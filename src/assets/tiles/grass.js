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
 * the texture (see transitionTexture.js), so the map multiplies to 1.0 there
 * and the vertex colors show through. Decorated variants (grass-flowers /
 * grass-bushes) keep their decoration as TEXTURE CONTENT (pixel-art flowers
 * / leaf-clump bushes painted into the top face) — explicitly allowed by the
 * Slice B spec, and it keeps every variant a uniform prism so
 * outlineTop/outlineBase stay exact.
 *
 * Variants are KEYED BY STRING (the VARIANTS manifest below), not by module.
 * All 13 pre-Slice-B variant names stay valid (showcase + composer tests
 * depend on them); 3 new texture variants are added as distinct strings:
 * grass-plain-b, grass-plain-c, dirt-plain-b. Transition orientations are
 * BAKED (grass-dirt-n/e/s/w, grass-tilled-n/e/s/w) and go through the shared
 * zipper utility transitionTexture.js — the zipper is never reimplemented;
 * the pixel-art post-pass (per-half noise, shading, jagged outline) is
 * applied on top of the zipper's own canvas.
 *
 * Poly budget: 26 triangles per variant geometry (2 cap + 24 side-band
 * quads). One draw call per variant, InstancedMesh-compatible.
 */

import * as THREE from 'three'
import { COLORS, SeededRNG } from '../../core/procedural'
import {
  TRANSITION_TEXTURE_SIZE,
  makeTransitionTopTexture,
} from './transitionTexture'
import {
  makePixelTexture,
  paintNoise,
  paintAboveLeftShading,
  paintJaggedOutline,
  maskDiamondEdge,
  cssColor,
  setPixel,
  insideDiamond,
  hexToRgb,
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

/** Dirt top-face palette (dirt-plain / dirt-plain-b + the dirt half of the
 *  grass↔dirt transitions). base = COLORS.dirt. */
export const DIRT_LIGHT = 0xab8940
export const DIRT_DARK = 0x7f5f24
export const DIRT_CRACK = 0x6a4e1c
export const DIRT_HILITE = 0xb2954e
export const DIRT_SHADOW = 0x765822
export const DIRT_OUTLINE = 0x503a14
export const DIRT_SIDE = 0x7a5d24

/** Tilled top (grass-tilled plain + the tilled half of grass↔tilled edges):
 *  golden-olive worked soil. base = COLORS.tilled. */
export const TILLED_CLOD = 0x5f4a16
export const TILLED_CRUMB = 0x8f6f26
export const TILLED_HILITE = 0x93752f
export const TILLED_SHADOW = 0x5c4715
export const TILLED_OUTLINE = 0x4a3a14
export const TILLED_SIDE = 0x5f4a1c

/** Bush leaf palette (painted into the grass-bushes top texture). */
export const BUSH_DARK = 0x2d7a2d
export const BUSH_MID = 0x3a8e3a
export const BUSH_LIGHT = 0x5ab85a

/** Flower palette (painted into the grass-flowers top texture). */
export const FLOWER_WHITE = 0xffffff
export const FLOWER_YELLOW = 0xfff3b0
export const FLOWER_CENTER = 0xe8c84a

// ─── Outline palette (convention §3 + Slice B pinned biome colors) ───
// Biome default outline colors — one named const, referenced from the
// VARIANTS manifest so the composer reads them from manifest metadata (via
// the factory mesh's userData), never from family code. Edge variants use
// their fromBiome (owner) color.
export const OUTLINE_COLORS = {
  /** Deep green — Slice B pinned grass ribbon outline (was a brown baseline
   *  pre-Slice-B). */
  grass: 0x2e6b24,
  /** Warm earth brown for dirt (unchanged — already matches the Slice B
   *  "warm brown" pin). */
  dirt: 0x6b4a2e,
  /** Dark worked-loam brown for tilled (unchanged — "warm loam"). */
  tilled: 0x4a3a26,
}

// ─── Tile anatomy constants ───
const TOP_Y = 0.34 // top face (Slice B reduced height — was 0.45 two-band)
const BASE_BOT_Y = 0 // prism base
const SIZE = TRANSITION_TEXTURE_SIZE

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

/** Grass top with pixel-art flowers (canvas detail — NOT separate meshes). */
function makeFlowerTopTexture() {
  const tex = makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(GRASS_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, GRASS_TOP, 1)
    const rng = new SeededRNG(4242)
    paintNoise(ctx, {
      rng,
      base: GRASS_TOP,
      accents: [GRASS_BLADE_DARK, GRASS_BLADE_LIT],
      density: 18,
      clumpSize: 2,
      style: 'blades',
    })
    paintAboveLeftShading(ctx, { rng, light: GRASS_LIGHT, shadow: GRASS_SHADOW })
    // Flowers: 2px head + darker center + 1px stem, away from the rim.
    for (let i = 0; i < 8; i++) {
      let x = -1
      let y = -1
      for (let tries = 0; tries < 10; tries++) {
        x = 3 + Math.floor(rng.next() * (w - 6))
        y = 3 + Math.floor(rng.next() * (h - 6))
        if (insideDiamond(x, y, w, 3)) break
      }
      if (!insideDiamond(x, y, w, 3)) continue
      const head = rng.next() < 0.7 ? FLOWER_WHITE : FLOWER_YELLOW
      setPixel(ctx, x, y, head)
      setPixel(ctx, x + 1, y, head)
      setPixel(ctx, x, y + 1, head)
      setPixel(ctx, x + 1, y + 1, head)
      setPixel(ctx, x + 1, y + 1, FLOWER_CENTER)
      setPixel(ctx, x + 1, y + 2, GRASS_BLADE_DARK) // stem
    }
    paintJaggedOutline(ctx, { rng, color: GRASS_OUTLINE })
  })
  return tex
}

