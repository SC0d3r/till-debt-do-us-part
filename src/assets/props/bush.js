/**
 * BUSH family — reference document two, item 3, plus the biome-palette-swap
 * convention (Slice B doc §4: "the snow bush is one geometry with its palette
 * resolved per-biome, not a second hand-built asset") — SOLID rework.
 *
 * One dense emerald shrub re-imagined as a real 3D object: a dark plinth plus
 * FOUR stacked tapered hexagon tiers forming a rounded dome (slightly wider
 * than tall, deliberately lumpy tier offsets so the silhouette is leafy and
 * irregular). Every tier's top face carries the detailed leaf-clump art
 * (lime highlights upper-left, forest-dark clusters, near-black shadow
 * pockets toward the lower-right, broken dark-forest outline just inside the
 * silhouette) — the tile system's "detailed noisy top, darker banded sides"
 * rule. The visible side walls carry the 3-band darker treatment + per-wall
 * above-left shade, so the dome reads as a lit solid from the south camera.
 *
 * The family ships three palette-resolved variants:
 *
 *   bush       — emerald (reference item 3, to the letter)
 *   bush-snow  — the same shape in the snow palette (white drifts + cool
 *                gray-blue shadows + cool pale blue outline)
 *   dry-shrub  — a SPARSER two-tier shape with bare twig prisms in the dry
 *                palette (muted tan, brown shadow pockets, dry-light
 *                highlights) — the same family, withered.
 *
 * All three read as one family under the same above-left light. Medium visual
 * weight (world height 0.2 for the green bush; dry-shrub ~0.16).
 *
 * Palette per variant: 5 colors incl. outline (tight, per the reference).
 *
 * Socket: center (max 1) for all three. InstancedMesh-safe: ONE merged
 * geometry per shape (dome or sparse) + one material per variant.
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildPrism,
  buildBase,
  mergePropParts,
  paintPrismTop,
  polygonPoints,
  polyToPixels,
} from './propBase'

// ─── Per-variant palettes (same shape, biome-resolved tones) ───
const EMERALD = {
  e: 0x2f9e44, // emerald base
  d: 0x1f6b2e, // forest dark leaf clusters
  k: 0x14421d, // near-black green shadow pockets
  l: 0x8fd95e, // lime upper-left highlights
  O: 0x123d1a, // outline — dark forest green (never black)
}
const SNOW = {
  e: 0xeaf1f8, // snow base
  d: 0xc8d6e4, // cool gray-blue drifts
  k: 0xa8bcd0, // cool shadow pockets
  l: 0xffffff, // pure white caps
  O: 0x7e93ad, // outline — cool pale blue
}
const DRY = {
  e: 0xa08a5a, // muted tan base
  d: 0x7a6538, // dry brown clusters
  k: 0x55442a, // withered shadow pockets
  l: 0xc4ae7a, // dry-light highlights
  O: 0x3d3018, // outline — dark warm brown
}

/** Canvas side (64): one 32x32 top-art rect per dome tier. */
const SIZE = 64
const R1 = { x: 0, y: 0, w: 32, h: 32 }
const R2 = { x: 32, y: 0, w: 32, h: 32 }
const R3 = { x: 0, y: 32, w: 32, h: 32 }
const R4 = { x: 32, y: 32, w: 32, h: 32 }

/** Per-variant texture options (sparser + spikier = dry shrub). */
const VARIANT_OPTS = {
  bush: { seed: 9001, density: 16 },
  'bush-snow': { seed: 9002, density: 14 },
  'dry-shrub': { seed: 9003, density: 8 },
}

// ─── Shared resources (module scope, built once, disposed exactly once) ───
const geometryCache = new Map() // 'dome' | 'sparse' → geometry
const materialCache = new Map() // variant → material
const ownedTextures = new Set()

