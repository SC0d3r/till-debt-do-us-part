/**
 * GRAVEL-PATCH prop — surface socket, scattered gravel with low mounds (FORM
 * redesign).
 *
 * A flat-ish overlay that is still REAL geometry: 7 tiny angular pebble
 * chunks + 2 very low dome mounds scattered over a small disc, every piece
 * individually buried into the tile top face. Gray pebbles with a few warm
 * tan ones, per-chunk 3-tone ramps — reads as scattered gravel, not a
 * painted plane.
 *
 * World height ≤ 0.02 — a surface dressing.
 *
 * Palette (6): gray light/mid/dark, tan + tan dark, outline.
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

// ─── Palette (stone family) ───
const GRAY = { light: 0xb4bec9, mid: 0x8b96a2, dark: 0x5a6570, outline: 0x39424c }
const TAN = { light: 0xc2ab7e, mid: 0xa8906a, dark: 0x7d6846, outline: 0x39424c }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Low mounds (2) — the "few low mounds of real geometry" for a surface
    // overlay: wide, very flat domes.
    const mounds = [
      { r: 0.05, jitter: 0.14, squash: 0.3, seed: 801, off: [-0.035, 0.02] },
      { r: 0.04, jitter: 0.14, squash: 0.3, seed: 802, off: [0.045, -0.02] },
    ]
    for (const mn of mounds) {
      const g = buildIcosa({ r: mn.r, detail: 1, seed: mn.seed, jitter: mn.jitter, squash: mn.squash })
      sitOnGround(g)
      shadeFaces(g, GRAY, { aoAmount: 0.45 })
      g.translate(mn.off[0], 0, mn.off[1])
      parts.push(g)
    }
    // Pebble scatter.
    const pebbles = [
      { r: 0.03, jitter: 0.5, squash: 0.5, seed: 811, off: [-0.02, -0.045], tan: true },
      { r: 0.026, jitter: 0.55, squash: 0.52, seed: 812, off: [0.03, 0.045], tan: false },
      { r: 0.024, jitter: 0.5, squash: 0.5, seed: 813, off: [-0.055, -0.005], tan: false },
      { r: 0.022, jitter: 0.55, squash: 0.55, seed: 814, off: [0.055, 0.012], tan: true },
      { r: 0.02, jitter: 0.5, squash: 0.5, seed: 815, off: [0.0, 0.055], tan: false },
      { r: 0.018, jitter: 0.6, squash: 0.5, seed: 816, off: [-0.045, 0.045], tan: false },
      { r: 0.017, jitter: 0.55, squash: 0.55, seed: 817, off: [0.045, -0.05], tan: false },
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