/** Paints one pixel-art bush clump (leaf blobs, above-left lit). */
function paintBushClump(ctx, rng, cx, cy) {
  // 2-3 overlapping leaf blobs with a jagged silhouette
  const blobs = 2 + Math.floor(rng.next() * 2)
  for (let i = 0; i < blobs; i++) {
    const bx = cx + Math.floor(rng.next() * 5) - 2
    const by = cy + Math.floor(rng.next() * 4) - 1
    const w = 2 + Math.floor(rng.next() * 2)
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (rng.next() < 0.18) continue // jagged holes
        const x = bx + dx
        const y = by + dy
        if (!insideDiamond(x, y, SIZE, 2)) continue
        // above-left within the blob: top-left pixels light, bottom dark
        const col = dx === 0 && dy === 0 ? BUSH_LIGHT : dy === 1 ? BUSH_DARK : BUSH_MID
        setPixel(ctx, x, y, col)
      }
    }
    // a couple of protruding leaf pixels for the spiky silhouette
    if (rng.next() < 0.6) {
      const x = bx + Math.floor(rng.next() * w)
      if (insideDiamond(x, by - 1, SIZE, 2)) setPixel(ctx, x, by - 1, BUSH_MID)
    }
  }
}

/** Grass top with pixel-art bushes (canvas texture — NOT separate meshes). */
function makeBushTopTexture() {
  const tex = makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(GRASS_TOP)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, GRASS_TOP, 1)
    const rng = new SeededRNG(999)
    paintNoise(ctx, {
      rng,
      base: GRASS_TOP,
      accents: [GRASS_BLADE_DARK],
      density: 12,
      clumpSize: 2,
      style: 'blades',
    })
    paintAboveLeftShading(ctx, { rng, light: GRASS_LIGHT, shadow: GRASS_SHADOW })
    // 2-3 bushes
    const bushes = 2 + Math.floor(rng.next() * 2)
    for (let i = 0; i < bushes; i++) {
      let cx = -1
      let cy = -1
      for (let tries = 0; tries < 10; tries++) {
        cx = 6 + Math.floor(rng.next() * (w - 12))
        cy = 6 + Math.floor(rng.next() * (h - 12))
        if (insideDiamond(cx, cy, w, 4)) break
      }
      if (!insideDiamond(cx, cy, w, 4)) continue
      paintBushClump(ctx, rng, cx, cy)
    }
    paintJaggedOutline(ctx, { rng, color: GRASS_OUTLINE })
  })
  return tex
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

/** Tilled top: worked-soil clods + light crumbs. */
function makeTilledTileTexture() {
  return makePixelTexture(SIZE, (ctx, w, h) => {
    ctx.fillStyle = cssColor(COLORS.tilled)
    ctx.fillRect(0, 0, w, h)
    maskDiamondEdge(ctx, w, COLORS.tilled, 1)
    const rng = new SeededRNG(5151)
    paintNoise(ctx, {
      rng,
      base: COLORS.tilled,
      accents: [TILLED_CLOD],
      density: 14,
      clumpSize: 2,
      style: 'clumps',
    })
    paintNoise(ctx, {
      rng,
      base: COLORS.tilled,
      accents: [TILLED_CRUMB],
      density: 8,
      clumpSize: 1,
      style: 'grain',
    })
    paintAboveLeftShading(ctx, { rng, light: TILLED_HILITE, shadow: TILLED_SHADOW })
    paintJaggedOutline(ctx, { rng, color: TILLED_OUTLINE })
  })
}

