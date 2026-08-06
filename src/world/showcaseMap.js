/**
 * Showcase map data for the Modular Isometric Biome Tile System — slice A.
 *
 * A small hand-authored 9x9 grid (81 cells, x/y in 0..8) that proves the
 * grass family in ONE view: a grass-plain field (majority), sprinkled
 * grass-flowers / grass-bushes, a 2-wide dirt-plain path crossing the field
 * north-south, a 3x3 tilled patch (interior = grass-tilled plain) ringed by
 * correctly-oriented grass-tilled-n/e/s/w edges, and grass↔dirt transitions
 * wherever a grass cell borders the path.
 *
 * ROTATION PROOF (user revision 2026-08-06): the path's bottom rows (y=0..2)
 * author both boundaries from ONE edge variant — grass-dirt-n with rotation
 * 90 (dirt half turned east, the same visual boundary as a baked
 * grass-dirt-e) on the west side and rotation 270 (dirt half west, same as a
 * baked grass-dirt-w) on the east side. The top rows (y=3..8) keep the baked
 * e/w variants, proving baked variants stay valid alongside rotated ones.
 *
 * OUTLINE COLOR DEMO (user revision 2026-08-06; map-level mode 'interior'):
 * every grass-OWNED cell (owner biome grass — plain/decorated AND the
 * grass↔tilled edge tiles, whose outline uses their fromBiome color) in
 * columns x=0..2 carries a GREEN outline color 0x4f7a34, harmonious with the
 * grass greens; the rest of the grass field (x=3..4), the tilled patch
 * interior and the dirt path keep the biome palette's BROWN defaults
 * (grass #4e3d2e / dirt #6b4a2e / tilled #4a3a26). The left 3 columns vs the
 * rest is a clear side-by-side green/brown comparison on the same field.
 * Green records: 21 total — rows y=4..8: x=0..2; rows y=0..3: the grass
 * cells of x=0..2 (x=1..2 rows y=1..3 are the grass-tilled patch INTERIOR,
 * biome tilled, so they keep the tilled brown).
 *
 * DATA-AUTHORING CONSTRAINTS (why the map looks the way it does):
 *   - Every cell carries exactly ONE variant, so a grass cell adjacent to two
 *     different-biome cells is NOT representable (it would need two edge
 *     variants). That rules out path bends/corners: the inside-corner grass
 *     cell of any turn touches both arms. The dirt path is therefore a
 *     straight 2-wide corridor (dirt↔grass edges only), and the tilled
 *     patch ring is buffered from the path by the grass column at x=5 so no
 *     ring cell borders both tilled and dirt.
 *   - Transition semantics (convention §2, pinned): "<a>-<b>-<o>" = biome
 *     `b` occupies the `<o>` half; the edge tile sits at the FIRST biome's
 *     cell (grass), orientation points AT the `b`-biome neighbor.
 *     grass-dirt-e at (5,y) = dirt is east, at (x+1). Rotation turns the
 *     baked half: grass-dirt-n + rotation 90 = dirt east, + 270 = dirt west.
 *
 * GRID (x = column 0..8 left→right; y = row 0..8 south→north). The 'G' row
 * marks the GREEN-outline columns (grass-owned cells of x=0..2 — the demo
 * split vs the brown biome default on x=3..8):
 *
 *         G  G  G  .  .  .  .  .  .
 *   y=8  .  B  .  .  .  |>  #  #  <|
 *   y=7  B  .  .  .  F  |>  #  #  <|
 *   y=6  .  .  F  B  .  |>  #  #  <|
 *   y=5  F  .  .  .  .  |>  #  #  <|
 *   y=4  .  v  v  v  .  |>  #  #  <|
 *   y=3  <  x  x  x  <  |>  #  #  <|
 *   y=2  <  x  x  x  <  R>  #  #  R<
 *   y=1  <  x  x  x  <  R>  #  #  R<
 *   y=0  .  ^  ^  ^  .  R>  #  #  R<
 *        x=0 1  2  3  4  5   6  7  8
 *
 *   .  = grass-plain        x = grass-tilled      ^ = grass-tilled-n
 *   B  = grass-bushes       v = grass-tilled-s    < = grass-tilled-e / grass-dirt-e
 *   F  = grass-flowers      |> = grass-dirt-e     <| = grass-dirt-w
 *   #  = dirt-plain
 *   R> = grass-dirt-n rotated 90 (dirt east — rotation proof, same look as |>)
 *   R< = grass-dirt-n rotated 270 (dirt west — rotation proof, same look as <|)
 *
 * OUTLINE COLOR DEMO: cells under the 'G' columns whose variant is
 * grass-OWNED (all '.'/'B'/'F', the '<' grass-tilled-e at x=0 rows y=1..3,
 * the '^' at x=1..2 row y=0 and the 'v' at x=1..2 row y=4) carry
 * `outlineColor: 0x4f7a34` (green). The 'x' tilled-patch interior (x=1..2,
 * rows y=1..3 — biome tilled), the dirt path and the x=3..8 grass keep the
 * brown biome palette. See the OUTLINE COLOR DEMO prose above for the exact
 * 21 green records.
 *
 * IMPORTANT (prod-bundle gate): SHOWCASE_MAP must stay a provably-pure
 * module-scope value (a literal array). A top-level build loop with map
 * writes is a module-side effect rollup cannot prove pure, which would keep
 * this module (and the whole tile kit it imports) in the production bundle
 * despite devHarness being tree-shaken. Keep it literal.
 *
 * validateShowcaseMap(data) is the data-level acceptance gate (design-critic
 * Minor): it asserts every cross-biome adjacency is covered EXACTLY ONCE by
 * the correctly named+oriented edge AND every edge variant's toBiome
 * neighbor sits on its EFFECTIVE side (baked orientation + rotation; n = +y,
 * e = +x, s = -y, w = -x in data coordinates; rotation 90 maps n→e→s→w→n).
 * GHOST-EDGE check (design-critic fold-in): every edge must ALSO have at
 * least one fromBiome neighbor on its two perpendicular (behind) sides
 * (out-of-grid counts as a pass) — an edge dropped inside a foreign field
 * is rejected even though its toBiome neighbor sits ahead. The fixture setup
 * and the composer regression test both call it.
 */

