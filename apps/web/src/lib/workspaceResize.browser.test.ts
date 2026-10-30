import { describe, expect, it, vi } from "vite-plus/test";
import { fakeTimers } from "../../test/render";
import { createSizeEdit } from "./resizeEdit";
import { createWorkspaceResizeController } from "./workspaceResize";
import {
  queueWorkspaceActionFromPalette,
  restoreWorkspaceFocusFromPalette,
} from "./workspaceFocus";

function setup() {
  const root = document.createElement("div");
  root.innerHTML =
    '<textarea></textarea><div data-terminal-owner="drawer"><textarea></textarea></div>';
  document.body.append(root);
  const input = root.querySelector("textarea")!;
  const terminal = root.querySelectorAll("textarea")[1]!;
  input.focus();
  const controller = createWorkspaceResizeController(document);
  const states = {
    right: { stored: 540, preview: null as number | null, writes: 0 },
    bottom: { stored: 280, preview: null as number | null, writes: 0 },
  };
  const dividers = { right: document.createElement("div"), bottom: document.createElement("div") };
  const stops: Array<() => void> = [];
  for (const id of ["right", "bottom"] as const) {
    const state = states[id];
    const divider = dividers[id];
    divider.style.cssText = "width:10px;height:10px";
    root.append(divider);
    stops.push(
      controller.register({
        id,
        divider,
        size: () => state.preview ?? state.stored,
        begin: () =>
          createSizeEdit({
            size: state.stored,
            direction: -1,
            clamp: (size) => Math.max(id === "right" ? 360 : 180, Math.min(700, size)),
            preview: (size) => {
              state.preview = size;
            },
            persist: (size) => {
              state.stored = size;
              state.writes++;
            },
          }),
      }),
    );
  }
  const keydown = (event: KeyboardEvent) => {
    controller.handleKey(event);
  };
  window.addEventListener("keydown", keydown, true);
  const key = (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    (document.activeElement ?? root).dispatchEvent(event);
    return event;
  };
  return {
    controller,
    input,
    terminal,
    states,
    dividers,
    key,
    status: () => document.querySelector<HTMLElement>("[data-workspace-resize-status]"),
    [Symbol.dispose]() {
      window.removeEventListener("keydown", keydown, true);
      controller.dispose();
      for (const stop of stops) stop();
      root.remove();
    },
  };
}

