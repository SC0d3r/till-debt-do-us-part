/**
 * SAND biome family — Slice B pixel-art.
 *
 * Same module convention as grass.js: ONE single-section prism (top face
 * ~0.34, base 0), pixel-art top texture through the shared painter
 * (src/assets/pixelart/pixelPainter.js), banded darker side faces via
 * vertex colors, InstancedMesh-safe, VARIANTS manifest, createSandTile,
 * dispose().
 *
 * Per the reference document: warm beige/tan base, fine grain that CLUSTERS
 * (never uniform scatter), subtle almost-white highlights, gentle overall
 * shading (lowest contrast of the set), soft warm-brown outline. The ribbon
 * outlineColor is warm brown.
 *
 * Variants: sand-plain, sand-plain-b (2 texture variants).
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

/** Warm beige / light tan base. */
export const SAND_TOP = 0xdcc290
/** Darker tan grain. */
export const SAND_DARK = 0xc4a76a
/** Soft brown pebble grain. */
export const SAND_BROWN = 0xa8895a
/** Almost-white highlight on the highest grains. */
export const SAND_LIGHT = 0xf0e2bc
/** Gentle shadow tone. */
export const SAND_SHADOW = 0xb99a66
/** Baked-in texture outline (dark warm brown — never black). */
export const SAND_OUTLINE = 0x8a6a3a
/** Side-face base color (1-2 steps darker than the top). */
export const SAND_SIDE = 0xb59a63
/** Ribbon outlineColor (Slice B pinned: warm brown). */
export const SAND_RIBBON_OUTLINE = 0x9a7440

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
  let g = geometryCache.get('sand')
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, [SAND_SIDE, SAND_SIDE, SAND_SIDE, SAND_SIDE])
    geometryCache.set('sand', g)
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

/** Sand top: clustered fine grain + a few pebbles, gentle shading. */
function makeSandTopTexture(seed, opts = {}) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(SAND_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, SAND_TOP, 1)
    const rng = new SeededRNG(seed)
    // fine grain that clusters (never uniform scatter)
    paintNoise(ctx, {
      rng,
      base: SAND_TOP,
      accents: [SAND_DARK, SAND_BROWN, SAND_LIGHT],
      density: opts.grainDensity ?? 26,
      clumpSize: 1,
      style: 'grain',
    })
    // a few soft pebbles (clumped)
    paintNoise(ctx, {
      rng,
      base: SAND_TOP,
      accents: [SAND_BROWN, SAND_DARK],
      density: opts.pebbleDensity ?? 6,
      clumpSize: 2,
      style: 'clumps',
    })
    // gentle overall shading — subtle highlights, soft shadows
    paintAboveLeftShading(ctx, { rng, light: SAND_LIGHT, shadow: SAND_SHADOW, shadowDensity: 8 })
    // softer, less aggressive outline than dirt
    paintJaggedOutline(ctx, { rng, color: SAND_OUTLINE, skipChance: 0.42 })
  })
}

function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'sand-plain':
      tex = makeSandTopTexture(6001)
      break
    case 'sand-plain-b':
      tex = makeSandTopTexture(6002, { grainDensity: 32, pebbleDensity: 4 })
      break
    default:
      throw new Error(`sand: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'sand-plain': {
    name: 'sand-plain',
    biome: 'sand',
    kind: 'plain',
    topColor: SAND_TOP,
    baseColor: SAND_SIDE,
    outlineColor: SAND_RIBBON_OUTLINE,
  },
  'sand-plain-b': {
    name: 'sand-plain-b',
    biome: 'sand',
    kind: 'plain',
    topColor: SAND_TOP,
    baseColor: SAND_SIDE,
    outlineColor: SAND_RIBBON_OUTLINE,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='sand-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createSandTile(variant = 'sand-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createSandTile: unknown variant "${variant}"`)
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
export const createTile = (variant) => createSandTile(variant)