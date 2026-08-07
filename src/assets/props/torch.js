/**
 * TORCH prop — edge socket, wooden stake with a bright baked flame.
 *
 * A jagged wooden stake (3px wide, dark-shaded right edge, near-black brown
 * broken outline) with a hot flame pixel cluster baked into the texture —
 * NO real lights, NO bloom, one material only. The flame reads like classic
 * pixel-art fire: bright yellow core, orange mid, dark ember rim, plus a
 * baked orange glow row around the flame so it "lights" the stake top without
 * any runtime light. Charred ember pixels where the flame meets the wood.
 *
 * World height 0.24 (the tallest of the edge props). The stake's bottom rests
 * on the tile surface; composers place it at an edge midpoint.
 *
 * Palette (6 colors incl. outline): flame yellow, orange, ember red, wood,
 * dark wood, near-black brown outline.
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
const y = 0xffe08a // flame core — yellow
const o = 0xff8a3a // flame mid — orange (also baked glow)
const e = 0x8a2c14 // ember — dark red rim / charred wood
const w = 0x7a5230 // wood
const W = 0x5c3a1f // wood dark (right edge shadow)
const O = 0x3a2412 // outline — near-black brown

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 11, y: 8, w: 12, h: 24 }
/** On-screen world height of the sprite. */
const WORLD_HEIGHT = 0.24

// Flame is asymmetric (flickers left), glows out past its core, then the
// stake tapers with charred ember at the top.
const SPRITE = [
  '....y.......', //  0 flame tip
  '...yy.......', //  1
  '...yyo......', //  2
  '..oyyo......', //  3
  '..oyoyo.....', //  4
  '.eoyoyo.....', //  5 baked glow spills left/right of the flame
  '.eoyoyo.....', //  6
  '.eoyoyo.....', //  7
  '..eyyo......', //  8
  '..eOeo......', //  9 ember + charred stake top
  '..ew........', // 10 stake
  '..wW........', // 11
  '..wW........', // 12
  '..Ww........', // 13
  '..wW........', // 14
  '..wW........', // 15
  '..Ww........', // 16
  '..wW........', // 17
  '..Ww........', // 18
  '..wW........', // 19
  '..Ww........', // 20
  '.OwW........', // 21 outline along the stake edge
  '.OwW........', // 22
  '.Oww........', // 23 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { y, o, e, w, W, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  torch: {
    name: 'torch',
    socket: 'edge',
    max: 4,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged torch Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='torch'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'torch') {
  if (!VARIANTS[name]) {
    throw new Error(`torch: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createTorch = createProp

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
