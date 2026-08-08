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
 *   1. ISLAND / VOID MASK (fix round 1, user design directives 2026-08-08):
 *      the world is FLOATING ISLANDS against the sky, not a solid all-ground
 *      plane. A two-octave hash-based value-noise field (continuous across
 *      chunk borders, deterministic) decides per TILE whether it is solid
 *      land (noise > threshold) or void. The coastline is ragged at the tile
 *      level — no square chunk borders. Fully-void chunks return
 *      { tiles: [], props: [] } WITHOUT running the biome pass (void chunk
 *      generation costs ~nothing).
 *   2. STEPPING-STONE BRIDGES (directive: chokepoints = sparse random tiles,
 *      not solid corridors): a void tile in the narrow noise band just below
 *      the coastline becomes an isolated bridge tile with low probability —
 *      occasional single/short random-tile stepping stones between island
 *      masses (or coastlines), never wide solid pathways.
 *   3. BIOME (per chunk, not per tile): hash-based Voronoi. Coarse cells of
 *      CELL_SIZE chunks each derive a deterministic seed point (jittered
 *      position + biome from a mix table) from hash(seed, cellX, cellY). A
 *      chunk's biome is the nearest seed point's biome over the 3×3 coarse
 *      cells around it (bounded window — always contains the nearest point).
 *      CELL_SIZE is small (tunable) so regions read as small-to-medium blobs,
 *      NOT two giant half-screen masses.
 *   4. CHOKE-POINT GATE PASS: 3 iterations of a deterministic local rule —
 *      a chunk with a different-biome neighbor is reassigned to the majority
 *      biome of its 3×3 neighborhood UNLESS it is a "gate" chunk
 *      (hash(seed, biomeA, biomeB, cx, cy) < GATE_PROBABILITY). Long open
 *      borders erode away; only the sparse gate chunks survive as narrow
 *      1-3 chunk connectors between regions. Locally computable: each
 *      iteration only needs the 3×3 neighborhood, so a bounded window of
 *      radius = iteration count around the queried chunk is exact.
 *   5. ORIGIN GUARANTEE (design-critic Major 1 + round 2): the origin chunk
 *      (0,0) is pinned to grass AFTER every pass (raw Voronoi pin + final pin
 *      in chunkBiomeAt), and a 5×5 SPAWN PATCH around the origin tile —
 *      max(|x|,|y|) <= SPAWN_PIN_RADIUS (2) — is pinned solid AND grass
 *      (tileBiomeAt) in every chunk it crosses: the player always spawns on
 *      a comfortable grass island, never a one-tile spike in the void (seeds
 *      777/4242/1/2 booted to 1-16 tiles pre-fix). Tiles beyond the patch
 *      follow the island noise, so the patch edge stays ragged where the
 *      noise is void.
 *   6. TILE VARIANTS: per-tile deterministic PRNG (hash(seed, cx, cy, x, y))
 *      distributes the biome's texture variants (grass-plain/-b/-c etc.).
 *   7. PROPS: ~10% per solid tile (at most one prop per tile), from the
 *      biome's eligible prop list, with deterministic dx/dz jitter (±0.2
 *      within the tile diamond) and yaw rotation (0-360°).
 *
 * Output is plain JSON-serializable data ({ tiles, props } with GLOBAL tile
 * coordinates) — the WorldManager turns it into meshes. Void chunks produce
 * { tiles: [], props: [] } and the WorldManager skips composer/prop building
 * for them entirely (zero meshes for void chunks).
 */

import { SeededRNG } from '../core/procedural'

/** Tiles per chunk side. Chunk (cx, cy) covers global tile coords
 *  x ∈ [cx*8, cx*8+8), y ∈ [cy*8, cy*8+8). */
export const CHUNK_SIZE = 8

/** Coarse Voronoi cell size in chunks (each cell holds one biome seed point).
 *  Small (3) so biome regions are small-to-medium blobs (a handful of chunks)
 *  — the original 8 produced two giant half-screen regions (fix round 1). */
const CELL_SIZE = 3

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

