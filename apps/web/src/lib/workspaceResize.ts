import { isWorkspaceElementVisible, requestWorkspaceFocus } from "./workspaceFocus";
import type { SizeEdit } from "./resizeEdit";

export type WorkspaceResizeTargetId = "right" | "bottom";
interface ResizeTarget {
  id: WorkspaceResizeTargetId;
  divider: HTMLElement;
  size: () => number;
  begin: () => SizeEdit;
  prepare?: () => void;
}

type ResizeState =
  | { mode: "idle" }
  | { mode: "prefix"; timer: number; restore: () => void; preferred: WorkspaceResizeTargetId }
  | {
      mode: "resizing";
      target: ResizeTarget;
      edits: Map<ResizeTarget, SizeEdit>;
      restore: () => void;
    };

export function createWorkspaceResizeController(doc: Document) {
  const targets = new Map<WorkspaceResizeTargetId, ResizeTarget>();
  let state: ResizeState = { mode: "idle" };
  let status: HTMLElement | undefined;
  const win = doc.defaultView!;
  const observer = new MutationObserver(() => {
    if (state.mode === "idle") return;
    if (
      hasModal() ||
      (state.mode === "resizing" &&
        [state.target, ...state.edits.keys()].some((target) => !available(target)))
    )
      cancel(false);
  });
  const available = (target: ResizeTarget) => isWorkspaceElementVisible(target.divider);
  const hasModal = () =>
    Array.from(
      doc.querySelectorAll<HTMLElement>('[aria-modal="true"], dialog[open], [data-app-modal]'),
    ).some(isWorkspaceElementVisible);
  const usable = () => Array.from(targets.values()).filter(available);
  const captureFocus = (previewTabId?: string) => {
    const guest = previewTabId
      ? doc.querySelector<HTMLElement>(`webview[data-preview-tab="${CSS.escape(previewTabId)}"]`)
      : null;
    const original = guest ?? doc.activeElement;
    const area = guest
      ? "panel"
      : original?.closest<HTMLElement>("[data-workspace-area]")?.dataset.workspaceArea;
    return () => {
      if (original instanceof HTMLElement && isWorkspaceElementVisible(original))
        original.focus({ preventScroll: true });
      else if (area) requestWorkspaceFocus({ area });
    };
  };
  const render = () => {
    for (const target of targets.values())
      target.divider.toggleAttribute(
        "data-workspace-resizing",
        state.mode === "resizing" && target === state.target,
      );
    if (state.mode === "idle") {
      status?.remove();
      status = undefined;
      return;
    }
    if (!status) {
      status = doc.createElement("div");
      status.tabIndex = -1;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.dataset.workspaceResizeStatus = "";
      status.className =
        "fixed bottom-4 left-1/2 z-[200] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-primary bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg outline-none";
      doc.body.append(status);
    }
    status.textContent =
      state.mode === "prefix"
        ? "Resize panes: press R. Escape cancels."
        : `Resize mode · ${state.target.id === "right" ? "Right panel width" : "Terminal height"}: ${Math.round(state.target.size())}px. ${state.target.id === "right" ? "H/L or Left/Right" : "K/J or Up/Down"} move divider · Shift: 50px · Tab: switch pane · Enter: save · Esc: cancel`;
    status.focus({ preventScroll: true });
  };
  const watch = () =>
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "hidden",
        "style",
        "class",
        "inert",
        "aria-hidden",
        "aria-modal",
        "data-workspace-unavailable",
        "data-preview-panel-maximized",
        "data-preview-panel-mode",
      ],
    });
  const finish = (commit: boolean, restore: boolean) => {
    const previous = state;
    if (previous.mode === "idle") return;
    state = { mode: "idle" };
    observer.disconnect();
    if (previous.mode === "prefix") win.clearTimeout(previous.timer);
    else
      for (const edit of previous.edits.values()) {
        if (commit) edit.commit();
        else edit.cancel();
      }
    render();
    if (restore) previous.restore();
  };
  const cancel = (restore = true) => finish(false, restore);
  const start = (previewTabId?: string) => {
    if (state.mode === "resizing" || hasModal()) return false;
    const availableTargets = usable();
    const preferred = state.mode === "prefix" ? state.preferred : preferredTarget();
    const target =
      availableTargets.find((candidate) => candidate.id === preferred) ?? availableTargets[0];
    if (!target) {
      cancel();
      return false;
    }
    for (const candidate of availableTargets) candidate.prepare?.();
    const restore = state.mode === "prefix" ? state.restore : captureFocus(previewTabId);
    if (state.mode === "prefix") win.clearTimeout(state.timer);
    state = { mode: "resizing", target, edits: new Map(), restore };
    watch();
    render();
    return true;
  };
  const preferredTarget = (): WorkspaceResizeTargetId =>
    doc.activeElement?.closest('[data-terminal-owner="drawer"]') ? "bottom" : "right";
  const armPrefix = (previewTabId?: string) => {
    if (state.mode !== "idle" || hasModal() || usable().length === 0) return false;
    const restore = captureFocus(previewTabId);
    state = {
      mode: "prefix",
      timer: win.setTimeout(() => cancel(), 1500),
      restore,
      preferred: preferredTarget(),
    };
    watch();
    render();
    return true;
  };
  const handleKey = (event: KeyboardEvent) => {
    if (state.mode === "idle") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (
      hasModal() ||
      (state.mode === "resizing" &&
        [state.target, ...state.edits.keys()].some((target) => !available(target)))
    ) {
      cancel(false);
      return true;
    }
    if (event.isComposing || event.keyCode === 229) {
      cancel(false);
      return true;
    }
    if (state.mode === "prefix") {
      if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return true;
      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey)
        start();
      else cancel();
      return true;
    }
    if (event.key === "Escape") cancel();
    else if (event.key === "Enter") finish(true, true);
    else if (event.key === "Tab") {
      const next = usable();
      const index = next.indexOf(state.target);
      state.target = next[(index + (event.shiftKey ? -1 : 1) + next.length) % next.length]!;
      render();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key.toLowerCase();
      const negative = state.target.id === "right" ? ["h", "arrowleft"] : ["k", "arrowup"];
      const positive = state.target.id === "right" ? ["l", "arrowright"] : ["j", "arrowdown"];
      const direction = negative.includes(key) ? -1 : positive.includes(key) ? 1 : 0;
      if (direction) {
        let edit = state.edits.get(state.target);
        if (!edit) {
          edit = state.target.begin();
          state.edits.set(state.target, edit);
        }
        edit.moveDivider(direction * (event.shiftKey ? 50 : 10));
        render();
      }
    }
    return true;
  };
  const blur = () => cancel(false);
  const composition = (event: CompositionEvent) => {
    if (state.mode === "idle") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel(false);
  };
  const pointer = () => cancel(false);
  win.addEventListener("blur", blur);
  win.addEventListener("compositionstart", composition, true);
  win.addEventListener("pointerdown", pointer, true);
  return {
    start,
    armPrefix,
    handleKey,
    cancel,
    register(target: ResizeTarget) {
      const previous = targets.get(target.id);
      if (previous && state.mode !== "idle") cancel(false);
      targets.set(target.id, target);
      return () => {
        if (targets.get(target.id) !== target) return;
        if (
          state.mode === "prefix" ||
          (state.mode === "resizing" && (state.target === target || state.edits.has(target)))
        )
          cancel(false);
        targets.delete(target.id);
      };
    },
    dispose() {
      cancel(false);
      win.removeEventListener("blur", blur);
      win.removeEventListener("compositionstart", composition, true);
      win.removeEventListener("pointerdown", pointer, true);
    },
  };
}

let controller: ReturnType<typeof createWorkspaceResizeController> | undefined;
const targets = new Map<ResizeTarget, (() => void) | undefined>();
export function startWorkspaceResize() {
  const active = createWorkspaceResizeController(document);
  controller = active;
  for (const target of targets.keys()) targets.set(target, active.register(target));
  return () => {
    active.dispose();
    if (controller === active) {
      controller = undefined;
      for (const target of targets.keys()) targets.set(target, undefined);
    }
  };
}
export function registerWorkspaceResizeTarget(target: ResizeTarget) {
  targets.set(target, controller?.register(target));
  return () => {
    targets.get(target)?.();
    targets.delete(target);
  };
}
export const beginWorkspaceResize = (previewTabId?: string) =>
  controller?.start(previewTabId) ?? false;
export const armWorkspaceResizePrefix = (previewTabId?: string) =>
  controller?.armPrefix(previewTabId) ?? false;
export const handleWorkspaceResizeKey = (event: KeyboardEvent) =>
  controller?.handleKey(event) ?? false;
export const cancelWorkspaceResize = () => controller?.cancel(false);
