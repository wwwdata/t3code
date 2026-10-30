# T3 Code verification map

Start with [verify-t3code](../SKILL.md): isolated explicit home, separate browser
tab, doctor, evidence directory, and teardown apply to every recipe.

- [Settings and appearance](settings.md): sidebar, search, direct route, command palette, keyboard, persistence, reversal.
- [Threads](threads.md): create, find, reopen, and alternate creation entry points.
- [Replay conversation](replay.md): free recorded turn, streaming, rendered history, reload.

These are starter journeys, not a complete catalog. Extend the relevant file
when a change adds an entry point or behavior; add another feature for a distinct
user task. All recipes use fresh Browser panel snapshots and `preview_act`.
Record feature and entry-point IDs with evidence. Missing data or unavailable
surfaces are failed preconditions with reasons, never silently skipped assertions.

Baseline: an empty-home dev instance paired in an incognito tab, with its
bootstrapped project and blank thread. Create history through Replay when needed.
For real file-changing turns use a disposable project, not this checkout or a
user workspace. No paid agent is needed for the baseline proof.

A web run does not prove mobile, desktop shell integration, remote/relay, or
tunnel behavior. List each relevant surface and connection mode in the result.
