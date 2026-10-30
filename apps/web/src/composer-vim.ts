import { Extension } from "@tiptap/core";
import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";
import { closeHistory, redo, undo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

type Register = { slice: Slice; kind: "character" | "line" };
type Operator = "d" | "c" | "y";
type Pending =
  | { kind: "none"; count: string }
  | { kind: "operator"; key: Operator; count: number | null; motionCount: string }
  | { kind: "g"; count: string; operator: { key: Operator; count: number | null } | null };
type NormalMode = {
  mode: "normal";
  pending: Pending;
  column: number | null;
  register: Register | null;
};
type VimState = { mode: "disabled" } | { mode: "insert"; register: Register | null } | NormalMode;
type Token = { from: number; to: number; text: string };
type Row = { from: number; to: number; tokens: Token[] };
type Motion = { pos: number; inclusive?: boolean; linewise?: boolean; column?: number };

const vimKey = new PluginKey<VimState>("composer-vim");
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const freshNormal = (register: Register | null): NormalMode => ({
  mode: "normal",
  pending: { kind: "none", count: "" },
  column: null,
  register,
});

function rowsOf(doc: ProseMirrorNode): Row[] {
  const rows: Row[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const value = child.isText ? child.text! : child.type.name === "hardBreak" ? "\n" : "\ufffc";
      for (let index = 0; index < value.length; index++) positions.push(pos + 1 + offset + index);
      text += value;
    });
    positions.push(pos + 1 + node.content.size);
    let row: Row = { from: pos + 1, to: pos + 1, tokens: [] };
    for (const { segment, index } of segmenter.segment(text)) {
      const from = positions[index]!;
      const to = positions[index + segment.length]!;
      if (segment === "\n" || segment === "\r\n") {
        row.to = from;
        rows.push(row);
        row = { from: to, to, tokens: [] };
      } else {
        row.tokens.push({ from, to, text: segment });
        row.to = to;
      }
    }
    row.to = pos + 1 + node.content.size;
    rows.push(row);
    return false;
  });
  return rows;
}

function rowIndex(rows: Row[], pos: number) {
  const index = rows.findIndex((row) => pos <= row.to);
  return index < 0 ? rows.length - 1 : index;
}

function normalPosition(row: Row, pos: number) {
  return row.tokens.findLast((token) => token.from <= pos)?.from ?? row.from;
}

function previousPosition(row: Row, pos: number) {
  return row.tokens.findLast((token) => token.from < pos)?.from ?? row.from;
}

function firstNonblank(row: Row) {
  return row.tokens.find((token) => !/^\s+$/u.test(token.text))?.from ?? row.from;
}

function wordKind(token: Token) {
  return /^\s+$/u.test(token.text)
    ? "space"
    : /^[\p{L}\p{N}_]/u.test(token.text)
      ? "word"
      : "punctuation";
}

function motionFor(
  rows: Row[],
  pos: number,
  key: string,
  count: number,
  column: number | null,
  changeWord = false,
): Motion | null {
  const index = rowIndex(rows, pos);
  const row = rows[index]!;
  const tokenIndex = Math.max(
    0,
    row.tokens.findIndex((token) => token.from === pos),
  );
  if (key === "h" || key === "l") {
    const target = Math.max(
      0,
      Math.min(row.tokens.length - 1, tokenIndex + (key === "h" ? -count : count)),
    );
    return {
      pos: row.tokens[target]?.from ?? row.from,
      inclusive: key === "l" && tokenIndex + count >= row.tokens.length,
    };
  }
  if (key === "j" || key === "k") {
    const preferred = column ?? tokenIndex;
    const target =
      rows[Math.max(0, Math.min(rows.length - 1, index + (key === "j" ? count : -count)))]!;
    return {
      pos: target.tokens[Math.min(preferred, target.tokens.length - 1)]?.from ?? target.from,
      linewise: true,
      column: preferred,
    };
  }
  if (key === "0") return { pos: row.from };
  if (key === "^") return { pos: firstNonblank(row) };
  if (key === "$") {
    const target = rows[Math.min(rows.length - 1, index + count - 1)]!;
    return { pos: target.tokens.at(-1)?.from ?? target.from, inclusive: true };
  }
  if (key === "gg" || key === "G") {
    const target =
      rows[
        key === "G" && count === 0
          ? rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, count - 1))
      ]!;
    return { pos: firstNonblank(target), linewise: true };
  }
  if (key !== "w" && key !== "b" && key !== "e") return null;
  const tokens: Token[] = [];
  for (const [i, current] of rows.entries()) {
    if (i > 0) tokens.push({ from: rows[i - 1]!.to, to: current.from, text: "\n" });
    tokens.push(...current.tokens);
  }
  if (tokens.length === 0) return { pos: row.from };
  let cursor = tokens.findIndex((token) => token.from >= pos);
  if (cursor < 0) cursor = tokens.length - 1;
  for (let repeat = 0; repeat < count; repeat++) {
    if (
      repeat > 0 &&
      ((cursor <= 0 && key === "b") ||
        (cursor >= tokens.length && key === "w") ||
        (cursor >= tokens.length - 1 && key === "e"))
    )
      break;
    if (key === "b") {
      cursor = Math.max(0, cursor - 1);
      while (cursor > 0 && wordKind(tokens[cursor]!) === "space") cursor--;
      const kind = tokens[cursor] && wordKind(tokens[cursor]!);
      while (cursor > 0 && wordKind(tokens[cursor - 1]!) === kind) cursor--;
    } else if (key === "w") {
      const kind = tokens[cursor] && wordKind(tokens[cursor]!);
      while (cursor < tokens.length && wordKind(tokens[cursor]!) === kind) cursor++;
      while (cursor < tokens.length && wordKind(tokens[cursor]!) === "space") cursor++;
    } else {
      if (!changeWord || repeat > 0) cursor = Math.min(tokens.length - 1, cursor + 1);
      while (cursor < tokens.length - 1 && wordKind(tokens[cursor]!) === "space") cursor++;
      const kind = tokens[cursor] && wordKind(tokens[cursor]!);
      while (cursor < tokens.length - 1 && wordKind(tokens[cursor + 1]!) === kind) cursor++;
    }
  }
  const target = tokens[Math.min(tokens.length - 1, cursor)];
  return {
    pos: target ? normalPosition(rows[rowIndex(rows, target.from)]!, target.from) : row.from,
    inclusive: key === "e" || cursor >= tokens.length,
  };
}

