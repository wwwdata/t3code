import { history } from "@tiptap/pm/history";
import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vite-plus/test";

import {
  composerVimMode,
  createComposerVimPlugin,
  handleComposerVimKeyDown,
  setComposerVimEnabled,
} from "./composer-vim";
import { groupUndoByChangeKind, type ComposerChangeKind } from "./composer-undo-grouping";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    codeBlock: { content: "text*", group: "block", code: true },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", atom: true },
    chip: { inline: true, group: "inline", atom: true, attrs: { id: {} } },
    blockquote: { content: "block+", group: "block" },
    bulletList: { content: "listItem+", group: "block" },
    listItem: { content: "paragraph block*" },
  },
  marks: { bold: {} },
});
const paragraph = (text: string) =>
  schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);

function composer(content: string | ProseMirrorNode[], position = 1) {
  let previousKind: ComposerChangeKind | null = null;
  const doc = schema.nodes.doc!.create(
    null,
    typeof content === "string" ? content.split("\n").map(paragraph) : content,
  );
  const view = {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, position),
      plugins: [history({ newGroupDelay: 1000 }), createComposerVimPlugin()],
    }),
    dom: {},
    composing: false,
    dispatch(tr: Transaction) {
      previousKind = groupUndoByChangeKind(tr, previousKind);
      view.state = view.state.apply(tr);
    },
  } as unknown as EditorView;
  setComposerVimEnabled(view, true);
  const press = (key: string, options: Partial<KeyboardEvent> = {}) =>
    handleComposerVimKeyDown(view, {
      key,
      target: view.dom,
      preventDefault() {},
      stopPropagation() {},
      ...options,
    } as KeyboardEvent);
  const keys = (command: string) => {
    for (const key of command) press(key);
  };
  const normal = () => press("Escape");
  const text = () => view.state.doc.textBetween(0, view.state.doc.content.size, "\n", "◆");
  const insert = (text: string) => view.dispatch(view.state.tr.insertText(text));
  const cursor = () => view.state.selection.from;
  const moveTo = (pos: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  return { view, press, keys, normal, text, insert, cursor, moveTo };
}

describe("Vim composer motions", () => {
  it.each(["paragraph", "codeBlock"])("keeps word commands on an empty %s usable", (type) => {
    for (const command of ["w", "b", "e", "dw", "cw"]) {
      const editor = composer([schema.nodes[type]!.create()]);
      editor.normal();
      editor.keys(command);
      expect(editor.text()).toBe("");
      editor.view.state.doc.check();
    }
  });
  it("starts in Insert, uses graphemes horizontally, and clamps at logical line edges", () => {
    const editor = composer("a👩🏽‍💻éz", 1);
    expect(composerVimMode(editor.view.state)).toBe("insert");
    expect(editor.press("h")).toBe(false);
    editor.normal();
    editor.keys("ll");
    expect(editor.cursor()).toBe(9);
    editor.keys("100l");
    expect(editor.cursor()).toBe(11);
    editor.keys("100h");
    expect(editor.cursor()).toBe(1);
  });

  it("keeps the preferred column over short paragraphs, code lines, and hard breaks", () => {
    const editor = composer([
      paragraph("abcde"),
      schema.nodes.codeBlock!.create(null, schema.text("x\n12345")),
      schema.nodes.paragraph!.create(null, [
        schema.text("q"),
        schema.nodes.hardBreak!.create(),
        schema.text("ABCDE"),
      ]),
    ]);
    editor.normal();
    editor.keys("4l");
    const columns: string[] = [];
    for (const key of "jjjj") {
      editor.keys(key);
      columns.push(editor.view.state.doc.textBetween(editor.cursor(), editor.cursor() + 1));
    }
    expect(columns).toEqual(["x", "5", "q", "E"]);
    editor.keys("4k");
    expect(editor.cursor()).toBe(5);
  });

  it.each([
    { command: "w", position: 3 },
    { command: "2w", position: 7 },
    { command: "e", position: 5 },
    { command: "2e", position: 8 },
    { command: "$b", position: 10 },
    { command: "$0", position: 1 },
    { command: "^", position: 3 },
  ])("moves $command by words and line boundaries", ({ command, position }) => {
    const editor = composer("  one !! two");
    editor.normal();
    editor.keys(command);
    expect(editor.cursor()).toBe(position);
  });

  it("moves gg and counted G by logical line", () => {
    const editor = composer("one\ntwo\nthree\n");
    editor.normal();
    editor.keys("G");
    expect(editor.cursor()).toBe(18);
    editor.keys("2gg");
    expect(editor.cursor()).toBe(6);
    editor.keys("gg2$");
    expect(editor.cursor()).toBe(8);
    editor.keys("4$");
    expect(editor.cursor()).toBe(18);
  });
});

