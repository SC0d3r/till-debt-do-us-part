# Tile System Convention — living spec

Single source of truth for how tile assets and the map composer are built in
the Modular Isometric Biome Tile System initiative
(`docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`). `asset-creator` and
`feature-writer` follow this; `asset-critic` and `performance-critic` judge
against it. If this doc and the code disagree, the code wins and this doc
needs fixing.

**Slice B (2026-08-07) replaced the coloring/anatomy rules below.** The old
two-band (top-strip + base-strip) tile shape and the flat per-face
vertex-tint coloring approach are VOID. The authoritative shape + coloring
spec is `docs/dev-log/SLICE_B_PIXEL_ART_TILES_AND_PROPS.md` and its two
reference documents; this section is the in-place replacement of the old
coloring rule. Do not reintroduce a second band or a flat per-face tint.

**User revision 2026-08-07 (binding):** the tile kit is PLAIN-ONLY. The
transition zipper utility was deleted (`transitionTexture.js` renamed to
`tileTexture.js` — shared canvas-texture factory only), all
transition/edge variants (grass-dirt-*, grass-tilled-*, decorated
variants) were removed, grass ships only `grass-plain/-b/-c`, and dirt is
its own family module. Six families: grass, dirt, water, sand, lava, snow.
Biomes abut in maps with no edge tiles.

## 1. Tile anatomy (every tile, every biome, no exceptions)

