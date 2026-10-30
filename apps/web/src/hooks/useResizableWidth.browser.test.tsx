import { type CSSProperties, useRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";
import type { SizeEdit } from "../lib/resizeEdit";

function WidthEditor({ storageKey, max = 700 }: { storageKey: string; max?: number }) {
  const { width, beginKeyboardResize } = useResizableWidth({
    storageKey,
    defaultWidth: 540,
    minWidth: 360,
    maxWidth: max,
    edge: "left",
  });
  const edit = useRef<SizeEdit | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={host}
      style={
        {
          [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
          width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
        } as CSSProperties
      }
    >
      <output>{width}</output>
      <button
        onClick={() => {
          edit.current = beginKeyboardResize(host.current!);
        }}
      >
        Start
      </button>
      <button onClick={() => edit.current?.moveDivider(50)}>Right</button>
      <button onClick={() => edit.current?.cancel()}>Cancel</button>
      <button onClick={() => edit.current?.commit()}>Save</button>
    </div>
  );
}

describe("panel width keyboard edit", () => {
  it("previews without writing, preserves a clamped preference on cancel, and persists once on save", async () => {
    const key = "test:keyboard-width";
    localStorage.setItem(key, "900");
    using _storage = { [Symbol.dispose]: () => localStorage.removeItem(key) };
    await using screen = await render(<WidthEditor storageKey={key} />);
    using write = vi.spyOn(Storage.prototype, "setItem");
    await screen.getByRole("button", { name: "Start" }).click();
    await screen.getByRole("button", { name: "Right" }).click();
    expect(screen.container.firstElementChild?.getBoundingClientRect().width).toBe(650);
    await expect.element(screen.getByRole("status")).toHaveTextContent("700");
    expect(localStorage.getItem(key)).toBe("900");
    expect(write).not.toHaveBeenCalled();
    await screen.rerender(<WidthEditor storageKey={key} max={600} />);
    await screen.getByRole("button", { name: "Cancel" }).click();
    await expect.element(screen.getByRole("status")).toHaveTextContent("600");
    expect(localStorage.getItem(key)).toBe("900");
    await screen.rerender(<WidthEditor storageKey={key} />);
    await screen.getByRole("button", { name: "Start" }).click();
    await screen.getByRole("button", { name: "Right" }).click();
    await screen.getByRole("button", { name: "Right" }).click();
    await screen.getByRole("button", { name: "Save" }).click();
    expect(localStorage.getItem(key)).toBe("600");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("keeps a transaction's original storage identity", async () => {
    const original = "test:keyboard-width-original";
    const other = "test:keyboard-width-other";
    localStorage.setItem(original, "540");
    localStorage.setItem(other, "460");
    using _storage = {
      [Symbol.dispose]: () => {
        localStorage.removeItem(original);
        localStorage.removeItem(other);
      },
    };
    await using screen = await render(<WidthEditor storageKey={original} />);
    await screen.getByRole("button", { name: "Start" }).click();
    await screen.getByRole("button", { name: "Right" }).click();
    await screen.rerender(<WidthEditor storageKey={other} />);
    await screen.getByRole("button", { name: "Save" }).click();
    expect(localStorage.getItem(original)).toBe("490");
    expect(localStorage.getItem(other)).toBe("460");
  });
});
