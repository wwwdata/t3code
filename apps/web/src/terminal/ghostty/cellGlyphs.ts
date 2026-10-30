type Weight = 0 | 1 | 2 | 3;
type Arms = readonly [north: Weight, east: Weight, south: Weight, west: Weight];

type CellGlyph =
  | { readonly kind: "box"; readonly arms: Arms }
  | { readonly kind: "rounded"; readonly arms: Arms }
  | { readonly kind: "dashed"; readonly arms: Arms; readonly dashes: 2 | 3 | 4 }
  | { readonly kind: "diagonal"; readonly rising: boolean; readonly falling: boolean }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "shade"; readonly alpha: number }
  | { readonly kind: "quadrants"; readonly mask: number }
  | { readonly kind: "powerline"; readonly right: boolean };

const BOX_ARMS = [
  [0, 1, 0, 1],
  [0, 2, 0, 2],
  [1, 0, 1, 0],
  [2, 0, 2, 0],
  [0, 1, 0, 1],
  [0, 2, 0, 2],
  [1, 0, 1, 0],
  [2, 0, 2, 0],
  [0, 1, 0, 1],
  [0, 2, 0, 2],
  [1, 0, 1, 0],
  [2, 0, 2, 0],
  [0, 1, 1, 0],
  [0, 2, 1, 0],
  [0, 1, 2, 0],
  [0, 2, 2, 0],
  [0, 0, 1, 1],
  [0, 0, 1, 2],
  [0, 0, 2, 1],
  [0, 0, 2, 2],
  [1, 1, 0, 0],
  [1, 2, 0, 0],
  [2, 1, 0, 0],
  [2, 2, 0, 0],
  [1, 0, 0, 1],
  [1, 0, 0, 2],
  [2, 0, 0, 1],
  [2, 0, 0, 2],
  [1, 1, 1, 0],
  [1, 2, 1, 0],
  [2, 1, 1, 0],
  [1, 1, 2, 0],
  [2, 1, 2, 0],
  [2, 2, 1, 0],
  [1, 2, 2, 0],
  [2, 2, 2, 0],
  [1, 0, 1, 1],
  [1, 0, 1, 2],
  [2, 0, 1, 1],
  [1, 0, 2, 1],
  [2, 0, 2, 1],
  [2, 0, 1, 2],
  [1, 0, 2, 2],
  [2, 0, 2, 2],
  [0, 1, 1, 1],
  [0, 1, 1, 2],
  [0, 2, 1, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 1],
  [0, 1, 2, 2],
  [0, 2, 2, 1],
  [0, 2, 2, 2],
  [1, 1, 0, 1],
  [1, 1, 0, 2],
  [1, 2, 0, 1],
  [1, 2, 0, 2],
  [2, 1, 0, 1],
  [2, 1, 0, 2],
  [2, 2, 0, 1],
  [2, 2, 0, 2],
  [1, 1, 1, 1],
  [1, 1, 1, 2],
  [1, 2, 1, 1],
  [1, 2, 1, 2],
  [2, 1, 1, 1],
  [1, 1, 2, 1],
  [2, 1, 2, 1],
  [2, 1, 1, 2],
  [2, 2, 1, 1],
  [1, 1, 2, 2],
  [1, 2, 2, 1],
  [2, 2, 1, 2],
  [1, 2, 2, 2],
  [2, 1, 2, 2],
  [2, 2, 2, 1],
  [2, 2, 2, 2],
  [0, 1, 0, 1],
  [0, 2, 0, 2],
  [1, 0, 1, 0],
  [2, 0, 2, 0],
  [0, 3, 0, 3],
  [3, 0, 3, 0],
  [0, 3, 1, 0],
  [0, 1, 3, 0],
  [0, 3, 3, 0],
  [0, 0, 1, 3],
  [0, 0, 3, 1],
  [0, 0, 3, 3],
  [1, 3, 0, 0],
  [3, 1, 0, 0],
  [3, 3, 0, 0],
  [1, 0, 0, 3],
  [3, 0, 0, 1],
  [3, 0, 0, 3],
  [1, 3, 1, 0],
  [3, 1, 3, 0],
  [3, 3, 3, 0],
  [1, 0, 1, 3],
  [3, 0, 3, 1],
  [3, 0, 3, 3],
  [0, 3, 1, 3],
  [0, 1, 3, 1],
  [0, 3, 3, 3],
  [1, 3, 0, 3],
  [3, 1, 0, 1],
  [3, 3, 0, 3],
  [1, 3, 1, 3],
  [3, 1, 3, 1],
  [3, 3, 3, 3],
  [0, 1, 1, 0],
  [0, 0, 1, 1],
  [1, 0, 0, 1],
  [1, 1, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 1],
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 2],
  [2, 0, 0, 0],
  [0, 2, 0, 0],
  [0, 0, 2, 0],
  [0, 2, 0, 1],
  [1, 0, 2, 0],
  [0, 1, 0, 2],
  [2, 0, 1, 0],
] as const;

