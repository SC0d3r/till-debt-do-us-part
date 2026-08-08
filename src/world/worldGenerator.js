/**
 * worldGenerator — pure, deterministic, per-chunk procedural map generator
 * (Slice C: Procedural Seeded Map Generation).
 *
 * The generator is a PURE function of (seed, chunkX, chunkY): no Math.random,
 * no Date.now, no shared mutable state anywhere in the generation path. The
 * same seed produces byte-identical chunk data every time, forever — the
 * world stores the seed, never the generated result.
 *
 * PIPELINE (per chunk):
 *   1. BIOME (per chunk, not per tile): hash-based Voronoi. Coarse cells of
 *      8×8 chunks each derive a deterministic seed point (jittered position +
 *      biome from a mix table) from hash(seed, cellX, cellY). A chunk's biome
 *      is the nearest seed point's biome over the 3×3 coarse cells around it
 *      (bounded window — always contains the nearest point). The origin chunk
 *      (0,0) is pinned to grass.
 *   2. CHOKE-POINT GATE PASS: 3 iterations of a deterministic local rule —
 *      a chunk with a different-biome neighbor is reassigned to the majority
 *      biome of its 3×3 neighborhood UNLESS it is a "gate" chunk
 *      (hash(seed, biomeA, biomeB, cx, cy) < GATE_PROBABILITY). Long open
 *      borders erode away; only the sparse gate chunks survive as narrow
 *      1-3 chunk connectors between regions. Locally computable: each
 *      iteration only needs the 3×3 neighborhood, so a bounded window of
 *      radius = iteration count around the queried chunk is exact.
 *   3. TILE VARIANTS: per-tile deterministic PRNG (hash(seed, cx, cy, x, y))
 *      distributes the biome's texture variants (grass-plain/-b/-c etc.).
 *   4. PROPS: ~10% per tile (at most one prop per tile), from the biome's
 *      eligible prop list, with deterministic dx/dz jitter (±0.2 within the
 *      tile diamond) and yaw rotation (0-360°).
 *
 * Output is plain JSON-serializable data ({ tiles, props } with GLOBAL tile
 * coordinates) — the WorldManager turns it into meshes.
 */

import { SeededRNG } from '../core/procedural'

/** Tiles per chunk side. Chunk (cx, cy) covers global tile coords
 *  x ∈ [cx*8, cx*8+8), y ∈ [cy*8, cy*8+8). */
export const CHUNK_SIZE = 8

/** Coarse Voronoi cell size in chunks (each cell holds one biome seed point). */
const CELL_SIZE = 8

/** Biome mix table (tunable): cumulative thresholds on a [0,1) roll. */
const BIOME_MIX = [
  ['grass', 0.35],
  ['dirt', 0.15],
  ['sand', 0.15],
  ['water', 0.15],
  ['snow', 0.10],
  ['lava', 0.10],
]

/** Fixed biome order — deterministic tie-break for the gate pass majority. */
const BIOME_ORDER = ['grass', 'dirt', 'sand', 'water', 'snow', 'lava']
const BIOME_INDEX = new Map(BIOME_ORDER.map((b, i) => [b, i]))

/** Gate probability: a boundary chunk keeps its biome (becomes a narrow
 *  connector) with this probability. Tunable. */
export const GATE_PROBABILITY = 0.15

/** Gate-pass iterations (2-3 recommended). */
const GATE_ITERATIONS = 3

/** Per-biome tile variant distribution (cumulative weights). */
const VARIANT_TABLE = {
  grass: [['grass-plain', 0.7], ['grass-plain-b', 0.2], ['grass-plain-c', 0.1]],
  dirt: [['dirt-plain', 0.85], ['dirt-plain-b', 0.15]],
  water: [['water-plain', 0.85], ['water-plain-b', 0.15]],
  sand: [['sand-plain', 0.85], ['sand-plain-b', 0.15]],
  snow: [['snow-plain', 0.85], ['snow-plain-b', 0.15]],
  lava: [['lava-plain', 1.0]],
}

/** Per-biome prop eligibility (Slice B prop library names). Water: none. */
const PROP_TABLE = {
  grass: ['flower', 'tall-grass', 'rock', 'bush', 'small-stone', 'big-stone', 'pebble-cluster'],
  dirt: ['gravel-patch', 'small-stone', 'big-stone', 'rock', 'pebble-cluster'],
  sand: ['cactus', 'dry-shrub', 'small-stone', 'big-stone', 'pebble-cluster', 'rock'],
  snow: ['bush-snow', 'snow-patch', 'small-stone', 'big-stone', 'rock'],
  lava: ['lava-rock', 'big-stone', 'small-stone'],
  water: [],
}

/** Prop placement chance per tile. */
const PROP_CHANCE = 0.10
/** Prop jitter range within the tile diamond (±0.2). */
const PROP_JITTER = 0.2

/**
 * Stable deterministic integer hash (FNV-1a over the argument ints). Pure and
 * stable across runs — the seed for every per-cell / per-tile PRNG.
 */
