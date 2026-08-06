# Tile System Convention — living spec

Single source of truth for how tile assets and the map composer are built in
the Modular Isometric Biome Tile System initiative
(`docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`). `asset-creator` and
`feature-writer` follow this; `asset-critic` and `performance-critic` judge
against it. If this doc and the code disagree, the code wins and this doc
needs fixing.

## 1. Tile anatomy (every tile, every biome, no exceptions)

- Footprint: a diamond **inscribed in a 1.0×1.0 grid cell** — vertices at
  `(±0.5, 0, ±0.5)`, center at the grid point. Grid spacing is `1.0` along
  X/Z, so adjacent diamonds touch at corners (corner-touching, no overlap —
  overlapping top faces would break raycast picking). Do NOT model the tile as
  a rotated square of side 1.0: that produces vertices at ±0.707 and overlaps
  neighbors at 1.0 spacing.
- **Two layers, not three (pinned 2026-08-06, user decision):** every tile has
  exactly TWO vertical bands, bottom to top, of a total height ~0.45:
  1. **Root band** — bottom ~45% (the bottom is the SAME height as the top
     or slightly SHORTER — pinned: top band slightly taller, ~55/45): the
     floating block's body. Its color is
     **BIOME-SPECIFIC** and must read as that biome's earth at a glance —
     grass: dark soil; dirt: dark rich earth; tilled: dark tilled loam. It
     must be darker and more desaturated than the top material, must stand
     out, and must never read as near-black. (The old middle side-wall band
     was removed; its height merged into the root band.)
  2. **Top face** — top ~55%: the visible/playable surface; flat or very
     slightly varied. The top slab's side thickness (riser) carries the
     top-face color per side.
- **Straight-sided prism (pinned 2026-08-06, user decision):** all bands
  share the SAME diamond footprint (vertices at ±0.5) — the tile is a
  straight-sided diamond prism, and the bands are distinguished by COLOR, not
  by inset geometry. There are NO stepped ledges/overhangs between bands; the
  side walls drop straight from the top cap to the base. (Reference image 3
  shows a terraced silhouette; the user chose straight-sided so composed maps
  read as clean floating blocks against sky/void.) The band boundary is the
  horizontal color change on the continuous wall.
- On transition tiles, the root band is split PER SIDE to match the top
  halves: the side under the dirt half gets the dirt root color, the side
  under the grass half gets the grass root color, etc.
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
  (reference image 3's "zipper" pattern). **All transition splits go through
  the shared utility `src/assets/tiles/transitionTexture.js`** —
  `makeTransitionTopTexture(colorA, colorB, orientation, ratio)` with pinned
  canvas resolution and stair-step size — never reimplemented per family.
  Ownership rule: the family that builds an edge owns it (grass owns
  grass↔dirt; the dirt family reuses those edges).
- **Transition orientation is baked as variants, never runtime rotation.**
  Each transition family ships exactly 4 baked orientation variants — the
  four diamond axis directions (e.g. `grass-dirt-n/e/s/w`). The composer does
  NOT rotate tiles; per-instance rotation is a deliberate later schema change.
  This applies to EVERY transition (grass→tilled included) — a partial
  transition family (1 orientation only) is a convention violation unless the
  composer explicitly supports a "no edge tile available" fallback.
- **Transition semantics (pinned):** a variant named `<a>-<b>-<o>` means
  "the biome named SECOND (`b`) occupies the `<o>` half of the tile"
  (`grass-dirt-n` = dirt toward the north). The edge tile is placed at the
  cell of the FIRST biome (`grass`), adjacent to a `b`-biome neighbor.
  Orientation `o` points AT the `b`-biome neighbor. The staircase runs along
  the perpendicular axis ('n'/'s' splits run east-west, 'e'/'w' run
  north-south). All of this lives in `transitionTexture.js`'s doc header and
  the family's VARIANTS manifest; the composer reads it from the manifest,
  never from family code.
- **Module ownership:** one module per biome family (`src/assets/tiles/grass.js`,
  later `dirt.js`, ...). Until a family's own module ships, its placeholder
  variants live in the nearest shipped family module (dirt-plain currently
  lives in grass.js) — the composer keys variants by STRING, never by module,
  so this stays invisible to it.
- **Decorated variants must be InstancedMesh-safe from the start**: a variant
  is a single merged geometry with a single material (e.g. a bush built into
  the tile's own flat-shaded palette and merged into the prism geometry).
  Multi-mesh/multi-material variant Groups are forbidden — the composer
  groups by `(biome, variant)` and uses ONE `InstancedMesh` per group, and
  hover must `setColorAt` on exactly one mesh.
- **Every family module exports a machine-readable `VARIANTS` manifest**
  (`{ 'grass-plain': {...}, 'grass-dirt-n': {...}, ... }`) used for fixture
  registration and by the composer to map data-level variant strings.
- Reuse `COLORS` from `src/core/MeshFactory.ts` where the palette overlaps;
  define new family colors (e.g. the earthy side-wall band) once in the
  family module and reference them from the manifest so later families
  harmonize.
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