function getGeometry(variant) {
  const key = variant === 'dry-shrub' ? 'sparse' : 'dome'
  if (geometryCache.has(key)) return geometryCache.get(key)
  const parts = []
  if (key === 'dome') {
    parts.push(buildBase({ r: 0.115, sideColor: EMERALD.d, size: SIZE }))
    // Rounded dome: 4 tapered tiers, offset for an irregular leafy silhouette.
    const tiers = [
      { r: 0.105, rTop: 0.1, y0: 0.036, y1: 0.095, off: [-0.01, 0.005], uv: R1 },
      { r: 0.08, rTop: 0.074, y0: 0.095, y1: 0.14, off: [0.012, -0.004], uv: R2 },
      { r: 0.055, rTop: 0.05, y0: 0.14, y1: 0.175, off: [-0.008, 0.01], uv: R3 },
      { r: 0.03, rTop: 0.027, y0: 0.175, y1: 0.2, off: [0.004, 0.002], uv: R4 },
    ]
    for (const t of tiers) {
      const g = buildPrism({
        pts: polygonPoints(6, t.r),
        ptsTop: polygonPoints(6, t.rTop),
        y0: t.y0,
        y1: t.y1,
        uv: t.uv,
        size: SIZE,
        sideColor: EMERALD.e,
      })
      g.translate(t.off[0], 0, t.off[1])
      parts.push(g)
    }
  } else {
    parts.push(buildBase({ r: 0.09, sideColor: DRY.d, size: SIZE }))
    const tiers = [
      { r: 0.08, rTop: 0.075, y0: 0.036, y1: 0.09, off: [-0.008, 0.004], uv: R1 },
      { r: 0.055, rTop: 0.05, y0: 0.09, y1: 0.13, off: [0.01, -0.005], uv: R2 },
    ]
    for (const t of tiers) {
      const g = buildPrism({
        pts: polygonPoints(6, t.r),
        ptsTop: polygonPoints(6, t.rTop),
        y0: t.y0,
        y1: t.y1,
        uv: t.uv,
        size: SIZE,
        sideColor: DRY.e,
      })
      g.translate(t.off[0], 0, t.off[1])
      parts.push(g)
    }
    // Bare twigs rising from the upper tier — the withered skeleton.
    const twigs = [
      { off: [-0.035, 0.008], rotX: -0.5, rotZ: 0.2 },
      { off: [0.04, -0.012], rotX: 0.35, rotZ: -0.35 },
    ]
    for (const tw of twigs) {
      const g = buildPrism({
        pts: polygonPoints(6, 0.009),
        ptsTop: polygonPoints(6, 0.004),
        y0: 0.13,
        y1: 0.19,
        uv: R1,
        size: SIZE,
        sideColor: DRY.d,
        capColor: DRY.k,
      })
      const m = new THREE.Matrix4().makeTranslation(tw.off[0], 0, tw.off[1])
        .multiply(new THREE.Matrix4().makeTranslation(0, 0.13, 0))
        .multiply(new THREE.Matrix4().makeRotationX(tw.rotX))
        .multiply(new THREE.Matrix4().makeRotationZ(tw.rotZ))
        .multiply(new THREE.Matrix4().makeTranslation(0, -0.13, 0))
      g.applyMatrix4(m)
      parts.push(g)
    }
  }
  const geometry = mergePropParts(parts)
  geometryCache.set(key, geometry)
  return geometry
}

function getMaterial(variant) {
  let m = materialCache.get(variant)
  if (!m) {
    const palette = variant === 'bush-snow' ? SNOW : variant === 'dry-shrub' ? DRY : EMERALD
    const { seed, density } = VARIANT_OPTS[variant]
    m = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rects = variant === 'dry-shrub' ? [R1, R2] : [R1, R2, R3, R4]
        const radii = variant === 'dry-shrub' ? [0.08, 0.055] : [0.105, 0.08, 0.055, 0.03]
        for (let i = 0; i < rects.length; i++) {
          const rng = new SeededRNG(seed + i * 31)
          const pts = polyToPixels(rects[i], polygonPoints(6, radii[i]))
          paintPrismTop(ctx, {
            pts,
            rng,
            base: palette.e,
            accents: [palette.d, palette.k, { color: palette.l, weight: 0.8 }],
            density,
            style: 'clumps',
            light: palette.l,
            shadow: palette.k,
            shadowPools: 7,
            outline: palette.O,
            outlineSkip: variant === 'dry-shrub' ? 0.22 : 0.14,
          })
        }
      })
    )
    ownedTextures.add(m.map)
    materialCache.set(variant, m)
  }
  return m
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  bush: {
    name: 'bush',
    socket: 'center',
    max: 1,
    height: 0.2,
    hostTile: 'grass-plain',
  },
  'bush-snow': {
    name: 'bush-snow',
    socket: 'center',
    max: 1,
    height: 0.2,
    hostTile: 'snow-plain',
  },
  'dry-shrub': {
    name: 'dry-shrub',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'sand-plain',
  },
}

/**
 * Factory: returns the single merged bush Mesh for the variant
 * (InstancedMesh-safe — one shared geometry per shape, one material per
 * variant).
 *
 * @param {string} [name='bush'] - key of VARIANTS ('bush' | 'bush-snow' | 'dry-shrub')
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'bush') {
  if (!VARIANTS[name]) {
    throw new Error(`bush: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(name), getMaterial(name))
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named aliases for direct imports. */
export const createBush = createProp
export const createBushSnow = (name = 'bush-snow') => createProp(name)
export const createDryShrub = (name = 'dry-shrub') => createProp(name)

/** Frees the shared geometries + all variant materials/textures exactly once. */
export function dispose() {
  for (const g of geometryCache.values()) g.dispose()
  geometryCache.clear()
  for (const m of materialCache.values()) m.dispose()
  materialCache.clear()
  for (const tex of ownedTextures) tex.dispose()
  ownedTextures.clear()
}
