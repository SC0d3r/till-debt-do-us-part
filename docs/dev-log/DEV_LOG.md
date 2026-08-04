# Dev Log

Reverse-chronological. `game-director` appends one entry per shipped feature,
at the END of step 7 in its cycle (newest entry at the top). This file is
ground truth for "what already exists in the game" — trust it over memory.

Entry template:

```
## <feature name> — <category> — <YYYY-MM-DD>
Commit: <hash>
Summary: <1-2 sentences>
Verdicts: design=<..> ui=<..> visual=<..> performance=<..> qa=<..>
Follow-ups queued: <backlog items added as a result, or "none">
```

---

## Debug/test harness (Part A) — Tech & Performance — 2026-08-04
Commit: 55883ed (manifest refresh: 1da0e6d)
Summary: Implemented docs/dev-log/DEBUG_HARNESS.md Part A end-to-end. `window.__debug` API (ready/setState/getState/gotoFixture/fastForward/triggerEvent/listFixtures) in src/debug/devHarness.ts, gated on `import.meta.env.DEV` + `?debug=1` and fully tree-shaken out of prod (verified by scripts/check-prod-bundle.mjs, wired into the Pages deploy). 8 seed fixtures (main-menu, farm-day, farm-crops-grown, shop-open, inventory-open, dialogue-open, mine-floor-1, slot-machine) with leak-free reset (localStorage wipe, fresh player/farm, story-trigger suppression, GPU teardown via FarmGrid.dispose + disposeObject). Puppeteer-core capture pipeline (scripts/capture-screenshots.mjs) with dev-server respawn, AbortSignal.timeout(2000) reachability, 960x720 desktop viewport + CSSOM hover:none strip, software-render fallback, merging index.json manifest. QA's automated suite tests/qa-harness.mjs: 118/122 probes green.
Verdicts: design=skipped (infra per spec Part A) ui=SHIP WITH FOLLOWUPS visual=SHIP WITH FOLLOWUPS performance=SHIP WITH FOLLOWUPS qa=SHIP WITH FOLLOWUPS
Follow-ups queued: mine-teardown-leak, harness-validation-gaps, overlay-flags-computed-style, capture-respawn-process-group, slot-layout-960x720, slot-fixture-determinism, dialogue-listener-and-slot-latch, mesh-dispose-and-interval-cancel, engines-and-favicon-housekeeping

---

<!-- newest entries go here -->
