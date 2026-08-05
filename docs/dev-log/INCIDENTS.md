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
