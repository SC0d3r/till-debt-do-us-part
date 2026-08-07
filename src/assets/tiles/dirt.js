/**
 * DIRT biome family — Slice B pixel-art.
 *
 * Same module convention as grass.js: ONE single-section prism (top face
 * ~0.34, base 0), pixel-art top texture through the shared painter
 * (src/assets/pixelart/pixelPainter.js), banded darker side faces via
 * vertex colors, InstancedMesh-safe (one merged geometry + one material per
 * variant), VARIANTS manifest, createDirtTile(variant), dispose().
 *
 * Dirt was split out of the grass family into its own module (grass now
 * ships ONLY plain grass variants). The palette and texture generator were
 * moved verbatim from the old grass.js so the dirt look is unchanged.
 *
 * Per the reference document: packed warm earth with clumps, meandering
 * cracks and a fine grain, gentle above-left shading, warm-brown outline.
 * The ribbon outlineColor is warm earth brown.
 *
 * Variants: dirt-plain, dirt-plain-b (2 texture variants so large dirt
 * areas never look stamped).
 */

import * as THREE from 'three'
import { COLORS, SeededRNG } from '../../core/procedural'
import { TILE_TEXTURE_SIZE } from './tileTexture'
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

/** Dirt top-face palette (dirt-plain / dirt-plain-b). base = COLORS.dirt. */
export const DIRT_LIGHT = 0xab8940
export const DIRT_DARK = 0x7f5f24
export const DIRT_CRACK = 0x6a4e1c
export const DIRT_HILITE = 0xb2954e
export const DIRT_SHADOW = 0x765822
export const DIRT_OUTLINE = 0x503a14
export const DIRT_SIDE = 0x7a5d24

// ─── Outline palette (convention §3 + Slice B pinned biome colors) ───
// Biome default outline colors — one named const, referenced from the
// VARIANTS manifest so the composer reads them from manifest metadata (via
// the factory mesh's userData), never from family code.
export const OUTLINE_COLORS = {
  /** Warm earth brown — Slice B pinned dirt ribbon outline. */
  dirt: 0x6b4a2e,
}

const TOP_Y = 0.34
const BASE_BOT_Y = 0
const SIZE = TILE_TEXTURE_SIZE

// ─── Shared resources (lazy, module scope, disposed exactly once) ───
const topTexCache = new Map()
const geometryCache = new Map()
const materialCache = new Map()
const ownedTextures = new Set()
const ownedGeometries = new Set()

function getGeometry() {
  let g = geometryCache.get('dirt')
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, [DIRT_SIDE, DIRT_SIDE, DIRT_SIDE, DIRT_SIDE])
    geometryCache.set('dirt', g)
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

/** Dirt top: packed soil with clumps + meandering cracks. */
function makeDirtTopTexture(seed, opts = {}) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(COLORS.dirt)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, COLORS.dirt, 1)
    const rng = new SeededRNG(seed)
    paintNoise(ctx, {
      rng,
      base: COLORS.dirt,
      accents: [DIRT_LIGHT, DIRT_DARK],
      density: opts.clumpDensity ?? 16,
      clumpSize: 2,
      style: 'clumps',
    })
    paintNoise(ctx, {
      rng,
      base: COLORS.dirt,
      accents: [DIRT_CRACK],
      density: opts.crackDensity ?? 5,
      clumpSize: 2,
      style: 'cracks',
    })
    paintNoise(ctx, {
      rng,
      base: COLORS.dirt,
      accents: [DIRT_LIGHT],
      density: opts.grainDensity ?? 8,
      clumpSize: 1,
      style: 'grain',
    })
    paintAboveLeftShading(ctx, { rng, light: DIRT_HILITE, shadow: DIRT_SHADOW })
    paintJaggedOutline(ctx, { rng, color: DIRT_OUTLINE })
  })
}

function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'dirt-plain':
      tex = makeDirtTopTexture(777)
      break
    case 'dirt-plain-b':
      tex = makeDirtTopTexture(778, { clumpDensity: 20, crackDensity: 7, grainDensity: 5 })
      break
    default:
      throw new Error(`dirt: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'dirt-plain': {
    name: 'dirt-plain',
    biome: 'dirt',
    kind: 'plain',
    topColor: COLORS.dirt,
    baseColor: DIRT_SIDE,
    outlineColor: OUTLINE_COLORS.dirt,
  },
  'dirt-plain-b': {
    name: 'dirt-plain-b',
    biome: 'dirt',
    kind: 'plain',
    topColor: COLORS.dirt,
    baseColor: DIRT_SIDE,
    outlineColor: OUTLINE_COLORS.dirt,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='dirt-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createDirtTile(variant = 'dirt-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createDirtTile: unknown variant "${variant}"`)
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
export const createTile = (variant) => createDirtTile(variant)