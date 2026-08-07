/**
 * ROCK prop — center socket, low lumpy blue-gray boulder (SOLID rework).
 *
 * Reference document two, item 2, re-imagined as a real 3D object: a dark
 * plinth plus THREE stacked tapered hexagon tiers, each offset and shrink-
 * wrapped — the extruded lump silhouette the reference describes ("low,
 * irregular boulder, wider than it is tall, lumpy organic silhouette"), with
 * visible side walls in shadow. Every tier's top face carries the detailed
 * noisy art (seeded clumps of light/almost-white upper-left facets, navy-
 * charcoal recesses toward the lower-right, wandering 1px cracks, broken
 * near-black blue-gray outline just inside the silhouette) — the tile system's
 * "detailed noisy top, darker banded sides" rule applied to a solid object.
 * The side walls carry the 3-band darker treatment + per-wall above-left
 * shade (NW face brightest, SE darkest), exactly like the tile prism sides.
 *
 * World height 0.16 — mid visual weight, strong anchor against bright tiles.
 *
 * Palette (6 colors incl. outline): blue-gray base, mid light, almost-white
 * highlight, navy-charcoal dark, crack charcoal, near-black blue-gray outline.
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

// ─── Palette (reference item 2 — mid-to-dark blue-gray) ───
const b = 0x6f7a86 // base — mid blue-gray
const l = 0x8d99a6 // light — upper-left facets
const h = 0xc9d2db // highlight — almost-white flecks
const d = 0x4a5561 // dark — navy-charcoal recesses / lower-right
const c = 0x39424c // crack — 1px wandering dark lines
const O = 0x2b333c // outline — near-black blue-gray

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
    parts.push(buildBase({ r: 0.11, sideColor: d, size: SIZE }))
    // Lumpy tiers: tapered hexagons, offset so the silhouette is organic.
    const tiers = [
      { r: 0.095, rTop: 0.088, y0: 0.036, y1: 0.09, off: [-0.012, 0.004], uv: R1 },
      { r: 0.07, rTop: 0.062, y0: 0.09, y1: 0.13, off: [0.014, -0.006], uv: R2 },
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
        // Each tier gets its own rect + seed → distinct lumpy faces.
        const tiers = [
          { uv: R1, r: 0.095, seed: 101 },
          { uv: R2, r: 0.07, seed: 102 },
          { uv: R3, r: 0.045, seed: 103 },
        ]
        for (const t of tiers) {
          const rng = new SeededRNG(t.seed)
          const pts = polyToPixels(t.uv, polygonPoints(6, t.r))
          paintPrismTop(ctx, {
            pts,
            rng,
            base: b,
            accents: [l, d, { color: h, weight: 0.6 }],
            density: 14,
            style: 'clumps',
            light: h,
            shadow: d,
            shadowPools: 6,
            outline: O,
            outlineSkip: 0.3,
          })
          // A few wandering 1px cracks across the face (reference item 2).
          paintPrismTop(ctx, {
            pts,
            rng,
            base: b,
            accents: [c],
            density: 3,
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
  rock: {
    name: 'rock',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged rock Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='rock'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'rock') {
  if (!VARIANTS[name]) {
    throw new Error(`rock: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createRock = createProp

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
