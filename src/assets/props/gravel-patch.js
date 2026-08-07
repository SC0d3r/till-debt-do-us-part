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
    // overlay: wide, very flat domes. detail 0 + light jitter: a handful of
    // clean facets, otherwise 80 facets at this scale read as pixel noise.
    // Spread apart so the patch covers the tile, not a central pile (F2).
    const mounds = [
      { r: 0.055, jitter: 0.18, squash: 0.3, seed: 801, off: [-0.16, 0.1] },
      { r: 0.045, jitter: 0.18, squash: 0.3, seed: 802, off: [0.19, -0.12] },
    ]
    for (const mn of mounds) {
      const g = buildIcosa({ r: mn.r, detail: 0, seed: mn.seed, jitter: mn.jitter, squash: mn.squash, yaw: mn.seed })
      sitOnGround(g)
      shadeFaces(g, GRAY, { aoAmount: 0.45 })
      g.translate(mn.off[0], 0, mn.off[1])
      parts.push(g)
    }
    // Pebble scatter across a wide disc (~0.45 world radius, F2): pebbles are
    // ~2x the old size so they read at the preview's 32px/unit resolution.
    const pebbles = [
      { r: 0.055, jitter: 0.5, squash: 0.62, seed: 811, off: [-0.22, -0.18], tan: true },
      { r: 0.048, jitter: 0.55, squash: 0.64, seed: 812, off: [0.26, 0.1], tan: false },
      { r: 0.044, jitter: 0.5, squash: 0.62, seed: 813, off: [-0.1, 0.24], tan: false },
      { r: 0.04, jitter: 0.55, squash: 0.66, seed: 814, off: [0.12, -0.28], tan: true },
      { r: 0.036, jitter: 0.5, squash: 0.62, seed: 815, off: [0.3, -0.04], tan: false },
      { r: 0.033, jitter: 0.6, squash: 0.62, seed: 816, off: [-0.32, 0.02], tan: false },
      { r: 0.03, jitter: 0.55, squash: 0.66, seed: 817, off: [0.02, 0.32], tan: false },
      { r: 0.038, jitter: 0.5, squash: 0.64, seed: 818, off: [-0.05, -0.32], tan: false },
    ]
    for (const pb of pebbles) {
      const g = buildIcosa({ r: pb.r, detail: 0, seed: pb.seed, jitter: pb.jitter, squash: pb.squash, yaw: pb.seed })
      sitOnGround(g)
      // Tight light bucket (see pebble-cluster.js): small squashed chunks
      // otherwise collapse into a single light tone and read flat.
      shadeFaces(g, pb.tan ? TAN : GRAY, { aoAmount: 0.5, hi: 0.7, lo: 0.1 })
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
