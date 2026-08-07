/**
 * FLOWER prop — center socket, tiny white two/three-bloom wildflower cluster
 * (FORM redesign).
 *
 * Three individual flowers per reference B 5a: each is a thin tapered hex
 * stem with a flattened petal dome (icosahedron detail 1, squashed flat —
 * "flattened sphere" petals) and a tiny bright yellow core sphere on top.
 * The trio is scattered in a loose triangular cluster with per-stem yaw,
 * lean and ±10% scale variety so nothing looks copy-pasted; stems lean
 * toward the camera. Each flower sits on its own tiny dark contact dot.
 *
 * World height ~0.13 — tiny, low visual weight.
 *
 * Palette (6): white petal + gray petal shade, warm yellow core + yellow
 * light, stem bright/dark green pair, dark olive contact tone.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / buildPost / sitOnGround /
 * shadeFaces / buildContactRing).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  buildPost,
  sitOnGround,
  shadeFaces,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (reference B flower ramp) ───
const PETAL = { light: 0xffffff, mid: 0xf0f2f5, dark: 0xb5bac0, outline: 0x2a4a1c }
const CORE = { light: 0xffe08a, mid: 0xffd54f, dark: 0xe0a92e, outline: 0x8a6a10 }
// Stems in a darker green than the grass tile so they connect heads to
// ground (B1): faceTone gives them the light-−x/dark-+x two-tone treatment.
const STEM = { light: 0x3d6b35, mid: 0x2d5a27, dark: 0x1e3f1c, outline: 0x17300f }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Loose triangular scatter; per-stem variety (yaw/lean/scale). The third
    // bloom is pushed toward +z (the camera) so the three heads overlap at
    // different depths — parallax (B1).
    const flowers = [
      { off: [-0.045, 0.012], h: 0.115, yaw: 0.4, lean: 0.09, scale: 1.0, seed: 71 },
      { off: [0.05, 0.002], h: 0.13, yaw: -0.35, lean: 0.05, scale: 0.9, seed: 72 },
      { off: [0.004, 0.078], h: 0.1, yaw: 1.15, lean: 0.13, scale: 1.08, seed: 73 },
    ]
    for (const fl of flowers) {
      const base = new THREE.Matrix4().makeTranslation(fl.off[0], 0, fl.off[1])
      const pivot = new THREE.Matrix4().makeTranslation(0, 0.006, 0)
      const fromPivot = new THREE.Matrix4().makeTranslation(0, -0.006, 0)
      const leanM = new THREE.Matrix4().makeRotationX(fl.lean)
      const yawM = new THREE.Matrix4().makeRotationY(fl.yaw)
      const m = base.multiply(pivot).multiply(leanM).multiply(yawM).multiply(fromPivot)
      const s = fl.scale

      // Stem: thin tapered hex post, slightly buried (thicker than v3 so it
      // reads against grass — B1).
      const stem = buildPost({
        r: 0.0095 * s,
        rTop: 0.0055 * s,
        h: fl.h,
        y0: -0.006,
        sides: 6,
        tones: STEM,
        bands: 1,
        aoHeight: 0.2,
      })
      stem.applyMatrix4(m)
      parts.push(stem)

      // Petals: flattened dome on the stem tip — squash 0.58 so the dome
      // keeps a shaded rim and reads round, not as a flat disc (B1).
      const petal = buildIcosa({ r: 0.03 * s, detail: 1, seed: fl.seed, jitter: 0.1, squash: 0.58 })
      petal.translate(0, fl.h + 0.004, 0)
      shadeFaces(petal, PETAL, { aoAmount: 0.15, aoHeight: 0.1, hi: 0.7, lo: 0.02 })
      petal.applyMatrix4(m)
      parts.push(petal)

      // Core: tiny bright sphere above the petal dome.
      const core = buildIcosa({ r: 0.011 * s, detail: 0, seed: fl.seed + 5 })
      core.translate(0, fl.h + 0.016, 0)
      shadeFaces(core, CORE, { aoAmount: 0.2, aoHeight: 0.4 })
      core.applyMatrix4(m)
      parts.push(core)
    }

    // ONE dark near-black-olive contact ring under the whole cluster (B1) —
    // replaces the three invisible per-flower dots. Centered on the scatter
    // centroid (flowers at xz ≈ (0.003, 0.03)).
    parts.push(buildContactRing({ r: 0.03, color: PETAL.outline, thickness: 0.016, y: 0.001 }))
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
  flower: {
    name: 'flower',
    socket: 'center',
    max: 1,
    height: 0.13,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged flower cluster Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='flower'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'flower') {
  if (!VARIANTS[name]) {
    throw new Error(`flower: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createFlower = createProp

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