const BOX_GLYPHS = BOX_ARMS.map((arms, index): CellGlyph => {
  if (index >= 0x71 && index <= 0x73) {
    return { kind: "diagonal", rising: index !== 0x72, falling: index !== 0x71 };
  }
  const dashes =
    index >= 4 && index <= 11 ? (index < 8 ? 3 : 4) : index >= 0x4c && index <= 0x4f ? 2 : 0;
  if (dashes !== 0) return { kind: "dashed", arms, dashes };
  return { kind: index >= 0x6d && index <= 0x70 ? "rounded" : "box", arms };
});

const BLOCK_GLYPHS: readonly CellGlyph[] = [
  { kind: "rect", x: 0, y: 0, width: 1, height: 0.5 },
  ...Array.from({ length: 8 }, (_, index): CellGlyph => ({
    kind: "rect",
    x: 0,
    y: (7 - index) / 8,
    width: 1,
    height: (index + 1) / 8,
  })),
  ...Array.from({ length: 7 }, (_, index): CellGlyph => ({
    kind: "rect",
    x: 0,
    y: 0,
    width: (7 - index) / 8,
    height: 1,
  })),
  { kind: "rect", x: 0.5, y: 0, width: 0.5, height: 1 },
  ...[0.25, 0.5, 0.75].map((alpha): CellGlyph => ({ kind: "shade", alpha })),
  { kind: "rect", x: 0, y: 0, width: 1, height: 0.125 },
  { kind: "rect", x: 0.875, y: 0, width: 0.125, height: 1 },
  ...[4, 8, 1, 13, 9, 7, 11, 2, 6, 14].map((mask): CellGlyph => ({ kind: "quadrants", mask })),
];
const POWERLINE_RIGHT: CellGlyph = { kind: "powerline", right: true };
const POWERLINE_LEFT: CellGlyph = { kind: "powerline", right: false };

export function cellGlyph(text: string): CellGlyph | null {
  if (text.length !== 1) return null;
  const code = text.charCodeAt(0);
  if (code >= 0x2500 && code <= 0x257f) return BOX_GLYPHS[code - 0x2500] ?? null;
  if (code >= 0x2580 && code <= 0x259f) return BLOCK_GLYPHS[code - 0x2580] ?? null;
  return code === 0xe0b0 ? POWERLINE_RIGHT : code === 0xe0b2 ? POWERLINE_LEFT : null;
}

