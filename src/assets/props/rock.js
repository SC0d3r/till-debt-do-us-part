/**
 * ROCK prop — center socket, angular blue-gray boulder cluster (FORM redesign).
 *
 * A REAL low-poly rock pile per reference B: 3 jittered icosahedron CHUNKS
 * (detail 0 — angular facets like cut shards, hard flat normals) clustered
 * with slight overlap, top facets light blue-gray, mid facets mid, lower-right
 * facets dark navy-charcoal, dark edge RIBBONS on every crease (the tinted
 * non-black silhouette outline), base AO + dark contact ring, and 1-2 small
 * green tuft blades poking from the base so it sits into the grass tile
 * (reference B rock recipe: "1-2 small green tuft blades... to seat it into
 * the grass tile visually").
 *
 * World height ~0.15.
 *
 * Palette (5): light/mid/dark blue-gray ramp, near-black blue-gray outline,
 * tuft green pair.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / shadeFaces / buildRibbons /
 * buildContactRing / buildBlade).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  buildBlade,
  sitOnGround,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (reference B rock ramp + tufts) ───
const R = { light: 0x8b98a8, mid: 0x6b7a8f, dark: 0x4a5568, outline: 0x2d3436 }
const TUFT_L = 0x3d6b35
const TUFT_D = 0x2d5a27

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    const chunks = [
      { r: 0.09, jitter: 0.5, squash: 0.74, seed: 31, yaw: 0.3, off: [0, 0] },
      { r: 0.06, jitter: 0.55, squash: 0.7, seed: 32, yaw: 1.2, off: [0.05, 0.018] },
      { r: 0.05, jitter: 0.6, squash: 0.66, seed: 33, yaw: 2.1, off: [-0.042, 0.05] },
    ]
    const bodyParts = []
    for (const ch of chunks) {
      const g = buildIcosa({ r: ch.r, detail: 0, seed: ch.seed, jitter: ch.jitter, squash: ch.squash, yaw: ch.yaw })
      sitOnGround(g)
      shadeFaces(g, R, { aoAmount: 0.6 })
      g.translate(ch.off[0], 0, ch.off[1])
      bodyParts.push(g)
    }
    const body = mergePropParts(bodyParts)
    parts.push(body)
    // Dark edge ribbons on the angular creases (silhouette + facet outlines).
    parts.push(buildRibbons(body, { color: R.outline, width: 0.011, minDihedral: 0.16 }))
    // Green tuft blades at the base, leaning toward the camera.
    const tufts = [
      { h: 0.09, w: 0.02, yaw: -0.5, lean: 0.3, off: [0.035, 0.035] },
      { h: 0.07, w: 0.017, yaw: 0.45, lean: 0.24, off: [-0.03, 0.045] },
    ]
    for (const tf of tufts) {
      const blade = buildBlade({ h: tf.h, w: tf.w, yaw: tf.yaw, lean: tf.lean, colLight: TUFT_L, colDark: TUFT_D, colTip: TUFT_L })
      blade.translate(tf.off[0], 0.002, tf.off[1])
      parts.push(blade)
    }
    // Contact ring (dark seam against the tile).
    parts.push(buildContactRing({ r: 0.098, color: R.outline }))
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) material = makeCelMaterial({ side: THREE.DoubleSide })
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  rock: {
    name: 'rock',
    socket: 'center',
    max: 1,
    height: 0.15,
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
