/**
 * BIG-STONE prop — corner socket (also center-compatible), larger stone.
 *
 * A chunky, heavier stone than small-stone (world height 0.16): a rounded
 * weathered block with a solid body, light upper-left facets + almost-white
 * highlight flecks, dark lower-right shadow, broken near-black blue-gray
 * outline thicker on the underside. Deliberately SIMPLER than the rock —
 * fewer lumps, no wandering cracks — so it reads as a boulder, not a mini
 * rock.
 *
 * Palette (5 colors incl. outline). Socket: corner (max 4); the manifest
 * notes center compatibility so composers may treat it as either.
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

// ─── Palette (same stone family as rock/small-stone) ───
const b = 0x74808c // base — blue-gray
const l = 0x93a0ac // light — upper-left facets
const h = 0xc2ccd5 // highlight — almost-white flecks
const d = 0x4e5965 // dark — lower-right shadow
const O = 0x2f3740 // outline — near-black blue-gray

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 6, y: 18, w: 20, h: 14 }
/** On-screen world height of the sprite (heavy). */
const WORLD_HEIGHT = 0.16

const SPRITE = [
  '........ll..........', //  0 upper highlight row
  '.......lbbll........', //  1
  '......lbbbbll.......', //  2
  '.....lbbbbbbbl......', //  3
  '.....hbbbbbbbl......', //  4
  '....lhbbbbbbbb......', //  5
  '....lbbbdbbbbb......', //  6
  '...lbbbdbbbbbb......', //  7
  '...bbbdbbbbbbb......', //  8
  '..Obbdbbbbbbbb......', //  9
  '..Obbbdbbbbbbb......', // 10
  '.OObbbdbbbbbbbb.....', // 11
  '.OObbbbbbbbbbbb.....', // 12
  '.OOObbbbbbbbbbbb....', // 13 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { b, l, h, d, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'big-stone': {
    name: 'big-stone',
    socket: 'corner',
    max: 4,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
    // The brief allows corner OR center; corner is the primary socket so the
    // composer can place up to 4 per tile, but center placement is legal too.
    alsoSockets: ['center'],
  },
}

/**
 * Factory: returns the single merged big-stone Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='big-stone'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'big-stone') {
  if (!VARIANTS[name]) {
    throw new Error(`big-stone: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createBigStone = createProp

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
