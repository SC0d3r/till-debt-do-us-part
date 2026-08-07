/**
 * PEBBLE-CLUSTER prop — corner socket, 2-3 small pebbles grouped.
 *
 * Three small rounded pebbles (two blue-gray, one warm tan) clustered with
 * slight overlap, each with its own above-left shading (light upper-left,
 * dark lower-right) and its own broken near-black outline — outlines stay
 * independent, no color bleeding, per the reference's overlap rule. The
 * cluster reads as one corner-scatter placement (world height 0.08 — the
 * lowest prop).
 *
 * Palette (6 colors incl. outline). Socket: corner (max 4).
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
const g = 0x8b96a2 // gray pebble base
const L = 0xb0bac5 // gray light
const d = 0x616c78 // gray dark
const t = 0xa8906a // tan pebble base
const O = 0x3f454e // outline — near-black stone gray

/** Sprite pixel rect inside the 32x32 canvas (base row = 31 = ground). */
const SPRITE_RECT = { x: 8, y: 22, w: 16, h: 10 }
/** On-screen world height of the sprite (tiny cluster). */
const WORLD_HEIGHT = 0.08

const SPRITE = [
  '................', //  0
  '..gg............', //  1 left gray pebble top
  '..gLg.tt........', //  2
  '..ggg.tttt......', //  3 tan pebble
  '...gg.tttt.gg...', //  4 right gray pebble starts
  '...Og.tttt.gL...', //  5
  '......ttO.tg....', //  6
  '......Og..Ogg...', //  7
  '......Od....d...', //  8
  '....O..OtO..Og..', //  9 ground row — rests on the tile
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
        drawSpriteRows(ctx, SPRITE, { g, L, d, t, O }, SPRITE_RECT.x, SPRITE_RECT.y)
      })
    )
  }
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'pebble-cluster': {
    name: 'pebble-cluster',
    socket: 'corner',
    max: 4,
    height: WORLD_HEIGHT,
    hostTile: 'grass-plain',
  },
}

/**
 * Factory: returns the single merged pebble-cluster Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='pebble-cluster'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'pebble-cluster') {
  if (!VARIANTS[name]) {
    throw new Error(`pebble-cluster: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createPebbleCluster = createProp

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
