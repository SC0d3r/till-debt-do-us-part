/**
 * BIG-STONE prop — center socket, large angular boulder (FORM redesign).
 *
 * Three bigger jittered icosahedron CHUNKS (detail 0, hard flat facets) in a
 * tight overlapping cluster — a proper landmark boulder, not a tile-height
 * block. Dark edge ribbons, base AO, contact ring.
 *
 * World height ~0.18.
 *
 * Palette (4): blue-gray light/mid/dark ramp + near-black outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / shadeFaces / buildRibbons /
 * buildContactRing).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  sitOnGround,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (boulder — deeper ramp than rock) ───
const B = { light: 0x8d99a6, mid: 0x67748a, dark: 0x46505f, outline: 0x262c34 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const chunks = [
      { r: 0.11, jitter: 0.48, squash: 0.76, seed: 51, yaw: 0.2, off: [0, 0] },
      { r: 0.075, jitter: 0.55, squash: 0.72, seed: 52, yaw: 1.0, off: [0.062, 0.02] },
      { r: 0.055, jitter: 0.58, squash: 0.7, seed: 53, yaw: 2.2, off: [-0.05, 0.06] },
    ]
    const bodyParts = []
    for (const ch of chunks) {
      const g = buildIcosa({ r: ch.r, detail: 0, seed: ch.seed, jitter: ch.jitter, squash: ch.squash, yaw: ch.yaw })
      sitOnGround(g)
      shadeFaces(g, B, { aoAmount: 0.6 })
      g.translate(ch.off[0], 0, ch.off[1])
      bodyParts.push(g)
    }
    const body = mergePropParts(bodyParts)
    const parts = [body]
    parts.push(buildRibbons(body, { color: B.outline, width: 0.012, minDihedral: 0.55 }))
    parts.push(buildContactRing({ r: 0.175, color: B.outline }))
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
  'big-stone': {
    name: 'big-stone',
    socket: 'center',
    max: 1,
    height: 0.18,
    hostTile: 'dirt-plain',
    alsoSockets: ['corner'],
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
