# Slice B (revised): Pixel-Art Tile & Prop Redesign

## 0. Authority — read this before anything else

Read `docs/dev-log/PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` first if you
haven't already — this slice assumes that pivot is done or in progress.

reference documents for slice B are in address:
`docs/dev-log/SLICE_B_PIXEL_ART_TILES_AND_PROPS_reference_document_one.md`
`docs/dev-log/SLICE_B_PIXEL_ART_TILES_AND_PROPS_reference_document_two.md`
read these reference documents when you want to work on the tile or items these
documents describe them

**This document replaces `SLICE_B_TILE_FIDELITY_AND_PROPS.md` in its
entirety.** If that file's work was already started or finished, redo
whatever conflicts with this spec. If it wasn't started, ignore that file
completely — this is the only valid Slice B from now on. Specifically
voided: the two-band (top-strip + base-strip) tile shape, and the flat
per-face vertex-tint coloring approach. Both are replaced below.

**USER REVISION 2026-08-07 (binding, supersedes anything below that
conflicts):** the tile kit ships PLAIN variants only. The grass family is
`grass-plain` / `grass-plain-b` / `grass-plain-c` and nothing else — no
flowers, no bushes, no dirt, no tilled, no grass↔dirt or grass↔tilled
transition/edge variants. The transition zipper utility
(`makeTransitionTopTexture` + staircase) is DELETED; `transitionTexture.js`
was renamed to `tileTexture.js` and keeps only the shared canvas-texture
factory (`makeTileCanvasTexture`, `maskDiamondEdge`, `TILE_TEXTURE_SIZE`).
Dirt is its own family module (`src/assets/tiles/dirt.js`: `dirt-plain`,
`dirt-plain-b`). The surviving roster is: grass (3 plain variants), dirt
(2), water (2), sand (2), lava (1), snow (2) = 12 variants. Biomes simply
abut in maps — no edge tiles, no orientation bookkeeping. The showcase map
is a 9x9 biome patchwork proving all six families in one view.

Update `docs/dev-log/TILE_SYSTEM_CONVENTION.md`'s existing coloring-rule
section **in place** — replace its text, don't leave the old rule sitting
alongside a new contradictory one. That file is what `asset-critic` actually
checks against; stale, conflicting guidance there defeats the point of this
whole document.

## 1. Shape change — one section, not two

Tiles no longer have a separate top band and a separate darker base band.
**One section only**: a single solid prism from top face to bottom, no
internal color-band split. Also reduce the overall prism height somewhat —
slightly lower/flatter than the previous two-band tiles were.

**The geometry's actual silhouette must stay exactly precise** — same clean
diamond footprint, same straight vertical sides, same corner positions as
before. `TileMapComposer`'s diagonal-lattice placement math depends on tiles
sharing exact edges (zero holes, zero overlap, unambiguous raycast picking),
and the outline ribbon system depends on precise corner/edge geometry. All
of the "organic, jagged, hand-drawn" quality described below comes from
**texture content**, never from moving real vertices. Don't deform the mesh
to fake raggedness — paint it.

`mesh.userData.outlineTop`/`outlineBase` still need to be set explicitly on
every tile factory, same as before — now simpler, since there's only one
section's top/bottom to report, not a two-band split.

## 2. The actual target style — real 3D geometry, pixel-art textures

Two reference documents (attached) specify this precisely: 5 terrain
materials (grass ×2 variants, dirt, water, sand) and 4 decorative props
(flower, rock, bush, tall grass/fern), at true low-resolution pixel-art
scale, with exact rules for palette, outline behavior, shading, and noise
character. Read them in full — what follows is how to apply them inside
this project's real 3D system, not a replacement for their detail.

**This keeps real 3D geometry** — a single-section prism, not a flat 2D
sprite/billboard. The reference's pixel-art rules describe the *texture*
applied to that geometry's real top face and real side face(s), rendered at
true pixel scale. Three critical, non-negotiable technical requirements this
implies:

- **`texture.magFilter = THREE.NearestFilter`, `texture.minFilter =
  THREE.NearestFilter`** on every tile/prop texture. Three.js's default
  linear filtering will blur pixel art into mush — this single setting is
  the difference between "pixel art" and "blurry mess," don't skip it.
- Draw with `ctx.imageSmoothingEnabled = false` and integer pixel
  coordinates — no canvas gradients, no anti-aliased strokes. Hard pixel
  steps only, per the reference's palette-discipline rule (4-7 colors per
  tile including the outline, no smooth gradients).
- The top face gets the detailed/noisy texture; the side face(s) get a
  simpler, less-noisy banded texture — exactly the top-vs-side treatment
  both reference documents describe. This is a property of the *texture*,
  not a second geometry section (see section 1 — geometry stays one piece).

