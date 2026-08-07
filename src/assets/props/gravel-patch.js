/**
 * GRAVEL-PATCH prop — surface socket, flat scattered gravel overlay (SOLID
 * rework).
 *
 * Surface props may not be zero-thickness planes anymore: the patch is a
 * cluster of VERY LOW solid hexagon mounds (main scatter disc + 3 satellites,
 * 0.01-0.014 tall — they have real side walls and real depth, just low), each
 * with a speckled gravel top face (gray + warm tan grain clusters, light
 * upper-left, dark lower-right, broken near-black outline) and a dark banded
 * side. Sits flush on the tile top face (bottom embeds BASE_EMBED into it).
 *
 * World height 0.014 — a surface dressing, not an object.
 *
 * Palette (6 colors incl. outline): gray base, gray light, gray dark, tan,
 * tan light, tan dark.
 *
 * Socket: surface (max 1). InstancedMesh-safe: ONE merged geometry (disc +
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

// ─── Palette (stone family — gray + a few warm tan pebbles) ───
const GRAY = 0x8b96a2
const GRAY_L = 0xb4bec9
const GRAY_D = 0x5a6570
const TAN = 0xa8906a
const TAN_L = 0xc2ab7e
const TAN_D = 0x7d6846

/** Canvas side (32): gravel top-art rect + reserved white pixel. */
const SIZE = 32
const R1 = { x: 4, y: 4, w: 24, h: 24 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Main scatter disc (the hero face) + three low satellites.
    const main = buildPrism({
      pts: polygonPoints(6, 0.14),
      ptsTop: polygonPoints(6, 0.13),
      y0: -0.004,
      y1: 0.014,
      uv: R1,
      size: SIZE,
      sideColor: GRAY_D,
    })
    parts.push(main)
    const sats = [
      { r: 0.055, off: [0.13, 0.05] },
      { r: 0.045, off: [-0.14, 0.08] },
      { r: 0.04, off: [0.02, -0.14] },
    ]
    for (const st of sats) {
      const g = buildPrism({
        pts: polygonPoints(6, st.r),
        ptsTop: polygonPoints(6, st.r * 0.92),
        y0: -0.004,
        y1: 0.01,
        uv: R1,
        size: SIZE,
        sideColor: GRAY_D,
        capColor: TAN_D,
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
        const rng = new SeededRNG(801)
        const pts = polyToPixels(R1, polygonPoints(6, 0.14))
        // Scattered gravel: gray grain clusters + warm tan pebbles.
        paintPrismTop(ctx, {
          pts,
          rng,
          base: GRAY,
          accents: [GRAY_L, GRAY_D, TAN, TAN_L],
          density: 22,
          style: 'grain',
          light: GRAY_L,
          shadow: GRAY_D,
          shadowPools: 6,
          outline: TAN_D,
          outlineSkip: 0.36,
        })
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'gravel-patch': {
    name: 'gravel-patch',
    socket: 'surface',
    max: 1,
    height: 0,
    hostTile: 'dirt-plain',
  },
}

/**
 * Factory: returns the single merged gravel-patch Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='gravel-patch'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'gravel-patch') {
  if (!VARIANTS[name]) {
    throw new Error(`gravel-patch: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createGravelPatch = createProp

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
