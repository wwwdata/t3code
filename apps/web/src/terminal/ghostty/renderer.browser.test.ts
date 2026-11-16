import { describe, expect, it } from "vite-plus/test";

import type { GhosttyCell, GhosttySnapshot } from "./core";
import { measureGhosttyCell, renderGhosttySnapshot } from "./renderer";

const background = { r: 255, g: 255, b: 255 };

const blank: GhosttyCell = {
  text: "",
  wide: 0,
  foreground: { r: 0, g: 0, b: 0 },
  background,
  bold: false,
  italic: false,
  invisible: false,
  strikethrough: false,
  overline: false,
  underline: false,
  selected: false,
};

/** Counts device pixels that are not the terminal background. */
function pixelsOffBackground(context: CanvasRenderingContext2D): number {
  const { data } = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] !== 255 || data[index + 1] !== 255 || data[index + 2] !== 255) count += 1;
  }
  return count;
}

/** Whether the device pixel under a CSS pixel position is closer to black than white. */
function isDarkAt(context: CanvasRenderingContext2D, x: number, y: number): boolean {
  const { a, d } = context.getTransform();
  const { data } = context.getImageData(Math.floor(x * a), Math.floor(y * d), 1, 1);
  return data[0]! < 128 && data[1]! < 128 && data[2]! < 128;
}