**What NOT to build**: scattered same-size squares of random different
colors dropped on a base tone. That reads as noise, not material — reject it
on sight. The reference's noise is organic and directional: grass blades
that are 1-3 pixels tall and irregular, dirt clumps with meandering 1-pixel
cracks, sand grain that clusters rather than scatters uniformly, water
sparkle that pools rather than dots evenly. If a submitted texture looks
like a checkerboard of random color squares, that's a rejection, not a
style choice.

### Baked-in outline vs. the existing ribbon outline system — these are two different, compatible things

`TileMapComposer` already has a sophisticated map-level outline system
(seam-ownership resolution, interior/exterior/all modes, biome-colored
ribbon geometry along tile edges). **That system is unchanged and stays
exactly as-is** — it's an optional, map-controllable overlay for board-game-
style edge clarity.

The reference documents separately describe an outline *baked into each
tile's own texture* — a jagged, broken, non-black, dark-hue-of-the-material
line drawn near the texture's own edges, giving each tile its hand-drawn
pixel-art character even in isolation. This is a property of the texture
content (asset-creator's job when painting it), completely independent of
the ribbon system. Build both — they serve different purposes and don't
conflict: the baked texture outline is always there and gives the art its
character; the ribbon system is an optional toggle for map-wide grid
readability.

### Shading model (supersedes the previous flat per-face tint rule)

Both reference documents specify light from above-left, in more detail than
"one flat tone per face": a highlight row of lighter pixels just inside the
top edge, shadows pooling toward the lower-right of the top face and the
lower half of side faces, side faces one to two full steps darker than the
top. Build this into the texture itself — real within-face shading, not a
single flat tint per face.

### Reusable noise-painting utility

Build the noise/pattern generation as a small shared utility (e.g. under
`src/assets/pixelart/`) that any tile or prop texture-generator calls with
parameters — base color, accent colors, density, clump size, seed — rather
than hand-coding pixel placement per asset. This is what keeps the "noise
character" consistent across biomes while the actual palette and density
vary; every biome's texture generator should be a thin wrapper around this
same shared painter, the same way tile geometry factories already share
conventions.

### Avoiding the "stamped" look — texture variants, not runtime jitter

The reference is explicit about this: keep 2-3 slightly different texture
variants of each common material (the two grass tiles in the reference are
themselves an example of this) so large areas never look like one image
copy-pasted. Build these as distinct `variant` strings in
`TileMapComposer`'s existing grouping system (e.g. `grass-plain-a`,
`grass-plain-b`, `grass-plain-c`) rather than a runtime color-jitter shader
trick — the composer already groups instances by variant string, so a later
map-generation step can pseudo-randomly distribute the 2-3 variants across
placements with no changes to the composer itself.

### Outline color per biome (unchanged requirement, now simpler)

`mesh.userData.outlineColor` still needs a real per-biome value for the
ribbon system (section above) — grass → deep green, water → deep blue, lava
→ warm ember orange, snow → cool pale blue, sand/desert → warm brown. This
is separate from the baked-texture outline color, which follows the
reference's own per-material rule (a dark hue of that material, e.g. dark
forest-green for grass, dark navy for water).

## 3. Biome roster

Grass, dirt, desert/sand, lava, snow, water — six families. Per the user
revision above: **plain variants only**, no transition/edge tiles; dirt is
its own module, grass ships only `grass-plain`/`-b`/`-c`. The reference
documents explicitly cover grass/dirt/water/sand; **extrapolate the same
technical rules to lava and snow**, which aren't pictured — the "Shared
technical style rules" and "Shared style rules" sections in the references
are written as universal rules, not per-material flavor text, so they
transfer directly. If any of these biome families already exist from earlier
work, redo them to this spec rather than leaving the old shape/coloring in
place — that's exactly what section 0's "this replaces the previous Slice B"
means in practice.

Water still needs its own multi-tone treatment (bright sparkle highlights,
mid blue, deeper navy pooling) per the reference's water breakdown
specifically — its shading has the strongest contrast of the whole set,
don't flatten it to match the others.

## 4. Prop library — same socket system, new visual technique

The socket system from the previous Slice B is unchanged and still applies:
`center` (one slot, tile center), `corner` (up to four, at the diamond's
`n`/`e`/`s`/`w` vertices), `edge` (up to four, at edge midpoints), `surface`
(at most one, a full top-face overlay). What changes is *how* each prop is
built — same pixel-art technique as the tiles, same nearest-filtering
requirement, same reference-driven shading/noise/outline rules.

