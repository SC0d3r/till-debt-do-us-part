/**
 * LANTERN prop — edge socket, real 3D post + box lantern (FORM redesign).
 *
 * A REAL lantern per the reference: a tapered 6-sided iron post, a true BOX
 * body with every face visible from the isometric camera — the +z face is
 * the warm glass (bright amber with a bright glow patch), the +x side face
 * is the darkest iron (the shaded right side), the −x side is mid iron, the
 * top carries the light, the back is dark — plus dark frame ribbons on the
 * box's edges (the lantern frame), a tiny finial on top and a contact ring.
 * Warm glass faces the camera; nothing reads as a flat card because the box
 * really has three visible faces.
 *
 * World height ~0.24.
 *
 * Palette (7): iron light/mid/dark, near-black iron outline, glass amber,
 * glow cream, finial dark.
 *
 * Socket: edge (max 4). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildPost / buildBox / buildIcosa /
 * buildRibbons / buildContactRing / finishGeo via builders).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  buildPost,
  buildBox,
  buildQuad,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette ───
const IRON = { light: 0x6b5840, mid: 0x4a3a2e, dark: 0x32261e, outline: 0x241a12 }
const GLASS = 0xffd966
const GLOW = 0xfff2b0
const FINIAL = { light: 0x3a2c22, mid: 0x32261e, dark: 0x241a12, outline: 0x1d1409 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    const POST_H = 0.13
    const BODY_H = 0.085
    const BODY_W = 0.1
    const BODY_D = 0.075

    // Post (slightly buried).
    parts.push(buildPost({
      r: 0.015,
      rTop: 0.012,
      h: POST_H,
      y0: -0.012,
      sides: 6,
      tones: IRON,
      bands: 2,
      aoHeight: 0.3,
    }))

    // Body: real box — warm glass toward +z (camera), shaded sides.
    const body = buildBox({
      w: BODY_W,
      h: BODY_H,
      d: BODY_D,
      y0: POST_H,
      tones: {
        front: GLASS,
        back: IRON.dark,
        left: IRON.light,
        right: IRON.dark,
        top: IRON.mid,
        bottom: IRON.outline,
      },
    })
    parts.push(body)

    // Glow patch: a small bright quad just in front of the glass face
    // (the lamp's lit center, baked).
    const glow = buildQuad({
      w: 0.05,
      h: 0.048,
      y0: POST_H + BODY_H * 0.26,
      z: BODY_D / 2 + 0.0012,
      color: GLOW,
    })
    parts.push(glow)

    // Frame ribbons on the box's crease edges (the lantern frame).
    parts.push(buildRibbons(body, { color: IRON.outline, width: 0.007, minDihedral: 0.05 }))

    // Top: small nub + finial ball.
    const nub = buildPost({ r: 0.006, rTop: 0.004, h: 0.011, y0: POST_H + BODY_H, sides: 6, tones: FINIAL, bands: 1, aoHeight: 0.2 })
    parts.push(nub)
    const finial = buildIcosa({ r: 0.012, detail: 0, seed: 95 })
    finial.translate(0, POST_H + BODY_H + 0.02, 0)
    shadeFaces(finial, FINIAL, { aoAmount: 0.2 })
    parts.push(finial)

    // Contact ring.
    parts.push(buildContactRing({ r: 0.024, color: IRON.outline, thickness: 0.016 }))
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
  lantern: {
    name: 'lantern',
    socket: 'edge',
    max: 4,
    height: 0.24,
    hostTile: 'dirt-plain',
  },
}

/**
 * Factory: returns the single merged lantern Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='lantern'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'lantern') {
  if (!VARIANTS[name]) {
    throw new Error(`lantern: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createLantern = createProp

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
