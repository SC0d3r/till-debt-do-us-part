/**
 * Showcase map data for the Modular Isometric Biome Tile System — Slice B.
 *
 * A hand-authored 9x9 grid (81 cells, x/y in 0..8) that proves the WHOLE
 * trimmed tile kit in ONE view: a biome PATCHWORK with no transition/edge
 * tiles — every cell carries exactly one surviving plain variant and biomes
 * simply abut (each tile keeps its own baked outline; the composer's
 * seam-resolution draws ONE line per shared edge).
 *
 * LAYOUT (all six biomes; grass is the majority):
 *   - Snow 3x3 top-left  (x=0..2, y=6..8)
 *   - Water 3x3 top-right (x=6..8, y=6..8)
 *   - Sand 3x3 bottom-left (x=0..2, y=0..2)
 *   - Lava 3x3 bottom-right (x=6..8, y=0..2)
 *   - Dirt 2x2 center (x=3..4, y=3..4)
 *   - Grass everywhere else (~41 cells)
 * Texture variants are sprinkled so large single-biome areas never look
 * stamped: grass-plain-b/-c on 10 grass cells, dirt-plain-b on 1 dirt cell,
 * water-plain-b on 2 water cells, sand-plain-b on 2 sand cells, snow-plain-b
 * on 3 snow cells.
 *
 * ROTATION PROOF (user revision 2026-08-06): exactly 6 grass cells carry
 * rotation 90/180/270 (row y=5: x=0,1,2 and x=6,7,8). Rotation is invisible
 * on plain tiles but exercises the composer's per-instance matrix + the
 * outline mask's data→local rotation (C3b pins 6 rotated instances).
 *
 * OUTLINE COLOR DEMO (map-level mode 'interior'): the 3x3 grass block at
 * top-center (x=3..5, y=6..8) carries a GREEN outline color 0x4f7a34
 * (harmonious with the grass greens) via per-record `outlineColor`; the rest
 * of the map keeps each biome's palette default (grass #2e6b24 Slice B deep
 * green / dirt #6b4a2e / water #1c4e6e / sand #9a7440 / lava #d4561c / snow
 * #8ea9c9). The green records are NOT biome-matched, so under the rev-4
 * ownership rule they lose every seam to a biome-colored neighbor — the
 * green block reads as a clean side-by-side green-vs-default comparison.
 *
 * DATA-AUTHORING CONSTRAINTS (why the map looks the way it does):
 *   - Every cell carries exactly ONE variant. With the transition zipper
 *     gone there are NO edge variants, so cross-biome adjacencies are simply
 *     abutting plains — no orientation, no ghost-edge, no boundary-coverage
 *     bookkeeping. The validator only checks known variants + unique (x,y).
 *
 * GRID (x = column 0..8 left→right; y = row 0..8 south→north). The 'G' row
 * marks the GREEN-outline 3x3 block (x=3..5, y=6..8):
 *
 *         .  .  .  G  G  G  .  .  .
 *   y=8  N  N  N  G  G  G  W  W  W
 *   y=7  N  N  N  G  G  G  W  W  W
 *   y=6  n  n  n  G  G  G  w  w  W
 *   y=5  R  R  R  .  .  .  R  R  R
 *   y=4  b  b  c  D  d  .  c  c  b
 *   y=3  b  b  c  D  D  .  c  c  .
 *   y=2  S  S  S  .  .  .  L  L  L
 *   y=1  s  s  S  .  .  .  L  L  L
 *   y=0  S  S  S  .  .  .  L  L  L
 *        x=0 1  2  3  4  5  6  7  8
 *
 *   .  = grass-plain        b  = grass-plain-b
 *   c  = grass-plain-c      R  = grass-plain rotated (90/180/270)
 *   G  = grass-plain + outlineColor 0x4f7a34 (GREEN demo)
 *   N  = snow-plain         n  = snow-plain-b
 *   W  = water-plain        w  = water-plain-b
 *   S  = sand-plain         s  = sand-plain-b
 *   D  = dirt-plain         d  = dirt-plain-b
 *   L  = lava-plain
 *
 * IMPORTANT (prod-bundle gate): SHOWCASE_MAP must stay a provably-pure
 * module-scope value (a literal array). A top-level build loop with map
 * writes is a module-side effect rollup cannot prove pure, which would keep
 * this module (and the whole tile kit it imports) in the production bundle
 * despite devHarness being tree-shaken. Keep it literal.
 *
 * validateShowcaseMap(data) is the data-level acceptance gate (design-critic
 * Minor): it asserts every record has a known variant (from the merged tile
 * registry) and no two records share an (x, y). With the transition zipper
 * gone there are no edge-orientation / ghost-edge / boundary-coverage checks
 * — cross-biome adjacency is legal by construction (biomes simply abut).
 */

