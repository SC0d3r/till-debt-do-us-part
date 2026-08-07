/**
 * LANTERN prop — edge socket, small lantern with warm baked glow.
 *
 * A short wooden post (3px wide) with a small paper-lantern body on top: a
 * bright warm core (2px yellow-white), a bright ring, a warm orange mid, a
 * dark ember rim, and a baked orange glow spilling around the body — the
 * "warm glassy glow" is IN the texture (hard pixel steps, no gradients), no
 * real lights. The lantern's top cap is outlined with the near-black brown.
 *
 * World height 0.16 — smaller and calmer than the torch; the post's bottom
 * rests on the tile surface; composers place it at an edge midpoint.
 *
 * Palette (6 colors incl. outline): glow yellow, bright core, warm orange,
 * dark rim, post wood, near-black brown outline.
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
const y = 0xffd27a // lantern mid — warm orange-yellow
const b = 0xfff0c0 // lantern core — bright glass glow
const o = 0xe8942a // lantern rim — orange
const d = 0xb05e14 // lantern base ring — dark ember
const w = 0x6e4a2a // post wood
const O = 0x3a2412 // outline — near-black brown

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 11, y: 16, w: 12, h: 16 }
/** On-screen world height of the sprite. */
const WORLD_HEIGHT = 0.16

const SPRITE = [
  '..OO........', //  0 cap outline
  '.Obo........', //  1 cap
  '.Obbbo......', //  2 lantern top
  '.obbbbo.....', //  3 body — warm ring
  'obbyybo.....', //  4 body — bright glass core
  'obbyybo.....', //  5
  'obbyybo.....', //  6
  'obbbybo.....', //  7
  'obbbybo.....', //  8
  '.obbbo......', //  9 body bottom
  '.Odbo.......', // 10 base ring (dark ember)
  '..Ow........', // 11 post
  '..Ow........', // 12
  '..Ow........', // 13
  '..Ow........', // 14
  '..Ow........', // 15 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { y, b, o, d, w, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  lantern: {
    name: 'lantern',
    socket: 'edge',
    max: 4,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
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
