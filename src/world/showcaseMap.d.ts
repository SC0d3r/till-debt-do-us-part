import type { TileMapRecord } from './TileMapComposer'

/** Hand-authored 9x9 showcase grid (81 records, x/y in 0..8) proving the
 *  plain-only tile kit in one view: a biome patchwork (grass majority with
 *  grass-plain-b/-c variety, dirt-plain/-b, water-plain/-b, sand-plain/-b,
 *  lava-plain, snow-plain/-b) with NO transition or decorated variants — the
 *  zipper was removed, every cell carries exactly one plain variant, and
 *  biome boundaries are hard edges. */
export const SHOWCASE_MAP: TileMapRecord[]

export interface ShowcaseValidation {
  ok: boolean
  errors: string[]
}

/**
 * Data-level acceptance gate: asserts every record is a known plain variant
 * (no decorated/edge variants), every (x, y) is unique, and the grid is
 * exactly 9x9. Any unknown variant or duplicate cell is rejected.
 */
export function validateShowcaseMap(data: TileMapRecord[]): ShowcaseValidation