function select(tr: Transaction, pos: number) {
  return tr
    .setSelection(
      TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(tr.doc.content.size, pos)))),
    )
    .scrollIntoView();
}

function dispatch(view: EditorView, next: VimState, tr = view.state.tr) {
  view.dispatch(tr.setMeta(vimKey, next));
}

function lineRange(rows: Row[], from: number, to: number) {
  const start = Math.min(rowIndex(rows, from), rowIndex(rows, to));
  const end = Math.max(rowIndex(rows, from), rowIndex(rows, to));
  return { start, end, from: rows[start]!.from, to: rows[end]!.to };
}

function operate(view: EditorView, state: NormalMode, motion: Motion, key: Operator) {
  const rows = rowsOf(view.state.doc);
  const pos = normalPosition(
    rows[rowIndex(rows, view.state.selection.from)]!,
    view.state.selection.from,
  );
  let from = Math.min(pos, motion.pos);
  let to = Math.max(pos, motion.pos);
  if (motion.inclusive) {
    const row = rows[rowIndex(rows, to)]!;
    to = row.tokens.find((token) => token.from === to)?.to ?? to;
  }
  const line = motion.linewise ? lineRange(rows, pos, motion.pos) : null;
  if (line) ({ from, to } = line);
  const register: Register = {
    slice: view.state.doc.slice(from, to),
    kind: line ? "line" : "character",
  };
  if (key === "y") {
    dispatch(view, freshNormal(register));
    return;
  }
  if (line && key === "d") {
    if (line.end < rows.length - 1) to = rows[line.end + 1]!.from;
    else if (line.start > 0) from = rows[line.start - 1]!.to;
  }
  const tr = closeHistory(view.state.tr).delete(from, to);
  if (key === "c") tr.setMeta("composer-vim-change", true);
  const next: VimState = key === "c" ? { mode: "insert", register } : freshNormal(register);
  const remaining = rowsOf(tr.doc);
  const row = remaining[rowIndex(remaining, from)]!;
  dispatch(
    view,
    next,
    select(tr, key === "c" ? Math.max(row.from, from) : normalPosition(row, from)),
  );
}

function openLine(tr: Transaction, row: Row, above: boolean) {
  const pos = above ? row.from : row.to;
  const resolved = tr.doc.resolve(pos);
  if (resolved.parent.type.spec.code) {
    tr.insertText("\n", pos);
    return above ? pos : pos + 1;
  }
  if (resolved.parentOffset !== (above ? 0 : resolved.parent.content.size)) {
    tr.insert(pos, tr.doc.type.schema.nodes.hardBreak!.create());
    return above ? pos : pos + 1;
  }
  tr.split(pos);
  return above ? pos : pos + 2;
}