// ── Transition pixel-art post-pass ──
// The zipper pattern comes from the shared utility (never reimplemented);
// this pass adds the Slice B pixel-art treatment ON TOP of the zipper canvas:
// per-half organic noise (region = "this texel currently has half A's color"),
// universal above-left shading, and the baked jagged outline.

/** Whether the canvas texel at (x, y) currently equals the sRGB bytes of
 *  `hex` (the zipper paints exact sRGB bytes, so equality is exact). */
function pixelEquals(ctx, x, y, hex) {
  const d = ctx.getImageData(x, y, 1, 1).data
  const [r, g, b] = hexToRgb(hex)
  return d[0] === r && d[1] === g && d[2] === b
}

/** Per-half noise definitions for the two transition families. */
const TRANSITION_NOISE = {
  'grass-dirt': {
    a: COLORS.dirt,
    b: GRASS_TOP,
    drawHalfA: (ctx, rng, region) => {
      paintNoise(ctx, { rng, base: COLORS.dirt, accents: [DIRT_LIGHT, DIRT_DARK], density: 10, clumpSize: 2, style: 'clumps', region })
      paintNoise(ctx, { rng, base: COLORS.dirt, accents: [DIRT_CRACK], density: 3, clumpSize: 2, style: 'cracks', region })
    },
    drawHalfB: (ctx, rng, region) => {
      paintNoise(ctx, { rng, base: GRASS_TOP, accents: [GRASS_BLADE_DARK, GRASS_BLADE_LIT], density: 14, clumpSize: 2, style: 'blades', region })
    },
    light: DIRT_HILITE,
    shadow: DIRT_SHADOW,
    outline: DIRT_OUTLINE,
  },
  'grass-tilled': {
    a: COLORS.tilled,
    b: GRASS_TOP,
    drawHalfA: (ctx, rng, region) => {
      paintNoise(ctx, { rng, base: COLORS.tilled, accents: [TILLED_CLOD], density: 10, clumpSize: 2, style: 'clumps', region })
      paintNoise(ctx, { rng, base: COLORS.tilled, accents: [TILLED_CRUMB], density: 6, clumpSize: 1, style: 'grain', region })
    },
    drawHalfB: (ctx, rng, region) => {
      paintNoise(ctx, { rng, base: GRASS_TOP, accents: [GRASS_BLADE_DARK, GRASS_BLADE_LIT], density: 14, clumpSize: 2, style: 'blades', region })
    },
    light: TILLED_HILITE,
    shadow: TILLED_SHADOW,
    outline: TILLED_OUTLINE,
  },
}

function makePixelTransitionTexture(family, orientation, seed) {
  const def = TRANSITION_NOISE[family]
  const tex = makeTransitionTopTexture(def.a, def.b, orientation)
  const canvas = tex.image
  const ctx = canvas.getContext('2d')
  const rng = new SeededRNG(seed)
  const isA = (x, y) => pixelEquals(ctx, x, y, def.a)
  const isB = (x, y) => pixelEquals(ctx, x, y, def.b)
  def.drawHalfA(ctx, rng, isA)
  def.drawHalfB(ctx, rng, isB)
  paintAboveLeftShading(ctx, { rng, light: def.light, shadow: def.shadow })
  paintJaggedOutline(ctx, { rng, color: def.outline })
  tex.needsUpdate = true
  return tex
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
    case 'grass-flowers':
      tex = makeFlowerTopTexture()
      break
    case 'grass-bushes':
      tex = makeBushTopTexture()
      break
    case 'grass-dirt-n':
      tex = makePixelTransitionTexture('grass-dirt', 'n', 2101)
      break
    case 'grass-dirt-e':
      tex = makePixelTransitionTexture('grass-dirt', 'e', 2102)
      break
    case 'grass-dirt-s':
      tex = makePixelTransitionTexture('grass-dirt', 's', 2103)
      break
    case 'grass-dirt-w':
      tex = makePixelTransitionTexture('grass-dirt', 'w', 2104)
      break
    case 'grass-tilled':
      tex = makeTilledTileTexture()
      break
    case 'grass-tilled-n':
      tex = makePixelTransitionTexture('grass-tilled', 'n', 3101)
      break
    case 'grass-tilled-e':
      tex = makePixelTransitionTexture('grass-tilled', 'e', 3102)
      break
    case 'grass-tilled-s':
      tex = makePixelTransitionTexture('grass-tilled', 's', 3103)
      break
    case 'grass-tilled-w':
      tex = makePixelTransitionTexture('grass-tilled', 'w', 3104)
      break
    case 'dirt-plain':
      tex = makeDirtTopTexture(777)
      break
    case 'dirt-plain-b':
      tex = makeDirtTopTexture(778, { clumpDensity: 20, crackDensity: 7, grainDensity: 5 })
      break
    default:
      throw new Error(`grass: unknown variant "${variant}"`)
  }
  topTexCache.set(variant, tex)
  ownedTextures.add(tex)
  return tex
}

