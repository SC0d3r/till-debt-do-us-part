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

## Slice B: pixel-art tile kit trim + 15-prop library — Assets & Art — 2026-08-08
Commit: 9529ac6
Summary: Executed `SLICE_B_PIXEL_ART_TILES_AND_PROPS.md` end to end. Tile kit
trimmed to plain-only per user revision: six biome families (grass/dirt/
water/sand/lava/snow) with 12 variants (grass-plain/-b/-c, dirt-plain/-b,
water-plain/-b, sand-plain/-b, lava-plain, snow-plain/-b), single-section
prism, baked jagged outlines, `pixelPainter.js` noise utility, transition
zipper + all grass-dirt/grass-tilled/flowers/bushes code removed. New prop
library: 15 low-poly camera-facing props (flower, rock, bush, tall-grass,
cactus, small-stone, big-stone, pebble-cluster, torch, lantern,
gravel-patch, dry-shrub, bush-snow, snow-patch, lava-rock) built from shared
`propBase.js` geometry builders with vertex-baked 3-tone pixel shading
(`PROP_BRIGHTNESS = 0.575`), tinted outlines, contact rings, and socket
metadata; `props-showcase` 7x6 diorama fixture. Three geometry generations
(crossed-quads and solid prisms rejected by user; final icosa/blob/post/
blade-fan forms approved). Showcase map rewritten as 9x9 biome patchwork;
29 fixtures; QA suites re-pinned (tile-kit 72/72, composer 78/78,
exploratory 31/31). Individual screenshots gitignored — one composite
example image (`tile-prop-catalog.png`) committed.
Verdicts: design=SHIP WITH FOLLOWUPS ui=SHIP WITH FOLLOWUPS
visual=SHIP WITH FOLLOWUPS (after 2 fix rounds) performance=SHIP WITH
FOLLOWUPS asset=SHIP WITH FOLLOWUPS (after 2 fix rounds) qa=SKIPPED (user
directive; local suites green instead)
Follow-ups queued: selection-ring ownership pinning, hover cursor,
outline frame cache key, prop instancing, dead-code sweep, prop-rocket
nits, organic-boundary demo, lava-plain-b variant (see FEATURE_BACKLOG.md)

## Project pivot: Harvest-Moon farming game removed — tile world foundation — Tech & Performance — 2026-08-07
Commit: <pending commit>
Summary: Executed `PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` end to end. The entire
farming game was deleted (src/farm, src/mine, src/npcs, src/economy,
src/progression, src/player, src/ui, src/data, src/persistence, WorldBuilder,
DayNightDriver, CoinFx, DayCycle, RootEvents, AssetLoader, Instancing,
MeshFactory, i18n, DebugActions, all farming tests/screenshots/assets, slot
DOM). What survives: the tile system (TileMapComposer, showcaseMap, grass
family, transitionTexture), generic engine infra (InputManager, SoundManager,
disposeObject), the DORMANT slot machine (decoupled to `{ gold: number }`
wallet, unimported, tree-shaken out of the bundle), and the debug harness
(rewritten: ready/getState/gotoFixture/listFixtures/setFastMode/previewAsset/
showcaseTileMap/showcase — setState/fastForward/triggerEvent deleted as
farming-era state API). New: `src/core/procedural.ts` (COLORS trimmed to the 6
used keys + SeededRNG), `src/main.ts` rewritten as a 119-line TileWorld
composition root booting SHOWCASE_MAP (9x9 grass map, 4-light rig, `?fast=1`
QA mode, devGraph). Fixture catalog re-pinned to 14 (13 asset-preview +
tile-showcase); prod gate GATES reduced to ['__debug','devHarness']; test:e2e
repointed to qa-tile-kit-regression. README rewritten (bilingual, no farming
framing); DEBUG_HARNESS.md + TILE_SYSTEM_CONVENTION.md + FEATURE_BACKLOG.md
banners/refs updated; old milestones VOIDed, farming backlog items removed.
Bundle: 631 kB → 487.69 kB raw (125 kB gzip), 12 modules.
Verdicts: design=SHIP WITH FOLLOWUPS (pre-build boundary check + post-build:
Blocker was staging-only, procedural.ts now tracked; Majors fixed: i18n.ts
deleted, public/ farm assets deleted, stale docs updated)
performance=SHIP WITH FOLLOWUPS (Major dead-assets fixed — ~6.4 MB of farm
PNGs/MP3s deleted from dist; Nits queued: fast-QA dead members, vestigial
dtScale param, settleTick loop, pointermove alloc)
visual=SHIP WITH FOLLOWUPS (Major: boot camera framing — map ~10% of frame,
queued; Minor: grass-root SW wall near-black, queued; Nits: dead COLORS keys,
queued)
qa=SHIP (148/148 assertions across qa-tile-kit-regression 41/41,
qa-composer-regression 76/76, qa-composer-exploratory 31/31, smoke-ci PASS;
14/14 fixtures captured, zero page errors, zero timeouts; prod-gate green)
Follow-ups queued: boot camera framing; grass-root wall shading; dead COLORS
keys; getState active-fixture reporting; vestigial dtScale param; unimported
dead-code audit (see FEATURE_BACKLOG.md "Follow-ups from project pivot").

