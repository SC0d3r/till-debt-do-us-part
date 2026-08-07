# Debug/Test Harness — living spec

This is the single source of truth for the game's debug/test API: what exists
right now, how to extend it, and how `feature-writer` / `asset-creator` /
`scene-capture` / `qa-tester` are each expected to use it. **This is not a
one-time task** — it's built once (Part A) and then grows alongside the game
forever (Parts B-D). If this doc and the actual code disagree, the code wins
and this doc needs fixing — treat it like `DEV_LOG.md`, not like a changelog
of a finished project.

Uses `puppeteer-core` against your already-installed system Chrome, not
Playwright — no bundled-browser download, minimal disk footprint.

---

## Part A — Initial build (run once, before starting the dev loop)

If `window.__debug` doesn't exist in the codebase yet, run this directly —
don't wait for the normal cycle-by-cycle loop to get to it:

```
opencode run --agent build "Read and implement docs/dev-log/DEBUG_HARNESS.md end to end, starting with Part A."
```

(`feature-writer` works too if you'd rather invoke it directly. Either way,
point it at this *file* — don't paste the contents into the prompt by hand.)

This is infrastructure, not a player feature — skip `design-critic`'s gate for
this one run, but `performance-critic` and `qa-tester` still apply (it must not
bloat the production bundle or break the game).

### A.1 Debug API surface

Implemented as `src/debug/devHarness.ts` (the game director's project pivot
removed the farming-era `devHarness.js`; this file is the post-pivot rewrite).
Gate: only active when the URL has `?debug=1` AND this is not a production
build — dead-code-eliminated from prod output entirely
(`if (import.meta.env.DEV) { ... }` or this bundler's equivalent), not just
runtime-hidden. Verified by `scripts/check-prod-bundle.mjs` (GATES =
`['__debug','devHarness']`).

Expose `window.__debug` with:

- **`ready: boolean`** — false while a transition is in flight, true once the
  scene has settled (render stabilized).
- **`getState()`** — returns a plain, serializable snapshot of current
  relevant state (world started/ready, renderer settings, fast-mode flags,
  fixture preview status). This matters a lot for a canvas-rendered game:
  there's no DOM to query, so this is how tests check "did the state change"
  without screenshotting and eyeballing it.
- **`gotoFixture(name)`** — named, high-level jump for screenshotting: looks up
  `name` in the fixture registry (A.2), calls the right transition for its
  category (`previewAsset` for `"asset-preview"`, `showcaseTileMap` for the
  tile showcase), then waits for `ready`.
- **`listFixtures()`** — returns the fixture registry as-is.
- **`setFastMode(enabled, renderEvery = 60)`** — dev-only QA speed-up: lowers
  renderer resolution/antialias and throttles rendering to every Nth frame
  while keeping world logic running (via `?fast=1` at boot, or called
  programmatically). Drives the fast-path e2e suites.
- **`previewAsset(name, opts?)`** — loads exactly one asset (built by
  `asset-creator`) into a neutral, isolated preview: plain studio background,
  a standard 3-point lighting rig, and a camera framed to fill most of the
  viewport with the asset. This is deliberately separate from the showcase map
  (which is a real scene) — asset review needs a clean, unambiguous shot with
  no gameplay context, lighting variance, or occlusion from other objects.
  Sets `ready` the same way as any other transition. Added by `asset-creator`
  the first time it's needed; every asset it builds after that registers a
  fixture that resolves through this same path.
- **`showcaseTileMap(opts?)`** — jumps to the showcase tile map (the current
  product surface) with optional validation output. Also returns a
  `showcase` handle (`{ composer, lastHover, validation, projectTile }`)
  for tests that need projection or hover state.

Removed in the project pivot (no longer exists — do not call): `setState`,
`fastForward`, `triggerEvent`. The post-pivot game has no mutable game-state
shape to write into (no farming state, no timers), so those primitives were
deleted rather than kept as dead API. If a future feature introduces mutable
state or time-based mechanics, revive the minimal `setState`/`fastForward`
subset this doc described, in the same change that introduces the state —
never as follow-up cleanup.

Reset any state that could leak between calls — this API will be called
repeatedly in the same page without a reload, both by the capture script and
by test scripts.

Reset any state that could leak between calls — this API will be called
repeatedly in the same page without a reload, both by the capture script and
by test scripts.

### A.2 Fixture registry — `tests/scene-fixtures.json`

Array of `{ "name": "...", "description": "...", "category": "..." }`. One
entry per meaningfully distinct visual state: every menu screen, key
time-of-day/weather combos, and the signature visual moment of every feature
going forward — plus one entry per asset under category `"asset-preview"`,
resolved through `previewAsset` rather than `gotoFixture` (`devHarness.js`
should check each fixture's category to know which path to call).
`devHarness.js` should import this JSON as its single source of truth, so
there's only one place to edit, not two that drift.

Seed it with at least: the tile showcase map (day), one asset preview per
registered asset, and any new visually distinct scene/menu states as they
appear.

### A.3 Capture script — `scripts/capture-screenshots.mjs`

```js
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME_PATH =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(p => existsSync(p));

if (!CHROME_PATH) {
  throw new Error('No Chrome/Chromium binary found. Set CHROME_PATH explicitly.');
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 },
  args: ['--use-gl=desktop', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
```

Only one package to install: `npm install --save-dev puppeteer-core`. It's a
thin driver library (a few MB) — unlike `puppeteer` or `playwright`, it does
NOT download its own bundled Chromium, since it drives the Chrome you already
have installed. This is the whole point of using it here.

If the GPU flags above misbehave on this machine (some integrated GPUs choke
on `--use-gl=desktop` under headless), drop them entirely — plain headless
Chrome with software rendering (SwiftShader) always works, just slower. Try
with the flags first, fall back without them if capture fails or produces
blank/garbled frames, and note in the script's header comment which one this
project ended up needing.

Behavior:
- **One browser, one page, reused for every shot in a run.** Never relaunch
  Chrome per screenshot — launch overhead dwarfs render time.
- CLI: `--fixtures=name1,name2` (capture just those) or `--all` (whole
  registry — reserve for milestone regressions, see Part C).
- `--concurrency=N` (default `1`): opens N pages in the same browser instance
  and captures fixtures in parallel across them. Default stays `1` on this
  machine; this flag exists so the pipeline doesn't get linearly slower
  forever as the fixture catalog grows — raise it later if it's worth it.
- For each fixture: `page.evaluate(n => window.__debug.gotoFixture(n), name)`
  → `page.waitForFunction(() => window.__debug.ready === true, { timeout: 15000 })`
  → `page.screenshot({ path: 'tests/screenshots/<name>.png' })`. No fixed
  `sleep()` anywhere — always poll the ready flag.
- A timeout on one fixture logs `<name>: TIMEOUT` and moves on — it does not
  abort the run, and it's a real finding (possible hang), not a flake to
  retry silently.
- Writes/updates `tests/screenshots/index.json`:
  `{ "<name>": { "path": "...", "capturedAt": "<ISO timestamp>", "commit": "<git rev-parse HEAD>" } }`.
- `--base-url=<url>` (or `BASE_URL` env var), default `http://localhost:4173`
  — the script always assumes a server is ALREADY reachable at this URL and
  fails fast with a clear error if it isn't. It never starts/stops a server
  itself. Whatever calls this script (a local dev loop, or the CI workflow in
  Part E) owns starting the preview server first and tearing it down after.
  This is what lets the exact same script run unmodified whether the server
  is `vite preview` on your machine or one spun up inside a GitHub Actions
  runner.

### A.4 Production-bundle safety check

Add a small test that runs after `npm run build` and greps the production
bundle for `__debug` (or whatever the gate string ends up being), failing
loudly if found. Debug hooks leaking into production are both a perf cost and
a way for a player to warp/cheat — this must be provably impossible, not just
runtime-gated.

### A.5 Acceptance criteria

- [ ] `window.__debug.gotoFixture(name)` works for every registered fixture.
- [ ] `window.__debug.getState()` returns a serializable snapshot for at least
      one real example (e.g. world started/ready flags).
- [ ] `node scripts/capture-screenshots.mjs --all` captures every registered
      fixture — report actual wall-clock time in your summary.
- [ ] Production-bundle grep-check exists and passes.
- [ ] `tests/scene-fixtures.json`, `tests/screenshots/index.json`, and a short
      `tests/README.md` (how to add a fixture, how to use the debug API in a
      test) all exist.

Out of scope for this first pass: no replay/recording system, no exhaustive
state-combination coverage — just enough to be useful, growing from here.

---

## Part B — Ongoing extension (every feature, forever)

Not a one-time task. Every feature that changes what a scene/menu looks like,
or that touches time-based/precondition-heavy behavior, extends this system as
a normal part of being "done" — this is already a standing rule in
`feature-writer`'s own agent file, restated here for context:

- Register/update a fixture in `tests/scene-fixtures.json`, wired into
  `gotoFixture`, for any new visually distinct state.
- Extend `getState` to cover any new piece of state the feature introduces
  (new flags, new settings). If `qa-tester` or `scene-capture` can't reach or
  assert on a piece of state through the debug API, that's a gap to close in
  the same change that introduced the state — not a later cleanup task.
- If a feature adds a new time-based mechanic, revive a minimal
  `fastForward`-style clock-advance hook (see the A.1 note on what the pivot
  removed) as part of that same feature.

`asset-creator` has the equivalent standing rule for its own output: every
asset it builds registers a `"asset-preview"` fixture through `previewAsset`
(A.1) in the same change that introduces the asset — never as follow-up
cleanup.

## Part C — Periodic health check (game-director, self-maintaining)

Every milestone regression pass (game-director's cycle, step 8):
- Run `capture-screenshots.mjs --all` and log the total wall-clock time in
  `MILESTONES.md`'s history entry for that milestone. If it's meaningfully
  slower than the previous milestone, file a Tech & Performance backlog item
  to raise `--concurrency` or prune stale fixtures — don't let it silently
  degrade.
- Check `tests/screenshots/index.json` for any fixture that's failed/timed out
  across the last two `--all` runs in a row. File a backlog item to fix or
  retire it rather than letting dead fixtures accumulate.

## Part D — How `qa-tester` should use this

Precondition setup should almost never be "click through the UI to reach the
right state" — that's exactly the slow, framerate-bound pattern this system
exists to remove. Instead:

1. Use `page.evaluate(() => window.__debug.gotoFixture(name))` — or
   `showcaseTileMap`/`previewAsset` directly if no named fixture matches — to
   jump straight to the precondition for whatever's actually under test.
2. Use `setFastMode(true)` when a test needs many logical frames quickly
   (fast-path QA) instead of waiting or hand-driving hundreds of ticks.
3. Perform the ACTUAL interaction under test with real simulated input
   (click/key events) — this part is never skipped, since it's specifically
   what's being tested. Debug hooks get you to the starting line fast; they
   never replace the thing being verified.
4. Assert via `page.evaluate(() => window.__debug.getState())` and check the
   returned object directly, rather than screenshotting and trying to read a
   canvas. Far faster and more reliable than pixel-based assertions for a
   WebGL game — reserve screenshots for what `visual-critic`/`ui-critic`
   actually need to look at, not for QA pass/fail logic.
5. If a piece of state needed for a test isn't exposed via `getState` yet,
   don't work around it (e.g. don't scrape the canvas) — file it as a gap per
   Part B and note it explicitly in the review output instead of silently
   skipping coverage.

## Part E — Running via GitHub Actions instead of locally (optional, recommended if local capture/testing is slow)

This repo is public, so standard GitHub-hosted runners are free and
unlimited — no reason to burn a slow local machine's CPU/GPU on Chrome when a
much faster, consistent runner is free. `scene-capture` and `qa-tester` both
default to this path; local execution (`node scripts/capture-screenshots.mjs`
directly) still works and is kept as a fallback for when `gh` isn't
authenticated or GitHub is unreachable.

**Do not use GitHub Pages for this.** A repo only gets one Pages site, and
this project's `master` already owns it (production deploy) — there's no way
to also publish `dev` there, and there's no need to: the workflow below
builds and serves `dev` entirely inside the ephemeral runner and never
touches Pages at all. This is also faster (no deploy-and-propagate latency)
and doesn't publicly expose in-progress/broken `dev` builds.

### How code being evaluated (often uncommitted) reaches a runner

`game-director`'s cycle evaluates a feature BEFORE committing it (so a
rejected feature never touches `dev`'s history). GitHub Actions can only
build from something pushed to GitHub, so `scripts/run-ci-puppeteer.sh`
bridges this transparently, every time it's invoked:

1. If the working tree is dirty, the script builds a snapshot commit WITHOUT
   touching the working tree or index: it stages the full worktree — tracked
   changes AND untracked files (respecting `.gitignore`) — into a private
   temp index (`GIT_INDEX_FILE`) and commits it with `commit-tree`, parented
   on `HEAD`. No add/commit/reset dance, no races between concurrent
   invocations. (Not `git stash create`: that plumbing command silently
   ignores `--include-untracked`, so brand-new test/source files would never
   reach the runner.) A clean tree publishes `HEAD` as-is.
2. Pushes that commit to a disposable branch unique to this invocation,
   `ci-eval-run-<epoch>-<pid>` (never a force-push, never to `dev`/`master`).
   Unique branches mean **any number of agents can invoke this script in
   parallel** — no shared branch to race on, and the workflow's concurrency
   group (`puppeteer-${{ inputs.ref }}`) keys on that per-run ref, so runs
   don't queue behind each other either.
3. Dispatch `.github/workflows/puppeteer-tests.yml` with `--ref=<that branch>`,
   wait for it, and download the results. Branches older than 48h are
   best-effort deleted on the next invocation.

This means `game-director`'s own cycle (commit only in step 7, on full
approval) never had to change — the snapshot/push dance is fully contained
inside this one script, invisible to everything else.

### The workflow — `.github/workflows/puppeteer-tests.yml`

`workflow_dispatch` only (never triggered by `push`, so it never fires on
random commits — only when explicitly asked for exactly the fixtures/tests
needed). Inputs: `ref`, `tag` (a caller-generated unique string, used in
`run-name` so the caller can find the resulting run — `gh workflow run`
doesn't return a run ID directly), `fixtures` (comma-separated), `all_fixtures`,
`run_e2e`, `tests` (comma-separated paths of arbitrary custom puppeteer test
scripts), `concurrency` (default 3 — the runners have 4 vCPUs), `browser`
(default `preinstalled`; see the benchmark table below).

Jobs: `build` (checkout at `ref`, `npm ci`, `npm run test:prod-gate` — compile gate
plus the production-bundle safety check) → `capture-screenshots` (only if
`fixtures`/`all_fixtures` was given: optionally install Chrome per the
`browser` input, start the Vite **dev server** on 4173, run
`capture-screenshots.mjs` against `--base-url=http://localhost:4173` with
`--concurrency=<input>` and `--software`, upload `tests/screenshots/` as an
artifact **even on failure** — `if: always()` on the upload step, so partial
captures still come back), `e2e-tests` (only if `run_e2e` was given: same
setup, run `npm run test:e2e` with `BASE_URL=http://localhost:4173`, tee
output into `tests/e2e-results/full-loop.txt`, upload as an artifact), and
`custom-tests` (only if `tests` was given: same setup, then run each listed
script with `node <path>`, tee output into
`tests/e2e-results/<basename>.txt`, upload as an artifact; the job fails if
any custom test exits non-zero). All downstream jobs run in parallel off the
same `build` output.

**Custom test scripts must be CI-friendly**: read `BASE_URL` and `CHROME_PATH`
from the environment instead of hardcoding `http://localhost:5173` (the runner
serves the dev server on port 4173) — see `tests/qa-tile-kit-regression.mjs`
for the exact pattern, including optional `PUPPETEER_BUNDLED=1` support for
the bundled Chromium provisioning mode.

**Why the dev server and not `vite preview`?** The harness is gated by
`import.meta.env.DEV`, which Vite statically replaces with `false` in *every*
`vite build` (even `--mode development`) — a built bundle can never expose
`window.__debug`. The dev server is what local capture/testing uses, and it
works identically in the runner. The `build` job still validates the real
production build via `test:prod-gate`.

### Workflow-file sync: the yml must exist on `master`

GitHub resolves `workflow_dispatch` by name from the DEFAULT branch
(`master`): a workflow that only exists on `dev` can never be dispatched. The
file actually executed for a run is the one on the ref passed to
`gh workflow run --ref` — which `run-ci-puppeteer.sh` sets to the disposable
branch snapshot of local state, so **new inputs and yml edits take effect even
if `master`'s copy is stale**. Still, keep `.github/workflows/puppeteer-tests.yml`
in sync on `master` whenever it changes (game-director's step 7 does this), so
dispatch-by-name always resolves and the Actions UI shows the current version.

### Software rendering & the GPU probe

`ubuntu-latest` runners have **no GPU at all** — WebGL only exists via SwiftShader
software rendering. An earlier design probed the GPU flags on one fixture first
and fell back to software per-fixture; in practice that probe wasted ~8-20s of
every run for a known outcome. The workflow now always passes `--software` and
`capture-screenshots.mjs` skips the probe entirely (kept only for local
machines that do have a usable GPU). Capture is ~30s for the full fixture
catalog either way, and the software-rendered PNGs are visually
indistinguishable in quality.

### Browser provisioning benchmark (2026-08-05, run IDs 31007742349/31008271519/31008271710)

Historical (pre-pivot, farming-era catalog: 9 fixtures + full e2e loop,
concurrency 3, fixed pipeline `--software`, boot-wait). `conclusion` was
`failure` in every case solely due to the then-known L9b slot-spin test
failure (56/57 — a real game bug, tracked in the backlog), never due to
infrastructure. The provisioning-cost conclusions still hold for the
post-pivot tile catalog.

| browser input      | build | capture job (inside) | e2e job | provisioning cost |
|--------------------|-------|----------------------|---------|-------------------|
| setup-chrome       | 17s   | 58s (31.3s)          | 4m13s   | setup-chrome action ~10-15s |
| **preinstalled**   | 19s   | **48s (28.9s)**      | **3m32s** | none — uses the runner's `/usr/bin/google-chrome` |
| puppeteer-bundled  | 15s   | 60s (29.4s)          | 3m53s   | `npm i --no-save puppeteer` ~15s |

Provisioning mode barely matters — the run is dominated by the e2e gameplay
loop (~3.5-4.2m, identical logic in all three) — but `preinstalled` is
marginally fastest and costs zero downloads or extra actions, so it is the
default. Use `--browser=setup-chrome` or `--browser=puppeteer-bundled` only if
the runner's preinstalled Chrome ever diverges from what local testing uses.

### The wrapper — `scripts/run-ci-puppeteer.sh`

The one command `scene-capture`/`qa-tester`/`feature-writer` actually run:

```
./scripts/run-ci-puppeteer.sh --fixtures=name1,name2   # or --all-fixtures, and/or --e2e
./scripts/run-ci-puppeteer.sh --tests=tests/qa-tile-kit-regression.mjs,tests/qa-composer-regression.mjs  # arbitrary custom tests
./scripts/run-ci-puppeteer.sh --fixtures=name1 --async  # dispatch, don't wait
./scripts/run-ci-puppeteer.sh --collect=run-1785922569-12345   # later: fetch that run's results
```

It does the snapshot/push dance above (unique disposable branch per run),
dispatches the workflow, polls `gh run list` for the run matching its tag,
`gh run watch`es it, checks the real conclusion via `gh run view --json
conclusion` (doesn't rely solely on `--exit-status`, which isn't guaranteed
across every `gh` version), downloads the `screenshots`/`e2e-results`
artifacts into the exact same local paths (`tests/screenshots/*.png`,
`tests/screenshots/index.json`) the local script would have produced, and
exits non-zero on failure. (`gh run download` refuses to overwrite existing
files, so downloads go to a temp dir first and are copied over — stale files
from earlier runs never block a download.) Everything downstream —
`ui-critic`/`visual-critic` reading screenshot paths, `qa-tester`'s own
assertions — is unaware whether a given run happened locally or in CI.

**Async mode (multitasking)**: `--async` dispatches and returns immediately,
printing `CI_RUN_TAG=<tag>`; the caller continues other work and later runs
`--collect=<tag>` to wait for that run and pull its results. This is the
recommended pattern whenever the caller has anything else to do — CI runs take
minutes, and blocking on them wastes the whole point of running on GitHub.

**Network resilience is built in**: every `gh`/git network call in the script
is wrapped so a 403 / "not reachable" / timeout failure is retried through the
proxy wrappers `ap`, `apsi`, `proxychains4` (whichever exist) before giving
up. Agents calling the script never need to wrap it themselves; for ad hoc
`gh` commands, apply the same rule manually (`ap gh ...`, `apsi gh ...`,
`proxychains4 gh ...`) and never use WebFetch against `api.github.com` (it
403s).

### One-time setup

- `gh auth login` once on this machine (already done, per the project owner).
- Nothing else — no new npm packages. `browser-actions/setup-chrome` is a
  GitHub Action, not an npm dependency, and it only runs inside the CI
  runner (and only when `browser=setup-chrome` is explicitly requested).