describe("Vim composer edits", () => {
  it("deletes complete emoji and combining graphemes", () => {
    const editor = composer("a👩🏽‍💻éz");
    editor.normal();
    editor.keys("lx");
    expect(editor.text()).toBe("aéz");
    editor.keys("x");
    expect(editor.text()).toBe("az");
  });

  it.each(["yyp", "ddp", "Gdgg", "o"])(
    "keeps nested list and quote schemas valid after %s",
    (command) => {
      const editor = composer(
        [
          schema.nodes.blockquote!.create(null, paragraph("quote")),
          schema.nodes.bulletList!.create(null, [
            schema.nodes.listItem!.create(null, paragraph("one")),
            schema.nodes.listItem!.create(null, paragraph("two")),
          ]),
        ],
        2,
      );
      editor.normal();
      editor.keys(command);
      editor.view.state.doc.check();
      expect(editor.view.state.doc.firstChild).not.toBeNull();
    },
  );
  it.each([
    { command: "dw", expected: "two three" },
    { command: "d2w", expected: "three" },
    { command: "2dw", expected: "three" },
    { command: "$bdw", expected: "one two " },
    { command: "999999d999999w", expected: "" },
    { command: "de", expected: " two three" },
    { command: "d$", expected: "" },
    { command: "$d0", expected: "e" },
    { command: "2x", expected: "e two three" },
    { command: "99dl", expected: "" },
    { command: "$dl", expected: "one two thre" },
  ])("applies $command to the motion range", ({ command, expected }) => {
    const editor = composer("one two three");
    editor.normal();
    editor.keys(command);
    expect(editor.text()).toBe(expected);
    editor.view.state.doc.check();
  });

  it.each([
    { command: "dd", expected: "two\nthree" },
    { command: "2dd", expected: "three" },
    { command: "dj", expected: "three" },
    { command: "dG", expected: "" },
    { command: "2dG", expected: "three" },
    { command: "d2G", expected: "three" },
    { command: "1dG", expected: "two\nthree" },
    { command: "2d2G", expected: "" },
    { command: "Gdd", expected: "one\ntwo" },
    { command: "Gdgg", expected: "" },
  ])("deletes complete logical lines with $command", ({ command, expected }) => {
    const editor = composer("one\ntwo\nthree");
    editor.normal();
    editor.keys(command);
    expect(editor.text()).toBe(expected);
    editor.view.state.doc.check();
  });

  it("changes a word without its trailing space and undoes its replacement together", () => {
    const editor = composer("a word");
    editor.normal();
    editor.keys("cw");
    expect(editor.text()).toBe(" word");
    expect(composerVimMode(editor.view.state)).toBe("insert");
    editor.insert("new");
    editor.normal();
    editor.keys("u");
    expect(editor.text()).toBe("a word");
    editor.press("r", { ctrlKey: true });
    expect(editor.text()).toBe("new word");
  });

  it("changes whole lines while keeping one line for the replacement", () => {
    const editor = composer("one\ntwo\nthree");
    editor.normal();
    editor.keys("2cc");
    editor.insert("new");
    expect(editor.text()).toBe("new\nthree");
  });

  it.each([
    { command: "i", expected: "Xabc" },
    { command: "a", expected: "aXbc" },
    { command: "A", expected: "abcX" },
    { command: "o", expected: "abc\nX" },
    { command: "O", expected: "X\nabc" },
  ])("enters Insert at the $command position", ({ command, expected }) => {
    const editor = composer("abc");
    editor.normal();
    editor.keys(command);
    editor.insert("X");
    expect(editor.text()).toBe(expected);
    editor.view.state.doc.check();
  });

  it("uses I at the first nonblank grapheme", () => {
    const editor = composer("  abc");
    editor.normal();
    editor.keys("$I");
    editor.insert("X");
    expect(editor.text()).toBe("  Xabc");
  });

  it.each(["p", "P"])("pastes yanked marks and atomic chips with %s", (key) => {
    const editor = composer([
      schema.nodes.paragraph!.create(null, [
        schema.text("ab", [schema.marks.bold!.create()]),
        schema.nodes.chip!.create({ id: "file" }),
        schema.text("z"),
      ]),
    ]);
    editor.normal();
    editor.keys(`y3l$${key}`);
    expect(editor.view.state.doc.firstChild!.childCount).toBeGreaterThan(2);
    const chips: string[] = [];
    const bold: string[] = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === "chip") chips.push(node.attrs.id as string);
      if (node.isText && node.marks.length) bold.push(node.text!);
    });
    expect(chips).toEqual(["file", "file"]);
    expect(bold.join("")).toBe("abab");
    editor.view.state.doc.check();
  });

  it.each([
    { command: "yyp", expected: "one\none\ntwo" },
    { command: "yyP", expected: "one\none\ntwo" },
    { command: "2yyGp", expected: "one\ntwo\none\ntwo" },
    { command: "ddp", expected: "two\none" },
    { command: "yy2p", expected: "one\none\none\ntwo" },
    { command: "yy7p", expected: "one\none\none\none\none\none\none\none\ntwo" },
  ])("pastes complete lines with $command", ({ command, expected }) => {
    const editor = composer("one\ntwo");
    editor.normal();
    editor.keys(command);
    expect(editor.text()).toBe(expected);
    editor.view.state.doc.check();
  });

  it.each([
    { value: "\na\nb", command: "2yy2p", expected: "\n\na\n\na\na\nb" },
    { value: "\na\nb", command: "2yy3p", expected: "\n\na\n\na\n\na\na\nb" },
    { value: "\na\nb", command: "2yy2P", expected: "\na\n\na\n\na\nb" },
    { value: "a\n\nb", command: "2yy2p", expected: "a\na\n\na\n\n\nb" },
    { value: "\n\n", command: "2yy2p", expected: "\n\n\n\n\n\n" },
  ])(
    "preserves empty lines in counted multiline paste $command",
    ({ value, command, expected }) => {
      const editor = composer(value);
      editor.normal();
      editor.keys(command);
      expect(editor.text()).toBe(expected);
      editor.view.state.doc.check();
    },
  );

  it("pastes and opens logical lines inside a code block", () => {
    const editor = composer([schema.nodes.codeBlock!.create(null, schema.text("one\ntwo"))]);
    editor.normal();
    editor.keys("yyp");
    expect(editor.text()).toBe("one\none\ntwo");
    editor.keys("O");
    editor.insert("new");
    expect(editor.text()).toBe("one\nnew\none\ntwo");
    expect(editor.view.state.doc.firstChild!.type.name).toBe("codeBlock");
  });

  it("keeps each Normal deletion in a separate undo group", () => {
    const editor = composer("abcd");
    editor.normal();
    editor.keys("xxu");
    expect(editor.text()).toBe("bcd");
    editor.keys("u");
    expect(editor.text()).toBe("abcd");
  });

  it("bounds a large counted paste by the message size and keeps it one undo step", () => {
    const editor = composer("a");
    editor.normal();
    editor.keys("y$999999p");
    expect(editor.view.state.doc.content.size).toBeLessThanOrEqual(
      PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
    );
    expect(editor.text().length).toBeGreaterThan(10_000);
    editor.keys("u");
    expect(editor.text()).toBe("a");
  });

  it("preserves history while toggling and clears the old register and pending command", () => {
    const editor = composer("abcd");
    editor.normal();
    editor.keys("xd");
    setComposerVimEnabled(editor.view, false);
    expect(editor.press("x")).toBe(false);
    setComposerVimEnabled(editor.view, true);
    expect(composerVimMode(editor.view.state)).toBe("insert");
    editor.normal();
    editor.keys("p");
    expect(editor.text()).toBe("bcd");
    editor.keys("u");
    expect(editor.text()).toBe("abcd");
  });

  it("leaves composition and modified app keys alone, and consumes unsupported printable keys", () => {
    const editor = composer("abc");
    expect(editor.press("Escape", { isComposing: true })).toBe(false);
    expect(editor.press("Escape", { keyCode: 229 })).toBe(false);
    editor.normal();
    expect(editor.press("x", { isComposing: true })).toBe(false);
    expect(editor.press("x", { metaKey: true })).toBe(false);
    expect(editor.press("x", { altKey: true })).toBe(false);
    expect(editor.press("x", { ctrlKey: true })).toBe(false);
    expect(editor.press("Enter")).toBe(false);
    expect(editor.press("z")).toBe(true);
    expect(editor.text()).toBe("abc");
  });
});
