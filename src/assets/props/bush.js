/**
 * BUSH family — reference document two, item 3, plus the biome-palette-swap
 * convention (Slice B doc §4: "the snow bush is one geometry with its palette
 * resolved per-biome, not a second hand-built asset").
 *
 * One dense emerald shrub (rounded, slightly wider than tall, deliberately
 * SPIKY leafy silhouette, 2-4px leaf blobs, near-black green shadow pockets
 * in the center/lower half, lime highlights upper-left, dark-forest broken
 * outline following every protruding leaf) built once as a shared blob sprite;
 * the family ships three palette-resolved variants on the SAME geometry:
 *
 *   bush       — emerald (reference item 3, to the letter)
 *   bush-snow  — the same shape in the snow palette (white drifts + cool
 *                gray-blue shadows + cool pale blue outline)
 *   dry-shrub  — the same shape in the dry/withered palette (muted tan,
 *                brown shadow pockets, dry-light highlights)
 *
 * All three read as one family under the same above-left light. Medium visual
 * weight (world height 0.2) for the green bush; dry-shrub paints sparser
 * (fewer clumps, more twig spikes) so it reads withered, on the same geometry.
 *
 * Palette per variant: 5 colors incl. outline (tight, per the reference).
 *
 * Socket: center (max 1) for all three. InstancedMesh-safe: ONE shared merged
 * crossed-quad geometry + one material per variant (texture differs only).
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildCrossedQuadGeometry,
  paintBlobSprite,
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

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 6, y: 16, w: 20, h: 16 }
/** On-screen world height of the sprite (medium weight). */
const WORLD_HEIGHT = 0.2

/** Per-variant texture options (sparser + spikier = dry shrub). */
const VARIANT_OPTS = {
  bush: { seed: 9001, clumpCount: 9, spikeCount: 9, outlineSkip: 0.16 },
  'bush-snow': { seed: 9002, clumpCount: 9, spikeCount: 9, outlineSkip: 0.2 },
  'dry-shrub': { seed: 9003, clumpCount: 5, spikeCount: 12, outlineSkip: 0.22, lightBias: 0.2 },
}

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
const materialCache = new Map() // variant → material
const ownedTextures = new Set()

function getGeometry() {
  if (!geometry) {
    geometry = buildCrossedQuadGeometry({ worldHeight: WORLD_HEIGHT, spriteRect: SPRITE_RECT })
  }
  return geometry
}

function makeTexture(variant) {
  const { seed, ...opts } = VARIANT_OPTS[variant]
  const palette = variant === 'bush-snow' ? SNOW : variant === 'dry-shrub' ? DRY : EMERALD
  return makePropTexture((ctx) => {
    paintBlobSprite(ctx, new SeededRNG(seed), palette, {
      bounds: SPRITE_RECT,
      cx: SPRITE_RECT.x + 9,
      cy: SPRITE_RECT.y + 7,
      radius: 8,
      ...opts,
    })
  })
}

function getMaterial(variant) {
  let m = materialCache.get(variant)
  if (!m) {
    const tex = makeTexture(variant)
    ownedTextures.add(tex)
    m = makePropMaterial(tex)
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
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
  'bush-snow': {
    name: 'bush-snow',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'snow-plain',
  },
  'dry-shrub': {
    name: 'dry-shrub',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'sand-plain',
  },
}

/**
 * Factory: returns the single merged bush Mesh for the variant
 * (InstancedMesh-safe — one shared geometry, one material per variant).
 *
 * @param {string} [name='bush'] - key of VARIANTS ('bush' | 'bush-snow' | 'dry-shrub')
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'bush') {
  if (!VARIANTS[name]) {
    throw new Error(`bush: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial(name))
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named aliases for direct imports. */
export const createBush = createProp
export const createBushSnow = (name = 'bush-snow') => createProp(name)
export const createDryShrub = (name = 'dry-shrub') => createProp(name)

/** Frees the shared geometry + all variant materials/textures exactly once. */
export function dispose() {
  if (geometry) {
    geometry.dispose()
    geometry = null
  }
  for (const m of materialCache.values()) m.dispose()
  materialCache.clear()
  for (const tex of ownedTextures) tex.dispose()
  ownedTextures.clear()
}
