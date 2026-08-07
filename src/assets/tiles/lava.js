/**
 * LAVA biome family — Slice B pixel-art (extrapolated from the shared rules;
 * not pictured in the reference, so the universal style rules transfer).
 *
 * Same module convention as grass.js: ONE single-section prism (top face
 * ~0.34, base 0), pixel-art top texture through the shared painter
 * (src/assets/pixelart/pixelPainter.js), banded darker side faces via
 * vertex colors, InstancedMesh-safe, VARIANTS manifest, createLavaTile,
 * dispose().
 *
 * Style: dark ember base with bright orange/yellow cracks and glow pools —
 * strong contrast like water (bright highlights against deep shadow). The
 * baked outline is near-black ember; the ribbon outlineColor is warm ember
 * orange.
 *
 * Variants: lava-plain.
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

/** Dark ember base. */
export const LAVA_TOP = 0x8a2c14
/** Bright orange crack / glow tone. */
export const LAVA_ORANGE = 0xff7a1a
/** Hot yellow crack / glow tone. */
export const LAVA_YELLOW = 0xffc832
/** Bright yellow-white glow pool tone. */
export const LAVA_GLOW = 0xffe08a
/** Rim highlight (glowing ember edge). */
export const LAVA_LIGHT = 0xff8a3a
/** Deep ember shadow. */
export const LAVA_SHADOW = 0x4a140a
/** Baked-in texture outline (near-black ember — never pure black). */
export const LAVA_OUTLINE = 0x3d0f08
/** Side-face base color (1-2 steps darker than the top). */
export const LAVA_SIDE = 0x6e2412
/** Ribbon outlineColor (Slice B pinned: warm ember orange). */
export const LAVA_RIBBON_OUTLINE = 0xd4561c

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
  let g = geometryCache.get('lava')
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, [LAVA_SIDE, LAVA_SIDE, LAVA_SIDE, LAVA_SIDE])
    geometryCache.set('lava', g)
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

/** Lava top: bright orange/yellow cracks + glow pools on a dark ember base,
 *  strong contrast (bright rim light, deep ember SE shadow). */
function makeLavaTopTexture(seed) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(LAVA_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, LAVA_TOP, 1)
    const rng = new SeededRNG(seed)
    // meandering bright cracks (the lava's fissures)
    paintNoise(ctx, {
      rng,
      base: LAVA_TOP,
      accents: [LAVA_ORANGE, LAVA_YELLOW],
      density: 9,
      clumpSize: 2,
      style: 'cracks',
    })
    // glow pools (clusters of yellow/white ember)
    paintNoise(ctx, {
      rng,
      base: LAVA_TOP,
      accents: [{ color: LAVA_YELLOW, weight: 2 }, LAVA_GLOW, LAVA_ORANGE],
      density: 12,
      clumpSize: 2,
      style: 'sparkle',
    })
    // strong contrast like water: bright rim highlight + deep ember shadow
    paintAboveLeftShading(ctx, { rng, light: LAVA_LIGHT, shadow: LAVA_SHADOW, shadowDensity: 12 })
    paintJaggedOutline(ctx, { rng, color: LAVA_OUTLINE })
  })
}

function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'lava-plain':
      tex = makeLavaTopTexture(7001)
      break
    default:
      throw new Error(`lava: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'lava-plain': {
    name: 'lava-plain',
    biome: 'lava',
    kind: 'plain',
    topColor: LAVA_TOP,
    baseColor: LAVA_SIDE,
    outlineColor: LAVA_RIBBON_OUTLINE,
  },
}

/**
 * Factory: returns a single merged Mesh for the given variant (InstancedMesh
 * compatible — one geometry, one material, vertex colors for hover).
 *
 * @param {string} [variant='lava-plain'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createLavaTile(variant = 'lava-plain') {
  if (!VARIANTS[variant]) {
    throw new Error(`createLavaTile: unknown variant "${variant}"`)
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
export const createTile = (variant) => createLavaTile(variant)