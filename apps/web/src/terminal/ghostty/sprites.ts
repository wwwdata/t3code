// Box drawing, block elements, and Braille are drawn as cell-sized shapes, as native Ghostty's
// sprite font does. Font glyphs rarely span the whole cell, so lines and blocks would not meet.
// All geometry is in whole device pixels relative to the cell's top-left corner.

export interface SpriteRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

type Point = readonly [x: number, y: number];

export type SpriteStroke =
  | { readonly kind: "line"; readonly from: Point; readonly to: Point }
  | {
      readonly kind: "arc";
      readonly from: Point;
      readonly corner: Point;
      readonly to: Point;
      readonly radius: number;
    };

export interface Sprite {
  readonly rects: readonly SpriteRect[];
  readonly strokes: readonly SpriteStroke[];
  readonly lineWidth: number;
}

const BOX_DRAWING_MIN = 0x2500;
const BLOCK_ELEMENT_MIN = 0x2580;
const BLOCK_ELEMENT_MAX = 0x259f;
const BRAILLE_MIN = 0x2800;
const BRAILLE_MAX = 0x28ff;

export function spriteCodePoint(text: string): number | null {
  if (text.length !== 1) return null;
  const codePoint = text.charCodeAt(0);
  if (codePoint >= BOX_DRAWING_MIN && codePoint <= BLOCK_ELEMENT_MAX) return codePoint;
  if (codePoint >= BRAILLE_MIN && codePoint <= BRAILLE_MAX) return codePoint;
  return null;
}

/** Light line thickness in device pixels for a cell of this width; heavy lines are twice it. */
export function spriteLineWidth(cellWidth: number): number {
  return Math.max(1, Math.round(cellWidth / 8));
}

// Arm weights for up, right, down, left: 0 none, 1 light, 2 heavy. Indexed from U+2500.
// Dashes mark the dash, double-line, arc, and diagonal cases handled separately below.
const BOX_ARMS: readonly string[] = [
  "0101 0202 1010 2020 - - - - - - - -",
  "0110 0210 0120 0220 0011 0012 0021 0022 1100 1200 2100 2200 1001 1002 2001 2002",
  "1110 1210 2110 1120 2120 2210 1220 2220 1011 1012 2011 1021 2021 2012 1022 2022",
  "0111 0112 0211 0212 0121 0122 0221 0222 1101 1102 1201 1202 2101 2102 2201 2202",
  "1111 1112 1211 1212 2111 1121 2121 2112 2211 1122 1221 2212 1222 2122 2221 2222",
]
  .join(" ")
  .split(" ");

const HALF_ARMS: Readonly<Record<number, string>> = {
  0x2574: "0001",
  0x2575: "1000",
  0x2576: "0100",
  0x2577: "0010",
  0x2578: "0002",
  0x2579: "2000",
  0x257a: "0200",
  0x257b: "0020",
  0x257c: "0201",
  0x257d: "1020",
  0x257e: "0102",
  0x257f: "2010",
};

// [horizontal, heavy, dashes] for the dashed lines.
const DASHES: Readonly<Record<number, readonly [boolean, boolean, number]>> = {
  0x2504: [true, false, 3],
  0x2505: [true, true, 3],
  0x2506: [false, false, 3],
  0x2507: [false, true, 3],
  0x2508: [true, false, 4],
  0x2509: [true, true, 4],
  0x250a: [false, false, 4],
  0x250b: [false, true, 4],
  0x254c: [true, false, 2],
  0x254d: [true, true, 2],
  0x254e: [false, false, 2],
  0x254f: [false, true, 2],
};

// Double lines as light segments: "h y x1 x2" or "v x y1 y2". Coordinates name the cell edges
// (L, R, T, B) or the stroke starts a (outer), m (centre), b (inner) of a double line.
const DOUBLE_SEGMENTS: readonly string[] = [
  "h a L R|h b L R",
  "v a T B|v b T B",
  "h a m R|h b m R|v m a B",
  "h m a R|v a m B|v b m B",
  "h a a R|v a a B|h b b R|v b b B",
  "h a L m|h b L m|v m a B",
  "h m L b|v a m B|v b m B",
  "h a L b|v b a B|h b L a|v a b B",
  "v m T b|h a m R|h b m R",
  "v a T m|v b T m|h m a R",
  "v a T b|h b a R|v b T a|h a b R",
  "v m T b|h a L m|h b L m",
  "v a T m|v b T m|h m L b",
  "v b T b|h b L b|v a T a|h a L a",
  "v m T B|h a m R|h b m R",
  "v a T B|v b T B|h m b R",
  "v a T B|v b T a|v b b B|h a b R|h b b R",
  "v m T B|h a L m|h b L m",
  "v a T B|v b T B|h m L a",
  "v b T B|v a T a|v a b B|h a L a|h b L a",
  "h a L R|h b L R|v m b B",
  "h m L R|v a m B|v b m B",
  "h a L R|h b L a|h b b R|v a b B|v b b B",
  "h a L R|h b L R|v m T a",
  "h m L R|v a T m|v b T m",
  "h b L R|h a L a|h a b R|v a T a|v b T a",
  "h a L R|h b L R|v m T B",
  "v a T B|v b T B|h m L R",
  "v a T a|v b T a|v a b B|v b b B|h a L a|h b L a|h a b R|h b b R",
];

