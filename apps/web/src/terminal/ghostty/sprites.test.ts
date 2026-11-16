import { describe, expect, it } from "vite-plus/test";

import { buildSprite, type Sprite, spriteCodePoint } from "./sprites";

// Cell sizes in device pixels: 13px JetBrains Mono at 1.0 and 1.35, and the same at 2x.
const CELLS = [
  { width: 8, height: 13, light: 1 },
  { width: 8, height: 18, light: 1 },
  { width: 16, height: 26, light: 2 },
  { width: 16, height: 35, light: 2 },
] as const;

function raster(sprite: Sprite, width: number, height: number): boolean[][] {
  const pixels = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  for (const part of sprite.rects) {
    expect(part.x).toBeGreaterThanOrEqual(0);
    expect(part.y).toBeGreaterThanOrEqual(0);
    expect(part.x + part.width).toBeLessThanOrEqual(width);
    expect(part.y + part.height).toBeLessThanOrEqual(height);
    for (let y = part.y; y < part.y + part.height; y += 1) {
      for (let x = part.x; x < part.x + part.width; x += 1) pixels[y]![x] = true;
    }
  }
  return pixels;
}

function edges(pixels: boolean[][]) {
  const filled = (values: boolean[]) =>
    values.flatMap((value, index) => (value ? [index] : [])).join(",");
  return {
    top: filled(pixels[0]!),
    bottom: filled(pixels.at(-1)!),
    left: filled(pixels.map((row) => row[0]!)),
    right: filled(pixels.map((row) => row.at(-1)!)),
  };
}

function cellEdges(text: string, cell: (typeof CELLS)[number]) {
  const sprite = buildSprite(spriteCodePoint(text)!, cell.width, cell.height, cell.light);
  return edges(raster(sprite!, cell.width, cell.height));
}

