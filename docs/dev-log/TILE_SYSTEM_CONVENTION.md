# Tile System Convention — living spec

Single source of truth for how tile assets and the map composer are built in
the Modular Isometric Biome Tile System initiative
(`docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`). `asset-creator` and
`feature-writer` follow this; `asset-critic` and `performance-critic` judge
against it. If this doc and the code disagree, the code wins and this doc
needs fixing.

## 1. Tile anatomy (every tile, every biome, no exceptions)

- Footprint: a square of side `1.0` in world units, rotated 45° about Y, so
  the top face reads as a diamond/parallelogram from the isometric camera.
  Grid spacing is `1.0` along X/Z (diamonds touch at corners; small gaps are
  fine — floating-tile look is intentional).
- Three vertical bands, bottom to top:
  1. **Root base band** — darker, desaturated color (the "root"). Sells the
     floating-block feeling.
  2. **Side-wall band** — a distinct color from the top material, usually a
     darker/more saturated shade of it (e.g. grass top / earthy-green side,
     NOT grass top / darker-grass side).
  3. **Top face** — the visible/playable surface; flat or very slightly varied.
- Total height ~0.42–0.5 units; top slab ~40% of height, root band ~60%
  (reference image 3 proportions).
- Flat/faceted shading everywhere (`flatShading: true` or equivalent flat
  normals). Crisp edges, no bevels, no smooth gradients.
- A subtle soft shadow/AO directly under the tile so it separates from the
  background (the dark root band carries most of this; the composer may add a
  shared under-shadow layer for whole maps).

## 2. Module convention (asset-creator)

- One module per biome family under `src/assets/tiles/` (e.g.
  `src/assets/tiles/grass.js`), plus one module per prop under
  `src/assets/props/`.
- Each tile factory follows the standing convention: self-contained factory
  function returning a `THREE.Group`/`THREE.Object3D`; shared geometry and
  material at MODULE scope, never rebuilt per instance; disposal-safe (a
  `dispose()` that frees shared geometry/materials is provided where the
  module owns them).
- **No required runtime arguments** beyond an optional variant/seed. Biome and
  decoration choice happens at the DATA level (the composer's grid), not by
  parameterizing one mega-function per biome.
- Top-face detail (grass noise, flowers, transition splits) is a small canvas
  texture with `NearestFilter`/`NearestFilter` and `RepeatWrapping` off —
  pixelated, crisp, matching the flat style. Transition tiles draw a
  stair-step diagonal split between two biome colors on the top-face texture
  (reference image 3's "zipper" pattern).
- Because all variants of a biome share the same prism geometry (only the top
  texture differs), every tile is InstancedMesh-compatible: the composer
  groups by `(biome, variant)` and uses one `InstancedMesh` per group.
- **Hover/selection must work on instances**: use per-instance color
  highlighting (`InstancedMesh.setColorAt` + `instanceColor.needsUpdate =
  true`) from the start, never per-object material swaps.

## 3. Composer convention (feature-writer)

- `src/world/TileMapComposer.js`: a generic module taking a plain data
  structure — an array/grid of `{ x, y, biome, variant, elevation? }` — and
  instantiating the right tile instances at the right isometric grid
  positions. It knows NOTHING about farming, the player, or any specific
  level layout.
- Group tile instances by `(biome, variant)`; `InstancedMesh` per group
  wherever a tile type appears many times.
- Hover: raycast from camera through mouse onto the tile layer; subtle
  brightness/opacity increase on the hovered tile. Selection: a visibly
  stronger cue (outline/glow/border) matching the flat crisp style.
- The showcase map is a technical proof (every family built so far + at least
  one transition visible in one view), wired through `window.__debug` so it's
  screenshot-able like everything else.

## 4. Preview fixtures

Every tile variant and prop registers an `"asset-preview"` fixture in
`tests/scene-fixtures.json`, resolved through `window.__debug.previewAsset`
(neutral studio background, standard 3-point rig, camera framed to fill the
viewport). One fixture per variant is fine — `scene-capture` can capture many
fixtures in a single CI run.