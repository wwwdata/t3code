import { cellGlyph, fillCellGlyph } from "./cellGlyphs";
import {
  GHOSTTY_CELL_WIDE,
  ghosttyColorsEqual,
  type GhosttyCell,
  type GhosttyColor,
  type GhosttySnapshot,
} from "./core";

export interface GhosttyCellMetrics {
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
}

export interface GhosttyCellRange {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

const DEFAULT_SELECTION_BACKGROUND = "rgba(72, 122, 191, 0.35)";

function cssColor(color: GhosttyColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function sameTextStyle(left: GhosttyCell, right: GhosttyCell): boolean {
  // Selection only tints the background; splitting text runs shifts glyph spacing when advances differ from cell width.
  return (
    ghosttyColorsEqual(left.foreground, right.foreground) &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.invisible === right.invisible
  );
}

function ghosttyTextRunEnd(
  cells: readonly GhosttyCell[],
  start: number,
  sameStyle: (cell: GhosttyCell) => boolean,
): number {
  let end = start + 1;
  while (end < cells.length) {
    const next = cells[end];
    if (!next) break;
    if (next.wide === GHOSTTY_CELL_WIDE.spacerTail) {
      end += 1;
      continue;
    }
    if (next.text.length === 0 || cellGlyph(next.text) !== null || !sameStyle(next)) break;
    end += 1;
  }
  return end;
}

function fontForCell(cell: GhosttyCell, fontSize: number, fontFamily: string): string {
  const style = cell.italic ? "italic" : "normal";
  const weight = cell.bold ? "700" : "400";
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
}

export function measureGhosttyCell(
  context: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  lineHeight = 1,
): GhosttyCellMetrics {
  context.font = `normal 400 ${fontSize}px ${fontFamily}`;
  const widthMeasurement = context.measureText("M");
  const verticalMeasurement = context.measureText("Mg");
  const validPair = (ascent: number, descent: number) =>
    Number.isFinite(ascent) &&
    Number.isFinite(descent) &&
    ascent >= 0 &&
    descent >= 0 &&
    ascent + descent > 0;
  const [ascent, descent] = validPair(
    verticalMeasurement.fontBoundingBoxAscent,
    verticalMeasurement.fontBoundingBoxDescent,
  )
    ? [verticalMeasurement.fontBoundingBoxAscent, verticalMeasurement.fontBoundingBoxDescent]
    : validPair(
          verticalMeasurement.actualBoundingBoxAscent,
          verticalMeasurement.actualBoundingBoxDescent,
        )
      ? [verticalMeasurement.actualBoundingBoxAscent, verticalMeasurement.actualBoundingBoxDescent]
      : [fontSize * 0.8, fontSize * 0.2];
  const naturalHeight = ascent + descent;
  const multiplier = Number.isFinite(lineHeight) ? Math.max(1, Math.min(2, lineHeight)) : 1;
  const height = Math.max(1, Math.ceil(naturalHeight * multiplier));
  return {
    width: Math.max(1, widthMeasurement.width),
    height,
    baseline: (height - naturalHeight) / 2 + ascent,
  };
}

export function terminalGridSize(
  width: number,
  height: number,
  metrics: GhosttyCellMetrics,
  padding: number,
): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor((width - padding * 2) / metrics.width)),
    rows: Math.max(1, Math.floor((height - padding * 2) / metrics.height)),
  };
}

