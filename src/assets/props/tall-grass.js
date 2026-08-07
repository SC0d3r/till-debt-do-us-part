/**
 * TALL-GRASS prop — reference document two, item 4 (to the letter).
 *
 * Vertical, spiky fern/grass tuft: a small irregular dark-green base clump
 * anchoring the plant, with 6 individual blades rising from it. Blades are
 * 1-2px wide with varying heights and slight leans (left AND right) so the
 * silhouette is jagged and upward-reaching; each blade is bright on its upper
 * portion, mid/dark toward the base, carries a dark pixel run down its lower
 * half for definition, catches a thin highlight on the left side of
 * left-leaning blades, and has its tip treated with the outline color
 * ("each leaf tip has its own outline treatment").
 *
 * Light-to-medium weight, strong vertical accent (world height 0.26 — the
 * tallest vegetation prop).
 *
 * Palette (5 colors incl. outline): bright/mid/dark green, dark base green,
 * dark-green outline.
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
  setPixel,
} from './propBase'

// ─── Palette (reference: bright-to-mid blades, dark lower halves, dark
// ─── anchor clump, dark-green outline following each blade tip) ───
const B = 0x7ccd5f // blade upper — bright
const M = 0x4fa03c // blade mid
const D = 0x3e8a31 // blade lower — dark
const b = 0x2e6b24 // base clump — dark green
const O = 0x274d20 // outline — dark green

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 9, y: 6, w: 14, h: 26 }
/** On-screen world height of the sprite (strong vertical accent). */
const WORLD_HEIGHT = 0.26

/** Canvas row where the blades emerge from the base clump. */
const BASE_Y = 27

// Blades: absolute canvas x, pixel height (tip row = BASE_Y - h), total lean
// (left = negative, right = positive). Deliberately varied: two tall blades,
// mid heights, a short one — jagged, upward-reaching silhouette.
const BLADES = [
  { x: 11, h: 9, lean: -1 },
  { x: 13, h: 15, lean: 1 },
  { x: 15, h: 20, lean: -2 }, // tallest — leans left
  { x: 17, h: 17, lean: 2 },
  { x: 19, h: 11, lean: 1 },
  { x: 20, h: 7, lean: -1 },
]

/** Base clump: small irregular dark-green clump (row 31 = ground row). */
const BASE_ROWS = [
  '....BDDD......', // r0 (canvas 26)
  '...bBBDDD.....', // r1
  '..bBBBDDD.....', // r2
  '..ObBBBDD.....', // r3
  '.ObB..ODD.....', // r4
  '.Ob....bB.....', // r5 — ground row (canvas 31)
]
const BASE_LEGEND = { B, D, b, O }

/** Paints one blade: bright upper third, mid middle, dark lower half, dark
 *  tip (outline treatment), thin highlight on the lit (left) side of blades
 *  leaning left, 2px-wide lower half on tall blades. */
function paintBlade(ctx, x0, h, lean) {
  for (let s = 0; s < h; s++) {
    const y = BASE_Y - s
    const x = x0 + Math.round((lean * s) / h)
    let col
    if (s === h - 1) col = O // tip — outline treatment
    else if (s >= h * 0.62) col = B // upper — bright
    else if (s >= h * 0.3) col = M // middle
    else col = D // lower — dark
    setPixel(ctx, x, y, col)
    // left-side highlight on left-leaning blades (lit edge), upper half
    if (lean < 0 && s < h * 0.6 && s > h * 0.12 && x - 1 >= SPRITE_RECT.x) {
      setPixel(ctx, x - 1, y, B)
    }
    // tall blades carry a second darker column down the lower half
    if (h >= 15 && s < h * 0.55 && x + 1 <= SPRITE_RECT.x + SPRITE_RECT.w - 1) {
      setPixel(ctx, x + 1, y, D)
    }
  }
}

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
        drawSpriteRows(ctx, BASE_ROWS, BASE_LEGEND, SPRITE_RECT.x, SPRITE_RECT.y + 20)
        for (const blade of BLADES) paintBlade(ctx, blade.x, blade.h, blade.lean)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'tall-grass': {
    name: 'tall-grass',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged tall-grass Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='tall-grass'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'tall-grass') {
  if (!VARIANTS[name]) {
    throw new Error(`tall-grass: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createTallGrass = createProp

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
