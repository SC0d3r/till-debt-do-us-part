/**
 * GRASS biome family — the first family of the Modular Isometric Biome Tile
 * System (see docs/dev-log/VISUAL_OVERHAUL_TILE_SYSTEM_BRIEF.md and
 * docs/dev-log/TILE_SYSTEM_CONVENTION.md).
 *
 * Construction (every tile, per the convention):
 *   - Diamond footprint INSCRIBED in a 1.0x1.0 grid cell: vertices at
 *     (±0.5, 0, ±0.5), center at the grid point. NOT a rotated square.
 *   - Two bands, total height 0.45: top face 55% (y 0.20..0.45), root band
 *     45% (y 0..0.20). No middle side-wall band (the old 30% band was merged
 *     into the root band — convention §1, pinned 2026-08-06; 55/45 split
 *     pinned 2026-08-06 — top band slightly TALLER than the root band).
 *   - Straight-sided diamond prism (convention §1): both bands share the SAME
 *     ±0.5 footprint — the bands are distinguished by COLOR (top band riser =
 *     capColors, root band = per-biome root colors), with NO stepped
 *     ledges/overhangs between them. The walls drop straight from the top cap
 *     to the base.
 *   - Flat/faceted shading everywhere (non-indexed geometry + flat normals +
 *     material flatShading:true). Crisp edges, no bevels.
 *   - Top-face detail is a 32x32 canvas texture (NearestFilter, no mipmaps).
 *   - Root band is BIOME-SPECIFIC dark earth (GRASS_ROOT / DIRT_ROOT /
 *     TILLED_ROOT) — darker and more desaturated than the top material, reads
 *     as that biome's soil, never near-black. On transition tiles it splits
 *     PER SIDE to match the top halves above it.
 *
 * InstancedMesh-safety: every variant is ONE merged BufferGeometry + ONE
 * MeshLambertMaterial. The top cap samples the map texture; the riser, the
 * root band and the merged bush carry vertex colors and UVs pointing at the
 * reserved white pixel (0,0) of the texture (see transitionTexture.js), so
 * the map multiplies to 1.0 there and the vertex colors show through. The
 * composer can therefore group by (biome, variant) and use ONE InstancedMesh
 * per group, and hover can setColorAt on exactly one mesh.
 *
 * Shared resources: geometry/material/texture are built ONCE per variant at
 * module scope (lazy) and reused by every instance. `dispose()` frees them.
 *
 *  Variants are KEYED BY STRING (the VARIANTS manifest below), not by module —
 *  the composer and fixture registration map data-level variant strings to
 *  this family. Transition orientations are BAKED as distinct variants (never
 *  runtime rotation); per the convention each transition family ships exactly
 *  4 baked orientations: grass-dirt-n/e/s/w and grass-tilled-n/e/s/w. The
 *  family ALSO ships the plain tilled tile as 'grass-tilled' (kind 'plain',
 *  solid tilled top — the tilled counterpart of dirt-plain; round 6, formerly
 *  a duplicate of the n-edge). All transition splits go through the shared
 *  utility src/assets/tiles/transitionTexture.js.
 *
 * Poly budget: ~78 triangles worst case (18-triangle tile prism + 60-triangle
 * merged bush). One draw call per variant, InstancedMesh-compatible.
 */

import * as THREE from 'three'
import { COLORS, SeededRNG } from '../../core/MeshFactory'
import {
  TRANSITION_TEXTURE_SIZE,
  makeTileCanvasTexture,
  makeTransitionTopTexture,
  maskDiamondEdge,
} from './transitionTexture'

// ─── Family colors (defined once here; referenced from VARIANTS so later
// ─── families harmonize against the same top / root palette) ───
/** Fresh, saturated grass top (Harvest-Moon palette): base fill of the
 *  top-face textures AND the cap-edge riser color of grass sides. Brighter
 *  and more saturated than COLORS.grass so the family reads vibrant green,
 *  not muddy. */
export const GRASS_TOP = 0x63b84f
/** Dark soil under grass (approved 2026-08-06 — keep exactly): warm dark
 *  brown, clearly darker than every top color, lifted off black so it reads
 *  as packed soil, not void. */
