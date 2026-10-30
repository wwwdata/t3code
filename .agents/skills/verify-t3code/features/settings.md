# Settings and appearance

Users can find a preference, change it, and retain it after reloading the client.

## Sub-features

- `settings-sidebar`: open Settings and choose Appearance.
- `settings-search`: find the theme through settings search.
- `settings-route`: reopen `/settings/appearance` directly.
- `settings-palette`: open settings from the command palette.
- `appearance-mode`: switch light/dark/system, persist, and restore.
- `appearance-keyboard`: cycle appearance with the configured shortcut.

## How to get to it (user POV)

- Sidebar `Settings` button → `Appearance` section.
- Settings `Search settings` → search `theme` and choose its result.
- Open `/settings/appearance` on the paired dev origin.
- Cmd+K on macOS or Ctrl+K elsewhere → `Open settings`.
- Cmd/Ctrl+Alt+Shift+A cycles appearance outside terminal focus.

## Driving it with Browser panel

Preconditions: doctor passed; paired dev tab; record current appearance selection.

- **Sidebar.** Snapshot, click the `Settings` button reference, snapshot, click
  treeitem `Appearance`. Expect a Settings dialog at `/settings/appearance`.
- **Change.** Start recording and capture before. Click `Use light mode` via
  its button reference or selector `button[aria-label="Use light mode"]`.
  Read `aria-pressed` on that button: expect `true` and a light page.
- **Persist.** `preview_navigate` to the same `/settings/appearance` URL for a
  document reload. Snapshot and read the selected button again; expect light
  still selected. Capture after and the action timeline.
- **Reverse.** Click `Use dark mode`, confirm pressed; restore the original
  `Follow the system appearance`, `Use light mode`, or `Use dark mode` button.
  Reload and confirm that original selection persists.
- **Search.** Resolve combobox `Search settings`; `preview_act` type `theme`.
  Choose the theme result and confirm Appearance opens; use `Clear settings
  search` to restore the navigation list.
- **Palette.** Close Settings, press `k` with `Meta` (macOS) or `Control`, type
  `Open settings` into the palette input, choose that result. Confirm Settings.
- **Keyboard.** Outside terminal focus press `a` with `Meta`/`Control`, `Alt`,
  `Shift`; reopen Appearance and confirm mode changed. Restore original mode.

## Gotchas

- Theme preferences are client state; observe persistence by document reload,
  not by expecting a server database row. Use the run's incognito tab.
- Search and keyboard entry points require separate proof when affected.
- Shortcuts can be customized; inspect Settings → Keybindings if defaults fail.
- Browser emulation of dark mode does not exercise the app's mode controls.
