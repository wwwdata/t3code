import { describe, expect, it } from "vite-plus/test";
import { measureGhosttyCell } from "./renderer";

describe("terminal cell metrics", () => {
  it.each([
    {
      name: "natural font bounds",
      fontAscent: 11,
      fontDescent: 3,
      actualAscent: 9,
      actualDescent: 2,
      multiplier: 1,
      height: 14,
      baseline: 11,
    },
    {
      name: "leading around font bounds",
      fontAscent: 11,
      fontDescent: 3,
      actualAscent: 9,
      actualDescent: 2,
      multiplier: 1.5,
      height: 21,
      baseline: 14.5,
    },
    {
      name: "actual bounds as a pair",
      fontAscent: 11,
      fontDescent: Number.NaN,
      actualAscent: 9,
      actualDescent: 3,
      multiplier: 1,
      height: 12,
      baseline: 9,
    },
    {
      name: "size fallback for incomplete pairs",
      fontAscent: Number.NaN,
      fontDescent: 3,
      actualAscent: 9,
      actualDescent: Number.NaN,
      multiplier: 1,
      height: 13,
      baseline: 10.4,
    },
    {
      name: "zero font bounds fall back",
      fontAscent: 0,
      fontDescent: 0,
      actualAscent: 9,
      actualDescent: 3,
      multiplier: 1,
      height: 12,
      baseline: 9,
    },
    {
      name: "invalid spacing is natural",
      fontAscent: 11,
      fontDescent: 3,
      actualAscent: 9,
      actualDescent: 2,
      multiplier: Number.NaN,
      height: 14,
      baseline: 11,
    },
  ])(
    "uses $name without rounding the column advance",
    ({ fontAscent, fontDescent, actualAscent, actualDescent, multiplier, height, baseline }) => {
      const context = {
        font: "",
        measureText: () => ({
          width: 7.3,
          fontBoundingBoxAscent: fontAscent,
          fontBoundingBoxDescent: fontDescent,
          actualBoundingBoxAscent: actualAscent,
          actualBoundingBoxDescent: actualDescent,
        }),
      } as unknown as CanvasRenderingContext2D;
      const metrics = measureGhosttyCell(context, 13, "monospace", multiplier);
      expect(metrics.width).toBe(7.3);
      expect(metrics.height).toBe(height);
      expect(metrics.baseline).toBeCloseTo(baseline);
    },
  );
});
