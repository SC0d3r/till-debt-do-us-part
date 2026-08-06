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

## Standing directives (game-director — always in force)

- **MODULAR CODE (2026-08-05, directive from project owner):** every
  `feature-writer` brief MUST require modular code. New features go in a
  purpose-named module under `src/<domain>/` (or an existing one); no new
  feature logic is to be added inline to `src/main.ts`. `main.ts` stays the
  thin composition root: wire subsystems, own the render loop, own nothing
  else. This directive predates and outlives the main.ts refactor — it applies
  from the next cycle onward even if the refactor is still in progress.

---

## Tile-kit initiative batch (2026-08-06) — Modular Isometric Biome Tile System

One-time initiative per `docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`.
Draw exclusively from this batch until its Definition of Done (section 5) is
met; category-variety rules are temporarily suspended for this batch. Items
are tagged `tile-kit:` so they're recognizable. Sequencing per brief section
6: composer right after the FIRST biome family ships, so the data-driven API
is validated early.

- [shipped] (Assets & Art, M) tile-kit: grass family — plain grass, flowers-decorated, bush/tree-decorated (single merged geometry, InstancedMesh-safe), grass→dirt edge-transition family (exactly 4 baked orientation variants n/e/s/w via shared `transitionTexture.js`), grass→tilled-soil edge, plus a plain dirt variant for showcase context. FIRST biome family; validates the tile construction convention + preview pipeline. SHIPPED 2026-08-06: 13 variants (grass-plain/flowers/bushes, grass-dirt-n/e/s/w, grass-tilled plain + grass-tilled-n/e/s/w edges, dirt-plain), straight-sided two-band prism (top ~55% / root ~45%), per-biome root colors, sRGB-unified texture pipeline, previewAsset harness + 13 fixtures, qa regression suite. NEXT: composer (brief §6).
- [idea] (Tech & Performance, L) tile-kit: TileMapComposer + showcase map — data-driven `src/world/TileMapComposer.js` taking `{x,y,biome,variant,elevation?}` grids; InstancedMesh per (biome,variant) group; hover (per-instance color via setColorAt) + selection feedback; showcase map proving every family built so far in one view; wire through `window.__debug` fixture. Ships right after the grass family.
- [idea] (Assets & Art, S) tile-kit: decorative props base set — crystals (color variants), rocks/boulders (small+large), low-poly tree/bush, grass tufts, flowers; each a small reusable factory, heavily instanced, composable onto tile top faces by the composer.
- [idea] (Assets & Art, M) tile-kit: dirt/farmland family — plain, tilled, watered, grass-transition edges (reuse/extend grass edges).
- [idea] (Assets & Art, M) tile-kit: water family — plain, shoreline/edge-to-grass or edge-to-sand transition.
- [idea] (Assets & Art, M) tile-kit: sand/desert family — plain, dune/cracked variant, cactus-decorated, grass-transition edge.
- [idea] (Assets & Art, M) tile-kit: rock/stone family — plain, ore/boulder-decorated, cliff/elevated variant (raised block on top).
- [idea] (Assets & Art, M) tile-kit: crystal/volcanic fantasy family — crystal-cluster tiles + lava-vent tiles with glow; the "diverse enough to build any map" stress test.
- [idea] (Tech & Performance, L) tile-kit: farm layout data + swap-over initiative — build today's farm layout as composer data and swap the live scene onto the tile system (SEPARATE later initiative; only once explicitly told gameplay is being rebuilt on this foundation).

---

## Shipped

- [shipped] (Tech & Performance, M) CI pipeline: arbitrary tests + async +
  gh rules — extended the puppeteer pipeline so ANY agent can run arbitrary
  custom puppeteer scripts through GitHub Actions (`--tests=` workflow input +
  custom-tests job), added `--async`/`--collect` multitasking, and made every
  gh/git call retry through ap/apsi/proxychains4 on 403/unreachable. Fixed the
  snapshot bug (git stash create drops untracked files → private temp index +
  commit-tree) and the CI build gate (typescript ^5.9.3 for madge@8 peer).
  Agent docs: qa-tester runs ONCE at end of eval; workflow yml synced to
  master. Validated on CI with tests/smoke-ci.mjs. (dev 5644ae0, 2026-08-06)
- [shipped] (Tech & Performance, L) Modularize main.ts — 1946-line Game
  monolith split into 14 subsystem modules (WorldBuilder, DayNightDriver,
  PlayerController, PlayerActionsController, Dog/ShopNpc/MorningBuyer
  controllers, ShipmentController, PaymentOverlay, CoinFx, RootEvents,
  MineController, StoryController, SaveController) + DebugActionRegistry;
  main.ts is now a 548-line composition root. Zero-behavior-change; quirk
  checklist preserved (bone-name lookups, unreachable updateUnstuckBtn);
  devHarness migrated to devGraph with pinned __debug API. (dev, 2026-08-05)