- Footprint: a diamond **inscribed in a 1.0×1.0 grid cell** — vertices at
  `(±0.5, 0, 0)` and `(0, 0, ±0.5)` (the cell's edge midpoints), center at the
  grid point; diamond diagonals are exactly 1.0 along world X/Z (grass.js cap
  order: N vertex +z, E vertex +x). Do NOT model the tile as a rotated square
  of side 1.0: that produces vertices at ±0.707 and overlaps neighbors.
- **Packing: diagonal lattice, solid ground (pinned 2026-08-06, user
  revision).** Tiles are NOT placed at axis-aligned `(x, 0, y)` with spacing
  1.0 — that only made adjacent diamonds touch at corner tips and left
  star-shaped holes between every four tiles. The composer maps data
  `(x, y)` → world `((x − y) · 0.5, 0, (x + y) · 0.5)`: adjacent data cells
  share FULL edges — solid ground, zero holes, zero overlap. (Zero overlap
  also keeps raycast picking unambiguous.) Data coordinates stay
  axis-aligned integers; only the world transform is the lattice.
- **One section, not two (Slice B, 2026-07-07):** every tile is a SINGLE
  solid prism from its top face to its base — no separate top band and no
  darker base band, no internal color-band split. Total height is reduced
  vs. the old two-band tiles: top face at ~0.34, base at 0 (slightly
  lower/flatter than the old 0.45 two-band prism). The top-vs-side visual
  difference comes from the TEXTURE (detailed noisy top vs. simpler banded
  sides), never from a second geometry section.
- **Geometry silhouette stays EXACTLY precise (Slice B, non-negotiable).**
  Same clean diamond footprint, same straight vertical sides, same corner
  positions as before. `TileMapComposer`'s diagonal-lattice placement math
  depends on tiles sharing exact edges (zero holes, zero overlap,
  unambiguous raycast picking), and the outline ribbon system depends on
  precise corner/edge geometry. All of the "organic, jagged, hand-drawn"
  quality comes from TEXTURE CONTENT — never from moving real vertices.
  Don't deform the mesh to fake raggedness — paint it.
- **Pixel-art texture rules (Slice B, every tile/prop, no exceptions):**
  - `texture.magFilter = THREE.NearestFilter`, `texture.minFilter =
    THREE.NearestFilter` on every tile/prop texture. Three.js's default
    linear filtering blurs pixel art into mush — this single setting is the
    difference between "pixel art" and "blurry mess".
  - Draw with `ctx.imageSmoothingEnabled = false` and integer pixel
    coordinates — no canvas gradients, no anti-aliased strokes. Hard pixel
    steps only.
  - **Palette discipline:** very limited colors per tile (usually 4-7
    including the outline). No smooth gradients — only hard pixel steps.
  - **Shading model (supersedes the old flat per-face tint):** light from
    above-left. A thin highlight row of lighter pixels sits just inside the
    top edge; shadows pool toward the lower-right of the top face and the
    lower half of side faces. Side faces are 1-2 full steps darker than the
    top. Build this into the texture itself — real within-face shading, not
    a single flat tint per face.
  - **Noise character:** organic and directional — grass blades 1-3 pixels
    tall and irregular, dirt clumps with meandering 1-pixel cracks, sand
    grain that clusters rather than scatters uniformly, water sparkle that
    pools rather than dots evenly. A checkerboard of random color squares is
    a rejection, not a style choice.
  - **Baked-in jagged outline:** a jagged, broken, NON-black,
    dark-hue-of-the-material line drawn near the texture's own edges, giving
    each tile its hand-drawn character even in isolation. It thickens or
    thins, skips pixels, and follows the surface noise. This is a property
    of the texture content, completely independent of (and compatible with)
    the composer's optional map-level ribbon outline system — build both.
  - **Top vs. side texture treatment:** the top face gets the
    detailed/noisy texture; the side face(s) get a simpler, less-noisy
    banded texture (1-2 steps darker). This is a property of the texture,
    not a second geometry section.
- **Shared noise-painting utility (Slice B):** all noise/pattern generation
  goes through a small shared utility under `src/assets/pixelart/` that any
  tile or prop texture-generator calls with parameters — base color, accent
  colors, density, clump size, seed. Every biome's texture generator is a
  thin wrapper around this same shared painter, the same way tile geometry
  factories share conventions.
- **Texture variants (Slice B):** keep 2-3 slightly different texture
  variants of each common material (e.g. `grass-plain-a`, `grass-plain-b`,
  `grass-plain-c`) as distinct variant strings in the composer's grouping
  system — NOT a runtime color-jitter shader trick. The composer already
  groups instances by variant string, so a later map-generation step can
  pseudo-randomly distribute the variants with no composer changes.
- Flat/faceted shading everywhere (`flatShading: true` or equivalent flat
  normals). Crisp edges, no bevels, no smooth gradients.
- A subtle soft shadow/AO directly under the tile so it separates from the
  background (the composer may add a shared under-shadow layer for whole
  maps).

## 2. Module convention (asset-creator)

- One module per biome family under `src/assets/tiles/` (e.g.
  `src/assets/tiles/grass.js`), plus one module per prop under
  `src/assets/props/`. A shared painter utility lives under
  `src/assets/pixelart/`.
- Each tile factory follows the standing convention: self-contained factory
  function returning a `THREE.Group`/`THREE.Object3D`; shared geometry and
  material at MODULE scope, never rebuilt per instance; disposal-safe (a
  `dispose()` that frees shared geometry/materials is provided where the
  module owns them).
- **No required runtime arguments** beyond an optional variant/seed. Biome and
  decoration choice happens at the DATA level (the composer's grid), not by
  parameterizing one mega-function per biome.
- Top-face detail (grass noise, dirt clumps, ...) is a small canvas
  texture with `NearestFilter`/`NearestFilter` and `RepeatWrapping` off —
  pixelated, crisp, matching the flat style. All top-face textures go
  through the shared factory `src/assets/tiles/tileTexture.js`
  (`makeTileCanvasTexture`, `maskDiamondEdge`, `TILE_TEXTURE_SIZE`) and the
  shared painter `src/assets/pixelart/pixelPainter.js` — never
  reimplemented per family. **There are NO transition/edge tiles**
  (user revision 2026-08-07): biomes abut in maps, each tile keeps its own
  baked outline.
- **Module ownership:** one module per biome family (`src/assets/tiles/grass.js`,
  `dirt.js`, `water.js`, `sand.js`, `lava.js`, `snow.js`, ...). Every
  shipped family owns its module (grass ships only grass, dirt only dirt —
  user revision 2026-08-07). The composer keys variants by STRING, never by
  module.
- **Decorated variants must be InstancedMesh-safe from the start**: a variant
  is a single merged geometry with a single material (e.g. a bush built into
  the tile's own flat-shaded palette and merged into the prism geometry).
  Multi-mesh/multi-material variant Groups are forbidden — the composer
  groups by `(biome, variant)` and uses ONE `InstancedMesh` per group, and
  hover must `setColorAt` on exactly one mesh. (Note: as of the 2026-08-07
  user revision no decorated variants are shipped — this rule applies if any
  are reintroduced.)
- **Every family module exports a machine-readable `VARIANTS` manifest**
  (`{ 'grass-plain': {...}, 'grass-plain-b': {...}, ... }`) used for fixture
  registration and by the composer to map data-level variant strings.
- Reuse `COLORS` from `src/core/procedural.ts` where the palette overlaps;
  define new family colors (e.g. the earthy side-wall band) once in the
  family module and reference them from the manifest so later families
  harmonize.
- **Outline color per biome (Slice B, pinned):** `mesh.userData.outlineColor`
  must carry a real per-biome value for the composer's ribbon outline system
  — grass → deep green, water → deep blue, lava → warm ember orange, snow →
  cool pale blue, sand/desert → warm brown. This is SEPARATE from the
  baked-in texture outline color, which follows the per-material rule (a
  dark hue of that material, e.g. dark forest-green for grass, dark navy for
  water).
- **Hover/selection must work on instances**: use per-instance color
  highlighting (`InstancedMesh.setColorAt` + `instanceColor.needsUpdate =
  true`) from the start, never per-object material swaps.

## 3. Composer convention (feature-writer)

- `src/world/TileMapComposer.js`: a generic module taking a plain data
  structure — an array/grid of `{ x, y, variant, rotation?, elevation? }` —
  and instantiating the right tile instances at the right isometric grid
  positions. It knows NOTHING about farming, the player, or any specific
  level layout.
- **Positioning (pinned 2026-08-06):** record `(x, y)` is placed at world
  `((x − y) · 0.5, 0, (x + y) · 0.5)` — the diagonal lattice that makes
  diamonds share full edges (no holes). `rotation` (0/90/180/270, clockwise
  from above, default 0) is applied per instance via `instanceMatrix`; a
  diamond's footprint is 90°-symmetric, so rotation never changes packing.
- Group tile instances by VARIANT STRING (never biome/module); `InstancedMesh`
  per group wherever a tile type appears many times. Rotation is a
  per-instance property and is NEVER a group key — instances of the same
  variant may mix rotations within one mesh.
- **Tile outlines (pinned 2026-08-06, user revision):** crisp gamey lines so
  composed maps read as individual cubes. Composer option
  `outline: { mode, color?, width? }` with `mode: 'all' | 'none' | 'interior'
  | 'exterior'` (default: unset → no outline meshes); per-record `outline`
  override (same modes, or an explicit data-space side list like `['n','e']`).
  `'interior'` = only edges that touch another cell in the data; `'exterior'`
  = only edges with no adjacent cell. Masks are authored in DATA space and
  resolve to the tile's LOCAL edges by rotating side names counter-clockwise
  by the record's rotation in 90° steps (data `'e'` at rotation 90 → local
  `'n'`). The frame is one InstancedMesh per resolved local mask: thin ribbon
  quads — one along each masked diamond top edge (just above the cap, no
  z-fight) plus the two vertical corner lines per edge (full prism height,
  offset outward ~0.004).
- **Outline color is PER-INSTANCE and customizable (pinned 2026-08-06, user
  revision):** the outline material is WHITE; each instance's instanceColor =
  resolved outline color × the hover dim factor (0.88 neutral / 1.0 hover),
  initialized at build for every outline instance. Resolution order:
  per-record `outlineColor` (hex) > biome default palette (per Slice B:
  grass → deep green, water → deep blue, lava → warm ember orange, snow →
  cool pale blue, sand → warm brown; dirt/tilled keep warm earth tones) >
  map-level `outline.color` > global default. Edge variants use their
  fromBiome (owner) color. Width: `outline.width`, default ~0.03. Outline
  meshes are NOT raycast (hover picks tiles only) and their instanceColor
  follows the tile's hover brightness. Frame geometry + material are owned
  and disposed by the composer.
- **Outline heights contract (pinned 2026-08-06, performance-critic):** every
  tile factory MUST ship `mesh.userData.outlineTop` / `outlineBase` (cap top /
  prism base heights) — the frame heights are the max/min union over the
  mask's variant set, and a family without userData silently falls back to
  the geometry bounding box (which decorated variants like grass-bushes
  inflate → floating ribbons). A dev-mode assert on bbox-vs-userData
  mismatch is a logged follow-up. The frame-geometry cache key MUST include
  the (top, base) height tuple once families can differ in height (before the
  elevation slice lands).
- **Seam resolution — ONE line per seam (pinned 2026-08-06, user revision):**
  when two tiles share an edge, AT MOST ONE tile renders that edge — two
  ribbons on one seam read as a doubled/thick line between tiles. Resolution:
  each record first computes its DESIRED mask (mode: 'all' → all 4 sides;
  'interior' → sides with a neighbor; 'exterior' → sides without a neighbor;
  explicit side list; 'none'), then for every desired side that has a
  neighbor: the OWNER renders the seam and the non-owner drops the side IF
  the owner also desires it; if the owner does not desire it, the non-owner's
  desire stands. **Owner rule (pinned 2026-08-06, user decision): the tile
  whose outline color MATCHES ITS OWN BIOME wins** — resolved color equals the
  biome-default palette color for its biome (edges use fromBiome); if both or
  neither match, the tile with lexicographically smaller data coords (x, then
  y) owns. Effect: a seam shows the natural biome color whenever one side is
  biome-colored; custom per-record colors yield at boundaries. The rendered
  mask then resolves to local edges with the record's rotation as before. The
  single seam ribbon is centered on the seam line; vertical corner ribbons
  keep their radial offset.
- **Selection vs outline color (pinned 2026-08-06, design-critic):** slice B's
  selection cue will take over the outline instanceColor of selected records
  (hover-clear must restore the SELECTED color, not the 0.88 neutral); the
  `outlineByRecord` plumbing supports it. CAUTION: the ownership pass
  permanently removes the non-owner's ribbon — a selected record's dropped
  seams (neighbor-owned) have NO ribbon to recolor, and `''`-mask records
  have no visible outline at all. Slice B MUST therefore render selection as
  its own ring geometry for dropped seams, or re-resolve ownership with the
  selected record forced owner. Pin this before slice B starts.
- **Consequence of biome-match ownership (pinned 2026-08-06, design-critic):**
  custom per-record colors yield at ALL natural boundaries — a colored ring
  only closes between custom-colored tiles (e.g. the showcase's green zone
  has brown seams at its x=2|x=3 edge). This is the user-chosen rule and is
  predictable; map authors must design against it. Also: at
  matched|matched seams across biomes (e.g. grass|dirt) the data-order
  tie-break decides the seam color, so a whole-map mirror flips those seam
  colors — folded into the swap-initiative data-coord note.
- Hover: raycast from camera through mouse onto the tile layer; subtle
  brightness/opacity increase on the hovered tile. Selection: a visibly
  stronger cue (outline/glow/border) matching the flat crisp style.
- The showcase map is a technical proof (every family built so far — as of
  2026-08-07 a 9x9 biome patchwork of all six plain-only families, no
  transitions), wired through `window.__debug` so it's screenshot-able like
  everything else.

## 4. Preview fixtures

Every tile variant and prop registers an `"asset-preview"` fixture in
`tests/scene-fixtures.json`, resolved through `window.__debug.previewAsset`
(neutral studio background, standard 3-point rig, camera framed to fill the
viewport). One fixture per variant is fine — `scene-capture` can capture many
fixtures in a single CI run.