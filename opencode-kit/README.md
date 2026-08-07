# OpenCode dev-loop kit for your farming sim

## Install

1. Check out your `dev` branch.
2. Copy this into the repo root:
   - `.opencode/agent/` (the 10 agent files)
   - `opencode.json` (or merge its contents into an existing one)
   - `docs/dev-log/` (seed backlog/milestones/log/harness spec)
   - `scripts/dev-loop.sh`
3. `chmod +x scripts/dev-loop.sh`
4. Verify OpenCode picks the agents up: `opencode agent list`. You should see
   `game-director`, `feature-writer`, `asset-creator`, `asset-critic`,
   `design-critic`, `ui-critic`, `visual-critic`, `performance-critic`,
   `qa-tester`, `scene-capture`.

**Note on the directory name**: OpenCode's own docs disagree with themselves —
the Agents page says per-project markdown agents live in `.opencode/agents/`
(plural), the CLI page's default for `opencode agent create --path` says
`.opencode/agent` (singular). This kit uses the singular form since it matches
the CLI default and most current examples. If `opencode agent list` doesn't
pick them up, rename the folder to `.opencode/agents/` and try again.

5. Commit this kit itself to `dev` before starting the loop, so `game-director`
   isn't the one to first introduce its own config.

## Run it

Interactively, one cycle at a time, so you can watch what it does before
trusting it unattended:

```
opencode run --agent game-director "Continue development. Read docs/dev-log/*.md and run exactly one development cycle."
```

Fully autonomous, forever, from a terminal/tmux session or a background
process/service:

```
./scripts/dev-loop.sh          # forever
./scripts/dev-loop.sh 20       # 20 cycles, then stop
```

## How "never stops" actually works here

An LLM agent cannot literally run one unbounded session forever — context
windows and provider limits are real. So `game-director` is designed to do
**exactly one development cycle per invocation** and write everything that
matters (what shipped, what's queued, what's blocked, milestone progress) to
`docs/dev-log/*.md`. `scripts/dev-loop.sh` is what actually makes it continuous
— it's a dumb `while true` loop that keeps invoking the agent. Each invocation
reads the log files to know exactly where the last one left off, so it survives
context resets, restarts, and even switching machines.

If you'd rather not keep a terminal/process running, look at OpenCode's GitHub
Action support (`opencode github install`) as an alternative to running
`dev-loop.sh` locally — check `opencode.ai/docs/github` for current setup, since
I haven't verified the exact workflow YAML for your setup.

## `--auto` and permissions — read this before running unattended

`dev-loop.sh` uses `--auto`, which auto-approves anything not explicitly set to
`deny` in the agent frontmatter/`opencode.json` — including things set to `ask`.
That means in headless mode, `ask` rules (like the push-to-`master` rule in
`game-director.md`) are **not** a real safety gate — they'll be auto-approved.
They *do* still work as a confirmation prompt if you ever run the same agent
interactively (TUI, no `--auto`). The real, always-enforced boundaries are the
`deny` rules: no force-push, no deleting `master`/`main`, no `feature-writer`
edits to `.opencode/**` or `docs/dev-log/**`, no `qa-tester`/critic edits outside
their lanes. Review those `deny` lists before you trust this unattended, and add
more if your project has other things worth hard-blocking.

## Resilience — outages, timeouts, and crashes mid-cycle

Two new files make interruptions (network outages, provider timeouts,
`game-director` itself getting killed) recoverable instead of losing work:

- **`docs/dev-log/CYCLE_STATE.json`** — a small checkpoint `game-director`
  writes right before anything that could be interrupted (selecting a
  feature, invoking a subagent) and resets to idle the moment a feature
  ships or gets abandoned. On every invocation it's the very first thing read
  — if it says `"in-progress"`, that invocation is a resume, not a fresh
  cycle, and it re-attaches to the same feature at the same step instead of
  picking something new or getting confused by leftover uncommitted changes.
- **`docs/dev-log/INCIDENTS.md`** — append-only log `game-director` writes to
  when a subagent fails 3 retries in a row, so failures are visible to you
  without digging through `logs/dev-loop/*.log`.

If a single subagent call (e.g. `feature-writer`) fails or times out,
`game-director` retries it directly (up to 3 attempts) with an explicit
instruction to check real repo state first rather than redo everything —
since the filesystem, not chat memory, is what's actually persistent. Only
after 3 failed attempts does it mark the feature `blocked` and move to a
different backlog item.

