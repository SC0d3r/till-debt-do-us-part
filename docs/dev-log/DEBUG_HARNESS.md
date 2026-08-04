# Debug/Test Harness — living spec

This is the single source of truth for the game's debug/test API: what exists
right now, how to extend it, and how `feature-writer` / `scene-capture` /
`qa-tester` are each expected to use it. **This is not a one-time task** — it's
built once (Part A) and then grows alongside the game forever (Parts B-D). If
this doc and the actual code disagree, the code wins and this doc needs fixing
— treat it like `DEV_LOG.md`, not like a changelog of a finished project.

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

Add `src/debug/devHarness.js` (adapt the path/pattern to however this project
already organizes code). Gate: only active when the URL has `?debug=1` AND this
is not a production build — dead-code-eliminated from prod output entirely
(`if (import.meta.env.DEV) { ... }` or this bundler's equivalent), not just
runtime-hidden.

Expose `window.__debug` with:

- **`ready: boolean`** — false while a transition is in flight, true once the
  scene has settled (assets loaded, render stabilized).
- **`setState(partial)`** — the low-level primitive. Directly writes into the
  game's actual state (position, inventory, currency, time-of-day, weather,
  open menu, quest/relationship flags — whatever this project's state shape
  really is) with no simulated input at all. Everything else below is built on
  top of this.
- **`getState()`** — returns a plain, serializable snapshot of current
  relevant game state. This matters a lot for a canvas-rendered game: there's
  no DOM to query, so this is how anything (tests, later tooling) checks "did
  the harvest actually add to inventory" without screenshotting and eyeballing
  it.
- **`gotoFixture(name)`** — named, high-level jump for screenshotting: looks up
  `name` in the fixture registry (A.2) and calls `setState` with whatever that
  fixture needs, then waits for `ready`.
- **`fastForward(amount)`** — advances the game's internal clock/timers
  (in-game minutes/days, growth timers, cooldowns) without waiting real
  wall-clock time or hand-stepping hundreds of animation frames. Essential for
  anything time-based — a crop that takes in-game days to grow should be
  testable/screenshot-able in milliseconds of real time.
- **`triggerEvent(name, payload?)`** — fires a specific internal game event
  directly (e.g. `"cropMatured"`, `"toolBroke"`) so a reaction can be tested
  without engineering the full real precondition chain that would naturally
  cause it.
- **`listFixtures()`** — returns the fixture registry as-is.

Reset any state that could leak between calls — this API will be called
repeatedly in the same page without a reload, both by the capture script and
by test scripts.

### A.2 Fixture registry — `tests/scene-fixtures.json`

Array of `{ "name": "...", "description": "...", "category": "..." }`. One
entry per meaningfully distinct visual state: every menu screen, key
time-of-day/weather combos, and the signature visual moment of every feature
going forward. `devHarness.js` should import this JSON as its single source of
truth for `gotoFixture`, so there's only one place to edit, not two that drift.

Seed it with at least: main menu, farm scene (day), farm scene (night, if the
game has one yet), one open in-game menu, one dialogue/interaction state —
whatever actually exists right now.

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
- If a dev/preview server is needed to load the game, assume one is already
  running and fail fast with a clear error if unreachable, or have the script
  start/stop this project's existing `npm run` preview command itself — don't
  invent a new run mode.

### A.4 Production-bundle safety check

Add a small test that runs after `npm run build` and greps the production
bundle for `__debug` (or whatever the gate string ends up being), failing
loudly if found. Debug hooks leaking into production are both a perf cost and
a way for a player to warp/cheat — this must be provably impossible, not just
runtime-gated.

### A.5 Acceptance criteria

- [ ] `window.__debug.gotoFixture(name)` works for at least 5 seed fixtures.
- [ ] `window.__debug.setState`/`getState`/`fastForward` work for at least one
      real example each (e.g. set+read inventory count; fast-forward a crop
      from planted to grown).
- [ ] `node scripts/capture-screenshots.mjs --all` captures every registered
      fixture — report actual wall-clock time in your summary.
- [ ] Production-bundle grep-check exists and passes.
- [ ] `tests/scene-fixtures.json`, `tests/screenshots/index.json`, and a short
      `tests/README.md` (how to add a fixture, how to use setState/getState/
      fastForward in a test) all exist.

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
- Extend `setState`/`getState` to cover any new piece of state the feature
  introduces (new inventory item types, new flags, new timers). If
  `qa-tester` or `scene-capture` can't reach or assert on a piece of state
  through the debug API, that's a gap to close in the same change that
  introduced the state — not a later cleanup task.
- If a feature adds a new time-based mechanic, extend `fastForward`'s internal
  clock-advance logic to cover it.

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

1. Use `page.evaluate(() => window.__debug.setState({...}))` — or
   `gotoFixture` if an existing named fixture already matches — to jump
   straight to the precondition for whatever's actually under test.
2. Use `fastForward()` to skip time-based setup (e.g. "crop is fully grown")
   instead of waiting or hand-driving hundreds of ticks.
3. Perform the ACTUAL interaction under test with real simulated input
   (click/key events) — this part is never skipped, since it's specifically
   what's being tested. Debug hooks get you to the starting line fast; they
   never replace the thing being verified.
4. Assert via `page.evaluate(() => window.__debug.getState())` and check the
   returned object directly, rather than screenshotting and trying to read a
   canvas. Far faster and more reliable than pixel-based assertions for a
   WebGL game — reserve screenshots for what `visual-critic`/`ui-critic`
   actually need to look at, not for QA pass/fail logic.
5. If a piece of state needed for a test isn't exposed via `getState`/
   `setState` yet, don't work around it (e.g. don't scrape the canvas) — file
   it as a gap per Part B and note it explicitly in the review output instead
   of silently skipping coverage.
