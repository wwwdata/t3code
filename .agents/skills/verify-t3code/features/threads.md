# Threads

Users create a conversation in a project and find it again in the sidebar.

## Sub-features

- `thread-create`: open a draft for a chosen project.
- `thread-palette`: create from the command palette.
- `thread-find`: find existing conversation history and reopen it.
- `thread-search-clear`: restore the sidebar after a query.

## How to get to it (user POV)

- Sidebar `New thread` button.
- Project header or thread breadcrumb `New thread in <project name>`.
- Cmd/Ctrl+K → `New thread in...` or `New thread without a project`.
- Sidebar `Search threads` combobox.

## Driving it with Browser panel

Preconditions: doctor passed; a project exists; create a completed Replay
conversation using [Replay conversation](replay.md) before checking stored history.

- **Create.** Snapshot and click `New thread`, choose the intended project if
  prompted. Expect heading `New thread`, textbox `Message New thread`, and an
  empty conversation. Do not submit to the default paid model.
- **Project entry.** Click `New thread in <project name>` from a fresh snapshot;
  expect the same composer in that project. Capture the project breadcrumb.
- **Palette.** Press `k` with `Meta`/`Control`; type `New thread in...`, choose
  it, and select the project. Confirm the intended project and blank composer.
  Repeat `New thread without a project` when that path is affected.
- **Find.** Record a completed Replay thread's visible title. Type that title
  into `Search threads`, choose its result, and confirm the Conversation region
  contains the recorded messages. Reload its URL and confirm those messages.
- **Clear.** Clear the search text through `preview_act` with `clear: true` and
  empty text. Confirm the unfiltered sidebar returns and the thread is reachable.

## Gotchas

- A draft is not proof of a persisted turn. Finish Replay before testing history.
- Bootstrap project names vary; resolve the actual displayed name.
- A missing history fixture fails `thread-find`; an empty result is not a pass.
- New-thread creation also has configurable keybindings; consult Settings →
  Keybindings and test the configured entry when changing creation behavior.
