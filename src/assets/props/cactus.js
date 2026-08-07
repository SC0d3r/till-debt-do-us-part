/**
 * CACTUS prop — center socket, desert saguaro (sand-biome palette).
 *
 * A saguaro with one left arm: thick trunk (4px wide) with a vertical
 * light-left / dark-right ridge treatment (above-left light), a bright top
 * cap, one arm jutting left then rising, 1px spine accents (pale
 * yellow-green) at the arm/trunk tips and sides, and a broken dark-green
 * outline that follows the silhouette. The base sits flush on the sand tile
 * (the bottom row is base green, no outline — a plant rooted in the ground).
 *
 * World height 0.24 — the tallest desert prop, strong vertical accent.
 *
 * Palette (5 colors incl. outline): cactus green, light green, dark green,
 * spine pale, dark-green outline.
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

// ─── Palette (desert greens — drier/more muted than the grass family) ───
const g = 0x55804a // base — cactus green
const l = 0x7aa86b // light — lit left facets / top cap
const d = 0x3a5c33 // dark — right-edge shadow ridge
const s = 0xc8d8a0 // spine — pale yellow-green
const O = 0x2b4026 // outline — dark green (never black)

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 9, y: 8, w: 15, h: 24 }
/** On-screen world height of the sprite. */
const WORLD_HEIGHT = 0.24

const SPRITE = [
  '..ss...........', //  0 arm + trunk spine tips
  '..ll...........', //  1 arm top (lit)
  '..lg...........', //  2
  '..lg....s......', //  3 trunk spine
  '..lg....ll.....', //  4 trunk top (lit cap)
  '..lg....lg.....', //  5
  '..lg....lg.....', //  6
  '..lg....lg.....', //  7
  '..lg...dlg.....', //  8
  '..lg...dlg.....', //  9
  '..lg...dlg.....', // 10
  '..lg...dlg.....', // 11
  '..lggggggg.....', // 12 arm joins trunk
  '..lgggggggd....', // 13
  '.......ggd.....', // 14 trunk
  '.......ggd.....', // 15
  '.......ggd.....', // 16
  '.......ggd.....', // 17
  '.......gdd.....', // 18
  '.......ggd.....', // 19
  '.......ggd.....', // 20
  '.......ggd.....', // 21
  '......Oggd.....', // 22 outline at the base edge
  '.......ggd.....', // 23 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { g, l, d, s, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  cactus: {
    name: 'cactus',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'sand-plain',
  },
}

/**
 * Factory: returns the single merged cactus Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='cactus'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'cactus') {
  if (!VARIANTS[name]) {
    throw new Error(`cactus: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createCactus = createProp

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