/** Spawn-patch radius (round 2 fix, design-critic Major): every tile with
 *  max(|x|,|y|) <= SPAWN_PIN_RADIUS around the origin is ALWAYS solid — a
 *  5×5 data-space patch (25 tiles). Exported as a QA hook (tests assert the
 *  origin-chunk tile floor for multiple seeds). */
export const SPAWN_PIN_RADIUS = 2

/** Gate-pass iterations (2-3 recommended). */
const GATE_ITERATIONS = 3

// ─── Island / void mask (fix round 1) ─────────────────────────────────────
/**
 * Island-mask tuning config (QA hook: exported so tests can probe the field;
 * production code reads it via islandNoise / isTileSolid). Two-octave
 * value-noise weights — octave 1 (large cell) shapes the island masses,
 * octave 2 (small cell) makes the coastlines ragged at the tile level; the
 * weights sum to 1 so the field stays in [-1, 1]. Cells are small so islands
 * are a handful of chunks, NOT one giant half-screen mass (fix round 1). */
export const ISLAND_CONFIG = {
  octaves: [
    { cell: 5, weight: 0.35 },
    { cell: 3, weight: 0.65 },
  ],
  /** Noise above this threshold is solid land. Above 0 → several disconnected
   *  island masses with sky between them. */
  threshold: 0.28,
  /** Stepping stones only appear in the void band this far below the coastline
   *  (in noise units) — sparse bridge tiles hug the coasts / narrow straits. */
  stoneBand: 0.35,
  /** Probability that a void tile inside the coastline band becomes a
   *  stepping-stone bridge tile. */
  stoneProb: 0.22,
}
/** Salt distinguishing the island-noise grid from the stone-roll grid. */
const STONE_SALT = 0x57a1e

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
 * is pinned to grass (player spawn guarantee). Exported as a QA hook (tests
 * probe the gate pass against the raw field).
 */
export function rawBiomeAt(seed, cx, cy) {
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
 * chunk, deterministic. The origin chunk is pinned to grass AFTER every pass
 * (design-critic Major 1: the raw pin alone could be reassigned by the gate
 * pass — this final pin guarantees the spawn biome).
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
  if (cx === 0 && cy === 0) return 'grass'
  return cur.get(`${cx},${cy}`)
}

// ─── Island / void mask (fix round 1) ─────────────────────────────────────

/** One grid value of the island value-noise field: hash-based, in [-1, 1]. */
function noiseGridValue(seed, salt, gx, gy) {
  return (hash(seed, salt, gx, gy) / 4294967296) * 2 - 1
}

/** Smoothstep — value-noise interpolation easing. */
function smooth(t) {
  return t * t * (3 - 2 * t)
}

/** Bilinear value noise over a hash-derived grid. Continuous across chunk
 *  borders (grid cells are world-aligned, not chunk-aligned), deterministic,
 *  output in [-1, 1]. */
function valueNoise(seed, salt, x, y, cell) {
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  const fx = (x - gx * cell) / cell
  const fy = (y - gy * cell) / cell
  const sx = smooth(fx)
  const sy = smooth(fy)
  const v00 = noiseGridValue(seed, salt, gx, gy)
  const v10 = noiseGridValue(seed, salt, gx + 1, gy)
  const v01 = noiseGridValue(seed, salt, gx, gy + 1)
  const v11 = noiseGridValue(seed, salt, gx + 1, gy + 1)
  const a = v00 + (v10 - v00) * sx
  const b = v01 + (v11 - v01) * sx
  return a + (b - a) * sy
}

/** The island field value at a global tile: two-octave value noise in [-1,1].
 *  Pure + deterministic + continuous across chunk borders. Exported as a QA
 *  hook (tests probe the field directly); production code only needs
 *  isTileSolid. */
export function islandNoise(seed, x, y) {
  const octaves = ISLAND_CONFIG.octaves
  let n = 0
  for (let i = 0; i < octaves.length; i++) {
    const o = octaves[i]
    n += o.weight * valueNoise(seed, 1000 + i, x, y, o.cell)
  }
  return n
}