`scripts/dev-loop.sh` also now backs off exponentially (30s → 60s → 120s →
capped at 5 min) after consecutive whole-process failures — e.g. if the
machine's internet is actually down for a while — and resets to the normal
30s cooldown the moment a cycle succeeds again, so it doesn't hammer a dead
connection.

## Screenshots: debug-jump, don't simulate navigation

`visual-critic` and `ui-critic` review code by default. To let them genuinely
review pixels without the slow, framerate-bound process of actually playing to
a given state, this kit adds a debug/test harness:

- **`docs/dev-log/DEBUG_HARNESS.md`** — a living spec, not a one-off task. It's
  built once (Part A) and then extended forever alongside the game (Parts
  B-D). It builds a `window.__debug` API in the game itself
  (`gotoFixture`/`setState`/`getState`/`fastForward`/`triggerEvent`), a
  `tests/scene-fixtures.json` registry of named states, and a
  `scripts/capture-screenshots.mjs` capture script — using **`puppeteer-core`
  against your already-installed `/usr/bin/google-chrome`**, not Playwright, so
  there's no bundled-browser download and minimal disk footprint (one
  `npm install --save-dev puppeteer-core`, a few MB).
- **`.opencode/agent/scene-capture.md`** — a narrow subagent that runs the
  capture script for exactly the fixtures `game-director` asks for (never the
  whole catalog mid-cycle — that's reserved for milestone regressions).
- **`.opencode/agent/qa-tester.md`** — rewritten to use the same
  `window.__debug` API for test preconditions (`setState`/`fastForward`)
  instead of simulating UI navigation, and to assert via `getState()` instead
  of screenshots/DOM-scraping. This is the single biggest lever for keeping
  functional testing fast as the game grows — see `DEBUG_HARNESS.md` Part D.
- `feature-writer` has a standing rule: any feature that changes a scene/menu
  or introduces new state must extend the debug API to cover it, in the same
  change — not as later cleanup.
- `ui-critic`/`visual-critic` have permission wired up for your two
  image-analysis MCP servers (`gemini-analyze-image_gemini_analyze_image` and
  `box-mcp_box_image_description`) and call them per-screenshot with a
  tailored prompt rather than one generic "describe this image." If
  `opencode agent list`/a session shows either tool under a different exact
  name, adjust the pattern in that file's frontmatter.

## CI test pipeline: arbitrary tests, async, and network resilience

`scripts/run-ci-puppeteer.sh` (see `DEBUG_HARNESS.md` Part E) dispatches
`.github/workflows/puppeteer-tests.yml` on GitHub Actions — free and much
faster than local Chrome. It supports:

- `--fixtures=name1,name2` / `--all-fixtures` — screenshot capture.
- `--e2e` — runs `tests/qa-tile-kit-regression.mjs`.
- `--tests=tests/qa-tile-kit-regression.mjs,<any>.mjs` — **arbitrary custom puppeteer
  test scripts**; the workflow runs each with `node` and uploads output to
  `tests/e2e-results/`. Custom tests must read `BASE_URL`/`CHROME_PATH` env
  (see `tests/qa-tile-kit-regression.mjs`).
- `--async` then `--collect=<tag>` — dispatch without waiting, keep working,
  fetch results later. Agents are expected to multitask this way instead of
  blocking on CI.
- Built-in network resilience: every `gh`/git call retries through
  `ap`/`apsi`/`proxychains4` proxy wrappers on 403/unreachable. Agents are
  told to use `gh` CLI for GitHub (never WebFetch against `api.github.com`,
  which 403s) and to apply the same proxy retry to ad hoc commands.

`game-director`'s cycle runs `qa-tester` ONCE at the end of evaluation (not in
every fix round — it's the slowest agent), and syncs any `.github/workflows/**`
change to `master` in the same cycle (GitHub resolves `workflow_dispatch` by
name from the default branch).

## Assets: a dedicated creator + critic, not ad hoc geometry

- **`.opencode/agent/asset-creator.md`** — builds one game asset per
  invocation (model/material/procedural texture) as reusable Three.js code
  matching this project's existing visual style, since no
  asset-*generation* tool is wired in (only the two analysis MCPs above) —
  everything is procedural geometry/materials/canvas-drawn textures, not
  imported files. It does a quick self-check with one of the image tools
  before handing off (catches obvious mistakes cheaply) but that never
  substitutes for real review.
- **`.opencode/agent/asset-critic.md`** — the authoritative, harsh reviewer.
  Separate from `asset-creator` on purpose, for the same reason none of the
  other builders grade their own work: it reviews via `previewAsset`
  screenshots (see below) through both image MCPs, cross-checking
  Blocker-level visual calls against both models, plus the code itself for
  poly budget, instancing, and disposal.
- **`window.__debug.previewAsset(name)`** — a new primitive in
  `DEBUG_HARNESS.md`, separate from `gotoFixture`. Loads exactly one asset
  into a neutral studio background/lighting rig so `asset-critic` gets a
  clean, unambiguous shot with no gameplay context — uses the exact same
  `scene-capture` subagent and capture script, just a different fixture
  category (`"asset-preview"`).
- `game-director` now has a **step 3.5** in its cycle: any feature needing new
  visual content stops there to commission `asset-creator` and get it through
  `asset-critic` *before* `feature-writer` ever touches it, and it's also a
  standalone backlog category (**Assets & Art**) for pure art passes with no
  code changes. There's a new standing rule against `feature-writer` ever
  improvising asset geometry as a shortcut.

### Running the bootstrap (Part A) — answering your question directly

Yes: before starting `dev-loop.sh`, open OpenCode once and point an agent at
the file — don't paste the doc's contents into the prompt by hand, just tell
it to read and implement the file:

```
opencode run --agent build "Read and implement docs/dev-log/DEBUG_HARNESS.md end to end, starting with Part A."
```

(`feature-writer` works too.) Once that's done and committed, `game-director`
and `scene-capture` will find `tests/scene-fixtures.json` on their own from
then on — nothing else to hand-configure. From that point the harness isn't a
separate task anymore; it just keeps growing as an ordinary part of every
feature (Part B) and gets health-checked at every milestone (Part C).

### Why this fixes the slowness you ran into

The expensive part was never taking the screenshot — it was *getting there*
(menus, movement, waiting on a slow render loop) and, for QA, *also* having to
simulate its way through preconditions before it could even start testing.
Debug-jump removes both: load once, call a function, poll a ready-flag,
screenshot or assert. A run that used to take minutes of simulated play (or
real time, for anything crop-growth/timer-based) becomes seconds.

### If it's still slow

- Try the GPU flags in the capture script's header comment
  (`--use-gl=desktop`, `--ignore-gpu-blocklist`, `--enable-gpu-rasterization`)
  before falling back to plain headless (software-rendered, always works, just
  slower — some integrated GPUs don't like those flags under headless).
- Keep the capture viewport small (960x540 is plenty for critique).
- Never capture `--all` mid-cycle — only the fixtures the current feature
  actually touched. Full-catalog runs are for milestones only.
- Raise `--concurrency` on `capture-screenshots.mjs` once the fixture catalog
  grows enough that even scoped runs feel slow.
- A fixture that times out waiting for `ready` is itself a useful signal
  (possible hang) — `game-director` forwards that to `qa-tester`, not just a
  silent retry.

## Cost/model tuning (optional)

Every agent file omits `model`, so subagents inherit whatever model
`game-director` (a primary agent) is running under, and `game-director` uses
your globally configured default. If you want to save cost, you can add a
`model:` line to the frontmatter of the critic agents to point them at a
cheaper/faster model while keeping `game-director` and `feature-writer` on your
strongest model — run `opencode models` to see what's available to you.

## Files in this kit

```
.opencode/agent/game-director.md      primary orchestrator
.opencode/agent/feature-writer.md     implements one feature per cycle
.opencode/agent/design-critic.md      is it fun / does it fit / is it redundant
.opencode/agent/ui-critic.md          HUD/menus/input harshness
.opencode/agent/visual-critic.md      Three.js scene/art-direction harshness
.opencode/agent/performance-critic.md render-loop/asset/memory harshness
.opencode/agent/qa-tester.md          breaks things on purpose, owns e2e tests
.opencode/agent/scene-capture.md      captures only the fixtures it's told to
.opencode/agent/asset-creator.md      builds one procedural Three.js asset per call
.opencode/agent/asset-critic.md       harsh, separate review of each asset
opencode.json                         default agent + hard git safety rules
docs/dev-log/FEATURE_BACKLOG.md       idea queue, seeded with 10 starter ideas
docs/dev-log/MILESTONES.md            milestone criteria + history
docs/dev-log/DEV_LOG.md               shipped-feature ground truth
docs/dev-log/DEBUG_HARNESS.md         living debug/test-harness spec — run Part A once
docs/dev-log/CYCLE_STATE.json         checkpoint for resuming after a crash/outage
docs/dev-log/INCIDENTS.md             log of subagent failures/retries
scripts/dev-loop.sh                   the actual "keep going forever" loop
```
