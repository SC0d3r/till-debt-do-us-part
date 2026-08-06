# Test & Screenshot Harness

Dev-loop infrastructure for the Three.js farming game. A debug API (`window.__debug`)
exposed **only** in dev builds with `?debug=1` in the URL lets tests and the
screenshot pipeline jump straight to any game state — no clicking through the
UI, no waiting for crops to grow. The entire harness is tree-shaken out of the
production bundle (verified by `npm run test:prod-gate`).

Spec: `docs/dev-log/DEBUG_HARNESS.md`.

## The debug API

Load the game with `?debug=1` (`npm run dev`, then open `http://localhost:5173/?debug=1`)
and use `window.__debug` from the console:

- **`ready: boolean`** — false while a state transition is settling, true once
  the scene has stabilized (600ms of wall-clock quiet time, so it settles in
  0.6s even on slow software renderers). All async methods below resolve only
  when `ready` is true again.
- **`setState(partial)`** — low-level primitive that writes real game state:
  `{ player, position, farm, mine, ui, started }`. Every key is validated;
  unknown keys throw. Returns a promise that resolves when settled.
- **`getState()`** — plain serializable snapshot of the current state
  (inventory, farm tiles, HUD flags, open overlays…). No THREE objects, no DOM.
- **`gotoFixture(name)`** — resets everything, then applies a named fixture's
  setup (see below). The reset step closes every overlay, exits the mine,
  removes the morning-buyer NPC, clears the shipping bin, restores a pristine
  `PlayerState`, and wipes the `till_debt_save` / `till_debt_farm` localStorage
  keys — so fixtures never leak into each other.
- **`fastForward(days)`** — exits the mine and closes all overlays, then
  advances `player.advanceDay()` + `farm.advanceDay()` per day, refreshes the
  HUD and settles.
- **`triggerEvent(name, payload?)`** — fires an internal game event directly:
  `cropMatured {x, z}`, `toolBroke {toolId}`, `buyerArrives {items}`.
- **`listFixtures()`** — the fixture registry from `tests/scene-fixtures.json`.

### ⚠️ fastForward gotcha: crops only grow when watered

`farm.advanceDay()` is real game logic: **unwatered crops spoil and disappear**
instead of growing. `fastForward` deliberately does NOT water anything for you —
if your test needs a crop to reach maturity, water the tile first
(`setState({ farm: { tiles: { '7,5': { watered: true } } } })`) or plant then
water, then fast-forward the crop's `growthDays`.

### ⚠️ Reset-window story-trigger suppression

`gotoFixture`'s reset restores a pristine `PlayerState` (introSeen=false), but
the game loop keeps running during the 600ms settle window, and
`checkStoryTriggers()` (src/main.ts) fires the `intro_1` dialogue **every frame**
while `introSeen` is false. `reset()` therefore forces `introSeen = true` and
`grimesFirstSeen = true` immediately after copying the fresh player, so no story
dialogue can pop over a fixture mid-settle. Related: `DialogueSystem` clears its
typewriter `setInterval` at the start of `show()`, `showRaw()`, and `close()` —
a stale interval from a previous dialogue used to keep appending characters into
the next one (corrupted text in the `dialogue-open` fixture).

### ⚠️ Slot-machine fixture: spin in progress, result is random

The `slot-machine` fixture opens the slot and dispatches `slotSpin` to populate
the reel grid (an opened slot starts empty — cells only exist after a spin).
The capture happens 600ms after the spin starts, so the top rows can still be
falling in — treat the baseline as "spin in progress, grid may be partially
populated". The spin outcome is random (`Math.random`), so the exact
symbols/win state vary per run.

### ⚠️ dialogue-open fixture skips the typewriter

The `dialogue-open` fixture calls `dialogue.show('intro_1')` and then clicks the
dialog box to run DialogueSystem's own skip handler, which renders the full
text and shows the real choice button synchronously (the ~178-char intro at
25ms/char would take ~4.5s — far longer than the 600ms settle). The captured
baseline therefore shows the complete intro text with its choice button, not a
partially-typed line.

