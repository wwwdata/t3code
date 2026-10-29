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
const POWERLINE_SOLID_RIGHT = "\ue0b0";
const POWERLINE_SOLID_LEFT = "\ue0b2";

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

function isSolidPowerlineSeparator(text: string): boolean {
  return text === POWERLINE_SOLID_RIGHT || text === POWERLINE_SOLID_LEFT;
}

const BLOCK_ELEMENT_MIN = 0x2580;
const BLOCK_ELEMENT_MAX = 0x259f;
const SHADE_LIGHT = 0x40 / 0xff;
const SHADE_MEDIUM = 0x80 / 0xff;
const SHADE_DARK = 0xc0 / 0xff;

export interface BlockElementRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

function singleCodePoint(text: string): number | null {
  const codePoint = text.codePointAt(0);
  if (codePoint === undefined) return null;
  const width = codePoint > 0xffff ? 2 : 1;
  return text.length === width ? codePoint : null;
}

function isBlockElement(text: string): boolean {
  const codePoint = singleCodePoint(text);
  return codePoint !== null && codePoint >= BLOCK_ELEMENT_MIN && codePoint <= BLOCK_ELEMENT_MAX;
}

function fullCell(width: number, height: number, alpha: number): BlockElementRect {
  return { x: 0, y: 0, width, height, alpha };
}

function alignedRect(
  cellWidth: number,
  cellHeight: number,
  xFromEnd: boolean,
  xFraction: number,
  yFromEnd: boolean,
  yFraction: number,
): BlockElementRect {
  const width = Math.round(cellWidth * xFraction);
  const height = Math.round(cellHeight * yFraction);
  return {
    x: xFromEnd ? cellWidth - width : 0,
    y: yFromEnd ? cellHeight - height : 0,
    width,
    height,
    alpha: 1,
  };
}

function quadrants(
  cellWidth: number,
  cellHeight: number,
  corners: {
    readonly tl?: boolean;
    readonly tr?: boolean;
    readonly bl?: boolean;
    readonly br?: boolean;
  },
): readonly BlockElementRect[] {
  const midX = Math.round(cellWidth / 2);
  const midY = Math.round(cellHeight / 2);
  const rects: BlockElementRect[] = [];
  if (corners.tl) rects.push({ x: 0, y: 0, width: midX, height: midY, alpha: 1 });
  if (corners.tr) rects.push({ x: midX, y: 0, width: cellWidth - midX, height: midY, alpha: 1 });
  if (corners.bl) rects.push({ x: 0, y: midY, width: midX, height: cellHeight - midY, alpha: 1 });
  if (corners.br)
    rects.push({ x: midX, y: midY, width: cellWidth - midX, height: cellHeight - midY, alpha: 1 });
  return rects;
}

/** Cell-local integer rects. Edges that should touch the cell boundary sit on it. */
export function blockElementRects(
  text: string,
  cellWidth: number,
  cellHeight: number,
): readonly BlockElementRect[] | null {
  const codePoint = singleCodePoint(text);
  if (codePoint === null || codePoint < BLOCK_ELEMENT_MIN || codePoint > BLOCK_ELEMENT_MAX)
    return null;
  const width = Math.max(1, Math.round(cellWidth));
  const height = Math.max(1, Math.round(cellHeight));
  switch (codePoint) {
    case 0x2580:
      return [alignedRect(width, height, false, 1, false, 0.5)];
    case 0x2581:
      return [alignedRect(width, height, false, 1, true, 0.125)];
    case 0x2582:
      return [alignedRect(width, height, false, 1, true, 0.25)];
    case 0x2583:
      return [alignedRect(width, height, false, 1, true, 0.375)];
    case 0x2584:
      return [alignedRect(width, height, false, 1, true, 0.5)];
    case 0x2585:
      return [alignedRect(width, height, false, 1, true, 0.625)];
    case 0x2586:
      return [alignedRect(width, height, false, 1, true, 0.75)];
    case 0x2587:
      return [alignedRect(width, height, false, 1, true, 0.875)];
    case 0x2588:
      return [fullCell(width, height, 1)];
    case 0x2589:
      return [alignedRect(width, height, false, 0.875, false, 1)];
    case 0x258a:
      return [alignedRect(width, height, false, 0.75, false, 1)];
    case 0x258b:
      return [alignedRect(width, height, false, 0.625, false, 1)];
    case 0x258c:
      return [alignedRect(width, height, false, 0.5, false, 1)];
    case 0x258d:
      return [alignedRect(width, height, false, 0.375, false, 1)];
    case 0x258e:
      return [alignedRect(width, height, false, 0.25, false, 1)];
    case 0x258f:
      return [alignedRect(width, height, false, 0.125, false, 1)];
    case 0x2590:
      return [alignedRect(width, height, true, 0.5, false, 1)];
    case 0x2591:
      return [fullCell(width, height, SHADE_LIGHT)];
    case 0x2592:
      return [fullCell(width, height, SHADE_MEDIUM)];
    case 0x2593:
      return [fullCell(width, height, SHADE_DARK)];
    case 0x2594:
      return [alignedRect(width, height, false, 1, false, 0.125)];
    case 0x2595:
      return [alignedRect(width, height, true, 0.125, false, 1)];
    case 0x2596:
      return quadrants(width, height, { bl: true });
    case 0x2597:
      return quadrants(width, height, { br: true });
    case 0x2598:
      return quadrants(width, height, { tl: true });
    case 0x2599:
      return quadrants(width, height, { tl: true, bl: true, br: true });
    case 0x259a:
      return quadrants(width, height, { tl: true, br: true });
    case 0x259b:
      return quadrants(width, height, { tl: true, tr: true, bl: true });
    case 0x259c:
      return quadrants(width, height, { tl: true, tr: true, br: true });
    case 0x259d:
      return quadrants(width, height, { tr: true });
    case 0x259e:
      return quadrants(width, height, { tr: true, bl: true });
    case 0x259f:
      return quadrants(width, height, { tr: true, bl: true, br: true });
    default:
      return null;
  }
}

