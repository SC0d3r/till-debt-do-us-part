# PROJECT PIVOT & IDENTITY OVERRIDE — read this before anything else

## Authority of this document

This is the current, authoritative statement of what this project is. It
**overrides and supersedes** any conflicting description found anywhere else
in this repository — including `.opencode/agent/game-director.md`'s own Role
paragraph (which currently describes you as directing a "Harvest-Moon-style
farming sim" — that description is stale as of this document), older
`DEV_LOG.md` entries, old `MILESTONES.md` targets, and any other saved file.
If anything else in this repo disagrees with this document, this document
wins. Do not reason your way back to farming-sim framing because an older
file still says so.

**You may not edit `.opencode/agent/**` yourself** to fix this — that's the
project owner's file, not yours, even though it's the single biggest source
of stale framing (see "Durability" below for why, and what to do about it
instead).

## What this project now is

A Three.js game built around a procedurally generated, seedable, chunked
isometric tile-map world (`TileMapComposer` — Slice A — plus the tile/prop
library and biome map generator being built in the slices that follow this
document). **The final genre and gameplay loop on top of that foundation is
intentionally undefined right now.** Do not invent one. Do not describe this
project as a farming game, a survival game, or any other specific genre in
new docs, commit messages, or backlog entries — describe it as what it
concretely is (a tile-based world/exploration foundation) until a future
brief defines gameplay on top of it. This is consistent with the standing
rule already in effect: no gameplay-functionality work, no new game-rule
content, until you're explicitly told otherwise.

## What survives the pivot

- The entire tile-map-composer system: `TileMapComposer.js`, every tile/prop
  asset module, `docs/dev-log/TILE_SYSTEM_CONVENTION.md`. This is what
  you're actively building on top of — nothing here is being removed.
- The debug harness: `window.__debug`, `docs/dev-log/DEBUG_HARNESS.md`,
  `tests/scene-fixtures.json`, the CI/Puppeteer pipeline
  (`scripts/run-ci-puppeteer.sh`, `.github/workflows/puppeteer-tests.yml`).
- **The slot machine code**, wherever it currently lives — locate it
  yourself (search the repo / check `DEV_LOG.md` for when it shipped). Keep
  it, don't delete it, but don't wire it into the active game loop either —
  it stays dormant, clearly separated (its own directory if it isn't already
  in one), for possible future reuse. Note in your cycle summary where you
  found it and where you left it.

## What gets deleted

Everything that constitutes the old Harvest-Moon farming game: the old farm
scene/world content, farming mechanics (planting, harvesting, tools,
animals, NPCs, shop/economy), and any farming-specific HUD/hotbar/UI.

**Before deleting anything**: inventory what actually exists (list/grep the
codebase) and use judgment on the boundary. Generic engine infrastructure
that isn't inherently about farming — input handling, camera controller,
renderer/scene bootstrap, generic save/load plumbing, anything the tile
system itself now depends on — should be kept even if it was originally
built for the farming game, since it may still be useful for whatever this
becomes. Farming-specific game logic, content, and assets should go. When a
piece of code is genuinely ambiguous, ask `design-critic` to judge fit rather
than guessing or deleting blindly.

Run this as a `feature-writer` task tagged Tech & Performance. `design-critic`,
`qa-tester`, and `performance-critic` all sanity-check the result — not
"is this fun" (there's no gameplay to judge), but: does the build stay green,
are there any orphaned imports/dead references left behind, does the app
still boot without runtime errors. Commit with a clear, honest message using
the breaking-change marker (e.g.
`chore!: remove Harvest-Moon farming game, pivot to tile-based world`), and
log it prominently in `DEV_LOG.md`.

## Durability — how this stays true across every future cycle, not just this one

`game-director` starts a brand-new session every single dev-loop cycle — it
has no memory of this chat, only what's in the repo's state files. A pivot
this size has to be written into something that gets read every cycle, or it
silently reverts the moment this conversation is gone. Do this now, as your
very first action:

1. **Prepend** (insert at the very top, above everything else — never
   append below existing content) this exact banner to BOTH
   `docs/dev-log/FEATURE_BACKLOG.md` and `docs/dev-log/MILESTONES.md`:

   ```
   # ⚠ PROJECT PIVOT — READ THIS FIRST, EVERY CYCLE, FOREVER
   This project is no longer a Harvest-Moon-style farming game. See
   `docs/dev-log/PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` for the full,
   authoritative statement of what this project now is. This banner
   supersedes any conflicting description anywhere else in this repo,
   including game-director.md's own agent description. Never remove this
   banner or let new content get inserted above it.
   ---
   ```

2. In `FEATURE_BACKLOG.md`, delete every farming-related backlog item below
   the banner — not mark blocked, actually remove them, they aren't coming
   back.
3. In `MILESTONES.md`, mark every existing farming-themed milestone
   `VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md`.
   Don't delete those entries — they're accurate history — just make
   unmistakably clear they're no longer active goals. Leave the "next
   milestone" slot empty/TBD for now rather than inventing new ones; that
   comes from a future brief once gameplay direction exists.
4. `DEV_LOG.md` history can stay as-is — it's an honest record of what
   existed, including things now removed. Just don't treat old entries as
   "still-existing features to maintain or extend."

**The one thing this document can't do on its own**: `game-director.md`'s
own Role paragraph still says "Harvest-Moon-style farming sim" every single
time you're invoked, since that file is outside your write access. Steps 1-3
above are what make the pivot durable without touching it. If you ever
notice yourself drifting back toward farming-flavored ideation, that stale
paragraph is almost certainly why — say so plainly in your cycle summary so
the project owner knows to fix it at the source, rather than trying to route
around it yourself indefinitely.

## Definition of done for this document

- [ ] Slot machine code located, confirmed preserved, not wired into the
      active loop.
- [ ] Old farming game content deleted; build stays green; no orphaned
      imports; app boots cleanly.
- [ ] Banner prepended to both `FEATURE_BACKLOG.md` and `MILESTONES.md`.
- [ ] Farming backlog items removed; old milestones marked VOID, not
      deleted.
- [ ] Clear commit logged in `DEV_LOG.md`.
- [ ] Proceed to the tile/prop design slice next (handed to you separately).