- [shipped] (Tech & Performance, M) CI pipeline verification — moved the
  puppeteer test/capture pipeline to GitHub Actions: `puppeteer-tests.yml`
  workflow (dev-mode build so the harness survives, `test:e2e` script,
  env-driven CHROME_PATH/BASE_URL, `--no-sandbox`, parallel-safe
  `run-ci-puppeteer.sh` with per-run disposable branches, dev-server serve,
  GPU probe skip on GPU-less runners, browser provisioning input
  (setup-chrome/preinstalled/puppeteer-bundled), 60s cold-load wait, Vite
  pre-warm, artifact upload on failure + download fix, `--browser`
  passthrough, preinstalled Chrome as default, refreshed CI-captured fixture
  screenshots). (dev 7942df8..9bbe43e, 2026-08-05)
- [shipped] (World & Exploration, M) Day/night cycle slice 1 — in-game
  clock (24h, 2 in-game min per real sec) + sun/moon arc + sky/light color
  temperature shift + HUD clock + Moonpetal night glow. (dev 0695a04,
  2026-08-04)
- [shipped] (Tech & Performance, M) Debug/test harness Part A — window.__debug
  API, 8 seed fixtures, screenshot capture pipeline, prod tree-shake gate.
  (dev 55883ed / manifest 1da0e6d, 2026-08-04)

## Follow-ups from harness review (2026-08-04)

- [shipped] (Tech & Performance, M) Fast QA mode — decouple game logic ticks
  from paint rate under software rendering so puppeteer tests (which ran 1-2fps
  and took 15+ min) finish minutes-fast: rAF override + render throttle + cheap
  renderer (no AA, half pixelRatio, no shadows) behind ?debug=1&fast=1, plus
  __debug.setFastMode. Player-facing impact: zero (DEV+debug-gated). Suite
  runtimes after fix round: qa-harness 120/124 @ 4m42s, probe-daynight 57/57 @
  1m38s, e2e-full-loop 57/57 @ 3m13s. (dev, 2026-08-05)

## Follow-ups from modularize-main-ts review (2026-08-05)

- [idea] (Tech & Performance, XS) Dead getLang export — src/core/i18n.ts still
  exports getLang but nothing imports it since the refactor; remove or it reads
  as a live API. design-critic Minor.
- [idea] (Tech & Performance, XS) Shared cooldowns seam — `{ actionCooldown }`
  is handed to both PlayerActionsController and MineController and decremented
  by the root; faithful to the original but a seam in the narrow-interfaces
  story. Give it a single owner or a portal. design-critic Minor.
- [idea] (Tech & Performance, S) H7b mine-dig flake root fix — seed
  MineSystem.generateFloor with worldSeed (or exclude the spawn-facing tile
  from rocks) so the dig probe is deterministic; ~15% of runs the spawn-facing
  tile is a rock and digsLeft stays 15. qa-tester Minor (pre-existing).
- [idea] (Polish & Game Feel, XS) Unstuck button cooldown feedback — the
  updateUnstuckBtn call is unconditionally unreachable (after the paused
  early-return), so the player gets no visual cooldown state on UNSTUCK beyond
  an error beep. Pre-existing; now that the quirk is documented, decide
  whether to fix deliberately. ui-critic Minor.
- [idea] (Tech & Performance, XS) MorningBuyer Vector3 allocations — 3 new
  THREE.Vector3 per tick while the buyer is active (~5s/day); pre-existing,
  pool them. performance-critic Minor.

## Follow-ups from fast-QA review (2026-08-05)

- [idea] (Core Loop, M) Slot machine SPIN click populates 0 reel cells — real
  game bug surfaced by CI e2e (L9b, runs 30996286294/31006867682/31008271519/
  31008271710, all 56/57). Clicking the real SPIN button via puppeteer leaves
  all 3 reel cells empty (cells.ok=true, value=0), while the __debug direct
  call works. Suspects: the click lands on a non-interactive overlay, the
  touch/mobile media query route (hover:none removal is only done in the
  capture script, not e2e), or a fast-mode race with the spin animation.
  Game-side fix required; the e2e suite stays red until this is resolved.
  qa-tester + design-critic.
- [idea] (Tech & Performance, S) Fast-latch replay on panel open — clear the
  InputManager fast-mode `latched` keys when a panel opens (shop/slot/dialogue/
  pause) so a key pressed while a panel is open can't replay as an action after
  it closes (confirmed repro, zero current-suite exposure; future fast-mode
  suites must not be bitten). qa-tester + ui-critic.