import { VARIANTS } from '../assets/tiles/grass'

/**
 * Hand-authored 9x9 showcase grid. Rows are emitted north-first (y=8..0) so
 * the literal reads like the map above; authoring order is the only order —
 * instanceIds are looked up by coordinates, never by array position.
 * @type {Array<{x: number, y: number, variant: string, rotation?: number}>}
 */
export const SHOWCASE_MAP = [
  { x: 0, y: 8, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo (column 0)
  { x: 1, y: 8, variant: 'grass-bushes', outlineColor: 0x4f7a34 }, // GREEN outline demo (column 1)
  { x: 2, y: 8, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo (column 2)
  { x: 3, y: 8, variant: 'grass-plain' },
  { x: 4, y: 8, variant: 'grass-plain' },
  { x: 5, y: 8, variant: 'grass-dirt-e' },
  { x: 6, y: 8, variant: 'dirt-plain' },
  { x: 7, y: 8, variant: 'dirt-plain' },
  { x: 8, y: 8, variant: 'grass-dirt-w' },
  { x: 0, y: 7, variant: 'grass-bushes', outlineColor: 0x4f7a34 }, // GREEN
  { x: 1, y: 7, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 2, y: 7, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 3, y: 7, variant: 'grass-plain' },
  { x: 4, y: 7, variant: 'grass-flowers' },
  { x: 5, y: 7, variant: 'grass-dirt-e' },
  { x: 6, y: 7, variant: 'dirt-plain' },
  { x: 7, y: 7, variant: 'dirt-plain' },
  { x: 8, y: 7, variant: 'grass-dirt-w' },
  { x: 0, y: 6, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 1, y: 6, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 2, y: 6, variant: 'grass-flowers', outlineColor: 0x4f7a34 }, // GREEN
  { x: 3, y: 6, variant: 'grass-bushes' },
  { x: 4, y: 6, variant: 'grass-plain' },
  { x: 5, y: 6, variant: 'grass-dirt-e' },
  { x: 6, y: 6, variant: 'dirt-plain' },
  { x: 7, y: 6, variant: 'dirt-plain' },
  { x: 8, y: 6, variant: 'grass-dirt-w' },
  { x: 0, y: 5, variant: 'grass-flowers', outlineColor: 0x4f7a34 }, // GREEN
  { x: 1, y: 5, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 2, y: 5, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 3, y: 5, variant: 'grass-plain' },
  { x: 4, y: 5, variant: 'grass-plain' },
  { x: 5, y: 5, variant: 'grass-dirt-e' },
  { x: 6, y: 5, variant: 'dirt-plain' },
  { x: 7, y: 5, variant: 'dirt-plain' },
  { x: 8, y: 5, variant: 'grass-dirt-w' },
  { x: 0, y: 4, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN
  { x: 1, y: 4, variant: 'grass-tilled-s', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 2, y: 4, variant: 'grass-tilled-s', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 3, y: 4, variant: 'grass-tilled-s' },
  { x: 4, y: 4, variant: 'grass-plain' },
  { x: 5, y: 4, variant: 'grass-dirt-e' },
  { x: 6, y: 4, variant: 'dirt-plain' },
  { x: 7, y: 4, variant: 'dirt-plain' },
  { x: 8, y: 4, variant: 'grass-dirt-w' },
  { x: 0, y: 3, variant: 'grass-tilled-e', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 1, y: 3, variant: 'grass-tilled' },
  { x: 2, y: 3, variant: 'grass-tilled' },
  { x: 3, y: 3, variant: 'grass-tilled' },
  { x: 4, y: 3, variant: 'grass-tilled-w' },
  { x: 5, y: 3, variant: 'grass-dirt-e' },
  { x: 6, y: 3, variant: 'dirt-plain' },
  { x: 7, y: 3, variant: 'dirt-plain' },
  { x: 8, y: 3, variant: 'grass-dirt-w' },
  { x: 0, y: 2, variant: 'grass-tilled-e', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 1, y: 2, variant: 'grass-tilled' },
  { x: 2, y: 2, variant: 'grass-tilled' },
  { x: 3, y: 2, variant: 'grass-tilled' },
  { x: 4, y: 2, variant: 'grass-tilled-w' },
  { x: 5, y: 2, variant: 'grass-dirt-n', rotation: 90 }, // ROTATION PROOF: baked n + rot 90 → dirt east, same boundary as grass-dirt-e
  { x: 6, y: 2, variant: 'dirt-plain' },
  { x: 7, y: 2, variant: 'dirt-plain' },
  { x: 8, y: 2, variant: 'grass-dirt-n', rotation: 270 }, // ROTATION PROOF: baked n + rot 270 → dirt west, same boundary as grass-dirt-w
  { x: 0, y: 1, variant: 'grass-tilled-e', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 1, y: 1, variant: 'grass-tilled' },
  { x: 2, y: 1, variant: 'grass-tilled' },
  { x: 3, y: 1, variant: 'grass-tilled' },
  { x: 4, y: 1, variant: 'grass-tilled-w' },
  { x: 5, y: 1, variant: 'grass-dirt-n', rotation: 90 }, // ROTATION PROOF (dirt east via rot 90)
  { x: 6, y: 1, variant: 'dirt-plain' },
  { x: 7, y: 1, variant: 'dirt-plain' },
  { x: 8, y: 1, variant: 'grass-dirt-n', rotation: 270 }, // ROTATION PROOF (dirt west via rot 270)
  { x: 0, y: 0, variant: 'grass-plain', outlineColor: 0x4f7a34 }, // GREEN outline demo (column 0)
  { x: 1, y: 0, variant: 'grass-tilled-n', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 2, y: 0, variant: 'grass-tilled-n', outlineColor: 0x4f7a34 }, // GREEN (edge, owner grass)
  { x: 3, y: 0, variant: 'grass-tilled-n' },
  { x: 4, y: 0, variant: 'grass-plain' },
  { x: 5, y: 0, variant: 'grass-dirt-n', rotation: 90 }, // ROTATION PROOF (dirt east via rot 90)
  { x: 6, y: 0, variant: 'dirt-plain' },
  { x: 7, y: 0, variant: 'dirt-plain' },
  { x: 8, y: 0, variant: 'grass-dirt-n', rotation: 270 }, // ROTATION PROOF (dirt west via rot 270)
]

// ─── Validation (data-level acceptance gate) ─────────────────────────────
// Direction → data-grid offset. Convention semantics: n = +y/z, e = +x,
// s = -y/z, w = -x.
const OFFSETS = {
  n: [0, 1],
  e: [1, 0],
  s: [0, -1],
  w: [-1, 0],
}
/** The direction a neighbor-edge must point when approached from the other
 *  side (grass-dirt-e at (5,y) is seen as grass-dirt-w from the dirt cell). */
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' }
/** Clockwise direction cycle (viewed from above +Y) — matches THREE's
 *  positive rotation.y: baked n + rotation 90 → e (convention §2, pinned). */
const DIRS = ['n', 'e', 's', 'w']
/** Perpendicular (behind) sides of each effective direction: the two sides
 *  orthogonal to where the edge points. The ghost-edge check requires at
 *  least one of them to carry the edge's OWNER biome. */
const PERPENDICULAR = { n: ['w', 'e'], e: ['n', 's'], s: ['e', 'w'], w: ['n', 's'] }

/** Rotates a baked orientation by a record's rotation (0/90/180/270,
 *  clockwise from above +Y). n→e→s→w→n for +90, e.g. grass-dirt-n rotated
 *  90 has its dirt half to the east. Invalid rotation values fall back to
 *  the baked orientation — the composer's build-time guard reports them
 *  with a clear error, the validator just never crashes on them. */
function effectiveDir(baked, rotation) {
  if (!rotation) return baked
  if (!DIRS.includes(baked) || ![90, 180, 270].includes(rotation)) return baked
  return DIRS[(DIRS.indexOf(baked) + rotation / 90) % 4]
}

/** Canonical key for the boundary between two orthogonally adjacent cells
 *  (order-independent, so both endpoints map to the same boundary). */
function boundaryKey(x1, y1, x2, y2) {
  return `${Math.min(x1, x2)},${Math.min(y1, y2)}|${Math.max(x1, x2)},${Math.max(y1, y2)}`
}

/**
 * Data-level acceptance check for showcase maps (and any tile data built on
 * the same schema). Asserts:
 *   1. Every record has a known variant; no duplicate (x, y).
 *   2. Edge orientation (rotation-aware): every edge variant has its toBiome
 *      neighbor on its EFFECTIVE side (baked orientation + rotation; n = +y,
 *      e = +x, s = -y, w = -x).
 *   3. Ghost-edge check: every edge variant has at least one fromBiome
 *      neighbor on its two PERPENDICULAR (behind) sides (out-of-grid counts
 *      as a pass) — edges dropped inside a foreign field are rejected.
 *   4. Exact boundary coverage: every cross-biome orthogonal adjacency is
 *      covered by EXACTLY ONE validly-oriented edge (uncovered adjacencies
 *      are rejected; boundaries covered twice are rejected as doubled edges;
 *      pairs without a shipped edge family are rejected as unrepresentable).
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

  // 2. Edge orientation + boundary coverage map. An edge covers the boundary
  // between its cell and the neighbor on its EFFECTIVE side — but only if
  // that neighbor is the toBiome biome; a mis-oriented edge covers nothing
  // (it is reported and does not satisfy any adjacency). GHOST-EDGE check
  // (design-critic fold-in): an edge must ALSO have at least one fromBiome
  // neighbor on its two PERPENDICULAR (behind) sides (out-of-grid counts as
  // a pass, so edges on the map rim stay legal). This rejects an edge
  // dropped inside a foreign field — e.g. a grass-dirt-e inside the dirt
  // path passes the toBiome-side check (dirt ahead) but has dirt on both
  // perpendicular sides too.
  const coverage = new Map()
  for (const rec of data) {
    const meta = VARIANTS[rec.variant]
    if (!meta || meta.kind !== 'edge') continue
    const eff = effectiveDir(meta.orientation, rec.rotation)
    const [dx, dy] = OFFSETS[eff]
    const nb = byCoord.get(`${rec.x + dx},${rec.y + dy}`)
    const nbMeta = nb ? VARIANTS[nb.variant] : undefined
    if (!nbMeta || nbMeta.biome !== meta.toBiome) {
      errors.push(
        `edge "${rec.variant}" at (${rec.x}, ${rec.y}) points ${eff} ` +
          `but its neighbor at (${rec.x + dx}, ${rec.y + dy}) is ` +
          `${nb ? `"${nb.variant}" (${nbMeta ? nbMeta.biome : '?'})` : 'EMPTY (grid edge)'} ` +
          `— expected a ${meta.toBiome} cell`,
      )
      continue
    }
    let hasOwnerSide = false
    for (const pdir of PERPENDICULAR[eff]) {
      const [pdx, pdy] = OFFSETS[pdir]
      const pnb = byCoord.get(`${rec.x + pdx},${rec.y + pdy}`)
      if (!pnb) {
        hasOwnerSide = true // out-of-grid counts as a pass
        break
      }
      const pmeta = VARIANTS[pnb.variant]
      if (pmeta && pmeta.biome === meta.fromBiome) {
        hasOwnerSide = true
        break
      }
    }
    if (!hasOwnerSide) {
      const perpDesc = PERPENDICULAR[eff]
        .map(pdir => {
          const [pdx, pdy] = OFFSETS[pdir]
          const pnb = byCoord.get(`${rec.x + pdx},${rec.y + pdy}`)
          return `(${rec.x + pdx}, ${rec.y + pdy}) is ${pnb ? `"${pnb.variant}"` : 'EMPTY (grid edge)'}`
        })
        .join(' and ')
      errors.push(
        `ghost edge: "${rec.variant}" at (${rec.x}, ${rec.y}) points ${eff} but neither perpendicular neighbor (${perpDesc}) ` +
          `is ${meta.fromBiome} — an edge must sit on its owner biome's cell`,
      )
      continue
    }
    const bkey = boundaryKey(rec.x, rec.y, rec.x + dx, rec.y + dy)
    if (coverage.has(bkey)) {
      const prev = coverage.get(bkey)
      errors.push(
        `doubled edge: "${prev.variant}" at (${prev.x}, ${prev.y}) and "${rec.variant}" at (${rec.x}, ${rec.y}) ` +
          `both cover the boundary between (${rec.x}, ${rec.y}) and (${rec.x + dx}, ${rec.y + dy})`,
      )
      continue
    }
    coverage.set(bkey, rec)
  }

  // 3. Completeness: every cross-biome orthogonal adjacency must be covered
  // exactly once by an edge at the first biome's cell.
  for (const rec of data) {
    const meta = VARIANTS[rec.variant]
    if (!meta) continue // already reported
    for (const dir of Object.keys(OFFSETS)) {
      const [dx, dy] = OFFSETS[dir]
      const nb = byCoord.get(`${rec.x + dx},${rec.y + dy}`)
      if (!nb) continue // grid edge — nothing adjacent
      const nbMeta = VARIANTS[nb.variant]
      if (!nbMeta || nbMeta.biome === meta.biome) continue // same biome
      const fwd = `${meta.biome}-${nbMeta.biome}-${dir}`
      const back = `${nbMeta.biome}-${meta.biome}-${OPPOSITE[dir]}`
      const hasFwd = !!VARIANTS[fwd]
      const bkey = boundaryKey(rec.x, rec.y, rec.x + dx, rec.y + dy)
      if (!hasFwd && !VARIANTS[back]) {
        errors.push(
          `no edge family for ${meta.biome}↔${nbMeta.biome} adjacency at (${rec.x}, ${rec.y}) ` +
            `(neighbor at (${rec.x + dx}, ${rec.y + dy}) is "${nb.variant}") — ` +
            `separate these biomes in the data`,
        )
      } else if (!coverage.has(bkey)) {
        // The edge belongs on the FIRST biome's cell. If `rec` is that biome
        // the expected variant sits here; otherwise it sits at the neighbor,
        // pointing back at us.
        const expect = hasFwd
          ? `${fwd} at (${rec.x}, ${rec.y})`
          : `${back} at (${nb.x}, ${nb.y})`
        errors.push(
          `uncovered ${meta.biome}↔${nbMeta.biome} boundary between (${rec.x}, ${rec.y}) and ` +
            `(${rec.x + dx}, ${rec.y + dy}) — expected edge "${expect}"`,
        )
      }
    }
  }

  return { ok: errors.length === 0, errors }
}
