/**
 * LAVA-ROCK prop — center socket, dark basalt boulder with ember cracks
 * (SOLID rework).
 *
 * The rock recipe re-paletted for the lava biome: a dark plinth plus THREE
 * stacked tapered hexagon tiers (offsets = lumpy silhouette), each top face
 * carrying the basalt art — dark gray base, basalt-light upper-left facets,
 * dark recesses lower-right, wandering ORANGE EMBER CRACKS with hot-yellow
 * flecks (the lava glow, baked into the faces like every light source in
 * this kit), broken near-black outline — and the side walls the 3-band
 * darker basalt treatment. Real volume, real depth; the ember veins follow
 * the tier faces like cooling lava rock.
 *
 * World height 0.16 — dark anchor on the lava tile.
 *
 * Palette (6 colors incl. outline): basalt, basalt light, basalt dark, ember
 * orange, glow yellow, near-black blue-gray outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry (plinth +
 * 3 tiers) + ONE material (see propBase.js buildPrism / merge).
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

// ─── Palette (basalt + ember) ───
const b = 0x4a4a55 // basalt base
const l = 0x666673 // basalt light — upper-left facets
const d = 0x33333c // basalt dark — recesses / lower-right
const o = 0xff7a1a // ember crack — orange
const y = 0xffc832 // glow — hot yellow
const O = 0x232329 // outline — near-black blue-gray

/** Canvas side (64): one 32x32 top-art rect per tier. */
const SIZE = 64
const R1 = { x: 0, y: 0, w: 32, h: 32 }
const R2 = { x: 32, y: 0, w: 32, h: 32 }
const R3 = { x: 0, y: 32, w: 32, h: 32 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.115, sideColor: d, size: SIZE }))
    const tiers = [
      { r: 0.1, rTop: 0.092, y0: 0.036, y1: 0.09, off: [-0.012, 0.004], uv: R1 },
      { r: 0.07, rTop: 0.063, y0: 0.09, y1: 0.13, off: [0.014, -0.006], uv: R2 },
      { r: 0.045, rTop: 0.04, y0: 0.13, y1: 0.16, off: [-0.006, 0.01], uv: R3 },
    ]
    for (const t of tiers) {
      const g = buildPrism({
        pts: polygonPoints(6, t.r),
        ptsTop: polygonPoints(6, t.rTop),
        y0: t.y0,
        y1: t.y1,
        uv: t.uv,
        size: SIZE,
        sideColor: b,
      })
      g.translate(t.off[0], 0, t.off[1])
      parts.push(g)
    }
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const tiers = [
          { uv: R1, r: 0.1, seed: 901 },
          { uv: R2, r: 0.07, seed: 902 },
          { uv: R3, r: 0.045, seed: 903 },
        ]
        for (const t of tiers) {
          const rng = new SeededRNG(t.seed)
          const pts = polyToPixels(t.uv, polygonPoints(6, t.r))
          // Basalt facets.
          paintPrismTop(ctx, {
            pts,
            rng,
            base: b,
            accents: [l, d],
            density: 12,
            style: 'clumps',
            light: l,
            shadow: d,
            shadowPools: 5,
            outline: O,
            outlineSkip: 0.3,
          })
          // Ember cracks: meandering orange veins with hot-yellow flecks.
          paintPrismTop(ctx, {
            pts,
            rng,
            base: b,
            accents: [{ color: o, weight: 2 }, y],
            density: 4,
            style: 'cracks',
            outline: undefined,
          })
        }
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'lava-rock': {
    name: 'lava-rock',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'lava-plain',
  },
}

/**
 * Factory: returns the single merged lava-rock Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='lava-rock'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'lava-rock') {
  if (!VARIANTS[name]) {
    throw new Error(`lava-rock: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createLavaRock = createProp

/** Frees the shared geometry/material/texture exactly once. */
export function dispose() {
  if (geometry) {
    geometry.dispose()
    geometry = null
  }
  if (material) {
    if (material.map) material.map.dispose()
    material.dispose()
    material = null
  }
}
