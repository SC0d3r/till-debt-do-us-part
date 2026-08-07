/**
 * SNOW-PATCH prop — surface socket, flat snow-drift overlay (SOLID rework).
 *
 * Surface props may not be zero-thickness planes anymore: the patch is a
 * cluster of VERY LOW solid hexagon mounds (main drift + 3 satellites,
 * 0.012-0.016 tall — real side walls and real depth, just low), each with a
 * drift-speckled top face (cool white base, pure white caps, gray-blue
 * drifts and shadow pockets, broken cool pale-blue outline) and a cool dark
 * banded side. Sits flush on the tile top face (bottom embeds BASE_EMBED).
 *
 * World height 0.016 — a snow dressing on snow tiles, reads as a thicker
 * fresh drift.
 *
 * Palette (5 colors incl. outline): drift base, drift shadow, deepest shadow
 * pocket, pure white cap, cool pale blue outline.
 *
 * Socket: surface (max 1). InstancedMesh-safe: ONE merged geometry (drift +
 * 3 satellites) + ONE material (see propBase.js buildPrism / merge).
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildPrism,
  mergePropParts,
  paintPrismTop,
  polygonPoints,
  polyToPixels,
} from './propBase'

// ─── Palette (snow family values) ───
const e = 0xeaf1f8 // drift base — cool white
const d = 0xc8d6e4 // drift shadow — cool gray-blue
const k = 0xa8bcd0 // deepest shadow pocket
const l = 0xffffff // pure white cap
const O = 0x7e93ad // broken cool pale blue outline

/** Canvas side (32): drift top-art rect + reserved white pixel. */
const SIZE = 32
const R1 = { x: 4, y: 4, w: 24, h: 24 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Main drift mound + three low satellites.
    const main = buildPrism({
      pts: polygonPoints(6, 0.15),
      ptsTop: polygonPoints(6, 0.14),
      y0: -0.004,
      y1: 0.016,
      uv: R1,
      size: SIZE,
      sideColor: d,
    })
    parts.push(main)
    const sats = [
      { r: 0.07, off: [0.14, 0.06] },
      { r: 0.055, off: [-0.15, 0.09] },
      { r: 0.05, off: [0.03, -0.15] },
    ]
    for (const st of sats) {
      const g = buildPrism({
        pts: polygonPoints(6, st.r),
        ptsTop: polygonPoints(6, st.r * 0.9),
        y0: -0.004,
        y1: 0.012,
        uv: R1,
        size: SIZE,
        sideColor: d,
        capColor: e,
      })
      g.translate(st.off[0], 0, st.off[1])
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
        const rng = new SeededRNG(8777)
        const pts = polyToPixels(R1, polygonPoints(6, 0.15))
        // Drift: white caps above-left, gray-blue pockets toward lower-right.
        paintPrismTop(ctx, {
          pts,
          rng,
          base: e,
          accents: [l, d],
          density: 14,
          style: 'clumps',
          light: l,
          shadow: k,
          shadowPools: 6,
          outline: O,
          outlineSkip: 0.3,
        })
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'snow-patch': {
    name: 'snow-patch',
    socket: 'surface',
    max: 1,
    height: 0,
    hostTile: 'snow-plain',
  },
}

/**
 * Factory: returns the single merged snow-patch Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='snow-patch'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'snow-patch') {
  if (!VARIANTS[name]) {
    throw new Error(`snow-patch: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createSnowPatch = createProp

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
