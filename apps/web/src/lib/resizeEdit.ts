export interface SizeEdit {
  moveDivider(deltaPx: number): number;
  commit(): void;
  cancel(): void;
}

export function createSizeEdit(options: {
  size: number;
  direction: 1 | -1;
  clamp: (size: number) => number;
  preview: (size: number | null) => void;
  persist: (size: number) => void;
}): SizeEdit {
  const initial = options.clamp(options.size);
  let size = initial;
  let finished = false;
  return {
    moveDivider(delta) {
      if (!finished) {
        size = options.clamp(options.clamp(size) + delta * options.direction);
        options.preview(size);
      }
      return size;
    },
    commit() {
      if (finished) return;
      finished = true;
      const final = options.clamp(size);
      if (final !== initial) options.persist(final);
      options.preview(null);
    },
    cancel() {
      if (finished) return;
      finished = true;
      options.preview(null);
    },
  };
}