// ─── Variant config (side colors per variant) ───
// sideColors order: [NE, SE, SW, NW]. Plains use one biome all around; edge
// variants color each side by the biome of the top-face quarter adjacent to
// it (same quarter semantics as the pre-Slice-B cap riser), so a transition
// tile's sides read as the two materials it joins.
const GRASS_SIDES = [GRASS_SIDE, GRASS_SIDE, GRASS_SIDE, GRASS_SIDE]
const DIRT_SIDES = [DIRT_SIDE, DIRT_SIDE, DIRT_SIDE, DIRT_SIDE]
const TILLED_SIDES = [TILLED_SIDE, TILLED_SIDE, TILLED_SIDE, TILLED_SIDE]

function variantSideColors(variant) {
  switch (variant) {
    case 'grass-plain':
    case 'grass-plain-b':
    case 'grass-plain-c':
    case 'grass-flowers':
    case 'grass-bushes':
      return GRASS_SIDES
    case 'grass-dirt-n':
      return [DIRT_SIDE, GRASS_SIDE, GRASS_SIDE, DIRT_SIDE]
    case 'grass-dirt-e':
      return [DIRT_SIDE, DIRT_SIDE, GRASS_SIDE, GRASS_SIDE]
    case 'grass-dirt-s':
      return [GRASS_SIDE, DIRT_SIDE, DIRT_SIDE, GRASS_SIDE]
    case 'grass-dirt-w':
      return [GRASS_SIDE, GRASS_SIDE, DIRT_SIDE, DIRT_SIDE]
    case 'grass-tilled':
      return TILLED_SIDES
    case 'grass-tilled-n':
      return [TILLED_SIDE, GRASS_SIDE, GRASS_SIDE, TILLED_SIDE]
    case 'grass-tilled-e':
      return [TILLED_SIDE, TILLED_SIDE, GRASS_SIDE, GRASS_SIDE]
    case 'grass-tilled-s':
      return [GRASS_SIDE, TILLED_SIDE, TILLED_SIDE, GRASS_SIDE]
    case 'grass-tilled-w':
      return [GRASS_SIDE, GRASS_SIDE, TILLED_SIDE, TILLED_SIDE]
    case 'dirt-plain':
    case 'dirt-plain-b':
      return DIRT_SIDES
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
  'grass-flowers': {
    name: 'grass-flowers',
    biome: 'grass',
    kind: 'decorated',
    topColor: GRASS_TOP,
    baseColor: GRASS_SIDE,
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-bushes': {
    name: 'grass-bushes',
    biome: 'grass',
    kind: 'decorated',
    topColor: GRASS_TOP,
    baseColor: GRASS_SIDE,
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
    baseColors: { grass: GRASS_SIDE, dirt: DIRT_SIDE },
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
    baseColors: { grass: GRASS_SIDE, dirt: DIRT_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-dirt-s': {
    name: 'grass-dirt-s',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 's',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_SIDE, dirt: DIRT_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-dirt-w': {
    name: 'grass-dirt-w',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'dirt',
    orientation: 'w',
    topColors: { grass: GRASS_TOP, dirt: COLORS.dirt },
    baseColors: { grass: GRASS_SIDE, dirt: DIRT_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-tilled': {
    name: 'grass-tilled',
    biome: 'tilled',
    kind: 'plain',
    topColor: COLORS.tilled,
    baseColor: TILLED_SIDE,
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
    baseColors: { grass: GRASS_SIDE, tilled: TILLED_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-tilled-e': {
    name: 'grass-tilled-e',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 'e',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_SIDE, tilled: TILLED_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-tilled-s': {
    name: 'grass-tilled-s',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 's',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_SIDE, tilled: TILLED_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
  'grass-tilled-w': {
    name: 'grass-tilled-w',
    biome: 'grass',
    kind: 'edge',
    fromBiome: 'grass',
    toBiome: 'tilled',
    orientation: 'w',
    topColors: { grass: GRASS_TOP, tilled: COLORS.tilled },
    baseColors: { grass: GRASS_SIDE, tilled: TILLED_SIDE },
    outlineColor: OUTLINE_COLORS.grass,
  },
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
  // `outlineColor` is the fromBiome (owner) color for edge variants, the
  // biome color for plains/decorated.
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