- [idea] (Tech & Performance, XS) DN2.3 comment + wrap bounds — DN2.3's comment
  claims it catches "multi-hour leaps" but an average over ~625 ticks can't see
  a single slow tick; assert a per-tick max on a small window too, and note it
  only runs under fast=1 (fastMode.ticks is 0 in normal mode). DN1.1/DN8.1 still
  use wrap-blind upper bounds (<1440) — switch to the modular helpers. design-critic.
- [idea] (Tech & Performance, XS) Wide clock-bound margins — L6c (360-840) and
  DN3.3 (360-600) relative clock windows shrink at 40 game-min/s on throttled
  boxes; retighten or make them deadline-based. ui-critic.
- [idea] (Polish & Game Feel, XS) Mine item settle freeze — items sliding fast
  freeze abruptly at ground contact (pre-existing, more visible now that items
  stay in play); add a friction ramp. visual-critic.
- [idea] (Tech & Performance, XS) setFastMode-from-rAF race note — switching
  drivers from inside a rAF callback could double-chain fast timers (theoretical,
  unreachable via page.evaluate); harden or comment the invariant. visual-critic.
- [idea] (Tech & Performance, XS) Prod fast-mode dead code — ~300B of
  setFastMode/fast fields survive in prod as dead code; extend
  scripts/check-prod-bundle.mjs to also grep for fast-gating leaks. performance-critic.
- [idea] (Tech & Performance, S) FarmGrid.updateRipeAnim per-tick scan — the
  12-37ms/tick grid scan caps fast-mode tick rate at ~27-80/s (design figure was
  250/s); throttle to N ticks or dirty-flag the patch. performance-critic.

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
- [idea] (Tech & Performance, S) Mine item positions in getState — expose
  bouncing mine item positions so the in-bounds invariant is assertable instead
  of only observable via collection. qa-tester.
- [idea] (Tech & Performance, XS) L7c margin watch — the dig sweep passes with a
  1-item margin (before:1, after:2); seeded mine floor would make it fully
  deterministic. qa-tester.
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
- [blocked] (World & Exploration, S) Night sky dressing — a static starfield
  and a faint moon disc glow pass. BLOCKED by design: the game is isometric
  and the camera never shows the sky (docs/DESIGN_NOTES.md) — sky bodies are
  out of scope by direction, not by effort.
- [idea] (World & Exploration, S) Weather system — cloud cover, overcast tint,
  and light rain with sound, driven by the same time-of-day pipeline. (Per
  docs/DESIGN_NOTES.md: convey via light/particles/puddles, never sky-dome
  clouds.)
- [idea] (World & Exploration, S) Day/night slice 2 design — give the clock
  gameplay consequence: night harvest bonus on Moonpetal (design-critic: this
  is the definition of slice 2), decide whether shop/inventory/dialogue pause
  the clock, shorter night window once hooks exist, midnight day rollover,
  and decide the sub-20fps dt-clamp clock slowdown (qa-tester finding).

## Follow-ups from day/night review (2026-08-04)

- [idea] (Polish & Game Feel, S) Sunrise keyframe pass — warm/saturate the
  06:00 sky (default wake time) so it reads golden, not muddy; visual-critic
  Major.
- [idea] (Polish & Game Feel, S) Night coziness — warm lamp glow near the
  house and a warmer night fill so 22:00 reads cozy, not murky; visual-critic
  Minor + ui-critic night-contrast notes (controls-hint, fences, dog).
- [idea] (Tech & Performance, S) Skip the sun shadow pass at night — toggle
  `sun.castShadow` on day/night transitions (one-time rebuild); perf-critic
  Minor.
- [idea] (Tech & Performance, XS) fastForward fractional days — floor to
  integer days or throw; qa-tester Nit.
- [idea] (Tech & Performance, XS) HUD clock while slot open — time flows but
  the clock DOM isn't refreshed (updateDayCycle early-returns); ui-critic
  Minor.
- [idea] (UI/UX & Accessibility, S) HUD group overflow at 320px in RTL +
  night contrast — 4-stat hud-group is tight on small phones; ui-critic Minor.
- [idea] (Polish & Game Feel, XS) Moon disc occlusion — fog:false disc renders
  sticker-flat if it ever overlaps mountains. MOOT per docs/DESIGN_NOTES.md
  (isometric view: sky bodies are never a design requirement); keep only if the
  disc is ever made visible again.
- [idea] (Polish & Game Feel, XS) Moonpetal glow ground halo — pure emissive
  has no falloff on the ground; optional soft point light/halo for "magical"
  read; visual-critic Minor on final pass.
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
