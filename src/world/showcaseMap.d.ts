import type { TileMapRecord } from './TileMapComposer'

/** Hand-authored 9x9 showcase grid (81 records, x/y in 0..8) proving the
 *  grass family in one view: grass-plain field (majority), sprinkled
 *  grass-flowers / grass-bushes, a 2-wide dirt-plain path crossing the field,
 *  a 3x3 grass-tilled patch ringed by correctly-oriented grass-tilled
 *  n/e/s/w edges, and grass↔dirt transitions on every grass cell bordering
 *  the path. The path's bottom rows (y=0..2) prove rotation: both boundaries
 *  are authored from grass-dirt-n rotated 90/270 instead of the baked e/w
 *  variants. */
export const SHOWCASE_MAP: TileMapRecord[]

export interface ShowcaseValidation {
  ok: boolean
  errors: string[]
}

/**
 * Data-level acceptance gate: asserts every cross-biome orthogonal adjacency
 * is covered by EXACTLY ONE correctly-named edge variant at the first
 * biome's cell AND every edge variant has its toBiome neighbor on its
 * EFFECTIVE side (baked orientation + rotation; n = +y, e = +x, s = -y,
 * w = -x; rotation 90 maps n→e→s→w→n). Uncovered and doubled boundaries are
 * rejected.
 */
export function validateShowcaseMap(data: TileMapRecord[]): ShowcaseValidation
