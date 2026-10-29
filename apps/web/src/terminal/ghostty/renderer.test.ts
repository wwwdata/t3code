import { describe, expect, it } from "vite-plus/test";

import { blockElementRects, snappedCellBox, type GhosttyCellMetrics } from "./renderer";

const metrics: GhosttyCellMetrics = { width: 7.4, height: 15.3, baseline: 12 };

describe("blockElementRects", () => {
  it("covers the whole cell for a full block and keeps half blocks on the outer edge", () => {
    expect(blockElementRects("█", 8, 15)).toEqual([{ x: 0, y: 0, width: 8, height: 15, alpha: 1 }]);
    expect(blockElementRects("▀", 8, 15)).toEqual([{ x: 0, y: 0, width: 8, height: 8, alpha: 1 }]);
    const lower = blockElementRects("▄", 8, 15);
    expect(lower).toEqual([{ x: 0, y: 7, width: 8, height: 8, alpha: 1 }]);
    expect(lower?.[0] && lower[0].y + lower[0].height).toBe(15);
    expect(blockElementRects("▁", 8, 16)?.[0]).toMatchObject({ y: 14, height: 2 });
    expect(blockElementRects("▔", 8, 16)?.[0]).toMatchObject({ y: 0, height: 2 });
  });

  it("tiles quadrants without a gap", () => {
    const rects = blockElementRects("▟", 9, 15);
    expect(rects).toEqual([
      { x: 5, y: 0, width: 4, height: 8, alpha: 1 },
      { x: 0, y: 8, width: 5, height: 7, alpha: 1 },
      { x: 5, y: 8, width: 4, height: 7, alpha: 1 },
    ]);
    const bottom = rects?.filter((rect) => rect.y > 0) ?? [];
    expect(bottom.every((rect) => rect.y + rect.height === 15)).toBe(true);
  });

  it("shades the full cell", () => {
    expect(blockElementRects("░", 4, 4)?.[0]?.alpha).toBeCloseTo(0x40 / 0xff);
    expect(blockElementRects("▒", 4, 4)?.[0]?.alpha).toBeCloseTo(0x80 / 0xff);
    expect(blockElementRects("▓", 4, 4)?.[0]?.alpha).toBeCloseTo(0xc0 / 0xff);
  });

  it("leaves ordinary text and box drawing to the font", () => {
    expect(blockElementRects("A", 8, 15)).toBeNull();
    expect(blockElementRects("─", 8, 15)).toBeNull();
    expect(blockElementRects("", 8, 15)).toBeNull();
  });

  it("shares an integer edge with the next row", () => {
    const row = snappedCellBox(4, 4, 0, 0, metrics);
    const next = snappedCellBox(4, 4, 0, 1, metrics);
    expect(row.top + row.height).toBe(next.top);
    const lower = blockElementRects("▄", row.width, row.height);
    const upper = blockElementRects("▀", next.width, next.height);
    expect(lower?.[0]?.y).toBeGreaterThan(0);
    expect(lower?.[0] && lower[0].y + lower[0].height).toBe(row.height);
    expect(upper?.[0]?.y).toBe(0);
  });
});
