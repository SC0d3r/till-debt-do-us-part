/**
 * ROCK prop — reference document two, item 2 (to the letter).
 *
 * Low, irregular boulder: wider than it is tall, lumpy organic silhouette
 * (weathered stone, not a geometric block). Mid-to-dark blue-gray base with
 * scattered lighter gray + almost-white highlights on the upper-left faces,
 * darker navy/charcoal pixels in recesses and the lower-right, 1-pixel dark
 * cracks wandering across the surface, a few protruding pixels making the
 * outline bumpy. Dark charcoal/near-black blue-gray outline, thicker on the
 * underside and in deep recesses. Classic above-left lighting: lightest
 * top-left, darkest bottom-right, thin highlight row along the upper edge.
 *
 * Heavy visual anchor (world height 0.16) against bright tiles.
 *
 * Palette (6 colors incl. outline): blue-gray base, mid light, almost-white
 * highlight, navy-charcoal dark, crack charcoal, near-black blue-gray outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged crossed-quad
 * geometry + ONE material (see propBase.js buildCrossedQuadGeometry).
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildCrossedQuadGeometry,
  drawSpriteRows,
  paintNoise,
  insideDiamond,
  setPixel,
} from './propBase'

// ─── Palette (reference: blue-gray body, white-ish upper-left highlights,
// ─── navy/charcoal recesses + lower-right shadows, near-black blue-gray
// ─── broken outline, thick on the underside) ───
const b = 0x6f7a86 // base — mid blue-gray
const l = 0x8d99a6 // light — upper-left facets
const h = 0xc9d2db // highlight — almost-white flecks
const d = 0x4a5561 // dark — navy-charcoal recesses / lower-right
const c = 0x39424c // crack — 1px wandering dark lines
const O = 0x2b333c // outline — near-black blue-gray

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 4, y: 18, w: 22, h: 14 }
/** On-screen world height of the sprite (heavy anchor). */
const WORLD_HEIGHT = 0.16

// Row 0 = sprite top. '.' = transparent. Silhouette is deliberately lumpy —
// pixels stick out / indent by 1-2 steps; bottom row rests on the ground.
const SPRITE = [
  '.......ll.............', //  0 upper bumps — highlight row
  '......lhlll...........', //  1
  '.....lhhhlhl..........', //  2
  '.....hhhlbbl..........', //  3
  '....lhbblbbl..........', //  4
  '....hbbbbbbbl.........', //  5
  '...lhbbdbbbbbb........', //  6
  '...bbbdbbdbbbbb.......', //  7
  '..Obbbdbbdbbbbbb......', //  8
  '..Obbdbbbbbbdbbbb.....', //  9
  '.OObbbdbbdbbbbbbbb....', // 10
  '.OObbbbbdbbbbbbbbbb...', // 11
  '.OObdbbbbbbbdbbbbbb...', // 12
  '.OOObbbbbbbbbbbbbbb...', // 13 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { b, l, h, d, c, O }, SPRITE_RECT.x, SPRITE_RECT.y)
        // Grain/crack pass: a few wandering 1px cracks + raised clumps per
        // the reference's surface-noise rule (deterministic, seeded).
        const rng = new SeededRNG(4242)
        paintNoise(ctx, {
          rng,
          accents: [c],
          density: 3,
          clumpSize: 2,
          style: 'cracks',
          region: (x, y) =>
            insideDiamond(x, y, 32, 0) &&
            x >= SPRITE_RECT.x - 1 && x <= SPRITE_RECT.x + SPRITE_RECT.w + 1 &&
            y >= SPRITE_RECT.y - 1 && y <= SPRITE_RECT.y + SPRITE_RECT.h + 1,
        })
        paintNoise(ctx, {
          rng,
          accents: [h],
          density: 4,
          clumpSize: 1,
          style: 'grain',
          region: (x, y) =>
            insideDiamond(x, y, 32, 0) &&
            x >= SPRITE_RECT.x && x <= SPRITE_RECT.x + SPRITE_RECT.w - 1 &&
            y >= SPRITE_RECT.y && y <= SPRITE_RECT.y + SPRITE_RECT.h - 1 &&
            y <= SPRITE_RECT.y + 5, // raised light clumps stay upper-left
        })
        // A couple of protruding edge pixels (bumpy outline).
        setPixel(ctx, SPRITE_RECT.x + 1, SPRITE_RECT.y + 11, b)
        setPixel(ctx, SPRITE_RECT.x + SPRITE_RECT.w - 3, SPRITE_RECT.y + 8, l)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  rock: {
    name: 'rock',
    socket: 'center',
    max: 1,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged rock Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='rock'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'rock') {
  if (!VARIANTS[name]) {
    throw new Error(`rock: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createRock = createProp

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
