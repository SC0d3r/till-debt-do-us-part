# ⚠ PROJECT PIVOT — READ THIS FIRST, EVERY CYCLE, FOREVER
This project is no longer a Harvest-Moon-style farming game. See
`docs/dev-log/PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` for the full,
authoritative statement of what this project now is. This banner
supersedes any conflicting description anywhere else in this repo,
including game-director.md's own agent description. Never remove this
banner or let new content get inserted above it.
---

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
- **TRUST THE NVIDIA VISION MODEL (2026-08-07, directive from project
  owner):** every agent that uses the image-analysis tools (box-mcp /
  gemini-analyze-image) MUST TRUST the vision model's output — it is
  accurate. Ask it MANY detailed, specific questions with generous token
  allowance to get its full output. Do not dismiss, second-guess, or
  "correct" its verdicts; a garbled/empty vision reply is a tooling retry
  (re-ask with a simpler prompt), not grounds to ignore the model.
- **NO INDIVIDUAL SCREENSHOT IMAGES IN THE REPO (2026-08-07, directive from
  project owner):** do not commit individual `tests/screenshots/*.png`
  files — they grow the repo. If any example image is committed at all, it
  must be ONE composite example image (a montage of the tile/prop catalog),
  and the individual captures stay untracked (gitignored).

---

## Tile-kit initiative batch (2026-08-06) — Modular Isometric Biome Tile System

One-time initiative per `docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`.
Draw exclusively from this batch until its Definition of Done (section 5) is
met; category-variety rules are temporarily suspended for this batch. Items
are tagged `tile-kit:` so they're recognizable. Sequencing per brief section
6: composer right after the FIRST biome family ships, so the data-driven API
is validated early.

- [shipped] (Assets & Art, M) tile-kit: grass family — plain grass, flowers-decorated, bush/tree-decorated (single merged geometry, InstancedMesh-safe), grass→dirt edge-transition family (exactly 4 baked orientation variants n/e/s/w via shared `transitionTexture.js`), grass→tilled-soil edge, plus a plain dirt variant for showcase context. FIRST biome family; validates the tile construction convention + preview pipeline. SHIPPED 2026-08-06: 13 variants (grass-plain/flowers/bushes, grass-dirt-n/e/s/w, grass-tilled plain + grass-tilled-n/e/s/w edges, dirt-plain), straight-sided two-band prism (top ~55% / root ~45%), per-biome root colors, sRGB-unified texture pipeline, previewAsset harness + 13 fixtures, qa regression suite. NEXT: composer (brief §6). **SUPERSEDED 2026-08-07 by the Slice B trim (user revision):** the two-band prism, flowers/bushes, and all grass-dirt/grass-tilled transition variants were REMOVED; grass is plain-only (`grass-plain/-b/-c`), dirt is its own module. See the Slice B doc batch log.
- [shipped] (Tech & Performance, L) tile-kit: TileMapComposer + showcase map — data-driven `src/world/TileMapComposer.js` taking `{x,y,variant,rotation?,elevation?,outline?,outlineColor?}` grids; InstancedMesh per variant-string group; diagonal-lattice packing ((x−y)*0.5, 0, (x+y)*0.5) — solid ground, zero holes; per-record rotation 0/90/180/270; hover contract (instanceColor 0.88↔1.0, pointerout/blur clears); outline system (per-record masks, one ribbon per seam, owner = biome-matched tile, per-instance colors); showcase 9x9 map + green-vs-brown A/B; rotation-aware validator + ghost-edge gate; devHarness fixture + lattice projectTile. SHIPPED 2026-08-06 (dev d78dc8c): 78/78 composer + 31/31 exploratory + 51/51 tile-kit + 23/23 fixtures; convention doc pinned through 4 user revisions. NEXT: slice B (selection) or next family (brief §6). **REVISED 2026-08-07:** showcase map rewritten as a 9x9 biome patchwork (all six plain-only families, no transitions); validator simplified to known-variant + unique-(x,y) checks; composer tests re-pinned to the trimmed roster.
- [idea] (Tech & Performance, S) tile-kit: composer slice B — selection (stronger cue than hover) incl. the pinned selection-ring-vs-dropped-seam ownership rule (render own ring geometry for neighbor-owned seams or force owner re-resolution); DOM-overlay raycast gate from ui-critic; hover cursor styling.
- [blocked] (Assets & Art, S) tile-kit: corner/elbow + 45-deg diagonal seam variants — design-critic Major from composer post-build: one-variant-per-cell can't express inside/outside corners (showcase dodges with straight path + buffered patch); corner/elbow variants unblock path bends; 45-deg seam variants unblock diagonal boundaries. **BLOCKED 2026-08-07 (user directive):** transitions/edge variants were removed entirely — this item is moot until/unless edge tiles are reintroduced.
- [idea] (Tech & Performance, M) tile-kit: elevation slice — nonzero elevation support in the composer + outline frame height-tuple cache key (design-critic + performance-critic: frame cache key must include (top,base) once families differ in height).
- [blocked] (Assets & Art, S) tile-kit: zipper canonical pixel-rotation — visual-critic Major: 90°/270° rotation of a baked transition MIRRORS the zipper staircase (baked boundaries are monotone-increasing); bake all four orientations from one canonical staircase via actual pixel rotation so rotated edges are mathematically identical to baked ones. **BLOCKED 2026-08-07 (user directive):** the transition zipper was deleted — moot until edge tiles return.
- [idea] (Tech & Performance, XS) tile-kit: composer data hardening — reject duplicate (x,y) records and non-integer x/y in `_validateRecord` (qa-tester: silent overlap/fractional-lattice gap in the generic composer; showcase path already gated); plus a harness escape hatch for outline-absent builds (opts.outline:null currently falls back to interior).
- [idea] (Tech & Performance, XS) tile-kit: dev assert bbox-vs-userData — catch a family that forgets userData.outlineTop/outlineBase before the bbox fallback silently floats the frame (performance-critic).
- [idea] (Assets & Art, XS) tile-kit: per-record outline width — accent records can't fatten their line without global retuning (design-critic nit).
- [idea] (Tech & Performance, XS) tile-kit: swap-initiative data-coord note — any later map-swap must pick a data-grid rotation or a second transform (data axes are world diagonals now); also matched|matched cross-biome seam colors flip on whole-map mirror (design-critic).
- [idea] (Assets & Art, S) tile-kit: decorative props base set — crystals (color variants), rocks/boulders (small+large), low-poly tree/bush, grass tufts, flowers; each a small reusable factory, heavily instanced, composable onto tile top faces by the composer. (Slice B section 4 socket system applies.)
- [idea] (Assets & Art, M) tile-kit: dirt/farmland family — plain, tilled, watered. (Plain dirt already shipped; tilled/watered are new plain variants.)
- [idea] (Assets & Art, M) tile-kit: water family — plain, shoreline/edge-to-grass or edge-to-sand transition. (Plain water shipped; shoreline is a new plain variant or a reintroduced edge.)
- [idea] (Assets & Art, M) tile-kit: sand/desert family — plain, dune/cracked variant, cactus-decorated. (Plain sand shipped.)
- [idea] (Assets & Art, M) tile-kit: rock/stone family — plain, ore/boulder-decorated, cliff/elevated variant (raised block on top).
- [idea] (Assets & Art, M) tile-kit: crystal/volcanic fantasy family — crystal-cluster tiles + lava-vent tiles with glow; the "diverse enough to build any map" stress test.
- [idea] (Tech & Performance, L) tile-kit: map layout data + swap-over initiative — build a full map as composer data and swap the live scene onto the tile system (SEPARATE later initiative; only once explicitly told gameplay is being rebuilt on this foundation).

