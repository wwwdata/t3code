import type { Editor } from "@tiptap/core";
import {
  EnvironmentId,
  MessageId,
  ThreadId,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { serializeAssistantCitation } from "@t3tools/shared/assistantCitations";
import { createRef, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../test/render";
import { serializeEditorDoc } from "~/composer-rich-text-doc";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
  type ComposerPromptEditorProps,
} from "./ComposerPromptEditorTiptap";
import { useChatShortcuts } from "./chat/useChatShortcuts";

function Composer(props: {
  value: string;
  enabled?: boolean;
  richText?: boolean;
  command?: ComposerPromptEditorProps["onCommandKeyDown"];
  captured?: (key: string) => void;
  clearOnEnter?: boolean;
}) {
  const [draft, setDraft] = useState({ value: props.value, cursor: 0 });
  useChatShortcuts({
    enabled: true,
    keybindings: props.captured
      ? ([
          ...["x", "Escape"].map((key) => ({
            command: "chat.new" as const,
            shortcut: {
              key,
              ctrlKey: false,
              metaKey: false,
              altKey: false,
              shiftKey: false,
              modKey: false,
            },
          })),
          ...["r", "["].map((key) => ({
            command: "chat.new" as const,
            shortcut: {
              key,
              ctrlKey: true,
              metaKey: false,
              altKey: false,
              shiftKey: false,
              modKey: false,
            },
          })),
          {
            command: "chat.new",
            shortcut: {
              key: "b",
              ctrlKey: true,
              metaKey: false,
              altKey: false,
              shiftKey: false,
              modKey: false,
            },
          },
        ] satisfies ResolvedKeybindingsConfig)
      : [],
    scriptKeybindings: [],
    getShortcutContext: () => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
      modelPickerOpen: false,
    }),
    threadFindActive: false,
    composerRef: { current: null },
    branchToolbarRef: { current: null },
    closeThreadFind: () => {},
    commands: props.captured ? { "chat.new": ({ event }) => props.captured?.(event.key) } : {},
    fallback: () => undefined,
  });
  return (
    <ComposerPromptEditorTiptap
      editorRef={createRef<ComposerPromptEditorHandle>()}
      value={draft.value}
      cursor={draft.cursor}
      vimEnabled={props.enabled ?? true}
      richTextEnabled={props.richText ?? true}
      contextRecords={new Map()}
      skills={[]}
      disabled={false}
      placeholder=""
      onChange={(value, cursor) => setDraft({ value, cursor })}
      onCommandKeyDown={(key, event) => {
        if (key === "Enter" && props.clearOnEnter) {
          setDraft({ value: "", cursor: 0 });
          return true;
        }
        return props.command?.(key, event) ?? false;
      }}
      onPaste={() => {}}
    />
  );
}

function editorIn(container: HTMLElement) {
  const element = container.querySelector<HTMLElement & { editor: Editor }>(".tiptap");
  if (!element) throw new Error("Composer did not mount");
  return element.editor;
}

async function focus(editor: Editor) {
  await act(async () => {
    editor.view.focus();
  });
  await vi.waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
}

it.each([true, false])("edits in Normal and Insert modes with rich text %s", async (richText) => {
  await using screen = await render(<Composer value="one two three" richText={richText} />);
  const editor = editorIn(screen.container);
  await focus(editor);
  await userEvent.keyboard("{Escape}d2wiNEW{Escape}");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("NEWthree");
  await expect.element(screen.getByRole("status")).toHaveTextContent("NORMAL");
  expect(editor.view.dom.dataset.composerVimMode).toBe("normal");
  await userEvent.keyboard("uu");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("one two three");
  await userEvent.keyboard("{Control>}r{/Control}");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("three");
});