/**
 * Is the global tile (x, y) solid (builds a mesh)? Land (noise above
 * threshold) OR a stepping-stone bridge tile (void but inside the coastline
 * band, rare per-tile roll). The SPAWN PATCH around (0,0) is ALWAYS solid —
 * the player spawn guarantee (round 2: a 5×5 patch, not a single pinned
 * tile — non-default seeds used to boot to a 1-tile island in the void),
 * pinned after the island mask. Pure + deterministic.
 */
export function isTileSolid(seed, x, y) {
  // Spawn patch: the data-space square max(|x|,|y|) <= 2 (25 tiles — a 5×5
  // patch; in world space it reads as a small diamond island). The noise can
  // still add land beyond it, keeping the edge ragged; it can never be
  // REMOVED, so the origin chunk always has a comfortable spawn area.
  if (Math.max(Math.abs(x), Math.abs(y)) <= SPAWN_PIN_RADIUS) return true
  const cfg = ISLAND_CONFIG
  const n = islandNoise(seed, x, y)
  if (n > cfg.threshold) return true
  const depth = cfg.threshold - n
  if (depth > cfg.stoneBand) return false
  return hash(seed, STONE_SALT, x, y) / 4294967296 < cfg.stoneProb
}

/** The biome for a solid tile: 'grass' for every tile inside the 5×5 spawn
 *  patch (fix round 2 — the patch is a clean GRASS island even where it
 *  crosses into the neighbor chunks, whose chunk biomes are NOT pinned),
 *  otherwise the chunk's gate-passed biome. Deterministic. */
function tileBiomeAt(seed, x, y) {
  if (Math.max(Math.abs(x), Math.abs(y)) <= SPAWN_PIN_RADIUS) return 'grass'
  return chunkBiomeAt(seed, Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE))
}

/** Biome for a global tile coordinate: 'grass' on the spawn patch, the
 *  chunk's gate-passed biome on other solid tiles, 'void' for void tiles
 *  (fix round 1: void tiles have no biome — the world manager's public API
 *  documents this). Deterministic. */
export function biomeAt(seed, x, y) {
  if (!isTileSolid(seed, x, y)) return 'void'
  return tileBiomeAt(seed, x, y)
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
 * Void chunks (no solid tile in the island mask) return { tiles: [],
 * props: [] } WITHOUT running the biome gate pass — empty chunks cost almost
 * nothing and the WorldManager builds no meshes for them (design directive:
 * the sky shows through around the islands).
 *
 * @param {number} seed
 * @param {number} cx - chunk x (tiles x ∈ [cx*8, cx*8+8))
 * @param {number} cy - chunk y (tiles y ∈ [cy*8, cy*8+8))
 * @returns {{tiles: Array<{x: number, y: number, variant: string}>, props: Array<{name: string, x: number, y: number, dx: number, dz: number, rotation: number}>}}
 */
export function generateChunk(seed, cx, cy) {
  // Pass 1 — island/void mask (cheap, no biome window): collect the solid
  // tiles of this chunk. A fully-void chunk returns empty without touching
  // the biome machinery.
  const solid = []
  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const x = cx * CHUNK_SIZE + tx
      const y = cy * CHUNK_SIZE + ty
      if (isTileSolid(seed, x, y)) solid.push([x, y])
    }
  }
  if (solid.length === 0) return { tiles: [], props: [] }

  // Pass 2+ — biome (gate-passed, origin pinned), variants, props.
  const biome = chunkBiomeAt(seed, cx, cy)
  const tiles = []
  const props = []
  const eligible = PROP_TABLE[biome]
  for (let i = 0; i < solid.length; i++) {
    const x = solid[i][0]
    const y = solid[i][1]
    const rng = new SeededRNG(hash(seed, cx, cy, x, y))
    // Per-tile biome override: the spawn patch is always GRASS (fix round 2),
    // even in the neighbor chunks whose chunk biomes aren't pinned — the
    // player's island reads as one clean grass mass.
    const tBiome = tileBiomeAt(seed, x, y)
    const tEligible = tBiome === biome ? eligible : PROP_TABLE[tBiome]
    tiles.push({ x, y, variant: pickVariant(tBiome, rng.next()) })
    if (tEligible.length > 0 && rng.chance(PROP_CHANCE)) {
      const name = tEligible[Math.floor(rng.next() * tEligible.length)]
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
  return { tiles, props }
}
