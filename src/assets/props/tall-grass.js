/**
 * TALL-GRASS prop — center socket, vertical spiky blade tuft (SOLID rework).
 *
 * Reference document two, item 4 ("vertical, spiky cluster of blades rising
 * from a small base"), re-imagined as real 3D: a small dark-green plinth plus
 * FIVE thin TAPERED hexagon blades (world r 0.011 → 0.0035) of different
 * heights (0.14-0.26), splayed at different yaws and leaning — several toward
 * the camera — so every blade shows lit front walls, a bright tip cap and a
 * shaded flank under the above-left light. No crossed quads: each blade is a
 * genuine extruded solid with 6 banded side walls; the cluster reads as a
 * tuft, not a card, from the south camera.
 *
 * World height 0.26 — the strongest vertical accent in the library.
 *
 * Palette (5 colors incl. outline): bright/mid/dark green, dark base green,
 * dark-green outline (all four greens kept from the sprite era).
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry (plinth +
 * 5 blades) + ONE material (see propBase.js buildPrism / merge).
 */

import * as THREE from 'three'
import {
  makePropTexture,
  makePropMaterial,
  buildPrism,
  buildBase,
  mergePropParts,
  polygonPoints,
} from './propBase'

// ─── Palette (tall-grass greens — bright tips, dark base) ───
const B = 0x7ccd5f // blade upper — bright
const M = 0x4fa03c // blade mid
const D = 0x3e8a31 // blade lower — dark
const b = 0x2e6b24 // base clump / plinth — dark green
const O = 0x274d20 // outline — dark green

/** Canvas side (32) — only the reserved white pixel is used (blade caps are
 *  solid vertex-color caps; the texture exists for material uniformity). */
const SIZE = 32

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.055, sideColor: b, size: SIZE }))
    // Five tapered blades: yaw splays them, rotX leans them (positive = tip
    // toward the +z camera). Heights descend so the tuft has a ragged crown.
    const blades = [
      { h: 0.26, yaw: 0, lean: 0.12, off: [0.0, 0.0] },
      { h: 0.21, yaw: 0.95, lean: -0.06, off: [0.014, -0.012] },
      { h: 0.19, yaw: 2.0, lean: -0.1, off: [-0.016, 0.008] },
      { h: 0.16, yaw: 3.3, lean: 0.09, off: [0.02, 0.014] },
      { h: 0.14, yaw: 4.9, lean: 0.16, off: [-0.012, -0.018] },
    ]
    for (const bl of blades) {
      const g = buildPrism({
        pts: polygonPoints(6, 0.011),
        ptsTop: polygonPoints(6, 0.0035),
        y0: 0.03,
        y1: 0.03 + bl.h,
        uv: { x: 0, y: 0, w: 0, h: 0 },
        size: SIZE,
        sideColor: M,
        capColor: B,
      })
      const m = new THREE.Matrix4().makeTranslation(bl.off[0], 0, bl.off[1])
        .multiply(new THREE.Matrix4().makeTranslation(0, 0.03, 0))
        .multiply(new THREE.Matrix4().makeRotationX(bl.lean))
        .multiply(new THREE.Matrix4().makeRotationY(bl.yaw))
        .multiply(new THREE.Matrix4().makeTranslation(0, -0.03, 0))
      g.applyMatrix4(m)
      parts.push(g)
    }
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(makePropTexture(SIZE, () => {}))
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'tall-grass': {
    name: 'tall-grass',
    socket: 'center',
    max: 1,
    height: 0.26,
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
