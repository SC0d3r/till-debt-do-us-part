/**
 * SMALL-STONE prop — corner socket, tiny rounded stone.
 *
 * The lightest of the stone family (world height 0.10): a small rounded
 * pebble with the same blue-gray palette language as the rock — light
 * upper-left facet, mid base, dark lower-right shadow, broken near-black
 * blue-gray outline (thicker on the underside). Rests flush on the tile.
 *
 * Palette (4 colors incl. outline). Socket: corner (max 4) — the composer
 * scatters it at the diamond's vertices.
 *
 * InstancedMesh-safe: ONE merged crossed-quad geometry + ONE material (see
 * propBase.js buildCrossedQuadGeometry).
 */

import * as THREE from 'three'
import {
  makePropTexture,
  makePropMaterial,
  buildCrossedQuadGeometry,
  drawSpriteRows,
} from './propBase'

// ─── Palette ───
const b = 0x8894a0 // base — blue-gray
const l = 0xb4bec9 // light — upper-left facet
const d = 0x5a6570 // dark — lower-right shadow
const O = 0x3a434d // outline — near-black blue-gray

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 11, y: 24, w: 11, h: 8 }
/** On-screen world height of the sprite (tiny). */
const WORLD_HEIGHT = 0.1

const SPRITE = [
  '....ll.....',
  '...lbb.....',
  '..lbbb.....',
  '..bbbb.....',
  '..bdbb.....',
  '.Obbbb.....',
  '.Odbd......',
  '.OObb......', // ground row — rests on the tile
]

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    geometry = buildCrossedQuadGeometry({ worldHeight: WORLD_HEIGHT, spriteRect: SPRITE_RECT })
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture((ctx) => {
        drawSpriteRows(ctx, SPRITE, { b, l, d, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'small-stone': {
    name: 'small-stone',
    socket: 'corner',
    max: 4,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
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
