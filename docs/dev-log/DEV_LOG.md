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

## Day/night cycle (slice 1) — World & Exploration — 2026-08-04
Commit: 0695a04 (docs commit follows)
Summary: In-game 24h clock (timeOfDay 0..1439, default 06:00, 2 in-game
min/real sec = 12-min day) drives the whole sky/lighting rig from keyframes:
sky/fog/ambient/sun/fill colors+intensities (noon pixel-locked to the old
baseline at 720), sun east→west arc (noon position exactly (23,26,16)), the
sun DirectionalLight doubles as moonlight at night, HUD clock (24h HH:MM,
minute-gated DOM writes), sleep resets to 06:00, Moonpetal crops glow at
night (ripe 0x8866cc @0.5, unripe faint 0.175 with stage-0/1 mesh fallback;
transition-only pass, zero per-frame allocations). Harness: timeOfDay in
setState (integer 0..1439, throws otherwise) + getState, new farm-night
fixture (22:00, ripe patch incl. Moonpetal), farm-day/farm-crops-grown pinned
to noon 720 (baselines pixel-identical); qa-harness updated to the 9-fixture
registry (120/124, same 4 pre-existing known gaps); new tests/probe-daynight.mjs
(57/57). New docs/DESIGN_NOTES.md — design direction: the game is isometric,
celestial bodies are NEVER designed to be visible in the sky; time of day is
conveyed by light and ambient only. This cancelled the "moon invisible" visual
finding and blocks the starfield idea.
Verdicts: design=SHIP WITH FOLLOWUPS (pre-build + final pass) ui=SHIP WITH
FOLLOWUPS visual=SHIP WITH FOLLOWUPS (incl. narrow re-review after fix round)
performance=SHIP WITH FOLLOWUPS qa=SHIP WITH FOLLOWUPS (incl. narrow
re-review: SHIP, 120/124 + 57/57)
Follow-ups queued: day/night-slice-2-design (night harvest bonus on Moonpetal,
shop/dialogue pause decision, shorter night, midnight rollover, dt-clamp clock
speed), sunrise-keyframe-pass, night-coziness, night-shadow-pass-toggle,
fastForward-fractional-days, slot-clock-lag, hud-rtl-320px-overflow,
moonpetal-glow-halo

---
