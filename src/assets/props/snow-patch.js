/**
 * SNOW-PATCH prop — surface socket, flat snow drifts over the tile top face
 * (visual only — NO passability logic).
 *
 * A flat diamond overlay (see propBase.js buildFlatOverlayGeometry) carrying
 * clustered snow-drift blobs INSIDE the diamond: white/cool-white mounds with
 * cool gray-blue shadow edges (the snow family's values), sparse enough that
 * the tile's own detail shows through between drifts. The drift mounds share
 * the organic blob painter (paintBlobSprite) used by the bush family, so the
 * whole kit reads as one noise language.
 *
 * Socket: surface (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material. Deterministic seeded drifts.
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildFlatOverlayGeometry,
  paintBlobSprite,
} from './propBase'

// ─── Palette (snow family values) ───
const DRIFT = {
  e: 0xeaf1f8, // drift base — cool white
  d: 0xc8d6e4, // drift shadow — cool gray-blue
  k: 0xa8bcd0, // deepest shadow pocket
  l: 0xffffff, // pure white cap
  O: 0x7e93ad, // broken cool pale blue outline
}

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) geometry = buildFlatOverlayGeometry()
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture((ctx) => {
        // Drifts cluster around the diamond center, well inside the rim
        // (bounds square inscribed in the diamond).
        paintBlobSprite(ctx, new SeededRNG(7777), DRIFT, {
          bounds: { x0: 5, y0: 5, x1: 26, y1: 26 },
          cx: 16,
          cy: 16,
          radius: 8,
          clumpCount: 7,
          clumpSize: 3,
          spikeCount: 5,
          outlineSkip: 0.4,
          forceGround: false,
        })
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'snow-patch': {
    name: 'snow-patch',
    socket: 'surface',
    max: 1,
    height: 0,
    hostTile: 'snow-plain',
  },
}

/**
 * Factory: returns the single merged snow-patch Mesh (InstancedMesh-safe).
 * The mesh's local origin is the tile-top plane (geometry carries the tiny
 * anti-z-fight epsilon), so composers place it at tile-top height directly.
 *
 * @param {string} [name='snow-patch'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'snow-patch') {
  if (!VARIANTS[name]) {
    throw new Error(`snow-patch: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createSnowPatch = createProp

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
