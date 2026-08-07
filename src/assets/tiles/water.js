/**
 * WATER biome family — Slice B pixel-art.
 *
 * Same module convention as grass.js: ONE single-section prism (top face
 * ~0.34, base 0), pixel-art top texture through the shared painter
 * (src/assets/pixelart/pixelPainter.js), banded darker side faces via
 * vertex colors, InstancedMesh-safe (one merged geometry + one material per
 * variant), VARIANTS manifest, createWaterTile(variant), dispose().
 *
 * Per the reference document, water has the STRONGEST contrast of the whole
 * set: bright white/light-blue sparkle highlights that POOL, a mid cyan-blue
 * base, and deeper navy pooling. The baked outline is deep navy; the ribbon
 * outlineColor is deep blue.
 *
 * Variants: water-plain, water-plain-b (2 texture variants so large water
 * areas never look stamped).
 */

import * as THREE from 'three'
import { SeededRNG } from '../../core/procedural'
import {
  TRANSITION_TEXTURE_SIZE,
} from './transitionTexture'
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

/** Bright cyan-blue base. */
export const WATER_TOP = 0x3fb6d8
/** Light-cyan sparkle / rim highlight tone. */
export const WATER_LIGHT = 0xbfe8f5
/** Pure-white sparkle pixels (specular highlights). */
export const WATER_WHITE = 0xffffff
/** Mid light-blue sparkle tone. */
export const WATER_MID = 0x9fdcf0
/** Deep navy depth-pool tone. */
export const WATER_NAVY = 0x1a5f7d
/** Baked-in texture outline (deep navy — never black). */
export const WATER_OUTLINE = 0x143d52
/** Side-face base color (1-2 steps darker than the top). */
export const WATER_SIDE = 0x2a7fa0
/** Ribbon outlineColor (Slice B pinned: deep blue). */
export const WATER_RIBBON_OUTLINE = 0x1c4e6e

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
  let g = geometryCache.get('water')
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, [WATER_SIDE, WATER_SIDE, WATER_SIDE, WATER_SIDE])
    geometryCache.set('water', g)
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

/** Water top: navy depth pools + pooling white/cyan sparkles + strong
 *  above-left contrast (bright rim highlight, deep navy SE shadow pools). */
function makeWaterTopTexture(seed, opts = {}) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(WATER_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, WATER_TOP, 1)
    const rng = new SeededRNG(seed)
    // low-frequency navy depth pools
    paintNoise(ctx, {
      rng,
      base: WATER_TOP,
      accents: [WATER_NAVY],
      density: opts.navyDensity ?? 10,
      clumpSize: 2,
      style: 'clumps',
    })
    // sparkle highlights that POOL (1-4px white/light-blue clusters)
    paintNoise(ctx, {
      rng,
      base: WATER_TOP,
      accents: [{ color: WATER_WHITE, weight: 2 }, WATER_MID],
      density: opts.sparkleDensity ?? 16,
      clumpSize: 2,
      style: 'sparkle',
    })
    // strongest contrast of the set: bright rim highlight + deep navy pooling
    paintAboveLeftShading(ctx, { rng, light: WATER_LIGHT, shadow: WATER_NAVY, shadowDensity: 14 })
    paintJaggedOutline(ctx, { rng, color: WATER_OUTLINE })
  })
}

function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'water-plain':
      tex = makeWaterTopTexture(5001)
      break
    case 'water-plain-b':
      tex = makeWaterTopTexture(5002, { navyDensity: 14, sparkleDensity: 20 })
      break
    default:
      throw new Error(`water: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'water-plain': {
    name: 'water-plain',
    biome: 'water',
    kind: 'plain',
    topColor: WATER_TOP,
    baseColor: WATER_SIDE,
    outlineColor: WATER_RIBBON_OUTLINE,
  },
  'water-plain-b': {
    name: 'water-plain-b',
    biome: 'water',
    kind: 'plain',
    topColor: WATER_TOP,
    baseColor: WATER_SIDE,
    outlineColor: WATER_RIBBON_OUTLINE,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='water-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createWaterTile(variant = 'water-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createWaterTile: unknown variant "${variant}"`)
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

/** Uniform alias so the tile registry can call every family identically. */
export const createTile = (variant) => createWaterTile(variant)