export function snappedCellBox(
  padding: number,
  originY: number,
  column: number,
  row: number,
  metrics: GhosttyCellMetrics,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const left = Math.round(padding + column * metrics.width);
  const right = Math.round(padding + (column + 1) * metrics.width);
  const top = Math.round(originY + row * metrics.height);
  const bottom = Math.round(originY + (row + 1) * metrics.height);
  return { left, top, width: right - left, height: bottom - top };
}

function fillBlockElement(
  context: CanvasRenderingContext2D,
  text: string,
  color: GhosttyColor,
  box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): boolean {
  const rects = blockElementRects(text, box.width, box.height);
  if (!rects) return false;
  context.save();
  context.fillStyle = cssColor(color);
  for (const rect of rects) {
    context.globalAlpha = rect.alpha;
    context.fillRect(box.left + rect.x, box.top + rect.y, rect.width, rect.height);
  }
  context.restore();
  return true;
}

// Fallback fonts inset or scale these private-use glyphs, leaving a gap where
// the separator should meet the next cell. Fill the triangle from the cell's
// own edges instead, as native terminals do.
function fillSolidPowerlineSeparator(
  context: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  metrics: GhosttyCellMetrics,
): void {
  const right = left + metrics.width;
  const [base, point] = text === POWERLINE_SOLID_RIGHT ? [left, right] : [right, left];
  context.beginPath();
  context.moveTo(base, top);
  context.lineTo(point, top + metrics.height / 2);
  context.lineTo(base, top + metrics.height);
  context.closePath();
  context.fill();
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
    if (
      next.text.length === 0 ||
      isSolidPowerlineSeparator(next.text) ||
      isBlockElement(next.text) ||
      !sameStyle(next)
    ) {
      break;
    }
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
): GhosttyCellMetrics {
  context.font = `normal 400 ${fontSize}px ${fontFamily}`;
  const widthMeasurement = context.measureText("M");
  const verticalMeasurement = context.measureText("Mg");
  const ascent = verticalMeasurement.actualBoundingBoxAscent || fontSize;
  const descent = verticalMeasurement.actualBoundingBoxDescent;
  const glyphHeight = ascent + descent;
  const height = Math.max(1, Math.round(fontSize * 1.35), Math.ceil(glyphHeight));
  return {
    width: Math.max(1, widthMeasurement.width),
    height,
    baseline: Math.round((height - glyphHeight) / 2 + ascent),
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

    context.fillStyle = cssColor(snapshot.background);
    context.fillRect(padding, top, snapshot.cols * metrics.width, metrics.height);

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
        const left = padding + backgroundStart * metrics.width;
        const width = (backgroundEnd - backgroundStart) * metrics.width;
        if (!ghosttyColorsEqual(first.background, snapshot.background)) {
          context.fillStyle = cssColor(first.background);
          context.fillRect(left, top, width, metrics.height);
        }
        if (first.selected) {
          context.fillStyle = selectionBackground;
          context.fillRect(left, top, width, metrics.height);
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
      if (isSolidPowerlineSeparator(first.text)) {
        if (!first.invisible) {
          context.fillStyle = cssColor(first.foreground);
          fillSolidPowerlineSeparator(
            context,
            first.text,
            padding + runStart * metrics.width,
            top,
            metrics,
          );
        }
        runStart += 1;
        continue;
      }
      if (isBlockElement(first.text)) {
        if (!first.invisible) {
          fillBlockElement(
            context,
            first.text,
            first.foreground,
            snappedCellBox(padding, originY, runStart, rowIndex, metrics),
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
          padding + runStart * metrics.width,
          top,
          (runEnd - runStart) * metrics.width,
          metrics.height,
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
    context.fillStyle = cssColor(snapshot.cursor);
    if (!focused) {
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(left + 0.5, top + 0.5, metrics.width - 1, metrics.height - 1);
    } else if (snapshot.cursorStyle === 0) {
      context.fillRect(left, top, 2, metrics.height);
    } else if (snapshot.cursorStyle === 2) {
      context.fillRect(left, top + metrics.height - 2, metrics.width, 2);
    } else if (snapshot.cursorStyle === 3) {
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(left + 0.5, top + 0.5, metrics.width - 1, metrics.height - 1);
    } else {
      context.fillRect(left, top, metrics.width, metrics.height);
      const cell = snapshot.rowData[snapshot.cursorY]?.cells[snapshot.cursorX];
      if (cell?.text) {
        context.fillStyle = cssColor(snapshot.background);
        if (isSolidPowerlineSeparator(cell.text)) {
          fillSolidPowerlineSeparator(context, cell.text, left, top, metrics);
        } else if (
          !fillBlockElement(
            context,
            cell.text,
            snapshot.background,
            snappedCellBox(padding, originY, snapshot.cursorX, snapshot.cursorY, metrics),
          )
        ) {
          context.font = fontForCell(cell, fontSize, fontFamily);
          context.fillText(cell.text, left, top + metrics.baseline, metrics.width);
        }
      }
    }
  }
}
