# Initiative brief: Modular Isometric Biome Tile System

Read this whole brief before doing anything. This is a one-time initiative
brief, not a normal single-feature cycle — it temporarily changes some of your
default rules (see section 2). Once section 5's Definition of Done is met,
go back to your normal continuous-development loop exactly as before.

## 1. Context — current state vs. target

**Current state** (`farm-day.png`, your own current build): a continuous,
single connected blocky/voxel ground plane — mostly one grass material,
Minecraft-cube style. It needs a full hand-placed ring of cliffs and trees
around the play area or it looks unfinished, and there's no real concept of a
"tile" as a discrete asset — it's closer to a heightmap block world than a
kit.

**Target state**: a modular isometric floating-tile system. The world is
built from discrete, individually crafted tile assets. Each tile has real
visual thickness — a colored top face, a distinct side-wall color band, and a
darker "root" base band underneath — a crisp diamond/parallelogram
silhouette, flat/faceted shading (not smooth), and a family of variants per
biome (plain, decorated, edge/transition, elevated). The critical property
this buys you: each tile is visually self-sufficient. A handful of them
floating on an empty background still looks intentional and finished,
because the tile itself carries the scene — you're not dependent on
surrounding world-dressing to not look bare.

### Reference images (5 attached — reference these by number below; the
actual files live in `docs/dev-log/tile-system-reference/` (1.webp, 3.webp,
4.webp, 5.webp, farm-day.png) — `asset-creator` should open them with the
image-analysis tools when building each family, but this description should
stand on its own either way)

1. **Broad biome + prop kit** — floating island tiles across many biomes
   (grass+palm, sand, stone, water, volcanic/lava with glow), plus a large
   set of decorative props and items (crystal clusters in many colors,
   chests, tools, plants, rocks). Shows biome breadth and prop density.
2. **`farm-day.png`, your current build** — the "before" reference. See
   above.
3. **The cleanest technical reference.** A proper tile kit on white
   background: plain grass, grass-with-scattered-foliage, and — most
   important — a whole family of grass/dirt edge-transition tiles at
   different diagonal splits and orientations, a water tile, a plain dirt
   tile, a dirt-with-pebbles tile, and a dirt tile with a raised
   cliff/elevation block on top. Every tile shares the exact same
   construction: diamond top face, two visible side walls, dark base band.
   This is the silhouette/construction convention to copy exactly.
4. **Structural reference (pixel-art style, different render technique, same
   idea).** Shows a small tile *atlas* (grass, dirt, water, sand + tiny prop
   sprites) assembled into an arbitrary board layout — grass border, dirt
   path ring, water center, floating coin/gem pickups above tiles. The
   rendering style doesn't match your target (this one's pixel art, not
   flat-shaded low-poly), but the structural idea — a discrete tile atlas
   composed into an arbitrary board — is exactly what section 4's composer
   needs to do.
5. **Biome breadth reference.** More tile families on the same silhouette
   convention as #3: tall-grass-with-reeds, a rust/cracked "volcanic" tile
   with red grass tufts, rocky/stone, icy-blue water, grass-with-flowers,
   sand, dirt-with-mushrooms, grass-with-a-small-pond, and a cracked
   mud/shoreline tile. Confirms the construction convention holds up across
   very different biome materials.

## 2. Scope for this initiative — read carefully, this overrides some standing rules

- **This is Assets & Art / Tech & Performance work, not a gameplay feature.**
  You're building (a) a tile asset library and (b) a generic system that
  composes arbitrary maps from that library — not a playable mechanic.
- **Explicit, temporary override of your category-variety rule.** It's fine
  and expected to spend many consecutive cycles entirely in Assets & Art and
  Tech & Performance until section 5's Definition of Done is met. Don't force
  in an unrelated feature just to satisfy variety — that rule resumes
  automatically once this initiative is done.
