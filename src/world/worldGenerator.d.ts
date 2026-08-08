/** Pure, deterministic, per-chunk procedural map generator (Slice C). */

/** Tiles per chunk side. Chunk (cx, cy) covers global tile coords
 *  x ∈ [cx*8, cx*8+8), y ∈ [cy*8, cy*8+8). */
export const CHUNK_SIZE: number

/** Gate probability for the choke-point pass (tunable). */
export const GATE_PROBABILITY: number

/** Stable deterministic integer hash (FNV-1a over the argument ints). */
export function hash(...ints: number[]): number

export interface GeneratedTile {
  x: number
  y: number
  variant: string
}

export interface GeneratedProp {
  name: string
  x: number
  y: number
  dx: number
  dz: number
  rotation: number
}

export interface GeneratedChunk {
  tiles: GeneratedTile[]
  props: GeneratedProp[]
}

/** Generates one chunk: { tiles, props } with GLOBAL tile coordinates, plain
 *  JSON-serializable. Pure function of (seed, cx, cy). */
export function generateChunk(seed: number, cx: number, cy: number): GeneratedChunk

/** Final biome for a chunk (raw Voronoi + choke-point gate pass; origin
 *  chunk pinned to grass). Deterministic. */
export function chunkBiomeAt(seed: number, cx: number, cy: number): string

/** Biome for a global tile coordinate (the biome of its chunk). */
export function biomeAt(seed: number, x: number, y: number): string