export const GRASS_ROOT = 0x4a3a2a
/** Deep rich earth under dirt: warmer and more saturated than GRASS_ROOT
 *  (r+36) so it reads as a different soil at a glance, still clearly darker
 *  and less yellow than the dirt top (0x9b7930). Lifted from 0x604020 on
 *  2026-08-06 (critic nit: rendered too near-black under preview lighting). */
export const DIRT_ROOT = 0x6e4a24
/** Dark tilled loam under tilled soil: the coolest/least saturated of the
 *  three roots so it reads as worked, broken-up soil — lifted from 0x3d3520
 *  on 2026-08-06 (critic nit: rendered black under preview lighting) but
 *  still clearly darker/desaturated vs COLORS.tilled (0x7b5e20) and distinct
 *  from both GRASS_ROOT (r+g) and DIRT_ROOT (saturation). */
export const TILLED_ROOT = 0x4e4832

// ─── Outline palette (convention §3, pinned 2026-08-06) ───
// Biome default outline colors — one named const, referenced from the
// VARIANTS manifest so the composer reads them from manifest metadata (via
// the factory mesh's userData), never from family code. Edge variants use
// their fromBiome (owner) color. Tunable; the showcase also demonstrates a
// GREEN alternative on part of the grass field (record-level outlineColor).
export const OUTLINE_COLORS = {
  /** Slight brown — the grass baseline outline (demoed against the green
   *  alternative in the showcase). */
  grass: 0x4e3d2e,
  /** Warm earth brown for dirt. */
  dirt: 0x6b4a2e,
  /** Dark worked-loam brown for tilled. */
  tilled: 0x4a3a26,
}

// ─── Tile anatomy constants ───
const TOP_Y = 0.45 // top face
const MID_Y = 0.20 // band split point: top band bottom / root band top
//                   (top band 0.20..0.45 = 0.25 ≈ 55%, root 0..0.20 = 0.20 ≈ 45%)
const BASE_BOT_Y = 0 // root band bottom
// Both bands share the same ±0.5 diamond footprint (straight-sided prism,
// convention §1) — there are NO inset steps/ledges between bands.
/** UV of the center of the reserved white pixel (0,0) of every top texture.
 *  NOTE: CanvasTexture uploads with flipY=true (image row 0 = top ends up at
 *  v=1), so the white pixel lives at v = 1 - WHITE_UV, not v = WHITE_UV. */
const WHITE_UV = 0.5 / TRANSITION_TEXTURE_SIZE
const WHITE_UV_V = 1 - WHITE_UV

// ─── Top-face textures (lazy, shared per variant) ───
const topTexCache = new Map()
// Every texture this module owns (cached top-face textures AND per-variant
// transition textures) is tracked here so dispose() frees each exactly once —
// the cached textures live in BOTH topTexCache and the per-variant shared
// cache, so a naive double loop would dispose them twice.
const ownedTextures = new Set()

function clamp255(v) {
  return Math.max(0, Math.min(255, v))
}

/** Subtle mottled grass top (used by grass-plain and grass-bushes). */
function getGrassTopTexture() {
  if (topTexCache.has('grass')) return topTexCache.get('grass')
  const tex = makeTileCanvasTexture(TRANSITION_TEXTURE_SIZE, (ctx, w, h) => {
    ctx.fillStyle = '#63b84f'
    ctx.fillRect(0, 0, w, h)
    const rng = new SeededRNG(1337)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    // Gentle, green-biased dither (±9, green channel slightly boosted) so the
    // top reads as soft mottled grass, not muddy voxel noise.
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng.next() - 0.5) * 9
      d[i] = clamp255(d[i] + n)
      d[i + 1] = clamp255(d[i + 1] + n * 1.2)
      d[i + 2] = clamp255(d[i + 2] + n)
    }
    ctx.putImageData(img, 0, 0)
    // Sparse grass-blade pixels (lighter/darker green)
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(rng.next() * w)
      const y = Math.floor(rng.next() * h)
      ctx.fillStyle = rng.next() > 0.5 ? '#7adf63' : '#4f9a3a'
      ctx.fillRect(x, y, 1, 1)
    }
    // Solid rim so the diamond silhouette renders as a crisp straight edge.
    maskDiamondEdge(ctx, w, GRASS_TOP)
  })
  topTexCache.set('grass', tex)
  ownedTextures.add(tex)
  return tex
}