The second reference document gives exact specs for four `center`-socket
props: **flower, rock, bush, tall grass/fern.** Build those to the letter of
that document. For everything else in the prop roster that isn't explicitly
pictured — small stone (`corner`), a bigger stone (`corner`/`center`),
pebble cluster (`corner`), torch (`edge`), lantern (`edge`), gravel/path
patch (`surface`, visual only — still no passability logic, that's still
out of scope), cactus, dry shrub, snow-recolored bush, snow patch, lava rock
— apply the exact same style rules from both reference documents (palette
discipline, jagged hue-matched non-black outline, above-left shading with
highlight/shadow, organic clumped noise). The rules are general-purpose;
they don't need a picture of every single item to apply correctly.

The biome-palette-swap convention from before still holds: where a shape is
reused across biomes (the snow bush is the clear case), it's one geometry
with its palette resolved per-biome, not a second hand-built asset.

## 5. Process

Same as before: skip `qa-tester` functional coverage on this batch (pure
asset work). Run `asset-critic`, `ui-critic`, `visual-critic`,
`performance-critic` at full strength — `asset-critic` specifically checks
every submission against this document's shape/texture/outline rules and
against `TILE_SYSTEM_CONVENTION.md`'s updated coloring section (section 0).
Category-variety override still applies until section 6 is met.

## 6. Definition of done

Status legend: `[x]` done on dev, `[ ]` not yet, `[~]` superseded/removed by
the user revision.

- [x] `TILE_SYSTEM_CONVENTION.md`'s coloring-rule section is replaced (not
      appended to) with this document's rules.
- [x] Every tile is single-section (no base band), correct reduced height
      (top face ~0.34, base 0), geometry silhouette unchanged/precise.
- [x] Every tile texture uses nearest-neighbor filtering, hard palette,
      above-left shading with real highlight/shadow, organic
      directional noise (not random-square noise).
- [x] Every tile has a baked-in jagged texture outline per the
      reference, independent of and compatible with the existing ribbon
      outline system.
- [x] `outlineColor`/`outlineTop`/`outlineBase` set correctly on every tile
      (grass deep green, dirt warm brown, water deep blue, sand warm brown,
      lava ember orange, snow pale blue).
- [x] All 6 biome families built to this spec: grass (plain only, per user
      revision), dirt, water, sand, lava, snow.
- [x] 2-3 texture variants exist for common tile types, as distinct variant
      strings (`grass-plain/-b/-c`, `dirt-plain/-b`, `water-plain/-b`,
      `sand-plain/-b`, `snow-plain/-b`).
- [x] Full prop library (section 4) built to this spec, correct socket
      metadata on each — 15 props shipped (flower, rock, bush, tall-grass,
      cactus, small-stone, big-stone, pebble-cluster, torch, lantern,
      gravel-patch, dry-shrub, bush-snow, snow-patch, lava-rock), each with
      `userData.socket = { type, max }`, shared builders in
      `src/assets/props/propBase.js`, merged registry `src/assets/props/index.js`.
- [x] `asset-critic`, `ui-critic`, `visual-critic`, `performance-critic` all
      signed off on the tile batch (2026-08-07: asset/visual reached
      SHIP WITH FOLLOWUPS after two fix rounds; design/ui/performance
      SHIP WITH FOLLOWUPS on the first pass).
- [x] Once all of the above is true: hold here. Slice C is a separate brief
      handed to you next. (Tile + prop portion done; followups queued in
      FEATURE_BACKLOG.md.)

### Batch log

- **2026-08-07 tiles (dev)**: pixel-art painter utility
  (`src/assets/pixelart/pixelPainter.js`), single-section prism
  (`src/assets/tiles/tilePrism.js`), shared canvas-texture factory
  (`src/assets/tiles/tileTexture.js`), six family modules (grass/dirt/water/
  sand/lava/snow) with 12 plain variants, merged registry
  (`src/assets/tiles/index.js`), showcase map rewritten as a biome
  patchwork, composer tests re-pinned to the trimmed roster. The old
  transition zipper and all grass-dirt/grass-tilled/flowers/bushes code and
  fixtures were removed per the user revision.
- **2026-08-07 props (dev)**: 15 low-poly camera-facing props built to the
  two user references (2:1 dimetric iso, 3-tone ramps, tinted outline,
  contact rings, sparse asymmetric placement). Three geometry generations:
  crossed-quads (rejected: "paper"), solid prisms (rejected: "a tile, not a
  bush"), final icosa/blob/post/blade-fan forms with vertex-baked shading
  (`PROP_BRIGHTNESS = 0.575` applied in `shadeFaces`). `props-showcase`
  diorama (7x6 mixed terrain) registered; QA suite extended to 72 tests
  (T1–T11 incl. NDC framing assertions); 29 fixtures total in
  `tests/scene-fixtures.json`.
