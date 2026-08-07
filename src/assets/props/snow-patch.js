/**
 * SNOW-PATCH prop — surface socket, smooth snow drift overlay (FORM redesign).
 *
 * A flat-ish snow dressing made of REAL geometry: 4 very low, smooth dome
 * drifts (icosahedron detail 1, low jitter, squashed flat) clustered over a
 * small disc, individually buried into the tile top — reads as thicker fresh
 * snow, not a painted plane. Cool white 3-tone ramp: pure white caps,
 * cool-gray-blue shadows, pale blue outline tones at the drifts' bases.
 *
 * World height ≤ 0.02 — a surface dressing.
 *
 * Palette (4): white / drift base / drift shadow / pale blue outline.
 *
 * Socket: surface (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / sitOnGround / shadeFaces).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  sitOnGround,
  shadeFaces,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (snow ramp) ───
const SNOW = { light: 0xffffff, mid: 0xeaf1f8, dark: 0xc8d6e4, outline: 0x7e93ad }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    const drifts = [
      { r: 0.055, jitter: 0.1, squash: 0.3, seed: 877, off: [-0.02, 0.02] },
      { r: 0.05, jitter: 0.1, squash: 0.3, seed: 878, off: [0.05, 0.01] },
      { r: 0.042, jitter: 0.12, squash: 0.32, seed: 879, off: [-0.05, -0.025] },
      { r: 0.035, jitter: 0.1, squash: 0.3, seed: 880, off: [0.01, -0.055] },
    ]
    for (const dr of drifts) {
      const g = buildIcosa({ r: dr.r, detail: 1, seed: dr.seed, jitter: dr.jitter, squash: dr.squash })
      sitOnGround(g)
      shadeFaces(g, SNOW, { aoAmount: 0.4 })
      g.translate(dr.off[0], 0, dr.off[1])
      parts.push(g)
    }
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) material = makeCelMaterial()
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

/** Frees the shared geometry/material exactly once. */
export function dispose() {
  if (geometry) {
    geometry.dispose()
    geometry = null
  }
  if (material) {
    material.dispose()
    material = null
  }
}