/**
 * Grass top with scattered flower dots (canvas detail — NOT separate meshes).
 * Texture is shared per variant, so decoration variation is a DATA-level
 * choice (new variants with their own texture), never a per-instance seed.
 */
function getFlowerTopTexture() {
  if (topTexCache.has('flowers')) return topTexCache.get('flowers')
  const tex = makeTileCanvasTexture(TRANSITION_TEXTURE_SIZE, (ctx, w, h) => {
    ctx.fillStyle = '#63b84f'
    ctx.fillRect(0, 0, w, h)
    const rng = new SeededRNG(4242)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng.next() - 0.5) * 9
      d[i] = clamp255(d[i] + n)
      d[i + 1] = clamp255(d[i + 1] + n * 1.2)
      d[i + 2] = clamp255(d[i + 2] + n)
    }
    ctx.putImageData(img, 0, 0)
    // Flower dots (2x2 px + darker center) — keep away from the reserved (0,0)
    const flowerColors = ['#ffffff', '#ffe9a8', '#ffd1dc', '#ffb3d9', '#fff3b0']
    for (let i = 0; i < 14; i++) {
      const x = 2 + Math.floor(rng.next() * (w - 5))
      const y = 2 + Math.floor(rng.next() * (h - 5))
      ctx.fillStyle = flowerColors[Math.floor(rng.next() * flowerColors.length)]
      ctx.fillRect(x, y, 2, 2)
      ctx.fillStyle = '#e8c84a'
      ctx.fillRect(x + 1, y + 1, 1, 1)
    }
    // Solid rim so the diamond silhouette renders as a crisp straight edge.
    maskDiamondEdge(ctx, w, GRASS_TOP)
  })
  topTexCache.set('flowers', tex)
  ownedTextures.add(tex)
  return tex
}

/** Plain dirt top (dirt-plain tile). */
function getDirtTopTexture() {
  if (topTexCache.has('dirt')) return topTexCache.get('dirt')
  const tex = makeTileCanvasTexture(TRANSITION_TEXTURE_SIZE, (ctx, w, h) => {
    ctx.fillStyle = '#9b7930'
    ctx.fillRect(0, 0, w, h)
    const rng = new SeededRNG(777)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng.next() - 0.5) * 30
      d[i] = clamp255(d[i] + n)
      d[i + 1] = clamp255(d[i + 1] + n)
      d[i + 2] = clamp255(d[i + 2] + n)
    }
    ctx.putImageData(img, 0, 0)
    // Pebbles
    for (let i = 0; i < 10; i++) {
      const x = 1 + Math.floor(rng.next() * (w - 3))
      const y = 1 + Math.floor(rng.next() * (h - 3))
      ctx.fillStyle = rng.next() > 0.5 ? '#8a6820' : '#ab8940'
      ctx.fillRect(x, y, 1 + Math.floor(rng.next() * 2), 1 + Math.floor(rng.next() * 2))
    }
    // Solid rim so the diamond silhouette renders as a crisp straight edge.
    maskDiamondEdge(ctx, w, '#9b7930')
  })
  topTexCache.set('dirt', tex)
  ownedTextures.add(tex)
  return tex
}

/** Plain tilled top (grass-tilled tile — the tilled counterpart of dirt-plain):
 *  golden-olive base fill with the same mottle/pebble canvas language as the
 *  dirt top, flecked with darker worked-soil clods. */