it.each(["{Escape}", "{Control>}[BracketLeft]{/Control}"])(
  "gives open suggestions first refusal on %s and preserves Enter handling",
  async (escape) => {
    let menuOpen = true;
    const command = vi.fn((key: string) => {
      if (key === "Escape" && menuOpen) {
        menuOpen = false;
        return true;
      }
      return key === "Enter";
    });
    await using screen = await render(<Composer value="one" command={command} />);
    const editor = editorIn(screen.container);
    await focus(editor);
    await userEvent.keyboard(escape);
    await expect.element(screen.getByRole("status")).toHaveTextContent("INSERT");
    await userEvent.keyboard(`${escape}{Enter}`);
    await expect.element(screen.getByRole("status")).toHaveTextContent("NORMAL");
    expect(command.mock.calls.filter(([key]) => key === "Enter")).toHaveLength(1);
    expect(serializeEditorDoc(editor.state.doc).value).toBe("one");
  },
);

it("preserves the editor, draft, and history when the setting changes", async () => {
  await using screen = await render(<Composer value="one two" />);
  const editor = editorIn(screen.container);
  await focus(editor);
  await userEvent.keyboard("{Escape}dw");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("two");
  await screen.rerender(<Composer value="one two" enabled={false} />);
  expect(editorIn(screen.container)).toBe(editor);
  expect(serializeEditorDoc(editor.state.doc).value).toBe("two");
  await screen.rerender(<Composer value="one two" enabled />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("INSERT");
  await userEvent.keyboard("{Escape}u");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("one two");
});

it("bypasses composing Escape and edits, and cancels pending commands on blur", async () => {
  await using screen = await render(<Composer value="abcd" />);
  const editor = editorIn(screen.container);
  await focus(editor);
  const composingEscape = new KeyboardEvent("keydown", {
    key: "Escape",
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    editor.view.dom.dispatchEvent(composingEscape);
  });
  expect(composingEscape.defaultPrevented).toBe(false);
  await expect.element(screen.getByRole("status")).toHaveTextContent("INSERT");
  await userEvent.keyboard("{Escape}d");
  await act(async () => {
    editor.view.dom.blur();
  });
  await focus(editor);
  await userEvent.keyboard("l");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("abcd");
  expect(editor.state.selection.from).toBe(2);
});

it.each(["{Escape}", "{Control>}[BracketLeft]{/Control}"])(
  "lets Vim own %s before window capture and preserves modified app shortcuts",
  async (escape) => {
    const captured = vi.fn();
    await using screen = await render(<Composer value="abcd" captured={captured} />);
    const editor = editorIn(screen.container);
    await focus(editor);
    await userEvent.keyboard(`${escape}xd${escape}u{Control>}r{/Control}`);
    expect(serializeEditorDoc(editor.state.doc).value).toBe("bcd");
    expect(captured).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(captured).toHaveBeenCalledWith("b");
  },
);

it("starts the next draft in Insert with an empty register after Normal-mode submission", async () => {
  await using screen = await render(<Composer value="one two" clearOnEnter />);
  const editor = editorIn(screen.container);
  await focus(editor);
  await userEvent.keyboard("{Escape}yw{Enter}");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("");
  await expect.element(screen.getByRole("status")).toHaveTextContent("INSERT");
  await userEvent.keyboard("{Escape}p");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("");
});

it("leaves citation buttons and comment inputs outside Vim key handling", async () => {
  const citation = {
    version: 1 as const,
    environmentId: EnvironmentId.make("environment"),
    threadId: ThreadId.make("thread"),
    messageId: MessageId.make("message"),
    text: "quoted text",
    start: 0,
    end: 11,
    prefix: "",
    suffix: "",
  };
  await using screen = await render(
    <Composer value={`See ${serializeAssistantCitation(citation)}`} />,
  );
  const editor = editorIn(screen.container);
  await focus(editor);
  await userEvent.keyboard("{Escape}");
  const button = screen.container.querySelector<HTMLElement>("[data-citation-comment-trigger]");
  if (!button) throw new Error("Citation comment button did not mount");
  await act(async () => {
    button.focus();
  });
  await userEvent.keyboard("{Enter}");
  const comment = page.getByLabelText("Comment on selected text");
  await expect.element(comment).toBeVisible();
  await act(async () => {
    document
      .querySelector<HTMLTextAreaElement>('textarea[aria-label="Comment on selected text"]')
      ?.focus();
  });
  await userEvent.keyboard("xw");
  await expect.element(comment).toHaveValue("xw");
  expect(editor.view.dom.dataset.composerVimMode).toBe("normal");
});