## TileMapComposer + showcase map (slice A) — Tech & Performance — 2026-08-06
Commit: d78dc8c
Summary: Generic data-driven tile-map composer (`src/world/TileMapComposer.js`,
{ x, y, variant, rotation?, elevation?, outline?, outlineColor? } records →
one InstancedMesh per variant string + per-outline-mask frames; hover contract
via pointermove-only raycast with instanceColor 0.88↔1.0; mid-build
factory-throw cleanup; owned+disposed outline geometry/material). Three
user-driven revisions landed during the cycle: (1) DIAGONAL LATTICE packing
((x−y)*0.5, 0, (x+y)*0.5) — diamonds share full edges, solid ground, zero
holes (the initial axis-aligned corner-touching placement had star holes
between every four tiles); (2) per-record rotation 0/90/180/270 (clockwise
from above) via instanceMatrix — one baked edge variant + rotation builds
boundaries in every lattice direction (showcase rows y=0..2 prove it with
grass-dirt-n @90/270); (3) TILE OUTLINES — crisp gamey lines, per-record
masks (all/none/interior/exterior/side-lists) with seam resolution so each
shared edge renders EXACTLY ONE ribbon: owner = biome-matched tile (resolved
color == biome palette color; edges use fromBiome), tie-break lexicographic
(x, then y) — the user picked this rule over darker-wins and data-order.
Outline colors are per-instance (white material + instanceColor; record >
biome palette [grass #4e3d2e, dirt #6b4a2e, tilled #4a3a26] > map-level >
default), hover-synced. Showcase 9x9 map + green-vs-brown outline A/B on
grass (21 green-override cells) for the user's comparison. validateShowcaseMap
rotation-aware + exact-once boundary coverage + ghost-edge gate. devHarness:
beginPreviewState/teardownPreview, showcaseTileMap(data, opts), tile-showcase
fixture, lattice projectTile. grass.js: OUTLINE_COLORS, manifest, userData
outlineTop/outlineBase/outlineColor. Convention doc pinned through 4 revision
rounds (lattice, rotation, outlines, seam owner, selection/color caveats).
Verdicts: design=SHIP w/followups (3 rounds: pre-build, post-build, rev2/3/4;
corner-cell gap Major logged as follow-up) ui=SHIP (2 rounds; rev-2/4 hover
sync verified gapless) visual=SHIP w/followups (2 rounds; pixel-verified
ownership at every boundary type; recommends keeping BROWN biome defaults —
green is a near-tie at 2px and should be brightened (~0x3d8a2e) if used as a
regional tint) performance=SHIP (2 rounds; outline draw calls bounded ≤16
masks, dispose complete incl. mid-build) qa=SHIP w/followups (78/78 composer +
51/51 tile-kit + 31/31 new exploratory + 120/124 harness [4 known probes] +
23/23 fixture captures; extended prod-bundle gate CI-enforced)
Follow-ups queued: tile-kit corner/elbow variants (design-critic Major);
45-deg diagonal seam variants; tile-kit selection slice B incl. selection ring
vs dropped-seam ownership pin (design-critic); elevation slice incl.
height-tuple outline cache key (performance-critic); zipper canonical
pixel-rotation (visual-critic Major); swap-initiative data-coord note
(design-critic); dev assert bbox-vs-userData (performance-critic); composer
duplicate/integer record guards + outline-absent harness path (qa-tester);
per-record outline width (design-critic nit); hover cursor styling.

## Tile-kit: grass family (Modular Isometric Biome Tile System) — Assets & Art — 2026-08-06
Commit: 3599808
Summary: FIRST biome family of the tile-system initiative: 13 distinct variants
(grass-plain / grass-flowers / grass-bushes, grass-dirt-n/e/s/w edge transitions,
grass-tilled plain + grass-tilled-n/e/s/w edges, dirt-plain). Construction per
the pinned convention: straight-sided diamond prism (inscribed ±0.5 footprint)
with exactly TWO bands — top face ~55% (y 0.20..0.45) and root band ~45%
(y 0..0.20) — distinguished by color, per-biome root colors (GRASS_ROOT
0x4a3a2a dark soil, DIRT_ROOT 0x6e4a24 dark earth, TILLED_ROOT 0x4e4832 dark
loam; transition tiles split the root per side). Color pipeline unified to
sRGB (SRGBColorSpace on all tile canvas textures; plain tops now render
byte-equal to transition halves). Transitions baked as 4 orientations via the
shared transitionTexture.js (32x32, 4px stair-step zipper); every variant is
ONE merged BufferGeometry + ONE MeshLambertMaterial (~78-tri worst case),
InstancedMesh-safe, shared lazy cache, dispose() frees every texture exactly
once. Debug harness: previewAsset + 13 asset-preview fixtures; qa-tester added
tests/qa-tile-kit-regression.mjs (51 assertions) and fixed qa-harness.mjs A2
(9 -> 22 fixture registry). 6 review rounds incl. 5 user-driven design
iterations (straight-sided, two bands, per-biome roots, 55/45 split, plain
tilled tile).
Verdicts: design=SHIP w/followups (round 1; all resolved) ui=SHIP (round-1 re-check) visual=SHIP (final pass) performance=SHIP asset=SHIP (final pass + round-6 fix verification) qa=SHIP (51/51 regression, 22/22 fixtures, only pre-existing pinned failures)
Follow-ups queued: TileMapComposer + showcase map (brief §6 — next tile-kit item); screenshot byte-dedupe check in capture pipeline (asset-critic nit); persist HUD-scan results in screenshots/index.json for auditability (ui-critic nit).

## CI pipeline: arbitrary tests, async dispatch, gh/network rules — Tech & Performance — 2026-08-06
Commit: 5644ae0
Summary: Extended the GitHub Actions puppeteer pipeline so ANY agent can run
arbitrary custom puppeteer tests through CI (new `tests` workflow input +
custom-tests job; `run-ci-puppeteer.sh --tests=tests/<file>.mjs`), added
multitasking (`--async` dispatch + `--collect=<tag>` fetch-later), and made
every gh/git network call in the script retry through ap/apsi/proxychains4
proxy wrappers on 403/unreachable. Fixed a latent snapshot bug: `git stash
create` silently drops untracked files, so brand-new test/source files never
reached the runner — the script now stages the full worktree into a private
temp index + commit-tree. Fixed the pre-existing CI build gate (typescript
~5.3.0 -> ^5.9.3; madge@8 peer wants ^5.4.4 and newer runner npm fails npm ci
with ERESOLVE). Agent docs updated: game-director now runs qa-tester ONCE at
the end of evaluation (not per fix round), dispatches scene-capture async,
invokes fast critics in parallel, and syncs .github/workflows/** to master;
all agents told to use `gh` CLI (never WebFetch against api.github.com, which
403s) and to retry 403s with ap/apsi/proxychains4. qa-harness.mjs made
CI-friendly (BASE_URL/CHROME_PATH/PUPPETEER_BUNDLED). Validated end-to-end on
CI: build gate + custom-tests job + smoke test PASS, artifacts collected via
--collect.
Verdicts: n/a — owner-commissioned infra change, validated by a real CI run
of the new pipeline (tests/smoke-ci.mjs), not by the game critics.
Follow-ups queued: none.

## Modularize main.ts — Tech & Performance — 2026-08-05
Commit: 57fcc0c
Summary: 1946-line Game monolith split into 14 subsystem modules under src/
(WorldBuilder, DayNightDriver, PlayerController, PlayerActionsController,
DogController, ShopNpcController, MorningBuyerController, ShipmentController,
PaymentOverlay, CoinFx, RootEvents, MineController, StoryController,
SaveController) + a DebugActionRegistry for debugDispatch. main.ts is now a
548-line composition root: construction, wiring, loop choreography, pause,
fast-mode, and per-subsystem update() calls in the exact original order.
Narrow context interfaces throughout — no subsystem imports the Game type, no
circular imports (madge-clean, wired as npm run check:cycles). devHarness
migrated to a devGraph (initDevHarness(game, graph)) with the observable
__debug API pinned byte-for-byte (getState shape, setState error strings,
fixture setups, unknown-action throw). Quirk checklist preserved verbatim:
the 'this.pRightArm'/'this.pLeftArm' bone lookups (player AND shop) and the
unreachable updateUnstuckBtn call stay exactly as they were. The (this as any)
_buyerLines/_buyerTotal hacks became real fields in MorningBuyerController.
Zero-behavior-change: qa-harness 120/124 (same 4 pinned gap probes A27/A28/
A29/E-H1), probe-daynight 57/57, e2e-full-loop 57/57, prod gate clean, prod
bundle byte-identical to pre-refactor (631 kB, same hash), 9/9 fixture
screenshots re-captured and visually verified. Two pre-existing flakes
confirmed NOT regressions: H7b (unseeded Math.random in MineSystem
.generateFloor can put a rock on the spawn-facing tile) and L9b (slot SPIN
click can land on #slot-fade overlay within 450ms of open).
Verdicts: design=SHIP WITH FOLLOWUPS ui=SHIP visual=SHIP performance=SHIP qa=SHIP WITH FOLLOWUPS
Follow-ups queued: dead-getLang-export, shared-cooldowns-seam, h7b-mine-dig-flake-root-fix, unstuck-button-cooldown-feedback, morningbuyer-vector3-allocations

---

## CI pipeline verification — Tech & Performance — 2026-08-05
Commit: 9bbe43e (range 7942df8..9bbe43e, 12 commits)
Summary: Moved the puppeteer test/capture pipeline from local Chrome to
GitHub Actions so QA and screenshot capture run free and fast in CI. New
`.github/workflows/puppeteer-tests.yml` (workflow_dispatch + branch triggers):
dev-mode build so the harness survives, `npm run test:e2e`, env-driven
CHROME_PATH/BASE_URL, `--no-sandbox` for GH runners, parallel-safe
`scripts/run-ci-puppeteer.sh` with per-run disposable branches, dev-server
serve inside the workflow, GPU probe skipped on GPU-less runners (--software),
60s cold-load wait, Vite transform pre-warm, concurrency input, artifact
upload on failure + fixed artifact download (extract to temp dir), `--browser`
passthrough (setup-chrome/preinstalled/puppeteer-bundled), preinstalled Chrome
as the default mode, and the fixture screenshot catalog refreshed from the
final default-mode CI run. Also added proxy retry rules (ap/apsi/proxychains4)
for agents hitting network errors.
Verdicts: design=n/a (infra) ui=n/a visual=n/a performance=n/a qa=PASS via CI
runs (e2e-full-loop, qa-harness, probe-daynight all green on GH Actions;
screenshot catalog refreshed from CI capture)
Follow-ups queued: none new (existing slot-spin-click CI-e2e red item remains
open)

---
Commit: 07185e8
Summary: QA suites ran 1-2fps under SwiftShader (10-20+ min each). New dev-only
`?fast=1` mode (gated by import.meta.env.DEV, folded out of prod): 4ms setTimeout
loop driver, render throttled to 1-in-60 ticks via a single renderFrame(force)
choke point, cheap renderer at construction (no AA, 0.5 pixelRatio, no sun
shadows), game clock scaled 20x via timeDt (clamp 0.25x20) while movement/stamina
keep the 0.05 dt clamp (no teleports), HUD DOM writes throttled to render ticks,
fast-mode key latching in InputManager (momentary presses between ticks no longer
lost — 20/20 mine-entrance trials vs 33% loss before). `__debug.setFastMode`
(enabled, renderEvery=60, dtScale=20) is idempotent with exactly one pending loop
continuation (the old disable path froze the loop — fixed); getState gains
additive fastMode{enabled,renderEvery,dtScale,ticks}. Suites flipped to
?debug=1&fast=1 with wall-clock-coupled time assertions converted to tick-based
(DN2.3) and wrap-aware modular compares (fwdDelta/pinNear/modDist). Measured on a
real-input probe: 58.2s -> 11.6s total, per-action latency down 8-45x. Suite
runtimes after the fix round: qa-harness 120/124 @ 4m42s, probe-daynight 57/57 @
1m38s, e2e-full-loop 57/57 @ 3m13s (vs ~10-20+ min each before). Bundled gameplay
bug fix discovered during testing: dug mine items launched past the floor bounds
were unreachable forever — they now wall-bounce in-bounds (0.5..size-0.5,
horizontal reflect x0.6); normal-mode change, L7c went green with a redesigned
dig sweep.
Verdicts: design=SHIP WITH FOLLOWUPS ui=SHIP WITH FOLLOWUPS visual=SHIP WITH FOLLOWUPS performance=SHIP qa=SHIP WITH FOLLOWUPS
Follow-ups queued: fast-latch-replay-on-panel-open, dn23-comment-and-wrap-bounds, wide-clock-bounds-margins, mine-settle-freeze-polish, setfastmode-rAF-race-note, prod-fast-deadcode-and-gate-check, farmgrid-updateripeanim-scan, mine-item-positions-getstate, l7c-margin-watch

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