function getTilledTopTexture() {
  if (topTexCache.has('tilled')) return topTexCache.get('tilled')
  const tex = makeTileCanvasTexture(TRANSITION_TEXTURE_SIZE, (ctx, w, h) => {
    ctx.fillStyle = '#7b5e20'
    ctx.fillRect(0, 0, w, h)
    const rng = new SeededRNG(5150)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng.next() - 0.5) * 30
      d[i] = clamp255(d[i] + n)
      d[i + 1] = clamp255(d[i + 1] + n)
      d[i + 2] = clamp255(d[i + 2] + n)
    }
    ctx.putImageData(img, 0, 0)
    // Worked-soil clods (darker tilledDark flecks + a few lighter crumbs)
    for (let i = 0; i < 10; i++) {
      const x = 1 + Math.floor(rng.next() * (w - 3))
      const y = 1 + Math.floor(rng.next() * (h - 3))
      ctx.fillStyle = rng.next() > 0.5 ? '#6a4e18' : '#8f6f26'
      ctx.fillRect(x, y, 1 + Math.floor(rng.next() * 2), 1 + Math.floor(rng.next() * 2))
    }
    // Solid rim so the diamond silhouette renders as a crisp straight edge.
    maskDiamondEdge(ctx, w, '#7b5e20')
  })
  topTexCache.set('tilled', tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Geometry building ───

function hexToColor(hex) {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

function pushTri(arrays, v0, v1, v2, color) {
  for (const v of [v0, v1, v2]) {
    arrays.positions.push(v.p[0], v.p[1], v.p[2])
    arrays.uvs.push(v.uv[0], v.uv[1])
    arrays.colors.push(color[0], color[1], color[2])
  }
}

/** Quad as 2 triangles with outward winding (v0,v2,v1),(v0,v3,v2). */
function pushQuad(arrays, v0, v1, v2, v3, color) {
  pushTri(arrays, v0, v2, v1, color)
  pushTri(arrays, v0, v3, v2, color)
}

const WHITE = [1, 1, 1]

/**
 * Builds the full tile prism (top cap + cap edge + root band) and optionally
 * merges a low-poly bush into the same single geometry.
 *
 * The prism is STRAIGHT-SIDED (convention §1): both bands share the same
 * ±0.5 diamond footprint, so the walls drop straight from the top cap to the
 * base with no see-through gaps. There are exactly TWO bands, distinguished
 * by COLOR only — the top slab's cap-edge riser (capColors, i.e. the
 * top-face color per side) and the root band (rootColors, per-biome dark
 * earth) — no middle side-wall band, no ledges/overhangs.
 *
 * @param {THREE.Texture} topTexture - 32x32 top-face canvas texture
 * @param {number[]} capColors - [NE, SE, SW, NW] cap-edge (riser) colors
 * @param {number[]} rootColors - [NE, SE, SW, NW] root-band side colors
 * @param {boolean} bush - merge the bush geometry (grass-bushes variant)
 */
function buildTileGeometry({ topTexture, capColors, rootColors, bush }) {
  const arrays = { positions: [], uvs: [], colors: [] }

  // ── Top cap (2 triangles, diamond mapped to the full UV square) ──
  const cap = [
    { p: [0, TOP_Y, 0.5], uv: [0.5, 1] }, // N
    { p: [0.5, TOP_Y, 0], uv: [1, 0.5] }, // E
    { p: [0, TOP_Y, -0.5], uv: [0.5, 0] }, // S
    { p: [-0.5, TOP_Y, 0], uv: [0, 0.5] }, // W
  ]
  pushTri(arrays, cap[0], cap[1], cap[2], WHITE)
  pushTri(arrays, cap[0], cap[2], cap[3], WHITE)

  // ── Cap edge risers (4 quads at the ±0.5 footprint, y MID_Y..TOP_Y):
  // ── the top slab's side thickness. They close the prism so the interior
  // ── never shows through. Color = the top-face color per side (grass/dirt/
  // ── tilled), so the top slab reads as one colored layer sitting on the
  // ── root band.
  const capRim = [
    { p: [0, TOP_Y, 0.5] }, // N
    { p: [0.5, TOP_Y, 0] }, // E
    { p: [0, TOP_Y, -0.5] }, // S
    { p: [-0.5, TOP_Y, 0] }, // W
  ]
  const capFoot = [
    { p: [0, MID_Y, 0.5] }, // N
    { p: [0.5, MID_Y, 0] }, // E
    { p: [0, MID_Y, -0.5] }, // S
    { p: [-0.5, MID_Y, 0] }, // W
  ]
  const edges = [
    [0, 1], // NE
    [1, 2], // SE
    [2, 3], // SW
    [3, 0], // NW
  ]
  for (let i = 0; i < 4; i++) {
    const [a, b] = edges[i]
    const va = capFoot[a]
    const vb = capFoot[b]
    const ta = capRim[a]
    const tb = capRim[b]
    const color = hexToColor(capColors[i])
    pushQuad(arrays,
      { p: ta.p, uv: [WHITE_UV, WHITE_UV_V] },
      { p: tb.p, uv: [WHITE_UV, WHITE_UV_V] },
      { p: vb.p, uv: [WHITE_UV, WHITE_UV_V] },
      { p: va.p, uv: [WHITE_UV, WHITE_UV_V] },
      color)
  }

  // ── Root band (4 quads, y MID_Y..BASE_BOT_Y, same ±0.5 footprint —
  // ── straight-sided, no ledge). One solid band per side in the biome's
  // ── dark-earth root color: the whole prism body below the top slab.
  const rootV = [
    { top: [0, MID_Y, 0.5], bot: [0, BASE_BOT_Y, 0.5] }, // N
    { top: [0.5, MID_Y, 0], bot: [0.5, BASE_BOT_Y, 0] }, // E
    { top: [0, MID_Y, -0.5], bot: [0, BASE_BOT_Y, -0.5] }, // S
    { top: [-0.5, MID_Y, 0], bot: [-0.5, BASE_BOT_Y, 0] }, // W
  ]
  for (let i = 0; i < 4; i++) {
    const [a, b] = edges[i]
    const va = rootV[a]
    const vb = rootV[b]
    const color = hexToColor(rootColors[i])
    const aTop = { p: va.top, uv: [WHITE_UV, WHITE_UV_V] }
    const bTop = { p: vb.top, uv: [WHITE_UV, WHITE_UV_V] }
    const aBot = { p: va.bot, uv: [WHITE_UV, WHITE_UV_V] }
    const bBot = { p: vb.bot, uv: [WHITE_UV, WHITE_UV_V] }
    pushQuad(arrays, aTop, bTop, bBot, aBot, color)
  }

  // ── Bush (merged into the same geometry, same material) ──
  if (bush) addBush(arrays)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colors, 3))
  geometry.computeVertexNormals() // non-indexed → per-face (flat) normals

  const material = new THREE.MeshLambertMaterial({
    map: topTexture,
    vertexColors: true,
    flatShading: true,
  })

  return { geometry, material }
}

