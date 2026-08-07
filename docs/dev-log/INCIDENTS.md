## 2026-08-05 — Fast QA mode cycle
Subagent: ui-critic (round 2), plus infra notes
Observed: ui-critic round-2 review returned an empty result (task completed with
no output). Retried once with the interrupted-attempt instruction; second run
produced a full review. Also: shell tool calls touching `node tests/...` timed
out at 30-120s with no output (pgrep/pkill hung; a 120s mini-probe run died
silently) — leftover baseline e2e process survived a `pkill` and contended for
CPU until killed by PID; /tmp/opencode reads were permission-denied, so temp
logs moved to tests/.tmp-baseline/ (now gitignored).
Retries: ui-critic 2 attempts (1 retry); pkill/process checks repeated

---

## 2026-08-06 — TileMapComposer slice A cycle (user revisions)
Subagent: feature-writer (rev-2 outline round), design-critic (rev-2 + rev-3/4 re-checks), performance-critic (rev-1 re-check), plus infra notes
Observed: feature-writer rev-2 round returned EMPTY (completed with no output); design-critic returned EMPTY twice (rev-2 re-check, rev-3/4 re-check); performance-critic returned EMPTY once (rev-1 re-check). All four resumed the SAME session with a continue nudge and completed on the next attempt — no fresh agents were started. Also: one CI capture run failed with "Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout" (Chrome startup flake on the runner); retried the same dispatch once and it succeeded. Also: `git push origin dev` timed out at 60s once; a second attempt with a 180s timeout succeeded (lesson: use long timeouts for pushes, they can take minutes).
Retries: 4 subagent resumes (all successful); 1 capture re-dispatch (successful); 1 push retry (successful)
Resolution: all resumed successfully on the same-session path

# Incidents

Append-only. `game-director` writes here whenever a subagent fails 3 retries
in a row (see its Resilience section) — network outages, provider timeouts,
crashes. Nothing reads this back automatically; it's for you to skim
periodically to spot patterns (e.g. "feature-writer keeps timing out" usually
means an infra problem worth fixing outside the loop, not a content problem).

Entry template:

```
## <YYYY-MM-DD HH:MM> — <feature name>
Subagent: <which one>
Observed: <what happened, verbatim if possible>
Retries: <how many attempts>
Resolution: blocked and moved on / resumed successfully on next invocation
```

---

## 2026-08-04 ~06:00–07:30 — day/night cycle slice 1
Subagent: feature-writer (x3), scene-capture (x1)
Observed: Network outage window during the cycle. feature-writer: attempt 1
returned empty result (no work done), attempt 2 cancelled mid-flight by
outage (no work), attempt 3 (resume of same session) landed the full feature
but returned an empty final message — work verified in the tree. Fix round:
attempt 1 empty (no work), attempt 2 empty (no work), attempt 3 (same
session resume) completed all fixes. scene-capture: one cancellation after
the run's work had already completed (7/7 PNGs + manifest verified in tree).
Also: a direct `node tests/qa-harness.mjs` run by game-director exceeded a
7-minute shell timeout on this 1fps box (infra note, not an agent failure —
qa-tester and feature-writer both ran it to completion under their own
budgets).
Retries: 2–3 per call per Resilience rules; all calls eventually completed.
Resolution: no feature work lost; all resumed successfully on next attempt.

## 2026-08-06 ~11:00–12:00 — tile-kit grass family review rounds
Subagent: asset-critic (x2), visual-critic (x2)
Observed: critics could not run the NVIDIA vision API recipe — bash permission
allowlist in .opencode/agent/*.md allowed only git/cat/ls/find/grep, so
source/base64/python3/curl were denied ("The bash permission system denies
source"). Root cause: opencode loads agent config ONCE at process start and
does not hot-reload; the running `opencode --continue` process (PID 211988,
started 11:04) predated the permission edits (11:30), so spawned subagents
kept the stale allowlist until the user restarted opencode. Also: one pair of
final critic dispatches returned completely empty results (silent failure);
both sessions resumed successfully via task_id with a continue nudge (per the
new SILENT-FAILURE PROTOCOL) and delivered full reviews.
Retries: 2 rounds of critics before restart; 1 resume each after silent empty.
Resolution: agent MDs fixed + committed (777b146); opencode restarted by user;
critics re-ran successfully with NVIDIA vision.

## 2026-08-07 11:18Z — Slice B tile trim critic round
Subagent: visual-critic, ui-critic, asset-critic, performance-critic (4 parallel dispatches)
Observed: all four were dispatched in parallel with design-critic. design-critic
completed (SHIP WITH FOLLOWUPS, ses_0242ad302ffesYFvM7BNuTbXj7). The other four
returned "Task cancelled" with NO task ids — the user accidentally closed
opencode mid-dispatch. Session ids were never returned, so the same sessions
cannot be resumed (SILENT-FAILURE PROTOCOL rule 5: session lost = say so, don't
pretend). Per user directive the critics will be re-dispatched FRESH after the
prop library (slice B section 4) is built, so the whole slice is reviewed at
once — tile-only verdicts would be premature anyway.
Retries: n/a (cannot resume lost sessions)
Resolution: recorded as lost sessions; fresh dispatch scheduled post-props
