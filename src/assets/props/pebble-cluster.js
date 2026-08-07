/**
 * PEBBLE-CLUSTER prop — corner socket, grouped 2-3 pebble cluster (SOLID
 * rework).
 *
 * A low dark-gray plinth carrying THREE small tapered hexagon pebbles — two
 * blue-gray and one warm tan — each a real solid lump with its own detailed
 * top face (grain speckle art, light upper-left, dark lower-right shadow,
 * broken near-black outline) and banded side walls. The cluster reads as
 * scattered stones with depth, not painted dots.
 *
 * World height 0.08 — the smallest prop in the library.
 *
 * Palette (5 colors incl. outline): gray pebble base, gray light, gray dark,
 * tan pebble base, near-black stone-gray outline.
 *
 * Socket: corner (max 4). InstancedMesh-safe: ONE merged geometry (plinth +
 * 3 pebbles) + ONE material (see propBase.js buildPrism / merge).
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

// ─── Palette (stone family — gray + one warm tan pebble) ───
const g = 0x8b96a2 // gray pebble base
const L = 0xb0bac5 // gray light
const d = 0x616c78 // gray dark
const t = 0xa8906a // tan pebble base
const O = 0x3f454e // outline — near-black stone gray

/** Canvas side (32): one 16x16 top-art rect per pebble tone. */
const SIZE = 32
const RG = { x: 4, y: 4, w: 16, h: 16 } // gray pebble art
const RT = { x: 18, y: 4, w: 10, h: 10 } // tan pebble art (smaller, off-center)

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.09, sideColor: d, size: SIZE, height: 0.03 }))
    const pebbles = [
      { r: 0.045, rTop: 0.038, y0: 0.026, y1: 0.07, off: [-0.02, 0.008], uv: RG, side: g },
      { r: 0.035, rTop: 0.03, y0: 0.026, y1: 0.06, off: [0.05, 0.018], uv: RT, side: t },
      { r: 0.03, rTop: 0.026, y0: 0.026, y1: 0.05, off: [-0.045, 0.03], uv: RG, side: g },
    ]
    for (const p of pebbles) {
      const g = buildPrism({
        pts: polygonPoints(6, p.r),
        ptsTop: polygonPoints(6, p.rTop),
        y0: p.y0,
        y1: p.y1,
        uv: p.uv,
        size: SIZE,
        sideColor: p.side,
      })
      g.translate(p.off[0], 0, p.off[1])
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
        const rng = new SeededRNG(401)
        const grayPts = polyToPixels(RG, polygonPoints(6, 0.045))
        paintPrismTop(ctx, {
          pts: grayPts,
          rng,
          base: g,
          accents: [L, d],
          density: 7,
          style: 'grain',
          light: L,
          shadow: d,
          shadowPools: 3,
          outline: O,
          outlineSkip: 0.34,
        })
        const tanPts = polyToPixels(RT, polygonPoints(6, 0.035))
        paintPrismTop(ctx, {
          pts: tanPts,
          rng,
          base: t,
          accents: [0xc2ab7e, 0x7d6846],
          density: 4,
          style: 'grain',
          light: 0xc2ab7e,
          shadow: 0x7d6846,
          shadowPools: 2,
          outline: O,
          outlineSkip: 0.34,
        })
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'pebble-cluster': {
    name: 'pebble-cluster',
    socket: 'corner',
    max: 4,
    height: 0.08,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged pebble-cluster Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='pebble-cluster'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'pebble-cluster') {
  if (!VARIANTS[name]) {
    throw new Error(`pebble-cluster: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createPebbleCluster = createProp

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
