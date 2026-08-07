# Test & Screenshot Harness

Dev-loop infrastructure for the tile-based world (project pivot, 2026-08-07:
the Harvest-Moon farming game was deleted; the tile system — TileMapComposer +
the grass biome family — is now the product). A debug API (`window.__debug`)
exposed **only** in dev builds with `?debug=1` in the URL lets tests and the
screenshot pipeline jump straight to any fixture — no clicking through the UI.
The entire harness is tree-shaken out of the production bundle (verified by
`npm run test:prod-gate`).

Spec: `docs/dev-log/DEBUG_HARNESS.md`.

## The debug API

Load the game with `?debug=1` (`npm run dev`, then open `http://localhost:5173/?debug=1`)
and use `window.__debug` from the console:

- **`ready: boolean`** — false while a state transition is settling, true once
  the scene has stabilized (600ms of wall-clock quiet time, so it settles in
  0.6s even on slow software renderers). All async methods below resolve only
  when `ready` is true again.
- **`getState()`** — plain serializable snapshot of the current state:
  `{ ready, started, fastMode: { enabled, renderEvery, ticks } }`.
  No THREE objects, no DOM.
- **`gotoFixture(name)`** — resets everything, then applies a named fixture's
  setup (see below). The reset step tears down any active preview — so
  fixtures never leak into each other.
- **`listFixtures()`** — the fixture registry from `tests/scene-fixtures.json`
  (12 asset-preview fixtures — one per tile variant across the grass/dirt/water/sand/lava/snow families — plus the `tile-showcase` map fixture).
- **`previewAsset(name)`** — loads exactly one tile asset into a neutral
  studio (plain background, 3-point rig, tight iso framing). Stops the game
  loop for the duration of the preview; teardown restores the world.
- **`showcaseTileMap(data?, opts?)`** — builds a map through the data-driven
  TileMapComposer (defaults to SHOWCASE_MAP) and frames the camera for the
  whole grid. Same preview staging as `previewAsset`.
- **`showcase`** — debug handle for the showcase fixture: the live composer
  instance, the last onHover record, the last `validateShowcaseMap` result,
  and `projectTile(x, y)` (camera projection helper for aiming synthetic
  pointer events at a specific tile).
- **`setFastMode(enabled, renderEvery?)`** — runtime toggle for fast
  QA mode (`?fast=1`): setTimeout-driven loop with throttled renders.

### ⚠️ Preview loop semantics

`previewAsset` and `showcaseTileMap` stop the game loop for the duration of the
preview (`started` flips to false) and restore it on teardown. The world always
renders at boot (`started === true`); every fixture is a preview, so after any
`gotoFixture` the loop is off until the next teardown.

### ⚠️ Fixture page is reused

The capture script drives a single page across all fixtures — it never reloads
between them. State leaks between fixtures are prevented by `reset()` (teardown
of any active preview). If you add a new persistent store to the game, wipe it
in `reset()` too.

## Adding a fixture

1. Add an entry to `tests/scene-fixtures.json`:
   `{ "name": "my-scene", "description": "What it looks like", "category": "asset-preview" }`
2. Asset-preview fixtures are dispatched by category automatically (the harness
   iterates the grass family's VARIANTS manifest). For a new category, add a
   matching setup in `src/debug/devHarness.ts` under `fixtureSetups`, keyed by
   the same name. Every registered name MUST have a setup; `gotoFixture` throws
   otherwise.

## Capturing screenshots

```sh
npm run capture -- --all                  # every fixture
npm run capture -- --fixtures=grass-plain,tile-showcase   # just a few
npm run capture -- --all --concurrency=2 # parallel pages
```

Output lands in `tests/screenshots/<name>.png` with a manifest at
`tests/screenshots/index.json` (`{ name: { path, capturedAt, commit } }`).
The script drives a system Chrome via `puppeteer-core` (set `CHROME_PATH` if
it can't find one), starts the Vite dev server itself if none is running, and
always polls `window.__debug.ready` — it never sleeps. Timeouts and blank
frames (< 8 kB PNGs) are reported as failures and retried once without GPU
flags (software rendering); the exit code is 1 if anything failed.

## Running tests via CI (not local Chrome)

This repo is public, so GitHub Actions is free/unlimited and far faster than
local Chrome. All puppeteer-based work (screenshots, e2e suite, arbitrary
custom tests) goes through `scripts/run-ci-puppeteer.sh`:

```bash
./scripts/run-ci-puppeteer.sh --fixtures=grass-plain,tile-showcase   # screenshots
./scripts/run-ci-puppeteer.sh --e2e                                  # runs tests/qa-tile-kit-regression.mjs
./scripts/run-ci-puppeteer.sh --tests=tests/qa-tile-kit-regression.mjs   # arbitrary custom test(s)
./scripts/run-ci-puppeteer.sh --tests=tests/qa-tile-kit-regression.mjs --async   # dispatch, don't wait
./scripts/run-ci-puppeteer.sh --collect=run-<epoch>-<pid>     # later: fetch results of an async run
```

**Custom test scripts must be CI-friendly**: read `BASE_URL` and `CHROME_PATH`
from the environment (see `tests/qa-tile-kit-regression.mjs` for the pattern)
instead of hardcoding `http://localhost:5173` — the runner serves the dev
server on port 4173. The script retries GitHub 403/network failures internally
via `ap`/`apsi`/`proxychains4` proxy wrappers.

## Production-bundle gate

```bash
npm run test:prod-gate   # build + grep dist/ for the harness
```

This must pass — it proves the harness was dead-code-eliminated from the
production bundle rather than merely runtime-gated. The tile kit itself is the
product and ships in the bundle; only `__debug` / `devHarness` strings are
gated.