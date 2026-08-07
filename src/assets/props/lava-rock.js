/**
 * LAVA-ROCK prop — center socket, dark basalt boulder with glowing ember
 * cracks (lava-biome palette).
 *
 * A low, jagged basalt boulder (world height 0.16) in the lava family's
 * values: dark blue-black body, subtle gray-light upper-left facets and
 * darker recesses, with 1px ember cracks (orange → yellow) meandering from
 * the upper-middle toward the lower-right and small bright glow pools where
 * the cracks open. The glow is BAKED into the texture (hard pixel steps, no
 * gradients) — no real lights, one material only. The broken outline is
 * near-black blue-gray, thicker on the underside (stone rule, like the rock).
 *
 * Palette (6 colors incl. outline): basalt, basalt light, basalt dark, ember
 * orange, glow yellow, near-black blue-gray outline.
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

// ─── Palette (dark basalt + lava-family ember accents) ───
const b = 0x4a4a55 // basalt base
const l = 0x666673 // basalt light — upper-left facets
const d = 0x33333c // basalt dark — recesses / lower-right
const o = 0xff7a1a // ember crack — orange
const y = 0xffc832 // glow — hot yellow
const O = 0x232329 // outline — near-black blue-gray

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 6, y: 18, w: 19, h: 14 }
/** On-screen world height of the sprite. */
const WORLD_HEIGHT = 0.16

const SPRITE = [
  '........ll.........', //  0 upper highlight row
  '.......lbbl........', //  1
  '......lbbooo.......', //  2 crack begins (ember)
  '.....lbbboyybb.....', //  3 crack brightens (yellow glow)
  '....lbbbyybbb......', //  4
  '....bbbboybbbb.....', //  5
  '...bbbbboobbbb.....', //  6
  '...bdbbybbybbb.....', //  7
  '..Obbdyybybbbb.....', //  8
  '..Obdboybbdbbb.....', //  9
  '.OObbdboybdbbb.....', // 10
  '.OObbbboybbbbb.....', // 11
  '.OObdbbbbbdbbb.....', // 12
  '.OOObbbbbbbbbbb....', // 13 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { b, l, d, o, y, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'lava-rock': {
    name: 'lava-rock',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'lava-plain',
  },
}

/**
 * Factory: returns the single merged lava-rock Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='lava-rock'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'lava-rock') {
  if (!VARIANTS[name]) {
    throw new Error(`lava-rock: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createLavaRock = createProp

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
