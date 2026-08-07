/**
 * BIG-STONE prop — corner/center socket, large lumpy stone (SOLID rework).
 *
 * A low dark plinth plus TWO stacked tapered hexagon lumps — a main boulder
 * and a small satellite pebble fused at the base — each with its own detailed
 * top-face art (blue-gray base, almost-white upper-left facets, dark
 * lower-right recesses, broken near-black outline) and 3-band darker side
 * walls. Reads as a heavy solid with visible depth from the south camera.
 *
 * World height 0.16 — the largest stone; a strong visual anchor.
 *
 * Palette (5 colors incl. outline). Socket: corner (max 4); the manifest
 * notes center compatibility so composers may treat it as either.
 *
 * InstancedMesh-safe: ONE merged geometry (plinth + 2 lumps) + ONE material
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

// ─── Palette (stone family — blue-gray, larger set) ───
const b = 0x74808c // base — blue-gray
const l = 0x93a0ac // light — upper-left facets
const h = 0xc2ccd5 // highlight — almost-white flecks
const d = 0x4e5965 // dark — lower-right shadow
const O = 0x2f3740 // outline — near-black blue-gray

/** Canvas side (64): one 32x32 top-art rect per lump. */
const SIZE = 64
const R1 = { x: 0, y: 0, w: 32, h: 32 }
const R2 = { x: 32, y: 0, w: 32, h: 32 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.115, sideColor: d, size: SIZE }))
    const main = buildPrism({
      pts: polygonPoints(6, 0.1),
      ptsTop: polygonPoints(6, 0.075),
      y0: 0.036,
      y1: 0.12,
      uv: R1,
      size: SIZE,
      sideColor: b,
    })
    main.translate(-0.012, 0, 0.004)
    parts.push(main)
    const sat = buildPrism({
      pts: polygonPoints(6, 0.045),
      ptsTop: polygonPoints(6, 0.038),
      y0: 0.036,
      y1: 0.085,
      uv: R2,
      size: SIZE,
      sideColor: b,
    })
    sat.translate(0.075, 0, 0.02)
    parts.push(sat)
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const lumps = [
          { uv: R1, r: 0.1, seed: 301 },
          { uv: R2, r: 0.045, seed: 302 },
        ]
        for (const t of lumps) {
          const rng = new SeededRNG(t.seed)
          const pts = polyToPixels(t.uv, polygonPoints(6, t.r))
          paintPrismTop(ctx, {
            pts,
            rng,
            base: b,
            accents: [l, d, { color: h, weight: 0.6 }],
            density: 12,
            style: 'clumps',
            light: h,
            shadow: d,
            shadowPools: 5,
            outline: O,
            outlineSkip: 0.3,
          })
        }
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'big-stone': {
    name: 'big-stone',
    socket: 'corner',
    max: 4,
    height: 0.16,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged big-stone Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='big-stone'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'big-stone') {
  if (!VARIANTS[name]) {
    throw new Error(`big-stone: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createBigStone = createProp

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