function rect(x: number, y: number, width: number, height: number, alpha = 1): SpriteRect {
  return { x, y, width, height, alpha };
}

/** Start of a stroke of thickness `size` centred in a span of `span` pixels. */
function centred(span: number, size: number): number {
  return Math.floor((span - size) / 2);
}

function armRects(arms: string, width: number, height: number, light: number): SpriteRect[] {
  const thickness = (weight: string) => (weight === "2" ? light * 2 : weight === "1" ? light : 0);
  const [up, right, down, left] = [...arms].map(thickness) as [number, number, number, number];
  const vertical = Math.max(up, down);
  const horizontal = Math.max(left, right);
  const rects: SpriteRect[] = [];
  for (const [size, toEnd] of [
    [left, false],
    [right, true],
  ] as const) {
    if (size === 0) continue;
    // Arms run past the centre to cover the crossing line, so joins have no notch.
    const across = vertical > 0 ? vertical : size;
    const start = centred(width, across);
    const y = centred(height, size);
    rects.push(toEnd ? rect(start, y, width - start, size) : rect(0, y, start + across, size));
  }
  for (const [size, toEnd] of [
    [up, false],
    [down, true],
  ] as const) {
    if (size === 0) continue;
    const across = horizontal > 0 ? horizontal : size;
    const start = centred(height, across);
    const x = centred(width, size);
    rects.push(toEnd ? rect(x, start, size, height - start) : rect(x, 0, size, start + across));
  }
  return rects;
}

function dashRects(
  horizontal: boolean,
  size: number,
  dashes: number,
  width: number,
  height: number,
): SpriteRect[] {
  const length = horizontal ? width : height;
  const offset = centred(horizontal ? height : width, size);
  const rects: SpriteRect[] = [];
  for (let index = 0; index < dashes; index += 1) {
    const start = Math.round((index * length) / dashes);
    const end = Math.round(((index + 1) * length) / dashes);
    const gap = Math.max(1, Math.floor((end - start) / 2));
    const from = start + Math.floor(gap / 2);
    const span = Math.max(1, end - start - gap);
    rects.push(horizontal ? rect(from, offset, span, size) : rect(offset, from, size, span));
  }
  return rects;
}

function doubleRects(segments: string, width: number, height: number, light: number): SpriteRect[] {
  const middleX = centred(width, light);
  const middleY = centred(height, light);
  const xs: Record<string, number> = {
    L: 0,
    R: width,
    a: middleX - light,
    m: middleX,
    b: middleX + light,
  };
  const ys: Record<string, number> = {
    T: 0,
    B: height,
    a: middleY - light,
    m: middleY,
    b: middleY + light,
  };
  return segments.split("|").map((segment) => {
    const [axis, at = "", from = "", to = ""] = segment.split(" ");
    const horizontal = axis === "h";
    const along = horizontal ? xs : ys;
    const start = along[from] ?? 0;
    // An end on a stroke rather than an edge covers that stroke.
    const end = (along[to] ?? 0) + (to === "R" || to === "B" ? 0 : light);
    const position = (horizontal ? ys : xs)[at] ?? 0;
    return horizontal
      ? rect(start, position, end - start, light)
      : rect(position, start, light, end - start);
  });
}

function arcStroke(codePoint: number, width: number, height: number, light: number): SpriteStroke {
  const x = centred(width, light) + light / 2;
  const y = centred(height, light) + light / 2;
  const radius = Math.max(1, Math.min(x, width - x, y, height - y));
  const vertical: Point = codePoint === 0x256d || codePoint === 0x256e ? [x, height] : [x, 0];
  const horizontal: Point = codePoint === 0x256d || codePoint === 0x2570 ? [width, y] : [0, y];
  return { kind: "arc", from: vertical, corner: [x, y], to: horizontal, radius };
}