/** A 40 by 60 CSS pixel canvas drawn at the given device pixel ratio. */
function scaledContext(scale: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(40 * scale);
  canvas.height = Math.round(60 * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.setTransform(scale, 0, 0, scale, 0, 0);
  return context;
}

const layout = {
  metrics: { width: 7.8, height: 17, baseline: 13 },
  fontSize: 13,
  fontFamily: "monospace",
  padding: 4,
  originY: 4,
};

describe("measureGhosttyCell", () => {
  it("sizes rows at 1.35x the font size unless a line height is given", () => {
    const context = scaledContext(1);
    for (const fontSize of [8, 12, 13, 20]) {
      const metrics = measureGhosttyCell(context, fontSize, "monospace");
      expect(metrics.height).toBe(Math.round(fontSize * 1.35));
      expect(measureGhosttyCell(context, fontSize, "monospace", 1.35)).toEqual(metrics);
    }

    const tall = measureGhosttyCell(context, 12, "monospace", 2);
    const base = measureGhosttyCell(context, 12, "monospace");
    expect(tall.height).toBe(24);
    expect(tall.width).toBe(base.width);
    expect(tall.baseline).toBeGreaterThan(base.baseline);
  });
});

describe.each([1, 1.35])("box drawing at a %s line height", (lineHeight) => {
  it.each([1, 2])(
    "draws │ and █ continuously down a column at a %sx device pixel ratio",
    (scale) => {
      const probe = scaledContext(scale);
      const metrics = measureGhosttyCell(probe, 13, "monospace", lineHeight);
      const rows = 3;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil((metrics.width * 2 + 8) * scale);
      canvas.height = Math.ceil((metrics.height * rows + 8) * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas unavailable");
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const cells = [
        { ...blank, text: "│" },
        { ...blank, text: "█" },
      ];
      const snapshot: GhosttySnapshot = {
        cols: 2,
        rows,
        foreground: { r: 0, g: 0, b: 0 },
        background,
        cursor: { r: 0, g: 0, b: 0 },
        cursorX: 0,
        cursorY: 0,
        cursorVisible: false,
        cursorBlinking: false,
        cursorStyle: 1,
        dirtyRows: new Set(),
        rowData: Array.from({ length: rows }, () => ({
          cells,
          text: "",
          isWrapContinuation: false,
          wrapsToNext: false,
        })),
      };
      renderGhosttySnapshot({
        context,
        snapshot,
        metrics,
        fontSize: 13,
        fontFamily: "monospace",
        padding: 4,
        forceFull: true,
        cursorOn: false,
      });

      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const dark = (x: number, y: number) => data[(y * canvas.width + x) * 4]! < 128;
      const top = Math.round(4 * scale);
      const bottom = Math.round((4 + rows * metrics.height) * scale);
      const lineLeft = Math.round(4 * scale);
      const lineRight = Math.round((4 + metrics.width) * scale);
      const blockRight = Math.round((4 + metrics.width * 2) * scale);
      for (let y = top; y < bottom; y += 1) {
        let line = false;
        for (let x = lineLeft; x < lineRight; x += 1) line ||= dark(x, y);
        expect([y, line]).toEqual([y, true]);
        for (let x = lineRight; x < blockRight; x += 1)
          expect([x, y, dark(x, y)]).toEqual([x, y, true]);
      }
    },
  );
});

describe.each([1.25, 2.2])("renderGhosttySnapshot at a %sx device pixel ratio", (scale) => {
  it.each([
    ["bar", 0],
    ["block", 1],
    ["underline", 2],
    ["hollow block", 3],
  ])("erases a %s cursor completely when it blinks off", (_name, cursorStyle) => {
    const context = scaledContext(scale);
    const snapshot: GhosttySnapshot = {
      cols: 3,
      rows: 3,
      foreground: { r: 0, g: 0, b: 0 },
      background,
      cursor: { r: 0, g: 0, b: 0 },
      cursorX: 2,
      cursorY: 1,
      cursorVisible: true,
      cursorBlinking: true,
      cursorStyle,
      dirtyRows: new Set(),
      rowData: [0, 1, 2].map(() => ({
        cells: [blank, blank, blank],
        text: "",
        isWrapContinuation: false,
        wrapsToNext: false,
      })),
    };
    const options = { ...layout, context, snapshot };

    renderGhosttySnapshot({ ...options, forceFull: true, cursorOn: true });
    expect(pixelsOffBackground(context)).toBeGreaterThan(0);

    renderGhosttySnapshot({ ...options, forceFull: false, cursorOn: false, previousCursorY: 1 });
    expect(pixelsOffBackground(context)).toBe(0);
  });

  it("erases a Powerline separator completely when only its row repaints", () => {
    const context = scaledContext(scale);
    const firstRow = (cell: GhosttyCell): GhosttySnapshot => ({
      cols: 3,
      rows: 3,
      foreground: { r: 0, g: 0, b: 0 },
      background,
      cursor: { r: 0, g: 0, b: 0 },
      cursorX: -1,
      cursorY: -1,
      cursorVisible: false,
      cursorBlinking: false,
      cursorStyle: 1,
      dirtyRows: new Set([0]),
      rowData: [cell, blank, blank].map((middle) => ({
        cells: [blank, middle, blank],
        text: "",
        isWrapContinuation: false,
        wrapsToNext: false,
      })),
    });
    const options = { ...layout, context, forceFull: false, cursorOn: false };

    renderGhosttySnapshot({ ...options, snapshot: firstRow(blank), forceFull: true });
    renderGhosttySnapshot({ ...options, snapshot: firstRow({ ...blank, text: "\ue0b0" }) });
    expect(pixelsOffBackground(context)).toBeGreaterThan(0);

    renderGhosttySnapshot({ ...options, snapshot: firstRow(blank) });
    expect(pixelsOffBackground(context)).toBe(0);
  });

  it("keeps concealed text and its decorations hidden, under a block cursor too", () => {
    const context = scaledContext(scale);
    const concealed = { ...blank, text: "█", invisible: true, underline: true };
    const snapshot = (cursorVisible: boolean): GhosttySnapshot => ({
      cols: 3,
      rows: 1,
      foreground: { r: 0, g: 0, b: 0 },
      background,
      cursor: { r: 0, g: 0, b: 0 },
      cursorX: 1,
      cursorY: 0,
      cursorVisible,
      cursorBlinking: false,
      cursorStyle: 1,
      dirtyRows: new Set([0]),
      rowData: [
        {
          cells: [blank, concealed, blank],
          text: "",
          isWrapContinuation: false,
          wrapsToNext: false,
        },
      ],
    });
    const options = { ...layout, context, forceFull: true };

    renderGhosttySnapshot({ ...options, snapshot: snapshot(false), cursorOn: false });
    expect(pixelsOffBackground(context)).toBe(0);

    renderGhosttySnapshot({ ...options, snapshot: snapshot(true), cursorOn: true });
    expect(isDarkAt(context, 15.7, 12.5)).toBe(true);
  });

  // Cell 1 spans x 11.8 to 19.6 and row 0 spans y 4 to 21 in CSS pixels.
  it.each([
    ["right", "\ue0b4", { flat: 12.3, round: 19.1, neighbour: 0, outside: 11.3 }],
    ["left", "\ue0b6", { flat: 19.1, round: 12.3, neighbour: 2, outside: 20.1 }],
  ])("fills the rounded %s cap to the cell edges, under a block cursor too", (_side, text, x) => {
    const context = scaledContext(scale);
    const segment = { ...blank, background: { r: 0, g: 0, b: 0 } };
    const cells = [blank, { ...blank, text }, blank];
    cells[x.neighbour] = segment;
    const snapshot = (cursorVisible: boolean): GhosttySnapshot => ({
      cols: 3,
      rows: 1,
      foreground: { r: 0, g: 0, b: 0 },
      background,
      cursor: { r: 0, g: 0, b: 0 },
      cursorX: 1,
      cursorY: 0,
      cursorVisible,
      cursorBlinking: false,
      cursorStyle: 1,
      dirtyRows: new Set([0]),
      rowData: [{ cells, text: "", isWrapContinuation: false, wrapsToNext: false }],
    });

    renderGhosttySnapshot({
      ...layout,
      context,
      snapshot: snapshot(false),
      forceFull: true,
      cursorOn: false,
    });
    expect(isDarkAt(context, x.flat, 4.5)).toBe(true);
    expect(isDarkAt(context, x.flat, 20.5)).toBe(true);
    expect(isDarkAt(context, x.round, 12.5)).toBe(true);
    expect(isDarkAt(context, x.round, 4.5)).toBe(false);

    renderGhosttySnapshot({
      ...layout,
      context,
      snapshot: snapshot(true),
      forceFull: true,
      cursorOn: true,
    });
    expect(isDarkAt(context, x.outside, 12.5)).toBe(true);
    expect(isDarkAt(context, x.flat, 12.5)).toBe(false);
  });
});
