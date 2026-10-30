---
name: verify-t3code
description: Verify T3 Code user journeys in the real web UI with isolated development state and retained evidence. Use after personal improvements or in poteto mode; route native mobile and Electron-specific checks to their own harnesses.
---

# Verify T3 Code

Read [the feature map](features/README.md), select the affected journeys, then use
[test-t3-app](../test-t3-app/SKILL.md) for Browser panel operations. This skill adds
explicit isolation, journey coverage, and retained proof to that harness.

## Launch

Run from the checkout root. Honor `.t3/setup-running` before dependency work;
if setup never ran and dependencies are absent, run `vp i`.

Create a fresh home for each verification run and a separate evidence directory:

```bash
mkdir -p .t3
verify_home=$(mktemp -d "$PWD/.t3/verify-t3code-XXXXXX")
verify_evidence=$(mktemp -d /tmp/t3code-evidence-XXXXXX)
printf '%s\n' "$verify_home" "$verify_evidence"
vp run dev --home-dir "$verify_home" --no-seed
```

Retain the terminal session and the two absolute directory paths. Pass the same
explicit home to every backend CLI invocation (`--base-dir` on the server CLI).
Never run against `~/.t3/userdata`, copy production secrets/settings, reuse the
installed desktop server, or set `VITE_HTTP_URL` / `VITE_WS_URL`. Do not use
`--share`, link remote environments, or register OS handlers for local verification.
Ports vary: record `serverPort`, `webPort`, and `baseDir` from `[dev-runner]`.
Two runs need different homes and the runner's independently selected free ports.
Do not drive another run's instance.

Wait for migrations, `Listening on`, and the startup `pairingUrl:`. Run
`preview_status`, then `preview_open` with `profileId: "incognito"` and
`reuseExistingTab: false`; keep its returned `tabId` on every call. Navigate to
the complete pairing URL once. Ready means pairing has completed, the title is
`T3 Code (Dev)`, and the sidebar and composer or welcome view are usable.
The empty-home startup bootstraps a project and blank thread; inspect their names
rather than assuming the project is named after the repository.

If a journey needs more data, create it through the UI using a disposable project
directory. Use Replay for recorded history. Missing fixtures are failed
preconditions, not permission to weaken assertions. For large visual fixtures,
read [SQLite fixtures](../test-t3-app/references/sqlite-fixtures.md) first.

## Doctor

Before driving, and whenever the instance looks wrong, perform this read-only
identity check using the ports and PIDs recorded for this run:

```bash
git rev-parse --short HEAD
lsof -nP -iTCP:"$verify_server_port" -sTCP:LISTEN
lsof -nP -iTCP:"$verify_web_port" -sTCP:LISTEN
lsof -a -p "$verify_server_pid" -d cwd -Fn
ps -p "$verify_server_pid" -o pid=,ppid=,args=
```

Set the port variables from the launch log and the PID from its listener row.
Confirm the server cwd belongs to this checkout (`apps/server`), its process is
from the retained launch, and the log's `baseDir` equals `verify_home`. On Linux,
use `ss -H -ltnp` and `/proc/<pid>/cwd` for the same check. Then use
`preview_status` and `preview_snapshot` to confirm the tab's exact dev origin,
`T3 Code (Dev)` identity, usable UI, and absence of a pairing/disconnected screen.
An HTTP 200 or listening socket alone is insufficient. Refuse mutations if
identity, isolation, or authentication cannot be confirmed.

## Drive

Use `preview_snapshot` for fresh ARIA references, then `preview_act` with
`locator: "aria-ref=..."`. References expire after a snapshot or navigation.
The feature recipes name stable roles and labels; resolve those in the current
snapshot. For controls beyond the bounded tree, a repo-grounded selector such as
`button[aria-label="Use light mode"]` is acceptable. Use `preview_evaluate` for
read-only observations, never internal setters as a substitute for user actions.
Wait for observable state, not arbitrary sleeps. If the Browser panel is
unavailable, report the blocker; do not silently substitute another harness.

For native mobile use [test-t3-mobile](../test-t3-mobile/SKILL.md), pointing its
pairing helper at this run's explicit home and backend. A web pass covers shared
web rendering, not Electron IPC/OS integration or React Native. This recipe does
not isolate Electron's Chromium profile: `--home-dir` isolates backend state,
but the desktop development profile is shared as `t3code-dev`. Do not launch
desktop verification through this recipe. Report shell-specific proof blocked
until a separate Electron user-data profile is supported and verified. Do not
drive the installed app. Report unavailable device proof honestly.
Provider-specific changes need that adapter's real behavior; Replay proves only
the recorded pipeline/UI path. Use the cheapest suitable real model when needed.

## Evidence

Start `preview_recording_start` before the action. Capture before and after with
`preview_snapshot` (`save: true` returns `screenshotPath`); also save a normal
snapshot's ARIA tree and action timeline. Stop with `preview_recording_stop`.
Copy screenshots and recording from the returned paths into `verify_evidence`.
Browser artifacts may initially be stored by the host harness outside the dev
home; never delete or clean the host's artifact directory.

Keep a transcript in `verify_evidence` with commit, feature ID, entry point,
client/provider/connection mode, home, ports, actions, expected/observed results,
and artifact paths. Redact pairing tokens and credentials. For mutations,
reopen/reload through the UI and verify persistence; inspect output files or
read-only database state when those side effects are part of the feature.
Capture the action and result, not merely a final screenshot. UI work needs
before/after captures; timing needs video. Exercise real user paths; mocks belong
only at existing external boundaries. If using a dry-run, observe what it actually
writes or sends instead of trusting the flag name.

Run focused tests and lint for the change; before a requested push use
`vp run check:changed`. Do not run repo-wide checks. Report each applicable entry
point, client, provider, contract/agent path, reverse state, and connection mode as
passed, failed, or untested. A convenient entry point never proves the others.

## Cleanup

Keep the environment available while iterating. At the end of a bounded proof
run (including a failed attempt), stop recording, copy evidence, close only your
tab with `t3_preview_close`, and interrupt the retained server terminal session.
Confirm both captured listener PIDs exited. If interruption leaves a child,
terminate only a PID captured from this launch after confirming its cwd and
ownership. Never kill by name/path patterns or stop another server.

Remove only the fresh `verify_home` created for this run after the process exits.
Never remove the worktree's whole `.t3`, production state, or evidence. Confirm
`verify_evidence` still contains readable screenshots, video, and transcript after
teardown, and return its path. A proof lost during cleanup fails verification.

## Helpers

No new executable helper is required. Browser panel tools drive the real client;
the linked platform skills own pairing and fixture helpers. Keep the feature map
current with `$maintain-verification-skill` as behavior changes.
