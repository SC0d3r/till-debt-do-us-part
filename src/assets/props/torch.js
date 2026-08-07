/**
 * TORCH prop — edge socket, wooden stake torch with carved flame (SOLID
 * rework).
 *
 * A real 3D torch, not a painted card: a dark plinth, a solid hexagon post
 * (wood-brown banded sides, slightly tapered), a small socket collar, and a
 * tapered hexagon FLAME — a genuine solid whose top face carries the carved
 * flame art (yellow core, orange mid, ember rim, near-black brown outline)
 * and whose side walls carry the warm orange band. The whole prop faces the
 * south camera with its hero faces toward +z; the baked flame reads as a
 * carved/carried light source, consistent with the tile kit's no-runtime-
 * light rule.
 *
 * World height 0.24 — tall vertical accent for edges and entrances.
 *
 * Palette (6 colors incl. outline): flame yellow, orange, ember red, wood,
 * dark wood, near-black brown outline.
 *
 * Socket: edge (max 4). InstancedMesh-safe: ONE merged geometry (plinth +
 * post + collar + flame) + ONE material (see propBase.js buildPrism / merge).
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

// ─── Palette (torch — warm flame + wood) ───
const y = 0xffe08a // flame core — yellow
const o = 0xff8a3a // flame mid — orange (also baked glow)
const e = 0x8a2c14 // ember — dark red rim / charred wood
const w = 0x7a5230 // wood
const W = 0x5c3a1f // wood dark (right edge shadow)
const O = 0x3a2412 // outline — near-black brown

/** Canvas side (32): flame top-art rect + reserved white pixel. */
const SIZE = 32
const FLAME_UV = { x: 8, y: 8, w: 16, h: 16 }

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const parts = []
    parts.push(buildBase({ r: 0.045, sideColor: W, size: SIZE }))
    // Post (solid hexagon, slightly tapered, wood banded sides).
    const post = buildPrism({
      pts: polygonPoints(6, 0.02),
      ptsTop: polygonPoints(6, 0.016),
      y0: 0.036,
      y1: 0.19,
      uv: FLAME_UV,
      size: SIZE,
      sideColor: w,
      capColor: W,
    })
    parts.push(post)
    // Socket collar where the flame sits.
    const collar = buildPrism({
      pts: polygonPoints(6, 0.028),
      ptsTop: polygonPoints(6, 0.026),
      y0: 0.19,
      y1: 0.21,
      uv: FLAME_UV,
      size: SIZE,
      sideColor: W,
      capColor: e,
    })
    parts.push(collar)
    // Flame: tapered hexagon solid; the top face carries the flame art.
    const flame = buildPrism({
      pts: polygonPoints(6, 0.036),
      ptsTop: polygonPoints(6, 0.012),
      y0: 0.21,
      y1: 0.24,
      uv: FLAME_UV,
      size: SIZE,
      sideColor: o,
    })
    parts.push(flame)
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rng = new SeededRNG(501)
        const pts = polyToPixels(FLAME_UV, polygonPoints(6, 0.036))
        paintPrismTop(ctx, {
          pts,
          rng,
          base: o,
          accents: [y, e],
          density: 8,
          style: 'clumps',
          light: y,
          shadow: e,
          shadowPools: 3,
          outline: O,
          outlineSkip: 0.26,
        })
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
    height: 0.24,
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
