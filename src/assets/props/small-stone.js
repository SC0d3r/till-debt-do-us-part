/**
 * SMALL-STONE prop — corner socket, one small angular pebble (FORM redesign).
 *
 * A single jittered icosahedron CHUNK (detail 0, flat facets, pale gray ramp),
 * squashed low, with dark edge ribbons, base AO and a contact ring. Reads as
 * a modest stone that tucks into tile corners.
 *
 * World height ~0.08 — the smallest solid prop.
 *
 * Palette (4): pale gray light/mid/dark ramp + near-black outline.
 *
 * Socket: corner (max 4). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / shadeFaces / buildRibbons /
 * buildContactRing).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  sitOnGround,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (pale stone) ───
const S = { light: 0x9aa5b3, mid: 0x7a8595, dark: 0x556070, outline: 0x333c47 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const body = buildIcosa({ r: 0.06, detail: 0, seed: 41, jitter: 0.5, squash: 0.58, yaw: 0.7 })
    sitOnGround(body)
    shadeFaces(body, S, { aoAmount: 0.55 })
    const parts = [body]
    parts.push(buildRibbons(body, { color: S.outline, width: 0.01, minDihedral: 0.16 }))
    parts.push(buildContactRing({ r: 0.098, color: S.outline, thickness: 0.02 }))
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
  'small-stone': {
    name: 'small-stone',
    socket: 'corner',
    max: 4,
    height: 0.08,
    hostTile: 'dirt-plain',
  },
}

/**
 * Factory: returns the single merged small-stone Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='small-stone'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'small-stone') {
  if (!VARIANTS[name]) {
    throw new Error(`small-stone: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createSmallStone = createProp

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
