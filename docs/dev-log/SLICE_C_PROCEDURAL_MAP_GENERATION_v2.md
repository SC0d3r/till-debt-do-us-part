# Slice C: Procedural Seeded Map Generation + Movable-Cube Demo (revised)

## 0. Read first — dependencies

Read `docs/dev-log/PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` first. This
assumes Slice B (`SLICE_B_PIXEL_ART_TILES_AND_PROPS.md` — biome/prop
library + socket metadata, pixel-art tiles) is complete — check
`docs/dev-log/DEV_LOG.md`/`FEATURE_BACKLOG.md` for confirmation before
starting; if it isn't done yet, finish that first. This builds the actual
map generator on top of `TileMapComposer` (Slice A), using Slice B's
library.

**What changed from the previous version of this document**: earlier
drafts of this slice assumed the old Harvest-Moon farm scene would keep
running alongside the new tile system. That's no longer true — the pivot
document has that content removed entirely. Every instruction below about
"don't touch the existing farm scene" is void; there's nothing to preserve
there anymore. Everything else in this slice (generation, chunking, FOV,
lighting, demo tooling) is unchanged, since none of it ever depended on the
farming content.

## 1. Scope

Adjusted testing posture from Slice B, on purpose — this batch introduces
real interactive/algorithmic systems (generation determinism, input
handling, a debug command parser), which have meaningful correctness
properties worth testing even though there's still no real gameplay:

- `qa-tester` verifies BEHAVIORAL correctness: the same seed produces an
  identical map twice, WASD/click movement actually moves the cube and
  doesn't crash, debug commands don't throw on valid or invalid input.
- `performance-critic` verifies the CPU-efficiency requirement in section 3
  — chunk-generation time budget, no main-thread blocking spikes as the
  player moves.

Neither is testing "game rules" — there aren't any yet (and per the pivot
document, don't invent any). Also explicitly out of scope, same as Slice B:
no passability/collision logic. The demo cube moves freely across every
tile including water/gravel — don't implement any rule about what's
walkable; that's a deliberately later decision.

Category-variety override still applies until section 7's Definition of
Done is met.

## 2. Biome region generation

- Deterministic from a single seed: same seed → byte-identical map, every
  time, forever. Store the seed, not the generated result.
- Assign biome per CHUNK (a fixed-size block of tiles, not per-tile) from a
  low-frequency noise/cellular field evaluated at chunk-center coordinates,
  hashed together with the seed. Per-tile random biome assignment produces
  salt-and-pepper noise, not the coherent regions you actually want.
- A reasonable starting technique — not a mandate, these are the properties
  that matter, pick whatever implementation gets you there: scatter a
  handful of biome "seed points" across the generation space using the
  seed's own deterministic PRNG, assign each chunk to its nearest seed
  point's biome (a Voronoi-style cellular split). This naturally produces
  coherent, bounded regions. Cap each region's size — biomes should stay
  "gamey," not continent-scale.
- **Choke points**: at the boundary between two adjacent biome regions,
  narrow the transition to a short (roughly 1-3 tile) connector strip rather
  than a long open border — this is what makes crossing from one biome to
  another feel like a deliberate passage, not an arbitrary line on a noise
  map.
- Player always spawns on grass, at the origin chunk.
- Prop placement during generation respects biome eligibility (which prop
  types from Slice B's library are valid in which biome) and uses that
  biome's palette variant for shared shapes (the snow-bush case from
  Slice B). Where Slice B built 2-3 texture variants for a tile type,
  distribute them pseudo-randomly (deterministically from the seed) rather
  than always picking the same one.

## 3. Chunk streaming, and why not to grow `TileMapComposer` in place

`TileMapComposer` builds fixed-size `InstancedMesh`es once in its
constructor — there's no add/remove-instance API, by design. Don't try to
mutate one giant composer as the world expands. Instead: **one
`TileMapComposer` instance per chunk.** Generate a chunk's tile/prop data
(section 2) the moment the player gets within a load radius of it, construct
a composer for just that chunk's data, and `dispose()` the composer for any
chunk that falls outside a slightly larger keep-radius. This needs no
changes to `TileMapComposer`'s core build/dispose behavior — it's already
designed to be constructed and torn down cleanly; just apply that per-chunk
instead of once for a whole map.

