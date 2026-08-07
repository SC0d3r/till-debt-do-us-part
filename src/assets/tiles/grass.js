/**
 * GRASS biome family — Slice B pixel-art rebuild.
 *
 * Slice B replaced the old two-band (top-strip + root-strip) shape and the
 * flat per-face vertex tint with ONE single-section prism and pixel-art
 * textures (see docs/dev-log/TILE_SYSTEM_CONVENTION.md §1 and
 * docs/dev-log/SLICE_B_PIXEL_ART_TILES_AND_PROPS.md):
 *
 *   - Diamond footprint INSCRIBED in a 1.0x1.0 grid cell (vertices at
 *     (±0.5, 0, ±0.5), N vertex +z, E vertex +x). NOT a rotated square.
 *   - ONE section: a single solid prism from the top face (y ~0.34) to the
 *     base (y 0). No top band, no root band. The geometry silhouette stays
 *     EXACTLY precise — all organic/jagged quality comes from TEXTURE
 *     CONTENT, never from moving vertices (the composer's lattice packing
 *     and outline ribbons depend on the precise silhouette).
 *   - Top-face detail is a 32x32 pixel-art canvas texture (NearestFilter,
 *     no mipmaps, hard palette, above-left shading, baked jagged outline)
 *     built through the shared painter src/assets/pixelart/pixelPainter.js.
 *   - Side faces are the SAME geometry section, banded 1-2 steps darker via
 *     per-band vertex colors (top/mid/bottom bands; NW face lit, SE face
 *     shadowed) — a texture/visual property, never a second geometry section.
 *
 * InstancedMesh-safety: every variant is ONE merged BufferGeometry + ONE
 * MeshLambertMaterial. The top cap samples the map texture; the side bands
 * carry vertex colors and UVs pointing at the reserved white pixel (0,0) of
 * the texture (see tileTexture.js), so the map multiplies to 1.0 there and
 * the vertex colors show through.
 *
 * The grass family ships ONLY plain grass variants: grass-plain,
 * grass-plain-b, grass-plain-c (3 texture variants so large grass areas
 * never look stamped). No decorated variants (flowers/bushes), no dirt or
 * tilled variants, no transitions — dirt lives in its own family module
 * (src/assets/tiles/dirt.js) and there are no transition variants in the
 * kit anymore.
 *
 * Variants are KEYED BY STRING (the VARIANTS manifest below), not by module.
 *
 * Poly budget: 26 triangles per variant geometry (2 cap + 24 side-band
 * quads). One draw call per variant, InstancedMesh-compatible.
 */

import * as THREE from 'three'
import { SeededRNG } from '../../core/procedural'
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

// ─── Family colors (defined once here; referenced from VARIANTS so later
// ─── families harmonize against the same top / side palette) ───

/** Fresh, saturated grass top (Harvest-Moon palette): base fill of the
 *  top-face textures. */
export const GRASS_TOP = 0x63b84f
/** Grass blade accents: dark, mid and almost-yellow lit blades. */
export const GRASS_BLADE_DARK = 0x3e8a31
export const GRASS_BLADE_MID = 0x4fa03c
export const GRASS_BLADE_LIT = 0x9ad65a
/** Above-left shading tones for the grass top face. */
export const GRASS_LIGHT = 0x7ccd5f
export const GRASS_SHADOW = 0x4d9c3c
/** Baked-in texture outline (dark hue of the material — never black). */
export const GRASS_OUTLINE = 0x2c5e22
/** Side-face base color (one step darker than the top; banded darker below). */
export const GRASS_SIDE = 0x4d9339

// ─── Outline palette (convention §3 + Slice B pinned biome colors) ───
// Biome default outline colors — one named const, referenced from the
// VARIANTS manifest so the composer reads them from manifest metadata (via
// the factory mesh's userData), never from family code.
export const OUTLINE_COLORS = {
  /** Deep green — Slice B pinned grass ribbon outline. */
  grass: 0x2e6b24,
}

// ─── Tile anatomy constants ───
const TOP_Y = 0.34 // top face (Slice B reduced height — was 0.45 two-band)
const BASE_BOT_Y = 0 // prism base
const SIZE = TILE_TEXTURE_SIZE

// ─── Shared resources (lazy, module scope, disposed exactly once) ───
const topTexCache = new Map() // variant → texture
const geometryCache = new Map() // side-color key → geometry
const materialCache = new Map() // variant → material
const ownedTextures = new Set()
const ownedGeometries = new Set()

