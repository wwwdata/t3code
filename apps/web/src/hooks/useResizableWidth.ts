import { createSizeEdit, type SizeEdit } from "../lib/resizeEdit";
import { cancelWorkspaceResize } from "../lib/workspaceResize";
import { useStableCallback } from "./useStableCallback";
import * as Schema from "effect/Schema";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import { useResizeDrag } from "./useResizeDrag";

const WidthSchema = Schema.Finite;

/** The host must size itself from this custom property. */
export const RESIZABLE_WIDTH_PROPERTY = "--resizable-width";

export interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: "left" | "right";
}

export interface ResizableWidthHandlers {
  readonly ref: (node: HTMLElement | null) => (() => void) | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** Persist on drag end to avoid a storage write on every animation frame. */
export function useResizableWidth(options: UseResizableWidthOptions): {
  readonly width: number;
  readonly setWidth: (width: number) => void;
  readonly beginKeyboardResize: (host: HTMLElement) => SizeEdit;
  readonly cancelPointerResize: () => void;
  readonly readWidth: () => number;
  readonly handlers: ResizableWidthHandlers;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge } = options;

  const clamp = (value: number): number => {
    if (!Number.isFinite(value)) return defaultWidth;
    return Math.max(minWidth, Math.min(maxWidth, value));
  };

  const readWidth = () => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const stored = getLocalStorageItem(storageKey, WidthSchema);
      return clamp(stored ?? defaultWidth);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return defaultWidth;
    }
  };
  const [widthState, setWidthState] = useState(() => ({ storageKey, width: readWidth() }));
  if (widthState.storageKey !== storageKey) {
    setWidthState({ storageKey, width: readWidth() });
  }

  const keyboardWidthRef = useRef<number | null>(null);
  const keyboardHostRef = useRef<HTMLElement | null>(null);
  const clampedWidth = clamp(widthState.width);
  const readCommittedWidth = useStableCallback(() => clamp(widthState.width));
  const readCurrentWidth = useStableCallback(() =>
    clamp(keyboardWidthRef.current ?? widthState.width),
  );
  const currentClamp = useStableCallback(clamp);

  const commitWidth = (nextStorageKey: string, nextWidth: number) => {
    // Resizing remains usable for this session when browser storage is unavailable.
    setWidthState({ storageKey: nextStorageKey, width: nextWidth });
    try {
      setLocalStorageItem(nextStorageKey, nextWidth, WidthSchema);
    } catch (error) {
      console.error("Could not persist panel width.", error);
    }
  };

  const drag = useResizeDrag<HTMLElement>((event) => {
    const host = event.currentTarget.parentElement;
    // Disable drag transitions through transition-property; the host renders transition-duration.
    host?.style.setProperty("transition-property", "none");
    // The drag commits to the key and width it started from, even if the panel
    // switches keys before the pointer is released.
    const startStorageKey = storageKey;
    const startWidth = clamp(widthState.width);
    return {
      width: startWidth,
      edge,
      bounds: { min: minWidth, max: maxWidth },
      resize(nextWidth) {
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${nextWidth}px`);
        return nextWidth;
      },
      finish(finalWidth) {
        commitWidth(startStorageKey, finalWidth);
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed) host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${startWidth}px`);
      },
    };
  });

  const beginKeyboardResize = useStableCallback((host: HTMLElement) => {
    drag.cancel();
    keyboardHostRef.current = host;
    host.style.setProperty("transition-property", "none");
    return createSizeEdit({
      size: clampedWidth,
      direction: edge === "left" ? -1 : 1,
      clamp: currentClamp,
      preview: (value) => {
        keyboardWidthRef.current = value;
        host.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${value ?? readCommittedWidth()}px`);
        if (value === null) {
          host.style.removeProperty("transition-property");
          keyboardHostRef.current = null;
        }
      },
      persist: (value) => commitWidth(storageKey, value),
    });
  });

  // Bounds can change mid-drag (sidebar opens, window narrows), and the render
  // that carries them rewrites the committed width, so re-apply the live pointer position.
  const { refresh } = drag;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reapplies the temporary resize width to the DOM before paint when bounds or rendered width change
  useLayoutEffect(() => {
    refresh({ min: minWidth, max: maxWidth });
    if (keyboardWidthRef.current !== null) {
      keyboardWidthRef.current = currentClamp(keyboardWidthRef.current);
      keyboardHostRef.current?.style.setProperty(
        RESIZABLE_WIDTH_PROPERTY,
        `${keyboardWidthRef.current}px`,
      );
    }
  }, [refresh, minWidth, maxWidth, currentClamp]);

  return {
    width: clampedWidth,
    beginKeyboardResize,
    cancelPointerResize: drag.cancel,
    readWidth: readCurrentWidth,
    setWidth: (value) => commitWidth(storageKey, clamp(value)),
    handlers: {
      ref: drag.ref,
      onPointerDown: (event) => {
        cancelWorkspaceResize();
        drag.onPointerDown(event);
      },
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
    },
  };
}