export function hash(...ints) {
  let h = 2166136261 >>> 0
  for (const v of ints) {
    h ^= v | 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Picks a biome from the mix table using a [0,1) roll. */
function pickBiome(r) {
  let acc = 0
  for (const [biome, weight] of BIOME_MIX) {
    acc += weight
    if (r < acc) return biome
  }
  return 'lava'
}

/**
 * One coarse cell's deterministic seed point: jittered position (in chunk
 * units) + biome from the mix table, both derived from hash(seed, cellX,
 * cellY). Pure.
 */
function cellSeed(seed, cellX, cellY) {
  const rng = new SeededRNG(hash(seed, cellX, cellY))
  return {
    x: cellX * CELL_SIZE + rng.range(0, CELL_SIZE),
    y: cellY * CELL_SIZE + rng.range(0, CELL_SIZE),
    biome: pickBiome(rng.next()),
  }
}

/**
 * Raw Voronoi biome for a chunk (before the gate pass): nearest seed point
 * over the 3×3 coarse cells around the chunk's cell. The origin chunk (0,0)
 * is pinned to grass (player spawn guarantee).
 */
function rawBiomeAt(seed, cx, cy) {
  if (cx === 0 && cy === 0) return 'grass'
  const cellX = Math.floor(cx / CELL_SIZE)
  const cellY = Math.floor(cy / CELL_SIZE)
  const px = cx + 0.5
  const py = cy + 0.5
  let best = null
  let bestDist = Infinity
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const s = cellSeed(seed, cellX + dx, cellY + dy)
      const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py)
      if (d < bestDist) {
        bestDist = d
        best = s
      }
    }
  }
  return best.biome
}

/** Gate test for the boundary pair (biomeA, biomeB) at chunk (cx, cy):
 *  symmetric in the biome pair (min/max ordering) so both sides of a seam
 *  agree on which pair is being gated. */
function isGate(seed, biomeA, biomeB, cx, cy) {
  const a = BIOME_INDEX.get(biomeA)
  const b = BIOME_INDEX.get(biomeB)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return hash(seed, lo, hi, cx, cy) / 4294967296 < GATE_PROBABILITY
}

/**
 * One gate-pass iteration step for chunk (x, y): if it has a different-biome
 * neighbor it is reassigned to the majority biome of its 3×3 neighborhood
 * (fixed-order tie-break) UNLESS any of its different-biome adjacencies is a
 * gate chunk (then it keeps its biome — the narrow connector). `cur` holds
 * the current iteration's values for the bounded window; values outside the
 * window fall back to `raw` (the raw Voronoi biome).
 */
function gateStep(seed, x, y, cur, raw) {
  const own = cur.get(`${x},${y}`) ?? raw.get(`${x},${y}`)
  const counts = new Map()
  let hasDiff = false
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${x + dx},${y + dy}`
      const b = cur.get(key) ?? raw.get(key)
      counts.set(b, (counts.get(b) || 0) + 1)
      if (b !== own) hasDiff = true
    }
  }
  if (!hasDiff) return own
  // Gate check: ANY different-biome adjacency may gate this chunk.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      const key = `${x + dx},${y + dy}`
      const b = cur.get(key) ?? raw.get(key)
      if (b !== own && isGate(seed, own, b, x, y)) return own
    }
  }
  // Majority of the 3×3 neighborhood, deterministic tie-break (BIOME_ORDER).
  let best = own
  let bestCount = counts.get(own) || 0
  for (const b of BIOME_ORDER) {
    const c = counts.get(b) || 0
    if (c > bestCount) {
      best = b
      bestCount = c
    }
  }
  return best
}

/**
 * Final biome for a chunk: raw Voronoi → GATE_ITERATIONS of the choke-point
 * gate pass over a bounded window (radius = iteration count — exact, since
 * each iteration only reads its 3×3 neighborhood). Locally computable per
 * chunk, deterministic. The origin chunk stays grass.
 */
export function chunkBiomeAt(seed, cx, cy) {
  const R = GATE_ITERATIONS
  const raw = new Map()
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      raw.set(`${cx + dx},${cy + dy}`, rawBiomeAt(seed, cx + dx, cy + dy))
    }
  }
  let cur = raw
  for (let iter = 0; iter < GATE_ITERATIONS; iter++) {
    const next = new Map()
    for (const [key] of cur) {
      const comma = key.indexOf(',')
      const x = Number(key.slice(0, comma))
      const y = Number(key.slice(comma + 1))
      next.set(key, gateStep(seed, x, y, cur, raw))
    }
    cur = next
  }
  return cur.get(`${cx},${cy}`)
}

/** Biome for a global tile coordinate (the biome of its chunk). */
export function biomeAt(seed, x, y) {
  return chunkBiomeAt(seed, Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE))
}

/** Picks a tile variant from the biome's distribution using a [0,1) roll. */
function pickVariant(biome, r) {
  const table = VARIANT_TABLE[biome]
  let acc = 0
  for (const [variant, weight] of table) {
    acc += weight
    if (r < acc) return variant
  }
  return table[table.length - 1][0]
}

/**
 * Generates one chunk: { tiles, props } with GLOBAL tile coordinates, plain
 * JSON-serializable. Pure function of (seed, cx, cy).
 *
 * @param {number} seed
 * @param {number} cx - chunk x (tiles x ∈ [cx*8, cx*8+8))
 * @param {number} cy - chunk y (tiles y ∈ [cy*8, cy*8+8))
 * @returns {{tiles: Array<{x: number, y: number, variant: string}>, props: Array<{name: string, x: number, y: number, dx: number, dz: number, rotation: number}>}}
 */
export function generateChunk(seed, cx, cy) {
  const biome = chunkBiomeAt(seed, cx, cy)
  const tiles = []
  const props = []
  const eligible = PROP_TABLE[biome]
  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const x = cx * CHUNK_SIZE + tx
      const y = cy * CHUNK_SIZE + ty
      const rng = new SeededRNG(hash(seed, cx, cy, x, y))
      tiles.push({ x, y, variant: pickVariant(biome, rng.next()) })
      if (eligible.length > 0 && rng.chance(PROP_CHANCE)) {
        const name = eligible[Math.floor(rng.next() * eligible.length)]
        props.push({
          name,
          x,
          y,
          dx: rng.range(-PROP_JITTER, PROP_JITTER),
          dz: rng.range(-PROP_JITTER, PROP_JITTER),
          rotation: rng.range(0, 360),
        })
      }
    }
  }
  return { tiles, props }
}