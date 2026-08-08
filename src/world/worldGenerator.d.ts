/** Pure, deterministic, per-chunk procedural map generator (Slice C).
 *
 * Fix round 1: the world is FLOATING ISLANDS — a per-tile island/void mask
 * (two-octave hash value noise) decides solid vs void; void chunks return
 * empty { tiles: [], props: [] }. The origin chunk (0,0) is pinned to grass
 * AFTER the gate pass and the origin tile (0,0) is pinned solid (spawn
 * guarantee). biomeAt returns 'void' for void tiles. */

/** Tiles per chunk side. Chunk (cx, cy) covers global tile coords
 *  x ∈ [cx*8, cx*8+8), y ∈ [cy*8, cy*8+8). */
export const CHUNK_SIZE: number

/** Gate probability for the choke-point pass (tunable). */
export const GATE_PROBABILITY: number

/** Island-mask tuning config (QA hook): octaves (cell size + weight), land
 *  threshold, stepping-stone band + probability. Exported so tests can probe
 *  the island field. */
export const ISLAND_CONFIG: {
  octaves: Array<{ cell: number; weight: number }>
  threshold: number
  stoneBand: number
  stoneProb: number
}

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

/** Is the global tile (x, y) solid (builds a mesh)? Land (island noise above
 *  threshold) OR a stepping-stone bridge tile; the origin tile (0,0) is
 *  ALWAYS solid. Pure + deterministic. */
export function isTileSolid(seed: number, x: number, y: number): boolean

/** The island value-noise field at a global tile, in [-1, 1] (QA hook).
 *  Pure + deterministic + continuous across chunk borders. */
export function islandNoise(seed: number, x: number, y: number): number

/** Generates one chunk: { tiles, props } with GLOBAL tile coordinates, plain
 *  JSON-serializable. Pure function of (seed, cx, cy). Void chunks (no solid
 *  tile) return { tiles: [], props: [] } WITHOUT running the biome pass. */
export function generateChunk(seed: number, cx: number, cy: number): GeneratedChunk

/** Final biome for a chunk (raw Voronoi + choke-point gate pass; origin
 *  chunk pinned to grass AFTER every pass). Deterministic. */
export function chunkBiomeAt(seed: number, cx: number, cy: number): string

/** Raw Voronoi biome for a chunk (before the gate pass; QA hook — tests
 *  probe the gate pass against the raw field). */
export function rawBiomeAt(seed: number, cx: number, cy: number): string

/** Biome for a global tile coordinate: the chunk's gate-passed biome for
 *  solid tiles, 'void' for void tiles (the island mask is applied after the
 *  gate pass). Deterministic. */
export function biomeAt(seed: number, x: number, y: number): string
