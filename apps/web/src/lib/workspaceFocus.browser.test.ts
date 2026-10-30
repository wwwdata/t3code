import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { registerTerminalFocusTarget } from "./terminalFocus";
import { describe, expect, it, vi } from "vite-plus/test";
import { createWorkspaceFocusController } from "./workspaceFocus";

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = createWorkspaceFocusController(document);
  const area = (name: string, order: number, parent: HTMLElement = root) => {
    const element = document.createElement("section");
    element.dataset.workspaceArea = name;
    element.dataset.workspaceOrder = String(order);
    element.tabIndex = -1;
    const button = document.createElement("button");
    button.textContent = name;
    element.append(button);
    parent.append(element);
    return { element, button };
  };
  const append = (html: string) => {
    root.insertAdjacentHTML("beforeend", html);
    return root.lastElementChild as HTMLElement;
  };
  return {
    area,
    append,
    controller,
    [Symbol.dispose]() {
      controller.dispose();
      root.remove();
    },
  };
}

describe("workspace area focus", () => {
  it("traverses terminal cells before areas and leaves from the focused cell's rectangle", () => {
    using fixture = setup();
    using registrations = new DisposableStack();
    const source = fixture.area("terminal", 5);
    source.element.style.cssText = "position:fixed;left:0;top:0;width:300px;height:500px";
    source.button.remove();
    const group = document.createElement("div");
    group.dataset.terminalGrid = "";
    group.style.cssText = "height:100%;display:grid;grid-template-rows:1fr 1fr";
    source.element.append(group);
    let selected = "";
    const cells = ["top", "bottom"].map((terminalId) => {
      const mount = document.createElement("div");
      mount.tabIndex = -1;
      group.append(mount);
      registrations.defer(
        registerTerminalFocusTarget({
          threadRef: scopeThreadRef(EnvironmentId.make("spatial"), ThreadId.make("thread")),
          terminalId,
          mount,
          focus: () => {
            selected = terminalId;
            mount.focus();
            return true;
          },
        }),
      );
      return mount;
    });
    const upper = fixture.area("upper", 6);
    const lower = fixture.area("lower", 7);
    upper.element.style.cssText = "position:fixed;left:300px;top:0;width:200px;height:250px";
    lower.element.style.cssText = "position:fixed;left:300px;top:250px;width:200px;height:250px";
    cells[1]!.focus();
    expect(fixture.controller.move("up")).toBe(true);
    expect(document.activeElement).toBe(cells[0]);
    expect(selected).toBe("top");
    expect(fixture.controller.move("down")).toBe(true);
    expect(document.activeElement).toBe(cells[1]);
    expect(selected).toBe("bottom");
    expect(fixture.controller.move("right")).toBe(true);
    expect(document.activeElement).toBe(lower.button);
  });

  it("uses the visible composer card rather than its overlay when moving up from the drawer", () => {
    using fixture = setup();
    const conversation = fixture.area("conversation", 1);
    const composer = fixture.area("composer", 2);
    const terminal = fixture.area("terminal", 5);
    for (const area of [conversation, composer])
      area.element.style.cssText = "position:fixed;left:0;top:0;width:500px;height:500px";
    terminal.element.style.cssText = "position:fixed;left:0;top:500px;width:500px;height:100px";
    const card = document.createElement("div");
    card.dataset.chatComposerStack = "true";
    card.style.cssText = "position:fixed;left:50px;top:350px;width:400px;height:100px";
    card.append(composer.button);
    composer.element.append(card);
    terminal.button.focus();
    expect(fixture.controller.move("up")).toBe(true);
    expect(document.activeElement).toBe(composer.button);
    expect(fixture.controller.move("up")).toBe(true);
    expect(document.activeElement).toBe(conversation.element);
  });

  it("chooses physical neighbors without wrapping or entering hidden areas", () => {
    using fixture = setup();
    const sidebar = fixture.area("sidebar", 0);
    const composer = fixture.area("composer", 2);
    const details = fixture.area("details", 3);
    const panel = fixture.area("panel", 4);
    const terminal = fixture.area("terminal", 5);
    for (const [area, box] of [
      [sidebar, "left:0;top:0;width:100px;height:500px"],
      [composer, "left:100px;top:300px;width:300px;height:100px"],
      [details, "left:300px;top:300px;width:100px;height:100px"],
      [panel, "left:400px;top:0;width:200px;height:500px"],
      [terminal, "left:100px;top:400px;width:300px;height:100px"],
    ] as const)
      area.element.style.cssText = `position:fixed;${box}`;
    composer.button.focus();
    expect(fixture.controller.move("right")).toBe(true);
    expect(document.activeElement).toBe(panel.button);
    composer.button.focus();
    expect(fixture.controller.move("down")).toBe(true);
    expect(document.activeElement).toBe(terminal.button);
    expect(fixture.controller.move("down")).toBe(false);
    expect(fixture.controller.move("right")).toBe(true);
    expect(document.activeElement).toBe(panel.button);
    panel.element.hidden = true;
    composer.button.focus();
    expect(fixture.controller.move("right")).toBe(false);
    expect(document.activeElement).toBe(composer.button);
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(details.button);
    expect(fixture.controller.move(-1)).toBe(true);
    expect(document.activeElement).toBe(composer.button);
    details.button.focus();
    expect(fixture.controller.move("left")).toBe(true);
    expect(document.activeElement).toBe(composer.button);
    expect(fixture.controller.move("left")).toBe(true);
    expect(document.activeElement).toBe(sidebar.button);
    const modal = fixture.append('<div role="dialog" aria-modal="true">Confirm</div>');
    expect(fixture.controller.move("right")).toBe(false);
    modal.remove();
  });

  it("cycles in workspace order in both directions, independent of DOM order", () => {
    using fixture = setup();
    const panel = fixture.area("panel", 3);
    const sidebar = fixture.area("sidebar", 0);
    const conversation = fixture.area("conversation", 1);
    const composer = fixture.area("composer", 2);
    sidebar.button.focus();
    fixture.controller.move(1);
    // The conversation is a region; it takes focus itself rather than its first button.
    expect(document.activeElement).toBe(conversation.element);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(panel.button);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(sidebar.button);
    fixture.controller.move(-1);
    expect(document.activeElement).toBe(panel.button);
  });

  it("skips hidden, inert, and maximized-away areas", () => {
    using fixture = setup();
    const sidebar = fixture.area("sidebar", 0);
    const conversation = fixture.area("conversation", 1);
    const composer = fixture.area("composer", 2);
    const panel = fixture.area("panel", 3);
    const terminal = fixture.area("terminal", 4);
    conversation.element.dataset.chatColumnMaximizedAway = "true";
    composer.element.hidden = true;
    panel.element.dataset.workspaceUnavailable = "true";
    terminal.element.inert = true;
    sidebar.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(sidebar.button);
  });

  it("restores the last focused control and falls back when it is removed", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    const composer = fixture.area("composer", 2);
    const remembered = document.createElement("button");
    remembered.textContent = "remembered";
    composer.element.append(remembered);
    remembered.focus();
    fixture.controller.move(-1);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(remembered);
    fixture.controller.move(-1);
    remembered.remove();
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
  });

  it("keeps focus inside a dialog or an open popup", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    fixture.area("panel", 3);
    const dialog = fixture.append('<div role="dialog" tabindex="-1">Confirm</div>');
    dialog.focus();
    expect(fixture.controller.move(1)).toBe(false);
    expect(document.activeElement).toBe(dialog);
    dialog.remove();

    const popup = fixture.append(
      '<div role="listbox" data-slot="select-popup"><button role="option">Choice</button></div>',
    );
    const choice = popup.querySelector("button")!;
    choice.focus();
    expect(fixture.controller.move(1)).toBe(false);
    expect(document.activeElement).toBe(choice);
  });

  it("keeps moving while a non-modal notification is visible", () => {
    using fixture = setup();
    const composer = fixture.area("composer", 2);
    const panel = fixture.area("panel", 4);
    fixture.append(
      '<div data-slot="toast-viewport"><div role="dialog" aria-modal="false" tabindex="0">Update available</div></div>',
    );
    composer.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(panel.button);
  });

  it("moves only between the areas of an open Settings modal", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    fixture.area("composer", 2);
    const modal = fixture.append('<div role="dialog" data-app-modal=""></div>');
    const nav = fixture.area("settings-nav", 0, modal);
    const content = fixture.area("settings", 1, modal);
    nav.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(content.button);
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(nav.button);
  });

  it("keeps moving while a shortcut recorder is on the page but not focused", () => {
    using fixture = setup();
    const nav = fixture.area("settings-nav", 0);
    const content = fixture.area("settings", 1);
    fixture.append('<button data-keybinding-capture="">Record shortcut</button>');
    nav.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(content.button);
  });

  it("brings a restored control back into view inside its own list", () => {
    using fixture = setup();
    const sidebar = fixture.area("sidebar", 0);
    const list = document.createElement("div");
    list.style.cssText = "height: 50px; overflow-y: auto";
    const spacer = document.createElement("div");
    spacer.style.height = "400px";
    const row = document.createElement("button");
    row.textContent = "Last thread";
    list.append(spacer, row);
    sidebar.element.append(list);
    const composer = fixture.area("composer", 2);
    row.focus();
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
    list.scrollTop = 0;
    fixture.controller.move(-1);
    expect(document.activeElement).toBe(row);
    expect(list.scrollTop).toBeGreaterThan(0);
  });

  it("reveals a restored control through nested scrolling lists", () => {
    using fixture = setup();
    const settings = fixture.area("settings", 1);
    const page = document.createElement("div");
    page.style.cssText = "height: 80px; overflow-y: auto";
    const inner = document.createElement("div");
    inner.style.cssText = "height: 60px; overflow-y: auto";
    const field = document.createElement("button");
    field.textContent = "Provider field";
    inner.append(Object.assign(document.createElement("div"), { style: "height: 200px" }), field);
    page.append(inner, Object.assign(document.createElement("div"), { style: "height: 400px" }));
    settings.element.append(page);
    const nav = fixture.area("settings-nav", 0);
    field.focus();
    fixture.controller.move(-1);
    expect(document.activeElement).toBe(nav.button);
    inner.scrollTop = 0;
    page.scrollTop = 300;
    fixture.controller.move(1);
    expect(document.activeElement).toBe(field);
    const box = page.getBoundingClientRect();
    const rect = field.getBoundingClientRect();
    expect(rect.bottom > box.top && rect.top < box.bottom).toBe(true);
  });

  it("does not scroll the conversation to an old control", () => {
    using fixture = setup();
    const conversation = fixture.area("conversation", 1);
    const timeline = document.createElement("div");
    timeline.style.cssText = "height: 50px; overflow-y: auto";
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    timeline.append(copy, Object.assign(document.createElement("div"), { style: "height: 400px" }));
    conversation.element.append(timeline);
    const composer = fixture.area("composer", 2);
    copy.focus();
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
    // Live follow moved the timeline to the newest output.
    timeline.scrollTop = 300;
    fixture.controller.move(-1);
    expect(document.activeElement).toBe(conversation.element);
    expect(timeline.scrollTop).toBe(300);
  });

  it("returns focus to the area when its focused control disappears", async () => {
    using fixture = setup();
    const panel = fixture.area("panel", 3);
    const tab = document.createElement("button");
    tab.textContent = "Files tab";
    panel.element.append(tab);
    tab.focus();
    tab.remove();
    await vi.waitFor(() => expect(document.activeElement).toBe(panel.button));
  });

  it("falls back to the main content when the whole area disappears", async () => {
    using fixture = setup();
    const composer = fixture.area("composer", 2);
    const details = fixture.area("details", 3);
    details.button.focus();
    details.element.hidden = true;
    await vi.waitFor(() => expect(document.activeElement).toBe(composer.button));
  });

  it("waits for a requested area to mount", async () => {
    using fixture = setup();
    fixture.area("composer", 2);
    fixture.controller.request({ area: "pull-requests" });
    const list = fixture.area("pull-requests", 1);
    await vi.waitFor(() => expect(document.activeElement).toBe(list.button));
  });

  it("keeps focus on a control that React remounted elsewhere", async () => {
    using fixture = setup();
    fixture.area("composer", 2);
    const header = fixture.append("<header></header>");
    const toggle = document.createElement("button");
    toggle.setAttribute("aria-label", "Toggle right panel");
    header.append(toggle);
    toggle.focus();
    const moved = toggle.cloneNode() as HTMLButtonElement;
    toggle.remove();
    header.append(moved);
    await vi.waitFor(() => expect(document.activeElement).toBe(moved));
  });

  it("keeps moving while a hover popup without focus is open", () => {
    using fixture = setup();
    const composer = fixture.area("composer", 2);
    const terminal = fixture.area("terminal", 4);
    fixture.append('<div data-slot="popover-popup">New split terminal</div>');
    composer.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(terminal.button);
  });
});