/** Slightly darker leaf shade for the bush's top blob — lifted from
 *  COLORS.leafDark (0x2d7a2d), which read as near-black triangles at preview
 *  distance. Still shades the blob below the two other blobs, but keeps it on
 *  the family's brightness curve. */
const BUSH_SHADE = 0x45a245

/** Low-poly bush: 3 flattened icosahedron blobs in the tile's leaf palette. */
function addBush(arrays) {
  const blobs = [
    { x: -0.08, y: 0.56, z: -0.16, r: 0.16, sy: 0.8, color: COLORS.leaf },
    { x: 0.1, y: 0.52, z: -0.2, r: 0.13, sy: 0.85, color: COLORS.leafLight },
    { x: -0.05, y: 0.62, z: -0.1, r: 0.11, sy: 0.9, color: BUSH_SHADE },
  ]
  for (const b of blobs) addBlob(arrays, b)
}

function addBlob(arrays, { x, y, z, r, sy, color }) {
  const geo = new THREE.IcosahedronGeometry(r, 0)
  geo.toNonIndexed()
  const pos = geo.attributes.position
  const count = pos.count
  const c = new THREE.Color(color)
  for (let i = 0; i < count; i++) {
    arrays.positions.push(pos.getX(i) + x, pos.getY(i) * sy + y, pos.getZ(i) + z)
    arrays.uvs.push(WHITE_UV, WHITE_UV_V)
    arrays.colors.push(c.r, c.g, c.b)
  }
  geo.dispose()
}

// ─── Variant config ───