function getGeometry(sideColors) {
  const key = sideColors.join(',')
  let g = geometryCache.get(key)
  if (!g) {
    g = buildTilePrism(TOP_Y, BASE_BOT_Y, sideColors)
    geometryCache.set(key, g)
    ownedGeometries.add(g)
  }
  return g
}

function getMaterial(variant, topTexture) {
  let m = materialCache.get(variant)
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      map: topTexture,
      vertexColors: true,
      flatShading: true,
    })
    materialCache.set(variant, m)
  }
  return m
}

// ─── Texture generators (thin wrappers around the shared pixel painter) ───

/** Grass top with blade noise. `opts` varies seed/density/accents so the
 *  -b / -c texture variants read as the same material, not a stamp. */
function makeGrassTopTexture(seed, opts = {}) {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(GRASS_TOP)
    ctx.fillRect(0, 0, w, h)
    // Crisp rim first — the jagged outline is painted just INSIDE it.
    maskDiamondEdge(ctx, w, GRASS_TOP, 1)
    const rng = new SeededRNG(seed)
    paintNoise(ctx, {
      rng,
      base: GRASS_TOP,
      accents: opts.blades || [GRASS_BLADE_DARK, GRASS_BLADE_MID, GRASS_BLADE_LIT],
      density: opts.density ?? 26,
      clumpSize: opts.clumpSize ?? 2,
      style: 'blades',
    })
    paintAboveLeftShading(ctx, { rng, light: GRASS_LIGHT, shadow: GRASS_SHADOW })
    paintJaggedOutline(ctx, { rng, color: GRASS_OUTLINE })
  })
}

// ─── Variant → texture ───
function getTopTexture(variant) {
  if (topTexCache.has(variant)) return topTexCache.get(variant)
  let tex
  switch (variant) {
    case 'grass-plain':
      tex = makeGrassTopTexture(1337)
      break
    case 'grass-plain-b':
      tex = makeGrassTopTexture(31337, { density: 20, clumpSize: 3, blades: [GRASS_BLADE_DARK, GRASS_BLADE_LIT] })
      break
    case 'grass-plain-c':
      tex = makeGrassTopTexture(5150, { density: 32, clumpSize: 2, blades: [{ color: GRASS_BLADE_DARK, weight: 2 }, GRASS_BLADE_MID, GRASS_BLADE_LIT] })
      break
    default:
      throw new Error(`grass: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Variant config (side colors per variant) ───
// sideColors order: [NE, SE, SW, NW]. All grass variants are plain, so every
// side uses the grass side color.
const GRASS_SIDES = [GRASS_SIDE, GRASS_SIDE, GRASS_SIDE, GRASS_SIDE]

function variantSideColors(variant) {
  switch (variant) {
    case 'grass-plain':
    case 'grass-plain-b':
    case 'grass-plain-c':
      return GRASS_SIDES
    default:
      throw new Error(`grass: unknown variant "${variant}"`)
  }
}

// ─── Machine-readable manifest (used by the composer + fixture registration) ───
export const VARIANTS = {
  'grass-plain': {
    name: 'grass-plain',
    biome: 'grass',
    kind: 'plain',
    topColor: GRASS_TOP,
    baseColor: GRASS_SIDE,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-plain-b': {
    name: 'grass-plain-b',
    biome: 'grass',
    kind: 'plain',
    topColor: GRASS_TOP,
    baseColor: GRASS_SIDE,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-plain-c': {
    name: 'grass-plain-c',
    biome: 'grass',
    kind: 'plain',
    topColor: GRASS_TOP,
    baseColor: GRASS_SIDE,
    outlineColor: OUTLINE_COLORS.grass,
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
  const geometry = getGeometry(variantSideColors(variant))
  const texture = getTopTexture(variant)
  const material = getMaterial(variant, texture)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.variant = variant
  mesh.userData.biome = VARIANTS[variant].biome
  mesh.userData.kind = VARIANTS[variant].kind
  // Outline frame metadata (convention §3): the composer derives outline
  // frame heights from these family constants — NOT from the geometry's
  // bounding box — and the biome default outline color from the manifest.
  mesh.userData.outlineTop = TOP_Y
  mesh.userData.outlineBase = BASE_BOT_Y
  mesh.userData.outlineColor = VARIANTS[variant].outlineColor
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Frees all shared geometry/materials/textures owned by this module, each
 * exactly once.
 */
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
export const createTile = (variant) => createGrassTile(variant)