## Follow-ups from project pivot (2026-08-07)

- [idea] (Polish & Game Feel, S) boot camera framing — visual-critic Major on tile-showcase: the showcase map occupies ~10% of frame (465x280 px bbox on 960x720) and sits 32 px below center; ~90% empty background reads "unfinished" as the product's face. Push the boot camera in ~1.7x (e.g. (0, 6.4, 13) or FOV 50→~38°) and center vertical framing. Also makes decorated variants (2px flowers) read stronger.
- [idea] (Assets & Art, XS) grass-root SW wall reads near-black in preview — visual-critic Minor: GRASS_ROOT (0x4a3a2a) bottom-left wall catches only the 0.35 fill light; lift slightly or add subtle bounce for the SW wall (same fix the dirt/tilled roots got).
- [idea] (Tech & Performance, XS) dead COLORS keys in procedural.ts — visual-critic Nit: `grass` (grass.js uses its own GRASS_TOP) and `leafDark` (replaced by BUSH_SHADE) are unused; delete them or document as family-manifest-only.
- [idea] (Tech & Performance, XS) getState() should report active fixture — qa-tester Minor: tests that want to assert "we're on X" currently bookkeep it themselves.
- [idea] (Tech & Performance, XS) drop vestigial dtScale param — qa-tester Nit: TileWorld.setFastMode(enabled, renderEvery, dtScale=20) ignores dtScale; devHarness no longer passes it. Delete the param.
- [idea] (Tech & Performance, XS) unimported dead-code audit — feature-writer noted SlotMachine/InputManager/SoundManager/disposeObject are all unimported (only SlotMachine→SoundManager edge). Decide: keep dormant per pivot doc, or delete for hygiene.

---

## Shipped (surviving infrastructure — history)

- [shipped] (Tech & Performance, M) CI pipeline: arbitrary tests + async +
  gh rules — extended the puppeteer pipeline so ANY agent can run arbitrary
  custom puppeteer scripts through GitHub Actions (`--tests=` workflow input +
  custom-tests job), added `--async`/`--collect` multitasking, and made every
  gh/git call retry through ap/apsi/proxychains4 on 403/unreachable. Fixed the
  snapshot bug (git stash create drops untracked files → private temp index +
  commit-tree) and the CI build gate (typescript ^5.9.3 for madge@8 peer).
  Agent docs: qa-tester runs ONCE at end of eval; workflow yml synced to
  master. Validated on CI with tests/smoke-ci.mjs. (dev 5644ae0, 2026-08-06)
- [shipped] (Tech & Performance, L) Modularize main.ts — the 1946-line Game
  monolith was split into 14 subsystem modules + DebugActionRegistry; main.ts
  became a thin composition root. The farming subsystems it modularized were
  removed by the project pivot; the modularity directive and the devHarness
  API shape survive. (dev, 2026-08-05)
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
- [shipped] (Tech & Performance, M) Debug/test harness Part A — window.__debug
  API, 8 seed fixtures, screenshot capture pipeline, prod tree-shake gate.
  (dev 55883ed / manifest 1da0e6d, 2026-08-04)

## Follow-ups from harness review (2026-08-04)

- [shipped] (Tech & Performance, M) Fast QA mode — decouple game logic ticks
  from paint rate under software rendering so puppeteer tests finish
  minutes-fast: rAF override + render throttle + cheap renderer behind
  `?debug=1&fast=1`, plus `__debug.setFastMode`. (dev, 2026-08-05)