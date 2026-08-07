/**
 * TORCH prop — edge socket, wooden stake torch with baked flame (FORM
 * redesign).
 *
 * A REAL torch: a tapered 6-sided wooden post (brown 3-tone ramp, vertical
 * band darkening, base AO) with a dark char collar at the top and a 3-band
 * tapered FLAME (deep orange base → bright yellow tip, 5-sided, leaning
 * slightly toward the camera) on top. The flame is baked geometry — no
 * lights, no emissive — so it reads as the lit end of a proper object from
 * the isometric view. Dark contact ring at the base.
 *
 * World height ~0.33 (post 0.24 + flame 0.085).
 *
 * Palette (6): wood light/mid/dark, near-black wood outline, flame orange +
 * yellow pair.
 *
 * Socket: edge (max 4). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildPost / buildFlame / buildContactRing).
 */

import * as THREE from 'three'
import {
  buildPost,
  buildFlame,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette ───
const WOOD = { light: 0x8b6a45, mid: 0x6b4a2f, dark: 0x4a3220, outline: 0x2a1d10 }
const FLAME = [0xc24e00, 0xff7a1a, 0xffc832]
const CHAR = { light: 0x2a1d10, mid: 0x2a1d10, dark: 0x1d1409, outline: 0x1d1409 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    const POST_H = 0.24
    // Post (slightly buried).
    const post = buildPost({
      r: 0.025,
      rTop: 0.02,
      h: POST_H,
      y0: -0.012,
      sides: 6,
      tones: WOOD,
      bands: 2,
      aoHeight: 0.3,
    })
    parts.push(post)
    // Char collar where the flame sits.
    const collar = buildPost({
      r: 0.027,
      rTop: 0.023,
      h: 0.016,
      y0: POST_H - 0.012 - 0.004,
      sides: 6,
      tones: CHAR,
      bands: 1,
      aoHeight: 0.2,
    })
    parts.push(collar)
    // Baked flame leaning toward the camera.
    const flame = buildFlame({ r: 0.022, h: 0.09, y0: POST_H - 0.012, lean: 0.14, tones: FLAME, sides: 5 })
    parts.push(flame)
    // Contact ring.
    parts.push(buildContactRing({ r: 0.032, color: WOOD.outline, thickness: 0.018 }))
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
  torch: {
    name: 'torch',
    socket: 'edge',
    max: 4,
    height: 0.33,
    hostTile: 'dirt-plain',
  },
}

/**
 * Factory: returns the single merged torch Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='torch'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'torch') {
  if (!VARIANTS[name]) {
    throw new Error(`torch: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createTorch = createProp

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
