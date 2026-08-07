/**
 * CACTUS prop — center socket, low-poly saguaro column with arms (FORM
 * redesign).
 *
 * A REAL columnar cactus per the reference: a tapered 6-sided trunk post with
 * hard facets (each face gets its 3-tone ramp — the vertical facet stripes
 * read as ribs), a flattened dome cap on top, TWO arms on the camera side
 * (each a short horizontal elbow + a tapered rise, both on the +z half so the
 * hero read faces the camera), pale spine dots scattered on trunk + arms, and
 * a dark contact ring with sand-hue grounding. Edge ribbons along the trunk
 * ribs for the crisp silhouette.
 *
 * World height ~0.22.
 *
 * Palette (5): bright/mid/dark cactus green ramp, near-black green outline,
 * pale spine tone.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildPost / buildIcosa / buildSpineDot /
 * sitOnGround / shadeFaces / buildRibbons / buildContactRing).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  buildPost,
  buildSpineDot,
  sitOnGround,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (saguaro ramp) ───
const C = { light: 0x6fa35a, mid: 0x4e8a4c, dark: 0x2f5a2e, outline: 0x1b3a1c }
const SPINE = 0xe8e4d8

// ─── Geometry constants ───
const TRUNK_R = 0.038
const TRUNK_RTOP = 0.028
const TRUNK_H = 0.2
// F5: arms ~25% thicker and attached at ~55% of trunk height so they read as
// real arms (they were 1-3px bumps before); arm tops stay under the trunk top.
const ARM_R = 0.03
const ARM_H = 0.085
const ARM_Y = 0.11

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const body = [] // trunk + cap + arms + tips (ribbon source)
    const extras = [] // spine dots (never ribboned)

    // Trunk: tapered 6-sided post (facet stripes = ribs), buried + ringed.
    const trunk = buildPost({
      r: TRUNK_R,
      rTop: TRUNK_RTOP,
      h: TRUNK_H,
      y0: -0.012,
      sides: 6,
      tones: C,
      bands: 2,
      aoHeight: 0.3,
    })
    body.push(trunk)

    // Rounded cap dome on the trunk top.
    const cap = buildIcosa({ r: TRUNK_RTOP, detail: 1, seed: 83, jitter: 0.06, squash: 0.55 })
    cap.translate(0, TRUNK_H - 0.012, 0)
    shadeFaces(cap, C, { aoAmount: 0.35, aoHeight: 0.3 })
    body.push(cap)

    // Two arms on the camera (+z) half.
    const armAz = [0.42, -0.42] // azimuth: 0 = +z toward camera
    for (const az of armAz) {
      const sa = Math.sin(az)
      const ca = Math.cos(az)
      // Elbow: a short horizontal cylinder, laid along the arm direction.
      // F5: elbow radius slightly BELOW the rise radius (0.9×) and the rise
      // base overlaps the elbow's outer end so the junction reads as one
      // column instead of a visible step.
      const elbow = buildPost({ r: ARM_R * 0.9, rTop: ARM_R * 0.9, h: 0.05, sides: 6, tones: C, bands: 1, aoHeight: 0.2 })
      elbow.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2))
      elbow.applyMatrix4(new THREE.Matrix4().makeRotationY(az))
      elbow.translate(sa * 0.05, ARM_Y, ca * 0.05)
      body.push(elbow)
      // Rise: tapered column up from the elbow's outer end (overlaps it).
      const rise = buildPost({ r: ARM_R, rTop: ARM_R * 0.78, h: ARM_H, y0: 0, sides: 6, tones: C, bands: 2, aoHeight: 0.25 })
      rise.translate(sa * 0.068, ARM_Y + 0.014, ca * 0.068)
      body.push(rise)
      // Arm tip cap.
      const tip = buildIcosa({ r: ARM_R * 0.78, detail: 1, seed: 84 + Math.round(az * 10), jitter: 0.06, squash: 0.5 })
      tip.translate(sa * 0.068, ARM_Y + 0.014 + ARM_H, ca * 0.068)
      shadeFaces(tip, C, { aoAmount: 0.3, aoHeight: 0.3 })
      body.push(tip)
      // Spines on the arm rise.
      for (let i = 0; i < 3; i++) {
        const sy = ARM_Y + 0.02 + i * 0.028
        extras.push(buildSpineDot({ r: ARM_R * (1 - (0.22 * (i + 0.5)) / 3), y: sy, theta: az + 0.15, size: 0.0075, color: SPINE }))
      }
    }

    // Spine dots along the trunk (biased toward the camera side).
    const spineThetas = [0.0, 0.35, -0.4, 0.12, 0.9, 2.4, 3.5]
    for (let i = 0; i < spineThetas.length; i++) {
      const sy = 0.02 + (i / spineThetas.length) * (TRUNK_H - 0.03)
      const rAtY = TRUNK_R - (TRUNK_R - TRUNK_RTOP) * (sy / TRUNK_H)
      extras.push(buildSpineDot({ r: rAtY, y: sy, theta: spineThetas[i], size: 0.0075, color: SPINE }))
    }

    const bodyGeo = mergePropParts(body)
    const parts = [bodyGeo, ...extras]
    // Rib ribbons along the trunk/arm creases (silhouette + rib lines).
    parts.push(buildRibbons(bodyGeo, { color: C.outline, width: 0.009, minDihedral: 0.3 }))
    parts.push(buildContactRing({ r: TRUNK_R + 0.008, color: C.outline }))
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
  cactus: {
    name: 'cactus',
    socket: 'center',
    max: 1,
    height: 0.22,
    hostTile: 'sand-plain',
  },
}

/**
 * Factory: returns the single merged cactus Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='cactus'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'cactus') {
  if (!VARIANTS[name]) {
    throw new Error(`cactus: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createCactus = createProp

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
