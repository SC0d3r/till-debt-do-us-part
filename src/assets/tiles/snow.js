/**
 * SNOW biome family — Slice B pixel-art (extrapolated from the shared rules;
 * not pictured in the reference, so the universal style rules transfer).
 *
 * Same module convention as grass.js: ONE single-section prism (top face
 * ~0.34, base 0), pixel-art top texture through the shared painter
 * (src/assets/pixelart/pixelPainter.js), banded darker side faces via
 * vertex colors, InstancedMesh-safe, VARIANTS manifest, createSnowTile,
 * dispose().
 *
 * Style: cool pale blue-white base, clustered grain, subtle cool shadows
 * (gentle contrast like sand). The baked outline is cool pale blue; the
 * ribbon outlineColor is cool pale blue.
 *
 * Variants: snow-plain, snow-plain-b (2 texture variants).
 */

import * as THREE from 'three'
import { SeededRNG } from '../../core/procedural'
import { TRANSITION_TEXTURE_SIZE } from './transitionTexture'
import {
  makePixelTexture,
  paintNoise,
  paintAboveLeftShading,
  paintJaggedOutline,
  maskDiamondEdge,
  cssColor,
} from '../pixelart/pixelPainter'
import { buildTilePrism } from './tilePrism'

// ─── Family colors (defined once here; referenced from VARIANTS) ───

/** Cool pale blue-white base. */
export const SNOW_TOP = 0xdfe9f2
/** Pure-white grain highlight. */
export const SNOW_WHITE = 0xffffff
/** Cool gray-blue grain. */
export const SNOW_GRAY = 0xb9c9da
/** Cool shadow tone. */
export const SNOW_SHADOW = 0x9fb2c9
/** Baked-in texture outline (cool pale blue — never black). */
export const SNOW_OUTLINE = 0x7e93ad
/** Side-face base color (1-2 steps darker than the top). */
export const SNOW_SIDE = 0xc6d3e2
/** Ribbon outlineColor (Slice B pinned: cool pale blue). */
export const SNOW_RIBBON_OUTLINE = 0x8ea9c9

const TOP_Y = 0.34
const BASE_BOT_Y = 0
const SIZE = TRANSITION_TEXTURE_SIZE

// ─── Shared resources (lazy, module scope, disposed exactly once) ───
const topTexCache = new Map()
const geometryCache = new Map()
const materialCache = new Map()
const ownedTextures = new Set()
const ownedGeometries = new Set()

function getGeometry() {
  let g = geometryCache.get('snow')
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, [SNOW_SIDE, SNOW_SIDE, SNOW_SIDE, SNOW_SIDE])
    geometryCache.set('snow', g)
    ownedGeometries.add(g)
  }
  return g
}

function getMaterial(variant, topTexture) {
  let m = materialCache.get(variant)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: topTexture, vertexColors: true, flatShading: true })
    materialCache.set(variant, m)
  }
  return m
}

/** Snow top: clustered white/cool-gray grain + subtle cool shadows. */
function makeSnowTopTexture(seed, opts = {}) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(SNOW_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, SNOW_TOP, 1)
    const rng = new SeededRNG(seed)
    // clustered grain — white and cool gray-blue
    paintNoise(ctx, {
      rng,
      base: SNOW_TOP,
      accents: [SNOW_WHITE, SNOW_GRAY],
      density: opts.grainDensity ?? 24,
      clumpSize: 1,
      style: 'grain',
    })
    // a few soft snow-drift clumps
    paintNoise(ctx, {
      rng,
      base: SNOW_TOP,
      accents: [SNOW_GRAY],
      density: opts.driftDensity ?? 6,
      clumpSize: 2,
      style: 'clumps',
    })
    // subtle cool shading
    paintAboveLeftShading(ctx, { rng, light: SNOW_WHITE, shadow: SNOW_SHADOW, shadowDensity: 8 })
    paintJaggedOutline(ctx, { rng, color: SNOW_OUTLINE, skipChance: 0.4 })
  })
}

function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'snow-plain':
      tex = makeSnowTopTexture(8001)
      break
    case 'snow-plain-b':
      tex = makeSnowTopTexture(8002, { grainDensity: 30, driftDensity: 4 })
      break
    default:
      throw new Error(`snow: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'snow-plain': {
    name: 'snow-plain',
    biome: 'snow',
    kind: 'plain',
    topColor: SNOW_TOP,
    baseColor: SNOW_SIDE,
    outlineColor: SNOW_RIBBON_OUTLINE,
  },
  'snow-plain-b': {
    name: 'snow-plain-b',
    biome: 'snow',
    kind: 'plain',
    topColor: SNOW_TOP,
    baseColor: SNOW_SIDE,
    outlineColor: SNOW_RIBBON_OUTLINE,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='snow-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createSnowTile(variant = 'snow-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createSnowTile: unknown variant "${variant}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial(variant, getTopTexture(variant)))
  mesh.userData.variant = variant
  mesh.userData.biome = VARIANTS[variant].biome
  mesh.userData.kind = VARIANTS[variant].kind
  mesh.userData.outlineTop = TOP_Y
  mesh.userData.outlineBase = BASE_BOT_Y
  mesh.userData.outlineColor = VARIANTS[variant].outlineColor
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose() {
  for (const g of ownedGeometries) g.dispose()
  ownedGeometries.clear()
  geometryCache.clear()
  for (const m of materialCache.values()) m.dispose()
  materialCache.clear()
  for (const tex of ownedTextures) tex.dispose()
  ownedTextures.clear()
  topTexCache.clear()
}