- **Do not test gameplay functionality.** Don't ask `qa-tester` for
  functional/regression coverage on this work, and don't have it write
  assertions tied to current gameplay mechanics — the gameplay built on top
  of this system is going to change substantially later, so that investment
  would mostly be thrown away. The only thing `qa-tester` should confirm here
  is that the build stays green (a basic smoke check) — not correctness of
  any game rule.
- **Still run every other gate at full strength.** `design-critic`,
  `asset-critic`, `ui-critic`, `visual-critic`, `performance-critic` all
  apply as normal — arguably matter MORE here, since the entire point of this
  initiative is visual and technical quality. `design-critic`'s lens shifts
  for this work specifically: judge "does this fit the game's tone, and is it
  flexible enough that future gameplay won't be fighting the tile system,"
  not "is this fun" — its usual fun-test/progression-fit checklist mostly
  doesn't apply to tooling.
- **Don't rip out the current playable scene.** Build the new tile kit and
  map composer as an additive, parallel system (its own preview/showcase
  entry point — see section 4) rather than replacing the live farm scene in
  place. The actual swap-over to the new system is a separate, later
  initiative, once you're explicitly told gameplay is being rebuilt on this
  foundation.
- Use your existing pipeline exactly as designed — `asset-creator` builds
  each tile/prop, `asset-critic` reviews each one, `feature-writer` builds
  the composer/hover system, the rest of the critic pack reviews it in
  context. Nothing about *how* you delegate changes here, only *what*.

## 3. Visual language spec — hand this to `asset-creator` as the spec

### Tile anatomy (every tile, every biome, no exceptions)

- A flat or very slightly varied top face — the visible/playable surface.
- A distinct side-wall color band directly below it: usually a darker or
  more saturated shade of the top material, not the same color just
  uniformly darkened (e.g. grass top / earthy-green side, not grass top /
  darker-grass side).
- A darker, desaturated base band at the very bottom — the "root." This is
  what sells the floating-block feeling.
- Flat/faceted shading (`flatShading: true`, low-poly faceted geometry), not
  smooth-shaded. Crisp, clean edges everywhere — no soft/blurred transitions.
- A subtle soft shadow/AO directly under the tile so it visually separates
  from whatever's behind it.

### Biome families — build each as a FAMILY, not a single tile

Per biome: at minimum 1 plain variant, 1-2 decorated variants (small props
scattered on the top face), and edge/transition variants for blending into
at least one neighboring biome (reference image 3's grass-to-dirt diagonal
family — several rotations/ratios of the same blend). Build in roughly this
order — each is independently useful, and this order validates the composer
early instead of late:

1. **Grass** — plain, flowers, bushes/trees, tilled-soil-adjacent edge
   (connects directly to the existing farm mechanic later).
