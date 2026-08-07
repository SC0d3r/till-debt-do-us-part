# Tile System Convention — living spec

Single source of truth for how tile assets and the map composer are built in
the Modular Isometric Biome Tile System initiative
(`docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md`). `asset-creator` and
`feature-writer` follow this; `asset-critic` and `performance-critic` judge
against it. If this doc and the code disagree, the code wins and this doc
needs fixing.

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
- **Transition orientation: baked variants by default, runtime rotation
  supported (pinned 2026-08-06, user revision).** Each transition family
  ships 4 baked orientation variants — the four diamond axis directions
  (e.g. `grass-dirt-n/e/s/w`). Since the user revision, the composer ALSO
  supports per-record rotation (0/90/180/270 via instanceMatrix): one edge
  variant + rotation builds a boundary facing any of the four lattice
  directions, so pathways can be authored from a single variant. Baked
  variants remain the default authoring path and remain fully valid;
  rotation must be a multiple of 90° (the diamond footprint maps onto
  itself, so packing is unchanged). Rotation is clockwise when viewed from
  above (+Y): `rotation: 90` on `grass-dirt-n` puts the dirt half to the
  east. A partial transition family (1 orientation only) is covered by
  rotation and is no longer a violation.
- **Canonical authoring (pinned 2026-08-06):** prefer the baked variant
  matching the effective direction whenever one exists; use rotation only for
  directions with no baked variant (avoids fragmenting variant groups and
  mixing zipper styles). NOTE: a 90°/270° rotation of a baked transition
  MIRRORS the zipper staircase (baked boundaries are monotone-increasing), so
  a single boundary must never mix rotated and baked edges — keep one
  authoring style per boundary. (A canonical pixel-rotation of the staircase
  for all four orientations is a logged follow-up.)
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
- Reuse `COLORS` from `src/core/procedural.ts` where the palette overlaps;
  define new family colors (e.g. the earthy side-wall band) once in the
  family module and reference them from the manifest so later families
  harmonize.
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
  per-record `outlineColor` (hex) > biome default palette > map-level
  `outline.color` > global default. Biome palette (sensible earth tones,
  tunable, one named const): grass `#4e3d2e` (slight brown — the baseline;
  the showcase ALSO demonstrates a green alternative on part of the grass
  field so the user can compare), dirt `#6b4a2e`, tilled `#4a3a26`; edge
  variants use their fromBiome (owner) color. Width: `outline.width`, default
  ~0.03. Outline meshes are NOT raycast (hover picks tiles only) and their
  instanceColor follows the tile's hover brightness. Frame geometry +
  material are owned and disposed by the composer.
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
- The showcase map is a technical proof (every family built so far + at least
  one transition visible in one view), wired through `window.__debug` so it's
  screenshot-able like everything else.

## 4. Preview fixtures

Every tile variant and prop registers an `"asset-preview"` fixture in
`tests/scene-fixtures.json`, resolved through `window.__debug.previewAsset`
(neutral studio background, standard 3-point rig, camera framed to fill the
viewport). One fixture per variant is fine — `scene-capture` can capture many
fixtures in a single CI run.