describe("keyboard pane resize", () => {
  it("retains the palette opener when entering resize after the focus trap closes", async () => {
    using fixture = setup();
    fixture.terminal.focus();
    const workspace = fixture.terminal.parentElement!.parentElement!;
    workspace.inert = true;
    const palette = document.createElement("div");
    palette.tabIndex = -1;
    palette.setAttribute("aria-modal", "true");
    document.body.append(palette);
    using _palette = { [Symbol.dispose]: () => palette.remove() };
    palette.focus();
    queueWorkspaceActionFromPalette(() => fixture.controller.start());
    expect(restoreWorkspaceFocusFromPalette(fixture.terminal)).toBe(true);
    workspace.inert = false;
    palette.remove();
    await vi.waitFor(() =>
      expect(fixture.dividers.bottom.hasAttribute("data-workspace-resizing")).toBe(true),
    );
    fixture.key("Escape");
    expect(document.activeElement).toBe(fixture.terminal);
  });

  it("moves physical dividers on their own axis, clamps, and rolls both targets back", () => {
    using fixture = setup();
    expect(fixture.controller.start()).toBe(true);
    fixture.key("h");
    expect(fixture.states.right.preview).toBe(550);
    fixture.key("ArrowRight", { shiftKey: true });
    expect(fixture.states.right.preview).toBe(500);
    fixture.key("k");
    expect(fixture.states.right.preview).toBe(500);
    fixture.key("Tab");
    expect(fixture.dividers.bottom.hasAttribute("data-workspace-resizing")).toBe(true);
    fixture.key("ArrowUp");
    expect(fixture.states.bottom.preview).toBe(290);
    for (let i = 0; i < 5; i++) fixture.key("J", { shiftKey: true });
    expect(fixture.states.bottom.preview).toBe(180);
    expect(fixture.states.right.writes + fixture.states.bottom.writes).toBe(0);
    fixture.key("Escape");
    expect(fixture.states.right).toEqual({ stored: 540, preview: null, writes: 0 });
    expect(fixture.states.bottom).toEqual({ stored: 280, preview: null, writes: 0 });
    expect(fixture.status()).toBeNull();
    expect(document.activeElement).toBe(fixture.input);
  });

  it("starts at the focused drawer, consumes all mode keys, and saves each edited target once", () => {
    using fixture = setup();
    fixture.terminal.focus();
    const leaked: string[] = [];
    const hear = (event: KeyboardEvent) => leaked.push(event.key);
    window.addEventListener("keydown", hear);
    using _listener = { [Symbol.dispose]: () => window.removeEventListener("keydown", hear) };
    fixture.controller.start();
    expect(fixture.dividers.bottom.hasAttribute("data-workspace-resizing")).toBe(true);
    for (const key of ["x", "Backspace", " ", "F6"])
      expect(fixture.key(key).defaultPrevented).toBe(true);
    fixture.key("k");
    fixture.key("Tab");
    fixture.key("l");
    fixture.key("l");
    fixture.key("Enter");
    expect(fixture.states.bottom).toEqual({ stored: 290, preview: null, writes: 1 });
    expect(fixture.states.right).toEqual({ stored: 520, preview: null, writes: 1 });
    expect(leaked).toEqual([]);
    expect(document.activeElement).toBe(fixture.terminal);
  });

  it("uses only R after the prefix and expires using its clock", () => {
    using fixture = setup();
    using _timers = fakeTimers();
    fixture.terminal.focus();
    fixture.controller.armPrefix();
    fixture.key("r");
    expect(fixture.dividers.bottom.hasAttribute("data-workspace-resizing")).toBe(true);
    fixture.key("Escape");
    fixture.controller.armPrefix();
    expect(fixture.key("x").defaultPrevented).toBe(true);
    expect(fixture.status()).toBeNull();
    fixture.controller.armPrefix();
    vi.advanceTimersByTime(1500);
    expect(fixture.status()).toBeNull();
    expect(fixture.key("r").defaultPrevented).toBe(false);
    expect(fixture.states.bottom.writes).toBe(0);
  });

  it("cancels without stealing focus on blur, composition, target loss and modal entry", async () => {
    using fixture = setup();
    fixture.controller.start();
    fixture.key("h");
    window.dispatchEvent(new Event("blur"));
    expect(fixture.states.right.preview).toBeNull();
    fixture.controller.start();
    fixture.key("h");
    window.dispatchEvent(new CompositionEvent("compositionstart", { cancelable: true }));
    expect(fixture.status()).toBeNull();
    fixture.controller.start();
    fixture.key("h");
    fixture.dividers.right.hidden = true;
    await vi.waitFor(() => expect(fixture.status()).toBeNull());
    fixture.dividers.right.hidden = false;
    fixture.controller.start();
    fixture.key("h");
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.tabIndex = -1;
    modal.textContent = "Confirm";
    document.body.append(modal);
    using _modal = { [Symbol.dispose]: () => modal.remove() };
    modal.focus();
    await vi.waitFor(() => expect(fixture.status()).toBeNull());
    expect(document.activeElement).toBe(modal);
    expect(fixture.controller.start()).toBe(false);
    expect(fixture.states.right).toEqual({ stored: 540, preview: null, writes: 0 });
  });

  it("returns to the originating desktop guest only while it remains visible", () => {
    using fixture = setup();
    const guest = document.createElement("webview");
    guest.dataset.previewTab = "guest-tab";
    guest.tabIndex = -1;
    guest.style.cssText = "width:100px;height:100px;display:block";
    document.body.append(guest);
    using _guest = { [Symbol.dispose]: () => guest.remove() };
    fixture.controller.start("guest-tab");
    fixture.key("Escape");
    expect(document.activeElement).toBe(guest);
    fixture.controller.armPrefix("guest-tab");
    fixture.key("r");
    fixture.key("Enter");
    expect(document.activeElement).toBe(guest);
  });
});
