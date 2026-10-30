export type WorkspaceDirection = "left" | "down" | "up" | "right";

export function directionalNeighbor<T>(
  source: DOMRect,
  candidates: readonly T[],
  direction: WorkspaceDirection,
  rectangle: (candidate: T) => DOMRect,
): T | undefined {
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const center = (rect: DOMRect) =>
    horizontal ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
  const crossCenter = (rect: DOMRect) =>
    horizontal ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
  const score = (rect: DOMRect) => {
    const overlap = horizontal
      ? rect.top < source.bottom && rect.bottom > source.top
      : rect.left < source.right && rect.right > source.left;
    const distance = horizontal
      ? sign > 0
        ? rect.left - source.right
        : source.left - rect.right
      : sign > 0
        ? rect.top - source.bottom
        : source.top - rect.bottom;
    return [
      overlap ? 0 : 1,
      Math.max(0, distance),
      Math.abs(crossCenter(rect) - crossCenter(source)),
    ];
  };
  return candidates
    .map((candidate, order) => ({ candidate, order, rect: rectangle(candidate) }))
    .filter(({ rect }) => sign * (center(rect) - center(source)) > 0)
    .sort((a, b) => {
      const left = score(a.rect);
      const right = score(b.rect);
      return (
        left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]! || a.order - b.order
      );
    })[0]?.candidate;
}
