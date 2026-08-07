/**
 * CACTUS prop — center socket, desert saguaro (SOLID rework).
 *
 * A real 3D saguaro: a dark plinth, a thick tapered hexagon TRUNK whose top
 * face carries the ridge art (cactus green base, lit-left/ridge light,
 * right-edge dark ridge stripe, pale yellow-green spine speckles, dark-green
 * outline) and whose side walls carry the cactus-green band with per-wall
 * above-left shade (the left-facing walls read lit, right-facing walls
 * shadowed — the "light-left / dark-right ridge treatment" from the spec,
 * now a property of the actual 3D faces), plus ONE arm: a short solid stub
 * jutting out and a rising tapered hexagon arm with a bright tip cap. The
 * base sits flush on the sand tile.
 *
 * World height 0.24 — the tallest desert prop, strong vertical accent.
 *
 * Palette (5 colors incl. outline): cactus green, light green, dark green,
 * spine pale, dark-green outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry (plinth +
 * trunk + stub + arm) + ONE material (see propBase.js buildPrism / merge).
 */

import * as THREE from 'three'
import {
  SeededRNG,
  makePropTexture,
  makePropMaterial,
  buildPrism,
  buildBase,
  mergePropParts,
  paintPrismTop,
  polygonPoints,
  polyToPixels,
} from './propBase'

// ─── Palette (desert greens — drier/more muted than the grass family) ───
const g = 0x55804a // base — cactus green
const l = 0x7aa86b // light — lit left facets / top cap
const d = 0x3a5c33 // dark — right-edge shadow ridge
const s = 0xc8d8a0 // spine — pale yellow-green
const O = 0x2b4026 // outline — dark green (never black)

/** Canvas side (32): trunk top-art rect + reserved white pixel. */
const SIZE = 32
const TRUNK_UV = { x: 4, y: 4, w: 24, h: 24 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.06, sideColor: d, size: SIZE }))
    // Trunk: thick, slightly tapered, ridge art on top.
    const trunk = buildPrism({
      pts: polygonPoints(6, 0.045),
      ptsTop: polygonPoints(6, 0.038),
      y0: 0.036,
      y1: 0.22,
      uv: TRUNK_UV,
      size: SIZE,
      sideColor: g,
    })
    parts.push(trunk)
    // Arm stub: juts out from the trunk at its base, then the arm rises.
    const stub = buildPrism({
      pts: polygonPoints(6, 0.016),
      ptsTop: polygonPoints(6, 0.014),
      y0: 0.036,
      y1: 0.075,
      uv: TRUNK_UV,
      size: SIZE,
      sideColor: g,
      capColor: g,
    })
    stub.translate(0.052, 0, 0.008)
    parts.push(stub)
    const arm = buildPrism({
      pts: polygonPoints(6, 0.02),
      ptsTop: polygonPoints(6, 0.016),
      y0: 0.075,
      y1: 0.19,
      uv: TRUNK_UV,
      size: SIZE,
      sideColor: g,
      capColor: l,
    })
    arm.translate(0.086, 0, 0.024)
    parts.push(arm)
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rng = new SeededRNG(701)
        const pts = polyToPixels(TRUNK_UV, polygonPoints(6, 0.045))
        paintPrismTop(ctx, {
          pts,
          rng,
          base: g,
          accents: [l, d, { color: s, weight: 0.7 }],
          density: 10,
          style: 'clumps',
          light: l,
          shadow: d,
          shadowPools: 5,
          outline: O,
          outlineSkip: 0.3,
        })
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
    height: 0.24,
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
