/**
 * FLOWER prop — reference document two, item 1 (to the letter).
 *
 * Tiny two-bloom plant: two white 3-4px bloom clusters side by side, each
 * with one darker gray center pixel (stigma/shadow), on short 1px stems that
 * darken toward the bottom and join into a small irregular dark-green base
 * clump. Extremely light visual weight (world height 0.12 — the smallest
 * vegetation prop).
 *
 * Palette (6 colors incl. outline): pure white petals, light gray (right-side
 * volume on each bloom), bright + dark stem green, dark green base, dark
 * olive outline. The white blooms have almost no outline per the reference —
 * the outline hugs the stems/base only. Above-left light: the left bloom side
 * is purest white, the right side carries the gray pixel.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged crossed-quad
 * geometry + ONE material (see propBase.js buildCrossedQuadGeometry).
 */

import * as THREE from 'three'
import {
  makePropTexture,
  makePropMaterial,
  buildCrossedQuadGeometry,
  drawSpriteRows,
} from './propBase'

// ─── Palette (reference: pure white petals, cool gray center, green stems
// ─── that darken downward, dark-green anchor clump, dark-olive outline) ───
const W = 0xffffff // petal — purest white
const G = 0xd6d8da // stigma / right-side volume gray
const S = 0x4fa03c // stem, upper (bright)
const s = 0x3e8a31 // stem, lower (darker)
const B = 0x2e6b24 // base clump
const O = 0x274d20 // outline — dark olive

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 10, y: 18, w: 12, h: 14 }
/** On-screen world height of the sprite (tiny — the lightest prop). */
const WORLD_HEIGHT = 0.12

// Row 0 = sprite top. '.' = transparent. Bottom row rests on the ground line.
const SPRITE = [
  '.WW....WW...', //  0 blooms — outer petals
  '.WGW...WGW..', //  1 blooms — gray center pixel (right-side volume)
  '..W.....W...', //  2 blooms — base petal
  '..S.....s...', //  3 stems (bright top …)
  '..S.....s...', //  4
  '...S...s....', //  5 stems lean toward each other
  '...S...s....', //  6
  '....S.s.....', //  7
  '...BBBBB....', //  8 base clump (dark green)
  '..BBBBBBB...', //  9
  '.OBBBBBBB...', // 10
  '.OBBBB.BBB..', // 11 outline breaks along the clump
  '.BBO...OBB..', // 12
  '.BB.....BB..', // 13 ground row — flush on the tile surface
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
        drawSpriteRows(ctx, SPRITE, { W, G, S, s, B, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  flower: {
    name: 'flower',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged flower Mesh (InstancedMesh-safe).
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