/**
 * Per-variant build config. sideBiomes order: [NE, SE, SW, NW] — the biome of
 * the top-face quarter adjacent to each side. Both the cap-edge riser color
 * (the top-face color of that quarter) and the root-band side color (that
 * biome's dark earth) are derived from it, so the prism always reads as one
 * slab of biome-colored earth per side, split on transition tiles to match
 * the top halves above them.
 * Transition semantics (see transitionTexture.js + TILE_SYSTEM_CONVENTION.md):
 * "<a>-<b>-<o>" = the biome named SECOND (colorA) occupies the <o> half; the
 * edge tile is placed at the FIRST biome's cell, orientation points AT the
 * second biome's neighbor. So grass-dirt-n = dirt toward north.
 */
function variantConfig(variant) {
  const grassSides = ['grass', 'grass', 'grass', 'grass']
  const dirtSides = ['dirt', 'dirt', 'dirt', 'dirt']
  const tilledSides = ['tilled', 'tilled', 'tilled', 'tilled']
  const capForSide = (s) =>
    s === 'dirt' ? COLORS.dirt : s === 'tilled' ? COLORS.tilled : GRASS_TOP
  const rootForSide = (s) =>
    s === 'dirt' ? DIRT_ROOT : s === 'tilled' ? TILLED_ROOT : GRASS_ROOT
  const config = (sideBiomes, rest) => ({
    capColors: sideBiomes.map(capForSide),
    rootColors: sideBiomes.map(rootForSide),
    ...rest,
  })
  switch (variant) {
    case 'grass-plain':
      return config(grassSides, { topTexture: getGrassTopTexture(), bush: false })
    case 'grass-flowers':
      return config(grassSides, { topTexture: getFlowerTopTexture(), bush: false })
    case 'grass-bushes':
      return config(grassSides, { topTexture: getGrassTopTexture(), bush: true })
    case 'grass-dirt-n':
      return config(['dirt', 'grass', 'grass', 'dirt'], {
        topTexture: makeTransitionTopTexture(COLORS.dirt, GRASS_TOP, 'n'),
        bush: false,
      })
    case 'grass-dirt-e':
      return config(['dirt', 'dirt', 'grass', 'grass'], {
        topTexture: makeTransitionTopTexture(COLORS.dirt, GRASS_TOP, 'e'),
        bush: false,
      })
    case 'grass-dirt-s':
      return config(['grass', 'dirt', 'dirt', 'grass'], {
        topTexture: makeTransitionTopTexture(COLORS.dirt, GRASS_TOP, 's'),
        bush: false,
      })
    case 'grass-dirt-w':
      return config(['grass', 'grass', 'dirt', 'dirt'], {
        topTexture: makeTransitionTopTexture(COLORS.dirt, GRASS_TOP, 'w'),
        bush: false,
      })
    case 'grass-tilled':
      // PLAIN tilled tile (round 6): solid tilled top, tilled riser on all
      // four sides, TILLED_ROOT band all around. NOT the n-edge anymore —
      // grass-tilled-n is the dedicated oriented n-edge variant.
      return config(tilledSides, {
        topTexture: getTilledTopTexture(),
        bush: false,
      })
    case 'grass-tilled-n':
      return config(['tilled', 'grass', 'grass', 'tilled'], {
        topTexture: makeTransitionTopTexture(COLORS.tilled, GRASS_TOP, 'n'),
        bush: false,
      })
    case 'grass-tilled-e':
      return config(['tilled', 'tilled', 'grass', 'grass'], {
        topTexture: makeTransitionTopTexture(COLORS.tilled, GRASS_TOP, 'e'),
        bush: false,
      })
    case 'grass-tilled-s':
      return config(['grass', 'tilled', 'tilled', 'grass'], {
        topTexture: makeTransitionTopTexture(COLORS.tilled, GRASS_TOP, 's'),
        bush: false,
      })
    case 'grass-tilled-w':
      return config(['grass', 'grass', 'tilled', 'tilled'], {
        topTexture: makeTransitionTopTexture(COLORS.tilled, GRASS_TOP, 'w'),
        bush: false,
      })
    case 'dirt-plain':
      return config(dirtSides, {
        topTexture: getDirtTopTexture(),
        bush: false,
      })
    default:
      throw new Error(`createGrassTile: unknown variant "${variant}"`)
  }
}