function paste(view: EditorView, state: NormalMode, above: boolean, count: number) {
  if (!state.register) {
    dispatch(view, freshNormal(null));
    return;
  }
  const { slice, kind } = state.register;
  const tr = closeHistory(view.state.tr);
  const rows = rowsOf(tr.doc);
  const row = rows[rowIndex(rows, view.state.selection.from)]!;
  const pos = normalPosition(row, view.state.selection.from);
  const start =
    kind === "line"
      ? openLine(tr, row, above)
      : above
        ? pos
        : (row.tokens.find((token) => token.from === pos)?.to ?? row.to);
  const insert = (at: number, content: Slice) => {
    const mappingStart = tr.steps.length;
    tr.replaceRange(at, at, content);
    const mappedEnd = tr.mapping.slice(mappingStart).map(at, 1);
    return TextSelection.near(tr.doc.resolve(mappedEnd), -1).from;
  };
  let end = insert(start, slice);
  const limit = Math.max(
    1,
    Math.floor(
      (PROVIDER_SEND_TURN_MAX_INPUT_CHARS - view.state.doc.content.size) / (slice.size + 2),
    ),
  );
  const repetitions = Math.min(count, limit);
  for (const bit of repetitions.toString(2).slice(1)) {
    const copied = tr.doc.slice(start, end);
    const appendAt = () => {
      if (kind === "character") return end;
      const currentRows = rowsOf(tr.doc);
      return openLine(tr, currentRows[rowIndex(currentRows, end)]!, false);
    };
    const at = appendAt();
    end = insert(at, copied);
    if (bit === "1") {
      end = insert(appendAt(), slice);
    }
  }
  const insertedRows = rowsOf(tr.doc);
  const cursor =
    kind === "line"
      ? firstNonblank(insertedRows[rowIndex(insertedRows, start)]!)
      : previousPosition(insertedRows[rowIndex(insertedRows, end)]!, end);
  dispatch(view, freshNormal(state.register), select(tr, cursor));
}

export function composerVimMode(state: EditorState) {
  return vimKey.getState(state)?.mode ?? "disabled";
}

export function setComposerVimEnabled(view: EditorView, enabled: boolean) {
  if (enabled === (composerVimMode(view.state) !== "disabled")) return;
  dispatch(view, enabled ? { mode: "insert", register: null } : { mode: "disabled" });
}

export function resetComposerVim(view: EditorView) {
  if (composerVimMode(view.state) !== "disabled")
    dispatch(view, { mode: "insert", register: null });
}

export function isComposerVimEscapeKey(event: KeyboardEvent) {
  return (
    !event.metaKey &&
    !event.altKey &&
    ((event.key === "Escape" && !event.ctrlKey) ||
      (event.key === "[" && event.ctrlKey && !event.shiftKey))
  );
}

export function composerVimOwnsKey(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || !(event.target instanceof HTMLElement))
    return false;
  const editor = event.target.closest<HTMLElement>("[data-composer-vim-mode]");
  if (!editor || event.target !== editor || editor.ownerDocument.activeElement !== editor)
    return false;
  const mode = editor.dataset.composerVimMode;
  if (mode !== "insert" && mode !== "normal") return false;
  if (isComposerVimEscapeKey(event)) return true;
  if (event.metaKey || event.altKey) return false;
  if (event.ctrlKey) return mode === "normal" && !event.shiftKey && event.key.toLowerCase() === "r";
  return event.key === "Escape" || (mode === "normal" && Array.from(event.key).length === 1);
}