### ⚠️ Fixture page is reused

The capture script drives a single page across all fixtures — it never reloads
between them. State leaks between fixtures are prevented by `reset()` (overlays,
mine, NPC, bin, player state) and by wiping the two localStorage save keys
(`till_debt_save`, `till_debt_farm`). If you add a new persistent store to the
game, wipe it in `reset()` too.

## Adding a fixture

1. Add an entry to `tests/scene-fixtures.json`:
   `{ "name": "my-scene", "description": "What it looks like", "category": "farm" }`
2. Add a matching setup in `src/debug/devHarness.ts` under `fixtureSetups`,
   keyed by the same name. Every registered name MUST have a setup; `gotoFixture`
   throws otherwise.

Fixture setups usually start the game with a fixed seed
(`g.debugDispatch('start', FIXED_SEED)`), then call `setState` to shape the
scene. **Non-menu fixtures must set `player.introSeen: true`** (and keep
`day = 1`) — the game's auto-triggered intro dialogue (and Grimes on day 2+)
would otherwise pop over the screenshot. The intro trigger runs every frame,
so the flag must be set in the same synchronous tick as `start` (that's why
setups call `setState` immediately after).

## Capturing screenshots

```sh
npm run capture -- --all                  # every fixture
npm run capture -- --fixtures=farm-day,shop-open   # just a few
npm run capture -- --all --concurrency=2 # parallel pages
```

Output lands in `tests/screenshots/<name>.png` with a manifest at
`tests/screenshots/index.json` (`{ name: { path, capturedAt, commit } }`).
The script drives a system Chrome via `puppeteer-core` (set `CHROME_PATH` if
it can't find one), starts the Vite dev server itself if none is running, and
always polls `window.__debug.ready` — it never sleeps. Timeouts and blank
frames (< 8 kB PNGs) are reported as failures and retried once without GPU
flags (software rendering); the exit code is 1 if anything failed.

**Viewport is 960x720** — deliberately NOT the 960x540 suggested in
DEBUG_HARNESS.md. At 540px height the slot machine's `measure()` hits its
mobile breakpoint (`vh < 620` → stacked layout) and the controls hint is hidden
by CSS (`(max-height: 620px)`). 720px gives a proper desktop reference: desktop
slot layout + visible controls hint. One more headless quirk is handled in
`loadPage()`: headless Chrome reports `(hover: none)` (it has no input
devices), which would still trip the slot's mobile media query — the capture
script strips that clause from the media rules via CSSOM so the desktop layout
is captured. Real touch devices are unaffected (`(pointer: coarse)` clauses
remain).

## Running tests via CI (not local Chrome)

This repo is public, so GitHub Actions is free/unlimited and far faster than
local Chrome. All puppeteer-based work (screenshots, e2e suite, arbitrary
custom tests) goes through `scripts/run-ci-puppeteer.sh`:

```sh
./scripts/run-ci-puppeteer.sh --fixtures=farm-day,shop-open   # screenshots
./scripts/run-ci-puppeteer.sh --e2e                           # full-loop suite
./scripts/run-ci-puppeteer.sh --tests=tests/qa-harness.mjs    # arbitrary custom test(s)
./scripts/run-ci-puppeteer.sh --tests=tests/qa-harness.mjs --async   # dispatch, don't wait
./scripts/run-ci-puppeteer.sh --collect=run-<epoch>-<pid>     # later: fetch results of an async run
```

**Custom test scripts must be CI-friendly**: read `BASE_URL` and `CHROME_PATH`
from the environment (see `tests/qa-harness.mjs` for the pattern) instead of
hardcoding `http://localhost:5173` — the runner serves the dev server on port
4173. The script retries GitHub 403/network failures internally via
`ap`/`apsi`/`proxychains4` proxy wrappers.

## Production-bundle gate

```sh
npm run test:prod-gate   # build + grep dist/ for the harness
```

This must pass — it proves the harness was dead-code-eliminated from the
production bundle rather than merely runtime-gated.