// ─── Shared per-variant cache (geometry/material/texture, built once) ───
const sharedCache = new Map()

function getShared(variant) {
  let entry = sharedCache.get(variant)
  if (entry) return entry
  const cfg = variantConfig(variant)
  const { geometry, material } = buildTileGeometry(cfg)
  entry = { geometry, material, texture: cfg.topTexture }
  sharedCache.set(variant, entry)
  ownedTextures.add(cfg.topTexture)
  return entry
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'grass-plain': {
    name: 'grass-plain',
    biome: 'grass',
    kind: 'plain',
    topColor: GRASS_TOP,
    baseColor: GRASS_ROOT,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-flowers': {
    name: 'grass-flowers',
    biome: 'grass',
    kind: 'decorated',
    topColor: GRASS_TOP,
    baseColor: GRASS_ROOT,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-bushes': {
    name: 'grass-bushes',
    biome: 'grass',
    kind: 'decorated',
    topColor: GRASS_TOP,
    baseColor: GRASS_ROOT,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-dirt-n': {
    name: 'grass-dirt-n',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 'n',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_ROOT, dirt: DIRT_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-dirt-e': {
    name: 'grass-dirt-e',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 'e',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_ROOT, dirt: DIRT_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-dirt-s': {
    name: 'grass-dirt-s',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 's',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_ROOT, dirt: DIRT_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-dirt-w': {
    name: 'grass-dirt-w',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 'w',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_ROOT, dirt: DIRT_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-tilled': {
    name: 'grass-tilled',
    biome: 'tilled',
    kind: 'plain',
    topColor: COLORS.tilled,
    baseColor: TILLED_ROOT,
    outlineColor: OUTLINE_COLORS.tilled,
  },
  'grass-tilled-n': {
    name: 'grass-tilled-n',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 'n',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_ROOT, tilled: TILLED_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-tilled-e': {
    name: 'grass-tilled-e',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 'e',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_ROOT, tilled: TILLED_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-tilled-s': {
    name: 'grass-tilled-s',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 's',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_ROOT, tilled: TILLED_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'grass-tilled-w': {
    name: 'grass-tilled-w',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 'w',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_ROOT, tilled: TILLED_ROOT },
    outlineColor: OUTLINE_COLORS.grass, // edges use their fromBiome (owner) color
  },
  'dirt-plain': {
    name: 'dirt-plain',
    biome: 'dirt',
    kind: 'plain',
    topColor: COLORS.dirt,
    baseColor: DIRT_ROOT,
    outlineColor: OUTLINE_COLORS.dirt,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='grass-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createGrassTile(variant = 'grass-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createGrassTile: unknown variant "${variant}"`)
  }
  const shared = getShared(variant)
  const mesh = new THREE.Mesh(shared.geometry, shared.material)
  mesh.userData.variant = variant
  mesh.userData.biome = VARIANTS[variant].biome
  mesh.userData.kind = VARIANTS[variant].kind
  // Outline frame metadata (convention §3): the composer derives outline
  // frame heights from these family constants — NOT from the geometry's
  // bounding box (the bush blobs would inflate it) — and the biome default
  // outline color from the manifest. `outlineColor` is the fromBiome (owner)
  // color for edge variants, the biome color for plains/decorated.
  mesh.userData.outlineTop = TOP_Y
  mesh.userData.outlineBase = BASE_BOT_Y
  mesh.userData.outlineColor = VARIANTS[variant].outlineColor
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Frees all shared geometry/materials/textures owned by this module. Textures
 * are disposed exactly once via ownedTextures (cached top-face textures live
 * in BOTH topTexCache and the per-variant shared cache — a naive double loop
 * would dispose them twice).
 */
export function dispose() {
  for (const entry of sharedCache.values()) {
    entry.geometry.dispose()
    entry.material.dispose()
  }
  sharedCache.clear()
  for (const tex of ownedTextures) tex.dispose()
  ownedTextures.clear()
  topTexCache.clear()
}