**One real problem this creates, worth solving up front**:
`TileMapComposer` binds its own `document`/`window` hover listeners in its
constructor. One composer per loaded chunk means N independent listener sets
all raycasting redundantly on every `pointermove`. Fix: add an optional
constructor flag (e.g. `bindOwnHoverEvents`, default `true` so existing
single-map usage is unaffected) that skips the internal listener binding
when `false`, plus a small public method (e.g. `raycastFromPointer(ndcX,
ndcY)`) that runs the same raycast-against-this-composer's-meshes logic on
demand. Then build one small "world manager" that owns a single shared
`pointermove` listener, calls `raycastFromPointer` against whichever chunks
are currently loaded, and forwards the nearest hit's hover state — same
visual result, one listener instead of N.

- Budget chunk generation so it never blocks a frame noticeably — generate
  at most a small number of chunks per frame (or spread one chunk's
  generation across a couple of frames if it's ever heavy), not
  everything-at-once the moment the player crosses a boundary.
  `performance-critic` should treat a generation-caused frame spike as at
  least Major.

## 4. Field of view

- A visibility radius in tiles, day value larger than night value, both
  exposed as live-tunable settings (section 6's debug panel — being able to
  nudge this at runtime is exactly what makes it fast to tune).
- **No hard pop-in/pop-out.** Load a slightly larger radius than what's
  actually meant to be visible, and fade tiles smoothly (darken/desaturate
  toward a fog tone) across a band near the edge of the visible radius,
  fully faded out at the load radius. Compute this the same way the
  existing hover brightness already works — a per-instance distance-based
  darkness factor multiplied into the same `instanceColor` computation
  alongside the existing hover factor. This still works correctly now that
  tiles are pixel-textured rather than flat-vertex-colored — `instanceColor`
  multiplies against whatever the texture already outputs, so fog-darkening
  and hover-brightening apply as a tint on top of the pixel art, not a
  replacement of it.

## 5. Day/night lighting

- No sun/moon mesh or sprite needed — the isometric camera never looks at
  the sky, so this is purely ambient/directional light intensity and color,
  nothing geometric.
- Day: normal lighting, larger FOV radius.
- Night: very dark overall (Don't Starve-style) — a small, warm light pool
  around the player only (a point/spot light attached to the player),
  everything past a short radius reads as near-black. Smaller FOV radius at
  night too.
- Tie time-of-day to the existing `window.__debug.fastForward`/time-control
  primitives from `docs/dev-log/DEBUG_HARNESS.md` rather than building a
  second, separate day/night clock.

## 6. Demo & debug tooling

- **Placeholder player**: a plain cube (no player model exists yet — later).
  Moves via WASD, and via click-to-move (click a tile, cube paths/moves
  toward it) — both should work, not either/or. Camera follows.
- **Hover feedback**: already built into `TileMapComposer` — wire the demo
  to it, don't rebuild it.
- **Debug overlay**: pressing `` ` `` (backtick) toggles a panel, top-left,
  showing live stats (FPS, loaded chunk count, last chunk-generation time,
  current seed, biome under the cursor, whatever else is genuinely useful
  for debugging this system) plus a command input accepting at minimum:
  teleport to an x/y, set/advance time of day, regenerate the map with a new
  seed, and adjust the FOV radius live. Build this as a UI layer over the
  existing `window.__debug` primitives (`setState`/`getState`/`fastForward`
  etc.) — extend that harness with whatever new primitives this needs (a
  teleport helper, a map-regenerate helper) rather than building a second,
  parallel debug system; `DEBUG_HARNESS.md` exists specifically to keep
  growing this way.
- Wire the whole demo through the existing debug-harness/fixture convention
  (`previewAsset`-style) so it's screenshot-able via `scene-capture` the
  same as everything else, for `ui-critic`/`visual-critic` review.

## 7. Definition of done

- [ ] Same seed reproducibly generates the same map (`qa-tester` verifies
      this directly).
- [ ] Biome regions are coherent, bounded, connected via choke points — not
      per-tile noise.
- [ ] Chunks generate on approach and dispose on distance, with no
      single-frame generation spike (`performance-critic` signs off).
- [ ] FOV radius is live-tunable, day/night values differ, edge fades
      smoothly, correctly tinting the pixel-art textures rather than
      fighting them.
- [ ] Night lighting matches the Don't Starve-style small light pool
      description.
- [ ] Cube demo moves via WASD and click, hover works, the debug panel
      (`` ` ``) and its commands all work.
- [ ] Everything routes through the existing `window.__debug` harness rather
      than a parallel system.
- [ ] Once all of the above is true, resume normal category-rotation rules
      and continuous feature development — this initiative is over.
