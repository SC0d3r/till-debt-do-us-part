/**
 * LANTERN prop — edge socket, small post lantern with baked warm glow (SOLID
 * rework).
 *
 * A real 3D lantern: a dark plinth, a short solid hexagon post, a solid
 * hexagon lantern BODY whose top face carries the warm glow art (bright
 * glass core, warm orange-yellow mid, orange rim, dark ember base ring,
 * near-black brown outline — a baked light source, no runtime lights) and
 * whose side walls carry the warm band, then a dark cap and a tiny finial.
 * Hero faces toward the +z camera, above-left shading everywhere.
 *
 * World height 0.16 — compact warm marker for edges and paths.
 *
 * Palette (6 colors incl. outline): glow yellow, bright core, warm orange,
 * dark rim, post wood, near-black brown outline.
 *
 * Socket: edge (max 4). InstancedMesh-safe: ONE merged geometry (plinth +
 * post + body + cap + finial) + ONE material (see propBase.js buildPrism /
 * merge).
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

// ─── Palette (lantern — warm glow + wood) ───
const y = 0xffd27a // lantern mid — warm orange-yellow
const b = 0xfff0c0 // lantern core — bright glass glow
const o = 0xe8942a // lantern rim — orange
const d = 0xb05e14 // lantern base ring — dark ember
const w = 0x6e4a2a // post wood
const O = 0x3a2412 // outline — near-black brown

/** Canvas side (32): body top-art rect + reserved white pixel. */
const SIZE = 32
const BODY_UV = { x: 8, y: 8, w: 16, h: 16 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.04, sideColor: d, size: SIZE }))
    // Short post.
    const post = buildPrism({
      pts: polygonPoints(6, 0.016),
      y0: 0.036,
      y1: 0.09,
      uv: BODY_UV,
      size: SIZE,
      sideColor: w,
      capColor: w,
    })
    parts.push(post)
    // Lantern body — the hero solid; warm banded sides + glow top art.
    const body = buildPrism({
      pts: polygonPoints(6, 0.038),
      ptsTop: polygonPoints(6, 0.034),
      y0: 0.09,
      y1: 0.14,
      uv: BODY_UV,
      size: SIZE,
      sideColor: o,
    })
    parts.push(body)
    // Cap + finial.
    const cap = buildPrism({
      pts: polygonPoints(6, 0.028),
      ptsTop: polygonPoints(6, 0.024),
      y0: 0.14,
      y1: 0.155,
      uv: BODY_UV,
      size: SIZE,
      sideColor: w,
      capColor: O,
    })
    parts.push(cap)
    const finial = buildPrism({
      pts: polygonPoints(6, 0.012),
      ptsTop: polygonPoints(6, 0.004),
      y0: 0.155,
      y1: 0.16,
      uv: BODY_UV,
      size: SIZE,
      sideColor: d,
      capColor: d,
    })
    parts.push(finial)
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rng = new SeededRNG(601)
        const pts = polyToPixels(BODY_UV, polygonPoints(6, 0.038))
        // Baked glow: bright core pooled toward the light (NW), orange rim.
        paintPrismTop(ctx, {
          pts,
          rng,
          base: y,
          accents: [b, o],
          density: 9,
          style: 'clumps',
          light: b,
          shadow: o,
          shadowPools: 3,
          outline: O,
          outlineSkip: 0.24,
        })
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
    height: 0.16,
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