export function renderGhosttySnapshot(options: {
  readonly context: CanvasRenderingContext2D;
  readonly snapshot: GhosttySnapshot;
  readonly metrics: GhosttyCellMetrics;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly padding: number;
  readonly forceFull: boolean;
  readonly cursorOn: boolean;
  readonly previousCursorY?: number | null;
  readonly focused?: boolean;
  readonly selectionBackground?: string;
  readonly hoveredLinkRange?: GhosttyCellRange | null;
  readonly originY?: number;
  readonly pixelRatio?: number;
}): void {
  const {
    context,
    snapshot,
    metrics,
    fontSize,
    fontFamily,
    padding,
    forceFull,
    cursorOn,
    previousCursorY,
  } = options;
  const focused = options.focused ?? true;
  const selectionBackground = options.selectionBackground ?? DEFAULT_SELECTION_BACKGROUND;
  const hoveredLinkRange = options.hoveredLinkRange ?? null;
  const originY = options.originY ?? padding;
  const pixelRatio = options.pixelRatio ?? 1;
  const snap = (value: number) => Math.round(value * pixelRatio) / pixelRatio;
  const rowsToDraw = forceFull
    ? Array.from({ length: snapshot.rows }, (_, index) => index)
    : [...snapshot.dirtyRows];
  if (
    previousCursorY !== null &&
    previousCursorY !== undefined &&
    previousCursorY >= 0 &&
    !rowsToDraw.includes(previousCursorY)
  ) {
    rowsToDraw.push(previousCursorY);
  }
  if (snapshot.cursorVisible && snapshot.cursorY >= 0 && !rowsToDraw.includes(snapshot.cursorY)) {
    rowsToDraw.push(snapshot.cursorY);
  }

  if (forceFull) {
    context.save();
    context.resetTransform();
    context.fillStyle = cssColor(snapshot.background);
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
  }

  context.textBaseline = "alphabetic";
  for (const rowIndex of rowsToDraw) {
    const row = snapshot.rowData[rowIndex];
    if (!row) continue;
    const top = originY + rowIndex * metrics.height;
    const alignedTop = snap(top);
    const alignedHeight = snap(top + metrics.height) - alignedTop;

    context.fillStyle = cssColor(snapshot.background);
    context.fillRect(
      snap(padding),
      alignedTop,
      snap(padding + snapshot.cols * metrics.width) - snap(padding),
      alignedHeight,
    );

    let backgroundStart = 0;
    while (backgroundStart < row.cells.length) {
      const first = row.cells[backgroundStart];
      if (!first) break;
      let backgroundEnd = backgroundStart + 1;
      while (backgroundEnd < row.cells.length) {
        const next = row.cells[backgroundEnd];
        if (
          !next ||
          next.selected !== first.selected ||
          !ghosttyColorsEqual(next.background, first.background)
        ) {
          break;
        }
        backgroundEnd += 1;
      }
      if (first.selected || !ghosttyColorsEqual(first.background, snapshot.background)) {
        const left = snap(padding + backgroundStart * metrics.width);
        const width = snap(padding + backgroundEnd * metrics.width) - left;
        if (!ghosttyColorsEqual(first.background, snapshot.background)) {
          context.fillStyle = cssColor(first.background);
          context.fillRect(left, alignedTop, width, alignedHeight);
        }
        if (first.selected) {
          context.fillStyle = selectionBackground;
          context.fillRect(left, alignedTop, width, alignedHeight);
        }
      }
      backgroundStart = backgroundEnd;
    }

    let runStart = 0;
    while (runStart < row.cells.length) {
      const first = row.cells[runStart];
      if (!first) break;
      if (first.text.length === 0) {
        runStart += 1;
        continue;
      }
      const glyph = cellGlyph(first.text);
      if (glyph !== null) {
        if (!first.invisible) {
          context.fillStyle = cssColor(first.foreground);
          fillCellGlyph(
            context,
            glyph,
            padding + runStart * metrics.width,
            top,
            metrics.width,
            metrics.height,
            pixelRatio,
          );
        }
        runStart += 1;
        continue;
      }
      const runEnd = ghosttyTextRunEnd(row.cells, runStart, (cell) => sameTextStyle(cell, first));
      const text = row.cells
        .slice(runStart, runEnd)
        .map((cell) => cell.text)
        .join("");
      if (!first.invisible && text.trim().length > 0) {
        context.save();
        context.beginPath();
        context.rect(
          snap(padding + runStart * metrics.width),
          alignedTop,
          snap(padding + runEnd * metrics.width) - snap(padding + runStart * metrics.width),
          alignedHeight,
        );
        context.clip();
        context.font = fontForCell(first, fontSize, fontFamily);
        context.fillStyle = cssColor(first.foreground);
        context.fillText(
          text,
          padding + runStart * metrics.width,
          top + metrics.baseline,
          (runEnd - runStart) * metrics.width,
        );
        context.restore();
      }
      runStart = runEnd;
    }

    for (let column = 0; column < row.cells.length; column += 1) {
      const cell = row.cells[column];
      const hoveredLink =
        hoveredLinkRange !== null &&
        rowIndex >= hoveredLinkRange.start.y &&
        rowIndex <= hoveredLinkRange.end.y &&
        (rowIndex > hoveredLinkRange.start.y || column >= hoveredLinkRange.start.x) &&
        (rowIndex < hoveredLinkRange.end.y || column <= hoveredLinkRange.end.x);
      if (!cell || (!cell.underline && !cell.strikethrough && !cell.overline && !hoveredLink)) {
        continue;
      }
      context.fillStyle = cssColor(cell.foreground);
      const left = padding + column * metrics.width;
      if (cell.underline || hoveredLink) {
        context.fillRect(left, top + metrics.height - 2, metrics.width, 1);
      }
      if (cell.strikethrough) {
        context.fillRect(left, top + Math.floor(metrics.height * 0.55), metrics.width, 1);
      }
      if (cell.overline) context.fillRect(left, top + 1, metrics.width, 1);
    }
  }

  if (cursorOn && snapshot.cursorVisible && snapshot.cursorX >= 0 && snapshot.cursorY >= 0) {
    const left = padding + snapshot.cursorX * metrics.width;
    const top = originY + snapshot.cursorY * metrics.height;
    const cursorLeft = snap(left);
    const cursorTop = snap(top);
    const cursorWidth = snap(left + metrics.width) - cursorLeft;
    const cursorHeight = snap(top + metrics.height) - cursorTop;
    context.fillStyle = cssColor(snapshot.cursor);
    if (!focused) {
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(cursorLeft + 0.5, cursorTop + 0.5, cursorWidth - 1, cursorHeight - 1);
    } else if (snapshot.cursorStyle === 0) {
      context.fillRect(cursorLeft, cursorTop, snap(left + 2) - cursorLeft, cursorHeight);
    } else if (snapshot.cursorStyle === 2) {
      const underlineTop = snap(top + metrics.height - 2);
      context.fillRect(
        cursorLeft,
        underlineTop,
        cursorWidth,
        cursorTop + cursorHeight - underlineTop,
      );
    } else if (snapshot.cursorStyle === 3) {
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(cursorLeft + 0.5, cursorTop + 0.5, cursorWidth - 1, cursorHeight - 1);
    } else {
      context.fillRect(cursorLeft, cursorTop, cursorWidth, cursorHeight);
      const cell = snapshot.rowData[snapshot.cursorY]?.cells[snapshot.cursorX];
      if (cell?.text && !cell.invisible) {
        context.fillStyle = cssColor(snapshot.background);
        const glyph = cellGlyph(cell.text);
        if (glyph !== null) {
          fillCellGlyph(context, glyph, left, top, metrics.width, metrics.height, pixelRatio);
        } else {
          context.save();
          context.beginPath();
          context.rect(cursorLeft, cursorTop, cursorWidth, cursorHeight);
          context.clip();
          context.font = fontForCell(cell, fontSize, fontFamily);
          context.fillText(cell.text, left, top + metrics.baseline, metrics.width);
          context.restore();
        }
      }
    }
  }
}