import { VARIANTS } from '../assets/tiles'

/**
 * Hand-authored 9x9 showcase grid. Rows are emitted north-first (y=8..0) so
 * the literal reads like the map above; authoring order is the only order —
 * instanceIds are looked up by coordinates, never by array position.
 * @type {Array<{x: number, y: number, variant: string, rotation?: number, outlineColor?: number}>}
 */
export const SHOWCASE_MAP = [
  // y=8 (north): snow x0-2, GREEN grass x3-5, water x6-8
  { x: 0, y: 8, variant: 'snow-plain' },
  { x: 1, y: 8, variant: 'snow-plain' },
  { x: 2, y: 8, variant: 'snow-plain' },
  { x: 3, y: 8, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo
  { x: 4, y: 8, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo
  { x: 5, y: 8, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo
  { x: 6, y: 8, variant: 'water-plain' },
  { x: 7, y: 8, variant: 'water-plain' },
  { x: 8, y: 8, variant: 'water-plain' },
  // y=7
  { x: 0, y: 7, variant: 'snow-plain' },
  { x: 1, y: 7, variant: 'snow-plain' },
  { x: 2, y: 7, variant: 'snow-plain' },
  { x: 3, y: 7, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 4, y: 7, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 5, y: 7, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 6, y: 7, variant: 'water-plain' },
  { x: 7, y: 7, variant: 'water-plain' },
  { x: 8, y: 7, variant: 'water-plain' },
  // y=6
  { x: 0, y: 6, variant: 'snow-plain-b' },
  { x: 1, y: 6, variant: 'snow-plain-b' },
  { x: 2, y: 6, variant: 'snow-plain-b' },
  { x: 3, y: 6, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 4, y: 6, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 5, y: 6, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 6, y: 6, variant: 'water-plain-b' },
  { x: 7, y: 6, variant: 'water-plain-b' },
  { x: 8, y: 6, variant: 'water-plain' },
  // y=5 (all grass; x0,1,2 and x6,7,8 rotated — ROTATION PROOF)
  { x: 0, y: 5, variant: 'grass-plain', rotation: 90 },
  { x: 1, y: 5, variant: 'grass-plain', rotation: 180 },
  { x: 2, y: 5, variant: 'grass-plain', rotation: 270 },
  { x: 3, y: 5, variant: 'grass-plain' },
  { x: 4, y: 5, variant: 'grass-plain' },
  { x: 5, y: 5, variant: 'grass-plain' },
  { x: 6, y: 5, variant: 'grass-plain', rotation: 90 },
  { x: 7, y: 5, variant: 'grass-plain', rotation: 180 },
  { x: 8, y: 5, variant: 'grass-plain', rotation: 270 },
  // y=4: grass x0-2, dirt x3-4, grass x5-8
  { x: 0, y: 4, variant: 'grass-plain-b' },
  { x: 1, y: 4, variant: 'grass-plain-b' },
  { x: 2, y: 4, variant: 'grass-plain-c' },
  { x: 3, y: 4, variant: 'dirt-plain' },
  { x: 4, y: 4, variant: 'dirt-plain-b' },
  { x: 5, y: 4, variant: 'grass-plain' },
  { x: 6, y: 4, variant: 'grass-plain-c' },
  { x: 7, y: 4, variant: 'grass-plain-c' },
  { x: 8, y: 4, variant: 'grass-plain-b' },
  // y=3
  { x: 0, y: 3, variant: 'grass-plain-b' },
  { x: 1, y: 3, variant: 'grass-plain-b' },
  { x: 2, y: 3, variant: 'grass-plain-c' },
  { x: 3, y: 3, variant: 'dirt-plain' },
  { x: 4, y: 3, variant: 'dirt-plain' },
  { x: 5, y: 3, variant: 'grass-plain' },
  { x: 6, y: 3, variant: 'grass-plain-c' },
  { x: 7, y: 3, variant: 'grass-plain-c' },
  { x: 8, y: 3, variant: 'grass-plain' },
  // y=2: sand x0-2, grass x3-5, lava x6-8
  { x: 0, y: 2, variant: 'sand-plain' },
  { x: 1, y: 2, variant: 'sand-plain' },
  { x: 2, y: 2, variant: 'sand-plain' },
  { x: 3, y: 2, variant: 'grass-plain' },
  { x: 4, y: 2, variant: 'grass-plain' },
  { x: 5, y: 2, variant: 'grass-plain' },
  { x: 6, y: 2, variant: 'lava-plain' },
  { x: 7, y: 2, variant: 'lava-plain' },
  { x: 8, y: 2, variant: 'lava-plain' },
  // y=1
  { x: 0, y: 1, variant: 'sand-plain-b' },
  { x: 1, y: 1, variant: 'sand-plain-b' },
  { x: 2, y: 1, variant: 'sand-plain' },
  { x: 3, y: 1, variant: 'grass-plain' },
  { x: 4, y: 1, variant: 'grass-plain' },
  { x: 5, y: 1, variant: 'grass-plain' },
  { x: 6, y: 1, variant: 'lava-plain' },
  { x: 7, y: 1, variant: 'lava-plain' },
  { x: 8, y: 1, variant: 'lava-plain' },
  // y=0 (south)
  { x: 0, y: 0, variant: 'sand-plain' },
  { x: 1, y: 0, variant: 'sand-plain' },
  { x: 2, y: 0, variant: 'sand-plain' },
  { x: 3, y: 0, variant: 'grass-plain' },
  { x: 4, y: 0, variant: 'grass-plain' },
  { x: 5, y: 0, variant: 'grass-plain' },
  { x: 6, y: 0, variant: 'lava-plain' },
  { x: 7, y: 0, variant: 'lava-plain' },
  { x: 8, y: 0, variant: 'lava-plain' },
]

// ─── Validation (data-level acceptance gate) ─────────────────────────────
/**
 * Data-level acceptance check for showcase maps (and any tile data built on
 * the same schema). With the transition zipper removed there are NO edge
 * variants, so the only data-level invariants are:
 *   1. Every record has a known variant (from the merged tile registry).
 *   2. No two records share an (x, y) coordinate.
 * Cross-biome adjacency is legal by construction — biomes simply abut and
 * each tile keeps its own baked outline (seam resolution is the composer's
 * job, not the data gate's).
 *
 * @param {Array<{x: number, y: number, variant: string, rotation?: number, outlineColor?: number}>} data
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateShowcaseMap(data) {
  const errors = []
  const byCoord = new Map()
  for (const rec of data) {
    if (!VARIANTS[rec.variant]) {
      errors.push(`unknown variant "${rec.variant}" at (${rec.x}, ${rec.y})`)
      continue
    }
    const key = `${rec.x},${rec.y}`
    if (byCoord.has(key)) {
      errors.push(`duplicate tile at (${rec.x}, ${rec.y})`)
      continue
    }
    byCoord.set(key, rec)
  }

  return { ok: errors.length === 0, errors }
}