function blockRects(codePoint: number, width: number, height: number): SpriteRect[] {
  // Bottom and right parts are the complement of the top and left split, so ▀ and ▄ tile.
  const eighthsTall = (eighths: number, fromBottom: boolean) => {
    if (!fromBottom) return [rect(0, 0, width, Math.round((height * eighths) / 8))];
    const start = Math.round((height * (8 - eighths)) / 8);
    return [rect(0, start, width, height - start)];
  };
  const eighthsWide = (eighths: number, fromRight: boolean) => {
    if (!fromRight) return [rect(0, 0, Math.round((width * eighths) / 8), height)];
    const start = Math.round((width * (8 - eighths)) / 8);
    return [rect(start, 0, width - start, height)];
  };
  const midX = Math.round(width / 2);
  const midY = Math.round(height / 2);
  // Quadrant bits: 1 upper left, 2 upper right, 4 lower left, 8 lower right.
  const quadrants = (bits: number) =>
    [
      bits & 1 ? rect(0, 0, midX, midY) : null,
      bits & 2 ? rect(midX, 0, width - midX, midY) : null,
      bits & 4 ? rect(0, midY, midX, height - midY) : null,
      bits & 8 ? rect(midX, midY, width - midX, height - midY) : null,
    ].filter((part) => part !== null);
  if (codePoint === 0x2580) return eighthsTall(4, false);
  if (codePoint <= 0x2588) return eighthsTall(codePoint - 0x2580, true);
  if (codePoint <= 0x258f) return eighthsWide(0x2590 - codePoint, false);
  switch (codePoint) {
    case 0x2590:
      return eighthsWide(4, true);
    case 0x2591:
      return [rect(0, 0, width, height, 0x40 / 0xff)];
    case 0x2592:
      return [rect(0, 0, width, height, 0x80 / 0xff)];
    case 0x2593:
      return [rect(0, 0, width, height, 0xc0 / 0xff)];
    case 0x2594:
      return eighthsTall(1, false);
    case 0x2595:
      return eighthsWide(1, true);
    default:
      return quadrants([4, 8, 1, 13, 9, 7, 11, 2, 6, 14][codePoint - 0x2596] ?? 0);
  }
}

// Braille dot bits in reading order: left column dots 1-3, right column 4-6, then 7 and 8 below.
const BRAILLE_DOTS: readonly (readonly [column: number, row: number])[] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];

function brailleRects(codePoint: number, width: number, height: number): SpriteRect[] {
  const size = Math.max(1, Math.round(width / 4));
  const bits = codePoint - BRAILLE_MIN;
  return BRAILLE_DOTS.flatMap(([column, row], bit) =>
    bits & (1 << bit)
      ? [
          rect(
            Math.round(((2 * column + 1) * width) / 4 - size / 2),
            Math.round(((2 * row + 1) * height) / 8 - size / 2),
            size,
            size,
          ),
        ]
      : [],
  );
}

/** Geometry for one cell `width` by `height` device pixels, or null to draw the font glyph. */
export function buildSprite(
  codePoint: number,
  width: number,
  height: number,
  light: number,
): Sprite | null {
  const sprite = (rects: readonly SpriteRect[], strokes: readonly SpriteStroke[] = []) => ({
    rects,
    strokes,
    lineWidth: light,
  });
  if (codePoint >= BRAILLE_MIN && codePoint <= BRAILLE_MAX) {
    return sprite(brailleRects(codePoint, width, height));
  }
  if (codePoint >= BLOCK_ELEMENT_MIN && codePoint <= BLOCK_ELEMENT_MAX) {
    return sprite(blockRects(codePoint, width, height));
  }
  if (codePoint < BOX_DRAWING_MIN || codePoint >= BLOCK_ELEMENT_MIN) return null;
  const tableArms = BOX_ARMS[codePoint - BOX_DRAWING_MIN];
  const arms = tableArms !== undefined && tableArms !== "-" ? tableArms : HALF_ARMS[codePoint];
  if (arms) return sprite(armRects(arms, width, height, light));
  const dash = DASHES[codePoint];
  if (dash) {
    const [horizontal, heavy, dashes] = dash;
    return sprite(dashRects(horizontal, heavy ? light * 2 : light, dashes, width, height));
  }
  const double = DOUBLE_SEGMENTS[codePoint - 0x2550];
  if (double) return sprite(doubleRects(double, width, height, light));
  if (codePoint >= 0x256d && codePoint <= 0x2570) {
    return sprite([], [arcStroke(codePoint, width, height, light)]);
  }
  const rising: SpriteStroke = { kind: "line", from: [width, 0], to: [0, height] };
  const falling: SpriteStroke = { kind: "line", from: [0, 0], to: [width, height] };
  if (codePoint === 0x2571) return sprite([], [rising]);
  if (codePoint === 0x2572) return sprite([], [falling]);
  if (codePoint === 0x2573) return sprite([], [rising, falling]);
  return null;
}
