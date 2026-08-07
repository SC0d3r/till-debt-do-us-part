/**
 * SMALL-STONE prop — corner socket, tiny rounded stone (SOLID rework).
 *
 * A low dark plinth plus ONE tapered hexagon lump (the smallest stone in the
 * family): its top face carries the detailed stone art (blue-gray base, light
 * upper-left facet, dark lower-right shadow, broken near-black outline), its
 * side walls the 3-band darker treatment. Reads as a solid pebble with real
 * depth from the south camera.
 *
 * World height 0.1 — tiny corner detail.
 *
 * Palette (4 colors incl. outline). Socket: corner (max 4) — the composer
 * scatters it at the diamond's vertices.
 *
 * InstancedMesh-safe: ONE merged geometry (plinth + lump) + ONE material
 * (see propBase.js buildPrism / merge).
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

// ─── Palette (stone family — blue-gray) ───
const b = 0x8894a0 // base — blue-gray
const l = 0xb4bec9 // light — upper-left facet
const d = 0x5a6570 // dark — lower-right shadow
const O = 0x3a434d // outline — near-black blue-gray

/** Canvas side (32): hero top-art rect + reserved white pixel. */
const SIZE = 32
const R1 = { x: 4, y: 4, w: 24, h: 24 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.08, sideColor: d, size: SIZE }))
    const lump = buildPrism({
      pts: polygonPoints(6, 0.07),
      ptsTop: polygonPoints(6, 0.055),
      y0: 0.036,
      y1: 0.1,
      uv: R1,
      size: SIZE,
      sideColor: b,
    })
    lump.translate(0.006, 0, -0.004)
    parts.push(lump)
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rng = new SeededRNG(201)
        const pts = polyToPixels(R1, polygonPoints(6, 0.07))
        paintPrismTop(ctx, {
          pts,
          rng,
          base: b,
          accents: [l, d],
          density: 10,
          style: 'grain',
          light: l,
          shadow: d,
          shadowPools: 5,
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
  'small-stone': {
    name: 'small-stone',
    socket: 'corner',
    max: 4,
    height: 0.1,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged small-stone Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='small-stone'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'small-stone') {
  if (!VARIANTS[name]) {
    throw new Error(`small-stone: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createSmallStone = createProp

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