export function handleComposerVimKeyDown(view: EditorView, event: KeyboardEvent) {
  const state = vimKey.getState(view.state);
  if (
    !state ||
    state.mode === "disabled" ||
    view.composing ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.target !== view.dom
  )
    return false;
  if (event.metaKey || event.altKey) return false;
  if (event.ctrlKey && !isComposerVimEscapeKey(event)) {
    if (state.mode !== "normal" || event.shiftKey || event.key.toLowerCase() !== "r") return false;
    const count = state.pending.kind === "none" ? Math.max(1, Number(state.pending.count)) : 1;
    for (let index = 0; index < count; index++) if (!redo(view.state, view.dispatch)) break;
    dispatch(view, freshNormal(state.register));
  } else if (isComposerVimEscapeKey(event)) {
    const rows = rowsOf(view.state.doc);
    const row = rows[rowIndex(rows, view.state.selection.from)]!;
    dispatch(
      view,
      freshNormal(state.register),
      select(
        closeHistory(view.state.tr),
        state.mode === "insert"
          ? previousPosition(row, view.state.selection.from)
          : normalPosition(row, view.state.selection.from),
      ),
    );
  } else {
    if (state.mode !== "normal" || Array.from(event.key).length !== 1) return false;
    const key = event.key;
    const pending = state.pending;
    const operator =
      pending.kind === "operator" ? pending : pending.kind === "g" ? pending.operator : null;
    const digits = pending.kind === "operator" ? pending.motionCount : pending.count;
    const rows = rowsOf(view.state.doc);
    const row = rows[rowIndex(rows, view.state.selection.from)]!;
    const pos = normalPosition(row, view.state.selection.from);
    if (/^[0-9]$/.test(key) && (key !== "0" || digits !== "") && pending.kind !== "g") {
      const count = `${digits}${key}`.slice(0, 6);
      dispatch(view, {
        ...state,
        pending:
          pending.kind === "operator"
            ? { ...pending, motionCount: count }
            : { kind: "none", count },
      });
    } else if ((key === "d" || key === "c" || key === "y") && pending.kind !== "g") {
      if (operator?.key === key) {
        const count = Math.max(1, Number(digits)) * (operator.count ?? 1);
        const target = rows[Math.min(rows.length - 1, rowIndex(rows, pos) + count - 1)]!;
        operate(view, state, { pos: target.from, linewise: true }, key);
      } else if (!operator) {
        dispatch(view, {
          ...state,
          pending: {
            kind: "operator",
            key,
            count: digits ? Number(digits) : null,
            motionCount: "",
          },
          column: null,
        });
      } else dispatch(view, freshNormal(state.register));
    } else if (key === "g" && pending.kind !== "g") {
      dispatch(view, { ...state, pending: { kind: "g", count: digits, operator } });
    } else {
      const count = Math.max(1, Number(digits)) * (operator?.count ?? 1);
      const motion = motionFor(
        rows,
        pos,
        pending.kind === "g" ? (key === "g" ? "gg" : "") : key,
        key === "G" && !digits && operator?.count == null ? 0 : count,
        state.column,
      );
      if (motion) {
        if (operator) {
          // Vim's cw changes through the word end, leaving its following whitespace.
          const change =
            operator.key === "c" &&
            key === "w" &&
            !/^\s/u.test(row.tokens.find((token) => token.from === pos)?.text ?? "")
              ? motionFor(rows, pos, "e", count, null, true)!
              : motion;
          operate(view, state, change, operator.key);
        } else
          dispatch(
            view,
            { ...freshNormal(state.register), column: motion.column ?? null },
            select(view.state.tr, motion.pos),
          );
      } else if (operator || pending.kind === "g") dispatch(view, freshNormal(state.register));
      else if (["i", "a", "I", "A", "o", "O"].includes(key)) {
        const tr = closeHistory(view.state.tr);
        const target =
          key === "o" || key === "O"
            ? openLine(tr, row, key === "O")
            : key === "I"
              ? firstNonblank(row)
              : key === "A"
                ? row.to
                : key === "a"
                  ? (row.tokens.find((token) => token.from === pos)?.to ?? pos)
                  : pos;
        dispatch(view, { mode: "insert", register: state.register }, select(tr, target));
      } else if (key === "x") {
        const start = row.tokens.findIndex((token) => token.from === pos);
        const end = row.tokens[Math.min(row.tokens.length - 1, start + count - 1)]?.from ?? pos;
        operate(view, state, { pos: end, inclusive: true }, "d");
      } else if (key === "p" || key === "P") paste(view, state, key === "P", count);
      else if (key === "u") {
        for (let index = 0; index < count; index++) if (!undo(view.state, view.dispatch)) break;
        dispatch(view, freshNormal(state.register));
      } else dispatch(view, freshNormal(state.register));
    }
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function createComposerVimPlugin() {
  return new Plugin<VimState>({
    key: vimKey,
    state: {
      init: () => ({ mode: "disabled" }),
      apply: (tr, previous) => tr.getMeta(vimKey) ?? previous,
    },
    props: {
      attributes: (state) => ({ "data-composer-vim-mode": composerVimMode(state) }),
      decorations: (state) => {
        if (composerVimMode(state) !== "normal" || !state.selection.empty) return null;
        const rows = rowsOf(state.doc);
        const row = rows[rowIndex(rows, state.selection.from)]!;
        const token = row.tokens.find(
          (candidate) => candidate.from === normalPosition(row, state.selection.from),
        );
        if (token)
          return DecorationSet.create(state.doc, [
            Decoration.inline(token.from, token.to, { class: "composer-vim-caret" }),
          ]);
        return DecorationSet.create(state.doc, [
          Decoration.widget(row.from, () => {
            const caret = document.createElement("span");
            caret.className = "composer-vim-empty-caret";
            caret.setAttribute("aria-hidden", "true");
            return caret;
          }),
        ]);
      },
      handleDOMEvents: {
        blur: (view) => {
          const state = vimKey.getState(view.state);
          if (state?.mode === "normal") dispatch(view, freshNormal(state.register));
          return false;
        },
      },
    },
  });
}

export const ComposerVimExtension = Extension.create({
  name: "composer-vim",
  addProseMirrorPlugins() {
    return [createComposerVimPlugin()];
  },
});