2. **Dirt/farmland** — plain, tilled, watered, grass-transition edges (reuse/
   extend the grass edges from #1).
3. **Water** — plain, shoreline/edge-to-grass or edge-to-sand transition.
4. **Sand/desert** — plain, dune/cracked variant, cactus-decorated,
   grass-transition edge.
5. **Rock/stone** — plain, ore/boulder-decorated, cliff/elevated variant (a
   raised block on top, like image 3's bottom-right example).
6. **One clearly "fantasy" biome**, to prove the system isn't just literal
   terrain — crystal or volcanic (image 1's crystal clusters / lava-vent
   tiles). This is the stress test for "diverse enough to build any map,"
   not just farm-adjacent ground.

Anything beyond this (snow, forest, more transition permutations) is a good
follow-up backlog item once the composer is proven — don't block on building
every biome before starting section 4's composer work; validate the pipeline
early with a smaller set, per the sequencing in section 6.

### Decorative props — separate, small, reusable assets

Crystals (a few color variants), rocks/boulders (small and large), a simple
low-poly tree/bush, grass tufts, flowers. Each is its own `asset-creator`
commission — small, cheap, heavily instanced. These get scattered onto tile
top faces by the composer (section 4), not baked individually into every
tile variant where composability holds up visually — prefer "plain grass
tile + a flower prop placed on top" over "a separate grass-with-flowers tile
asset," so the number of prop combinations doesn't multiply the number of
tile assets you have to build and maintain.

### Hover / selection feedback

- **Hover**: a subtle brightness/opacity increase on the tile under the
  cursor — polished, not garish. Raycast from the camera through the mouse
  position onto the tile layer.
- **Selection**: a visibly stronger cue than hover — an outline/glow/border —
  still matching the flat, crisp art style, not a generic glow blob.
- **Technical heads-up, plan this from the start**: if the highest-count
  tile types (plain grass, plain dirt, etc.) use `InstancedMesh` for
  performance — they should, see section 4 — a per-object material swap
  won't work for hover/selection on those instances. Use per-instance color
  highlighting (`InstancedMesh.setColorAt` + `instanceColor.needsUpdate =
  true`) from the start, not as a retrofit after the naive version breaks.

## 4. Technical architecture requirements — hand this to `feature-writer`

- **Tile module convention**: every tile factory follows `asset-creator`'s
  existing standing convention (self-contained factory function, shared
  geometry/material at module scope, disposal-safe). Additionally, for this
  system specifically: every tile factory takes no required runtime
  arguments beyond an optional variant/seed — biome/decoration choice
  happens at the DATA level (below), not by parameterizing one mega-function
  per biome.
- **Map composer** (e.g. `src/world/TileMapComposer.js`): a generic module
  that takes a plain data structure — an array/grid of `{ x, y, biome,
  variant, elevation? }` — and instantiates the right tile instances at the
  right isometric grid positions. It must know nothing about farming, the
  player, or any specific level layout. Building today's farm layout and an
  arbitrary showcase layout should both just be "different data fed to the
  same composer" — that data-driven separation is the actual point of this
  initiative, not the art style by itself.
- **Instancing**: group tile instances by `(biome, variant)` and use
  `InstancedMesh` per group wherever a tile type will realistically appear
  many times — exactly what `performance-critic` already checks for; don't
  wait to be told.
- **Showcase/demo map**: build one map purely to exercise the composer and
  prove it handles every biome family built so far together, arranged so
  every family and at least one transition is visible in a single view. This
  is a technical proof, not a real level — wire it through the existing
  `window.__debug`/`previewAsset`-style convention from
  `docs/dev-log/DEBUG_HARNESS.md` if that fits, so it's screenshot-able the
  same way everything else is, rather than something a player reaches
  through normal play.
- Keep the existing farm scene's own tiles/rendering untouched and working —
  this system lives alongside it until a later initiative swaps it in.

## 5. Definition of done for this initiative

- [ ] Tile module convention documented and used consistently.
- [ ] At least the 6 biome families in section 3, each with the variants
      listed, all through `asset-creator`/`asset-critic`.
- [ ] Decorative prop set built and composable onto tiles.
- [ ] `TileMapComposer` exists, is data-driven, and builds today's farm
      layout AND a separate showcase layout from two different data sets,
      proving reuse.
- [ ] Hover feedback works on the showcase map; selection feedback works or
      is a clearly-logged follow-up.
- [ ] `InstancedMesh` used for the high-count tile types;
      `performance-critic` has signed off.
- [ ] `asset-critic`, `ui-critic`, `visual-critic` have all signed off on the
      showcase map in-context — not just individual tile previews.
- [ ] Nothing in the existing playable farm scene broke.
- [ ] Once all of the above is true, resume your normal category-rotation
      rules and continuous feature development — this initiative is over.

## 6. How to start

Populate `docs/dev-log/FEATURE_BACKLOG.md` now with one Assets & Art item per
biome family (tag them so they're grouped/recognizable, e.g. "tile-kit:
grass family"), plus one Tech & Performance item for `TileMapComposer` —
sequence the composer item right after the FIRST biome family ships, not at
the end, so the data-driven composer approach gets validated early while
it's still cheap to adjust, rather than discovering a design problem after
building six biomes against an untested API. Then proceed through your
normal cycle exactly as usual, one item per cycle, drawn entirely from this
batch until section 5 is satisfied.
