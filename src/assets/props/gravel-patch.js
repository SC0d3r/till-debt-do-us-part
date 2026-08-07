/**
 * GRAVEL-PATCH prop — surface socket, flat scattered gravel over the tile top
 * face (visual only — NO passability logic, per the Slice B scope).
 *
 * A flat diamond overlay (see propBase.js buildFlatOverlayGeometry — same
 * footprint + UV mapping as the tile cap, raised a tiny epsilon so it never
 * z-fights) carrying a sparse scatter of small stone clumps INSIDE the
 * diamond: 2-4px gray/tan stones, each with its own 1px above-left light and
 * lower-right dark pixel, following the same stone palette language as
 * small-stone/pebble-cluster. The texture is mostly transparent, so the
 * tile's own baked detail shows through between stones — it reads as gravel
 * ON the ground, not a painted slab.
 *
 * Socket: surface (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material. Deterministic seeded scatter.
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildFlatOverlayGeometry,
  insideDiamond,
  setPixel,
} from './propBase'

// ─── Palette (stone family — gray + a few warm tan pebbles) ───
const GRAY = 0x8b96a2
const GRAY_L = 0xb4bec9
const GRAY_D = 0x5a6570
const TAN = 0xa8906a
const TAN_L = 0xc2ab7e
const TAN_D = 0x7d6846

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
        const size = ctx.canvas.width
        const rng = new SeededRNG(5551)
        // Sparse seeded scatter — most of the diamond stays transparent.
        for (let i = 0; i < 14; i++) {
          // stone clump center inside the diamond, away from the rim
          let cx = 16
          let cy = 16
          for (let t = 0; t < 14; t++) {
            cx = Math.floor(rng.next() * size)
            cy = Math.floor(rng.next() * size)
            if (insideDiamond(cx, cy, size, 2)) break
          }
          if (!insideDiamond(cx, cy, size, 2)) continue
          const isTan = rng.next() < 0.28
          const base = isTan ? TAN : GRAY
          const light = isTan ? TAN_L : GRAY_L
          const dark = isTan ? TAN_D : GRAY_D
          // 2-4px stone blob
          const n = 2 + Math.floor(rng.next() * 3)
          let x = cx
          let y = cy
          for (let k = 0; k < n; k++) {
            if (insideDiamond(x, y, size, 1)) setPixel(ctx, x, y, base)
            x += Math.floor(rng.next() * 3) - 1
            y += Math.floor(rng.next() * 3) - 1
          }
          // per-stone above-left shading
          if (insideDiamond(cx - 1, cy - 1, size, 1)) setPixel(ctx, cx - 1, cy - 1, light)
          if (insideDiamond(cx + 1, cy + 1, size, 1)) setPixel(ctx, cx + 1, cy + 1, dark)
        }
      })
    )
  }
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
 * The mesh's local origin is the tile-top plane (geometry carries the tiny
 * anti-z-fight epsilon), so composers place it at tile-top height directly.
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
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createGravelPatch = createProp

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