export function fillCellGlyph(
  context: CanvasRenderingContext2D,
  glyph: CellGlyph,
  left: number,
  top: number,
  width: number,
  height: number,
  pixelRatio: number,
): void {
  const snap = (value: number) => Math.round(value * pixelRatio) / pixelRatio;
  const right = left + width;
  const bottom = top + height;
  const cx = left + width / 2;
  const cy = top + height / 2;
  const light = Math.max(1, Math.round((Math.min(width, height) * pixelRatio) / 8)) / pixelRatio;
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    const x = snap(x0);
    const y = snap(y0);
    context.fillRect(x, y, snap(x1) - x, snap(y1) - y);
  };
  switch (glyph.kind) {
    case "rect":
      rect(
        left + glyph.x * width,
        top + glyph.y * height,
        left + (glyph.x + glyph.width) * width,
        top + (glyph.y + glyph.height) * height,
      );
      return;
    case "shade": {
      const alpha = context.globalAlpha;
      context.globalAlpha = alpha * glyph.alpha;
      rect(left, top, right, bottom);
      context.globalAlpha = alpha;
      return;
    }
    case "quadrants":
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        if ((glyph.mask & (1 << quadrant)) === 0) continue;
        const x = left + ((quadrant % 2) * width) / 2;
        const y = top + (Math.floor(quadrant / 2) * height) / 2;
        rect(x, y, x + width / 2, y + height / 2);
      }
      return;
    case "powerline": {
      const [base, point] = glyph.right ? [snap(left), snap(right)] : [snap(right), snap(left)];
      context.beginPath();
      context.moveTo(base, snap(top));
      context.lineTo(point, snap(cy));
      context.lineTo(base, snap(bottom));
      context.closePath();
      context.fill();
      return;
    }
    case "diagonal":
      context.save();
      context.strokeStyle = context.fillStyle;
      context.lineWidth = light;
      context.lineCap = "butt";
      context.beginPath();
      context.rect(snap(left), snap(top), snap(right) - snap(left), snap(bottom) - snap(top));
      context.clip();
      context.beginPath();
      if (glyph.rising) {
        context.moveTo(snap(left), snap(bottom));
        context.lineTo(snap(right), snap(top));
      }
      if (glyph.falling) {
        context.moveTo(snap(left), snap(top));
        context.lineTo(snap(right), snap(bottom));
      }
      context.stroke();
      context.restore();
      return;
    case "box":
    case "rounded":
    case "dashed":
      break;
  }
  const { arms } = glyph;
  if (glyph.kind === "rounded") {
    const x = snap(cx - light / 2) + light / 2;
    const y = snap(cy - light / 2) + light / 2;
    const endpoints = [
      [x, snap(top)],
      [snap(right), y],
      [x, snap(bottom)],
      [snap(left), y],
    ] as const;
    const directions = arms.flatMap((weight, direction) => (weight > 0 ? [direction] : []));
    const first = endpoints[directions[0] ?? 0];
    const last = endpoints[directions[1] ?? 0];
    if (!first || !last) return;
    const radius = Math.min(x - snap(left), snap(right) - x, y - snap(top), snap(bottom) - y);
    const nearCenter = ([edgeX, edgeY]: readonly [number, number]) =>
      [x + Math.sign(edgeX - x) * radius, y + Math.sign(edgeY - y) * radius] as const;
    const a = nearCenter(first);
    const b = nearCenter(last);
    context.save();
    context.strokeStyle = context.fillStyle;
    context.lineWidth = light;
    context.beginPath();
    context.lineCap = "butt";
    context.moveTo(first[0], first[1]);
    context.lineTo(a[0], a[1]);
    context.quadraticCurveTo(x, y, b[0], b[1]);
    context.lineTo(last[0], last[1]);
    context.stroke();
    context.restore();
    return;
  }
  if (glyph.kind === "dashed") {
    const horizontal = arms[1] > 0;
    const thickness = light * (horizontal ? arms[1] : arms[0]);
    for (let dash = 0; dash < glyph.dashes; dash += 1) {
      const start = (dash + 0.15) / glyph.dashes;
      const end = (dash + 0.85) / glyph.dashes;
      if (horizontal)
        rect(left + start * width, cy - thickness / 2, left + end * width, cy + thickness / 2);
      else rect(cx - thickness / 2, top + start * height, cx + thickness / 2, top + end * height);
    }
    return;
  }
  for (let direction = 0; direction < 4; direction += 1) {
    const weight = arms[direction];
    if (!weight) continue;
    const vertical = direction % 2 === 0;
    const outward = direction === 0 || direction === 3 ? -1 : 1;
    const axisCenter = vertical ? cy : cx;
    const crossCenter = vertical ? cx : cy;
    const edge = vertical ? (direction === 0 ? top : bottom) : direction === 3 ? left : right;
    const opposite = arms[(direction + 2) % 4] ?? 0;
    const negative = arms[vertical ? 3 : 0];
    const positive = arms[vertical ? 1 : 2];
    const laneSides = weight === 3 ? [-1, 1] : [0];
    for (const side of laneSides) {
      let end = axisCenter;
      if (negative === 3 || positive === 3) {
        if (weight === 3) {
          const sameSide = side < 0 ? negative : positive;
          const otherSide = side < 0 ? positive : negative;
          if (sameSide !== otherSide || !opposite) {
            end += outward * light * (sameSide === 3 && otherSide !== 3 ? 1 : -1);
          }
        } else if (!opposite) {
          end += outward * light * (negative === 3 && positive === 3 ? 1 : -1);
        }
      }
      const half = (light * (weight === 2 ? 2 : 1)) / 2;
      const cross = crossCenter + side * light;
      if (opposite || negative || positive) end -= outward * half;
      if (vertical) rect(cross - half, Math.min(edge, end), cross + half, Math.max(edge, end));
      else rect(Math.min(edge, end), cross - half, Math.max(edge, end), cross + half);
    }
  }
}
