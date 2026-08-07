/**
 * TALL-GRASS prop — center socket, vertical spiky blade tuft (FORM redesign).
 *
 * 5 tapered double-sided blade planes fanned from a common base point per
 * reference B 5d — heights 0.17-0.3, each blade leaning slightly outward and
 * toward the camera, lighter on its left (−x) edge, darker on its right
 * (+x) edge, bright tips (reference A grass rule). Double-sided material so
 * every blade reads from the isometric camera; a thin dark base clump ring
 * seats the tuft on the ground.
 *
 * World height ~0.3 — the tallest accent in the library.
 *
 * Palette (4): bright/mid blade green pair, dark base green, near-black
 * green outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * DoubleSide material (see propBase.js buildBlade / buildContactRing).
 */

import * as THREE from 'three'
import {
  buildBlade,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (blade greens — light left, dark right, bright tips) ───
const L = 0x4c8730 // blade left edge — bright green
const D = 0x2d5a27 // blade right edge — dark green
const T = 0x66a94a // blade tip — lightest
const O = 0x1b3a16 // outline / base clump

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Fanned blades from a common base: varied heights, lean toward +z.
    const blades = [
      { h: 0.3, w: 0.036, yaw: -0.12, lean: 0.22 },
      { h: 0.25, w: 0.032, yaw: 0.65, lean: 0.12 },
      { h: 0.21, w: 0.029, yaw: -0.62, lean: 0.16 },
      { h: 0.28, w: 0.034, yaw: 1.2, lean: 0.06 },
      { h: 0.17, w: 0.026, yaw: 0.15, lean: 0.3 },
    ]
    for (const bl of blades) {
      parts.push(buildBlade({ h: bl.h, w: bl.w, yaw: bl.yaw, lean: bl.lean, colLight: L, colDark: D, colTip: T }))
    }
    // Thin dark base clump ring.
    parts.push(buildContactRing({ r: 0.038, color: O, thickness: 0.02, height: 0.007 }))
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
  'tall-grass': {
    name: 'tall-grass',
    socket: 'center',
    max: 1,
    height: 0.3,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged tall-grass Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='tall-grass'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'tall-grass') {
  if (!VARIANTS[name]) {
    throw new Error(`tall-grass: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createTallGrass = createProp

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
