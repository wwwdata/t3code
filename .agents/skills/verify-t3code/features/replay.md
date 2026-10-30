# Replay conversation

Users see a recorded agent conversation stream through the real development
provider and reopen its completed history without paying for a model turn.

## Sub-features

- `replay-open`: open the development scenario picker.
- `replay-showcase`: render thinking, plan, tool calls, approval, and markdown.
- `replay-history`: reopen the completed conversation after reload.

## How to get to it (user POV)

- In the dev client, press Ctrl+Alt+Shift+R and choose `showcase` in the picker.
- For a CLI pipeline check, the server CLI can start the same scenario.

## Driving it with Browser panel

Preconditions: doctor passed; dev instance with Replay registered; paired tab;
no active paid provider turn. Read [test-t3-app](../../test-t3-app/SKILL.md).

- **Start.** Begin recording. Use `preview_act` press `r` with modifiers
  `Control`, `Alt`, `Shift`. Snapshot the picker and click `showcase`.
- **Observe.** Snapshot the Conversation region as the turn streams. Capture
  thinking, plan, tool-call and approval states. If the scenario pauses for an
  approval, drive its visible approval control and record the choice.
- **Complete.** Wait for the actual completed state through snapshots. Capture
  final markdown and tools. Record the thread URL and displayed title.
- **Persist.** Navigate to that thread URL for a document reload and confirm
  the recorded messages and tool results survive. Save screenshot and ARIA tree,
  then stop recording and copy the video into the evidence directory.
- **CLI entry.** When CLI behavior is in scope, run from the repo root:
  `node apps/server/src/bin.ts thread start --base-dir "$verify_home" --provider devReplay --model showcase <project> "go"`,
  replacing `<project>` with the disposable instance's project identifier.
  Save command/output/exit code; open the resulting thread in the UI and confirm
  completion and retained history. CLI entry does not prove the keyboard picker.

## Gotchas

- GNOME can intercept Ctrl+Alt+Shift+R for screen recording. Report that entry's
  blocker; the CLI can prove the pipeline separately, not the shortcut.
- Do not use `window.t3dev.replay` as proof of a user-driven picker.
- Replay simulates a recorded provider boundary. It does not prove Codex,
  Claude, Cursor, Grok, OpenCode, or Antigravity protocol compatibility.
- Empty history or an unfinished approval is a failed journey, not a pass.
