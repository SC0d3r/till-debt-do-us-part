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

<!-- newest entries go here -->
