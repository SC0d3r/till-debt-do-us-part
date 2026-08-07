/**
 * PEBBLE-CLUSTER prop — corner socket, scattered gray/tan pebbles (FORM
 * redesign).
 *
 * 6 tiny angular CHUNKS (detail 0, jittered, flattened) scattered loosely in
 * a small disc — a natural pebble scatter with mixed gray and warm-tan tones.
 * Ground-hugging (buried into the tile top), no ribbons at this size; the
 * facets + AO do the shading.
 *
 * World height ~0.045 — a flat dressing, reads as scattered stones.
 *
 * Palette (6): gray light/mid/dark, tan, tan dark, outline.
 *
 * Socket: corner (max 4). InstancedMesh-safe: ONE merged geometry + ONE
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

// ─── Palette (stone family) ───
const GRAY = { light: 0xb4bec9, mid: 0x8b96a2, dark: 0x5a6570, outline: 0x39424c }
const TAN = { light: 0xc2ab7e, mid: 0xa8906a, dark: 0x7d6846, outline: 0x39424c }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    const pebbles = [
      { r: 0.03, jitter: 0.5, squash: 0.5, seed: 61, off: [-0.02, 0.02], tan: false },
      { r: 0.024, jitter: 0.55, squash: 0.55, seed: 62, off: [0.035, 0.03], tan: true },
      { r: 0.022, jitter: 0.5, squash: 0.5, seed: 63, off: [-0.05, -0.02], tan: false },
      { r: 0.028, jitter: 0.55, squash: 0.52, seed: 64, off: [0.0, -0.05], tan: false },
      { r: 0.02, jitter: 0.6, squash: 0.55, seed: 65, off: [0.045, -0.03], tan: true },
      { r: 0.018, jitter: 0.5, squash: 0.5, seed: 66, off: [-0.035, 0.05], tan: false },
    ]
    for (const pb of pebbles) {
      const g = buildIcosa({ r: pb.r, detail: 0, seed: pb.seed, jitter: pb.jitter, squash: pb.squash, yaw: pb.seed })
      sitOnGround(g)
      shadeFaces(g, pb.tan ? TAN : GRAY, { aoAmount: 0.5 })
      g.translate(pb.off[0], 0, pb.off[1])
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
  'pebble-cluster': {
    name: 'pebble-cluster',
    socket: 'corner',
    max: 4,
    height: 0.045,
    hostTile: 'dirt-plain',
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
