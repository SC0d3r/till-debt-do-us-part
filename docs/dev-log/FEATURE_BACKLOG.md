# Feature Backlog

`game-director` reads and updates this file every cycle. Each entry:

`- [status] (category, size) Title — one-line pitch`

Status: `idea` -> `in-progress` -> `shipped`, or `blocked`.
Category: Core Loop / Animals & Husbandry / World & Exploration / NPCs & Story /
Economy & Progression / Events & Seasons / Polish & Game Feel /
UI/UX & Accessibility / Tech & Performance.
Size: S (few hours of an agent's time) / M (half a "cycle" worth) / L (should be
split before building).

Keep at least 3 un-started `idea` entries at all times — if the list gets thin,
the next cycle's Ideate step will top it back up.

---

## Shipped

- [shipped] (Tech & Performance, M) Debug/test harness Part A — window.__debug
  API, 8 seed fixtures, screenshot capture pipeline, prod tree-shake gate.
  (dev 55883ed / manifest 1da0e6d, 2026-08-04)

## Follow-ups from harness review (2026-08-04)

- [idea] (Tech & Performance, M) Mine teardown leak — dispose floor children on
  every `buildFloorVisuals()` rebuild and null the five cached mine-light refs
  in `exitMine()` (stale follow-lights darken the mine on 2nd+ entry). perf-critic
  Major; same leak class as the farm fix, still open on the mine side.
- [idea] (Tech & Performance, S) Harness validation gaps — `setState` must
  reject unknown keys under `mine`/`position` and range-check `selectedSlot`
  to 0..15 (currently silently accepted). ui-critic + qa-tester.
- [idea] (Tech & Performance, S) Overlay flags via computed style — getState
  pause/payment visibility currently reads inline style, false-positive while
  stylesheet-hidden. qa-tester.
- [idea] (Tech & Performance, S) Capture respawn leaks vite — kill the dev
  server's process group (`detached: true` + `process.kill(-pid)`) so the
  grandchild survives neither the script nor the shell. qa-tester.
- [idea] (Polish & Game Feel, S) Slot layout at 960x720 — side bet/rules panels
  overlap the 6x7 grid at the new reference resolution; tighten spacing.
  visual-critic.
- [idea] (Tech & Performance, S) Slot fixture determinism — seed the spin RNG
  (or re-roll until a match) so the baseline can't land on a dim no-win grid.
  visual-critic.
- [idea] (Tech & Performance, S) Listener/latch hygiene — remove DialogueSystem
  skip-handler on close/show (listener accumulation), self-reset the
  `_debugClosingSlot` latch, `clearTimeout(_closeTimer)` in SlotMachine.open().
  ui-critic + perf-critic.
- [idea] (Tech & Performance, S) Dispose replaced per-tile/crop meshes on
  `updateTileVisual` and cancel payment-overlay countInterval/coin rAF chains
  in harness reset. perf-critic.
- [idea] (Tech & Performance, XS) Housekeeping — `engines: node >=18` pin
  (AbortSignal.timeout/puppeteer-core 25), add a favicon to kill the dist 404.
  perf-critic + qa-tester.

---

## Seed ideas (edit/replace freely — these exist so cycle 1 isn't a cold start)

- [idea] (Core Loop, M) Crop cross-breeding — cross two crop types planted
  adjacent for a chance at a hybrid with blended traits. Adds a planning layer
  to plot layout.
- [idea] (Animals & Husbandry, M) Animal happiness meter — petting, feeding
  variety, and cleanliness affect produce quality/yield, not just quantity.
- [idea] (World & Exploration, L) Day/night lighting cycle with a real sky
  (split into: S — sun/moon position + color temperature shift; separate items
  for stars/weather later).
- [idea] (NPCs & Story, M) One rival farmer NPC with a simple relationship
  meter and 3-stage dialogue that reacts to your farm's progress.
- [idea] (Economy & Progression, S) Tool upgrade forge — spend currency + a
  material to upgrade a tool's range/speed, with a visible tool model change.
- [idea] (Events & Seasons, M) Harvest Fair — a seasonal event day where you can
  enter your best crop/animal for a prize and modest reputation bonus.
- [idea] (Polish & Game Feel, S) Harvest juice pass — squash/stretch on
  pickup, a satisfying pop/particle burst, and a short screen-space flash on
  a "perfect quality" harvest.
- [idea] (UI/UX & Accessibility, S) Remappable keybindings + a colorblind-safe
  palette toggle for quality/rarity indicators.
- [idea] (Economy & Progression, S) Farm expansion — purchase an adjacent plot
  of land to unlock more tillable tiles.
- [idea] (Tech & Performance, S) Instance identical crop meshes with
  `InstancedMesh` instead of one mesh per plant.