function components(pixels: boolean[][]): number {
  const seen = pixels.map((row) => row.map(() => false));
  let count = 0;
  for (let y = 0; y < pixels.length; y += 1) {
    for (let x = 0; x < pixels[y]!.length; x += 1) {
      if (!pixels[y]![x] || seen[y]![x]) continue;
      count += 1;
      const stack = [[x, y] as const];
      seen[y]![x] = true;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as const) {
          if (pixels[ny]?.[nx] && !seen[ny]![nx]) {
            seen[ny]![nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  return count;
}

const BOX_LINES = Array.from({ length: 0x2580 - 0x2500 }, (_, index) =>
  String.fromCharCode(0x2500 + index),
).filter((text) => !"┄┅┆┇┈┉┊┋╌╍╎╏╭╮╯╰╱╲╳".includes(text));

describe("buildSprite", () => {
  it("only replaces single box drawing, block, and Braille characters", () => {
    expect(spriteCodePoint("─")).toBe(0x2500);
    expect(spriteCodePoint("▟")).toBe(0x259f);
    expect(spriteCodePoint("⣿")).toBe(0x28ff);
    expect(spriteCodePoint("A")).toBeNull();
    expect(spriteCodePoint("")).toBeNull();
    expect(spriteCodePoint("─́")).toBeNull();
    expect(spriteCodePoint("")).toBeNull();
  });

  it.each(CELLS)("meets every neighbour on the same pixels in a $width x $height cell", (cell) => {
    // Any edge is empty or exactly a plain light, heavy, or double line's edge, so two
    // characters that both reach a shared edge always line up.
    const horizontal = new Set(["", ...["─", "━", "═"].map((text) => cellEdges(text, cell).left)]);
    const vertical = new Set(["", ...["│", "┃", "║"].map((text) => cellEdges(text, cell).top)]);
    expect(horizontal.size).toBe(4);
    expect(vertical.size).toBe(4);
    for (const text of BOX_LINES) {
      const sides = cellEdges(text, cell);
      expect([text, horizontal.has(sides.left), horizontal.has(sides.right)]).toEqual([
        text,
        true,
        true,
      ]);
      expect([text, vertical.has(sides.top), vertical.has(sides.bottom)]).toEqual([
        text,
        true,
        true,
      ]);
    }
  });

  it.each(CELLS)(
    "joins light and heavy arms without a notch in a $width x $height cell",
    (cell) => {
      for (const text of BOX_LINES.filter((value) => value < "═" || value > "╬")) {
        const sprite = buildSprite(spriteCodePoint(text)!, cell.width, cell.height, cell.light);
        expect([text, components(raster(sprite!, cell.width, cell.height))]).toEqual([text, 1]);
      }
    },
  );

  it("draws double corners and tees as two separate strokes", () => {
    const cell = CELLS[1];
    for (const [text, strokes] of [
      ["═", 2],
      ["╔", 2],
      ["╝", 2],
      ["╠", 3],
      ["╦", 3],
      ["╬", 4],
      ["╪", 1],
    ] as const) {
      const sprite = buildSprite(spriteCodePoint(text)!, cell.width, cell.height, cell.light);
      expect([text, components(raster(sprite!, cell.width, cell.height))]).toEqual([text, strokes]);
    }
    const corner = cellEdges("╔", cell);
    expect(corner.top).toBe("");
    expect(corner.right).toBe(cellEdges("═", cell).right);
    expect(corner.bottom).toBe(cellEdges("║", cell).bottom);
  });

  it.each(CELLS)("fills and tiles block elements in a $width x $height cell", (cell) => {
    const block = (text: string) =>
      buildSprite(spriteCodePoint(text)!, cell.width, cell.height, cell.light)!;
    expect(block("█").rects).toEqual([
      { x: 0, y: 0, width: cell.width, height: cell.height, alpha: 1 },
    ]);
    const upper = block("▀").rects[0]!;
    const lower = block("▄").rects[0]!;
    expect(upper.y).toBe(0);
    expect(upper.y + upper.height).toBe(lower.y);
    expect(lower.y + lower.height).toBe(cell.height);
    const left = block("▌").rects[0]!;
    const right = block("▐").rects[0]!;
    expect(left.width).toBe(right.x);
    expect(right.x + right.width).toBe(cell.width);
    expect(block("▁").rects[0]!.y + block("▁").rects[0]!.height).toBe(cell.height);
    expect(block("▕").rects[0]!.x + block("▕").rects[0]!.width).toBe(cell.width);
    const quadrants = raster(block("▙"), cell.width, cell.height);
    expect(quadrants.flat().filter(Boolean)).toHaveLength(
      cell.width * cell.height - block("▝").rects[0]!.width * block("▝").rects[0]!.height,
    );
    expect(block("░").rects[0]).toMatchObject({ width: cell.width, height: cell.height });
    expect(block("▒").rects[0]!.alpha).toBeCloseTo(0x80 / 0xff);
  });

  it("places all eight Braille dots inside the cell, and none for the blank pattern", () => {
    for (const cell of CELLS) {
      const full = buildSprite(0x28ff, cell.width, cell.height, cell.light)!;
      expect(full.rects).toHaveLength(8);
      expect(components(raster(full, cell.width, cell.height))).toBe(8);
      expect(buildSprite(0x2800, cell.width, cell.height, cell.light)!.rects).toEqual([]);
    }
  });

  it("strokes arcs from the same edge points as straight lines", () => {
    const cell = CELLS[1];
    const arc = buildSprite(0x256d, cell.width, cell.height, cell.light)!.strokes[0]!;
    const vertical = cellEdges("│", cell).bottom.split(",").map(Number);
    const horizontal = cellEdges("─", cell).right.split(",").map(Number);
    expect(arc.from).toEqual([vertical[0]! + cell.light / 2, cell.height]);
    expect(arc.to).toEqual([cell.width, horizontal[0]! + cell.light / 2]);
  });
});
