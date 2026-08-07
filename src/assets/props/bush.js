/**
 * BUSH family — bush / bush-snow / dry-shrub (FORM redesign).
 *
 * A REAL rounded low-poly shrub, not a prism: a flattened icosahedron dome
 * (detail 1, hard flat facets, seeded jitter for the lumpy clump silhouette)
 * plus two overlapping side lobes and 3-4 darker leaf-clump bumps seated on
 * the dome — the "round green bush" of reference A ("almost spherical / blob
 * shape made of clustered green pixels... soft silhouette — no hard edges").
 *
 * Shading is the baked 3-tone ramp from the upper-left-front light: top-left
 * facets bright (~lime for the green bush), body mid, lower-right facets
 * dark, base blended toward the tinted outline (AO where it meets the
 * ground), all under a dark contact ring. NO edge ribbons on purpose — the
 * reference wants a soft silhouette for bushes.
 *
 * Variants share ONE geometry builder with per-variant palettes (the
 * biome-palette-swap convention): 'bush' green, 'bush-snow' the same shape in
 * the snow palette, 'dry-shrub' tan/dry with a spikier silhouette (heavier
 * jitter, two upright twig tapers).
 *
 * World heights ~0.16 (bush) — a wide low dome, the strongest color block in
 * the library.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material per variant (see propBase.js buildIcosa / shadeFaces /
 * buildContactRing).
 */

import * as THREE from 'three'
import {
  buildIcosa,
  buildPost,
  sitOnGround,
  shadeFaces,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palettes (3-tone ramps + tinted outline; per-variant) ───
// B3: the snow ramp is widened so lower-right facets fall into a cool shadow
// tone (≈0x9fb2c9) while pure white stays on the upper-left caps only; the
// ring is darker than the snow tile top (≈0x8ba2bd) so the base separates.
// B4: the dry ramp's mid/dark are pushed apart so the spiky silhouette reads.
const GREEN = { light: 0x7cc552, mid: 0x4c8730, dark: 0x2d6a2f, outline: 0x1b4a1d, ring: 0x1b4a1d }
const SNOW = { light: 0xffffff, mid: 0xdbe6f0, dark: 0x9fb2c9, outline: 0x6e849e, ring: 0x8ba2bd }
const DRY = { light: 0xd4b08c, mid: 0x9a7a54, dark: 0x5c4428, outline: 0x3a2a18, ring: 0x3a2a18 }

// Per-palette tone-bucket tuning (B3/B4: force lower-right facets into the
// dark tone so pale ramps don't collapse into one flat tone).
const SHADE_OPTS = {
  GREEN: { aoAmount: 0.62 },
  SNOW: { aoAmount: 0.55, hi: 0.7, lo: 0.04 },
  DRY: { aoAmount: 0.6, hi: 0.62, lo: 0.1 },
}

/** Canvas-free pipeline: sizes are world-space; no texture constants. */

// ─── Shared geometry builders (module scope, built once) ───
let geoms = new Map()
let material = null

/** Builds the merged bush-family geometry for one palette/spikiness.
 *  Same shape for bush + bush-snow (palette swap only); dry-shrub is the
 *  same builder with spiky=true (heavier jitter + dry twigs). */
function buildBushGeometry(palette, { spiky = false } = {}) {
  const seed = spiky ? 73 : 21
  const jitter = spiky ? 0.36 : 0.2
  const domeR = spiky ? 0.11 : 0.125
  const shadeOpts = SHADE_OPTS[palette === GREEN ? 'GREEN' : palette === SNOW ? 'SNOW' : 'DRY']
  const parts = []

  // Main dome (the blob body).
  const dome = buildIcosa({ r: domeR, detail: 1, seed, jitter, squash: 0.72 })
  sitOnGround(dome)
  shadeFaces(dome, palette, shadeOpts)
  parts.push(dome)

  // Two overlapping side lobes.
  const lobes = [
    { r: domeR * 0.52, off: [0.062, 0.018], seed: seed + 1 },
    { r: domeR * 0.47, off: [-0.066, 0.012], seed: seed + 2 },
  ]
  for (const lb of lobes) {
    const g = buildIcosa({ r: lb.r, detail: 1, seed: lb.seed, jitter, squash: 0.74 })
    sitOnGround(g)
    shadeFaces(g, palette, { ...shadeOpts, aoAmount: (shadeOpts.aoAmount ?? 0.5) - 0.12 })
    g.translate(lb.off[0], 0, lb.off[1])
    parts.push(g)
  }

  // Leaf-clump bumps seated on the dome surface (darker, lumpy edges).
  const domeCenterY = domeR * 0.72 - 0.012 // after sitOnGround
  const dirs = [
    [0.42, 0.42, 0.55],
    [-0.55, 0.38, 0.5],
    [0.12, 0.4, -0.72],
    [-0.28, 0.62, -0.3],
  ]
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]
    const dl = Math.hypot(d[0], d[1], d[2])
    const ux = d[0] / dl
    const uy = d[1] / dl
    const uz = d[2] / dl
    const br = domeR * (0.17 + (i % 2) * 0.02) * (spiky ? 0.85 : 1)
    const sx = ux * domeR
    const sy = domeCenterY + uy * domeR * 0.72
    const sz = uz * domeR
    const bump = buildIcosa({ r: br, detail: 1, seed: seed + 7 + i, jitter: 0.34, squash: 0.62 })
    bump.translate(sx, sy - br * 0.25, sz)
    shadeFaces(bump, { light: palette.dark, mid: palette.dark, dark: palette.outline, outline: palette.outline }, { aoAmount: 0.3 })
    parts.push(bump)
  }

  // Dry twigs (spikier silhouette for dry-shrub only).
  if (spiky) {
    const twigs = [
      { r: 0.006, h: 0.085, yaw: 0.2, lean: 0.3, off: [0.03, 0.09, 0.02] },
      { r: 0.0055, h: 0.1, yaw: -0.35, lean: 0.24, off: [-0.028, 0.085, 0.03] },
      { r: 0.005, h: 0.075, yaw: 0.6, lean: 0.36, off: [0.0, 0.07, -0.04] },
    ]
    for (const tw of twigs) {
      // Twig tones ≥1 step below the dome (B4): mid = palette.dark, dark =
      // outline — the branches read in silhouette against the lighter dome.
      const g = buildPost({ r: tw.r, rTop: 0.0015, h: tw.h, sides: 4, tones: { light: palette.dark, mid: palette.dark, dark: palette.outline, outline: palette.outline }, bands: 1, aoHeight: 0.1 })
      const m = new THREE.Matrix4()
        .makeTranslation(tw.off[0], 0, tw.off[2])
        .multiply(new THREE.Matrix4().makeTranslation(0, tw.off[1], 0))
        .multiply(new THREE.Matrix4().makeRotationX(tw.lean))
        .multiply(new THREE.Matrix4().makeRotationY(tw.yaw))
      g.applyMatrix4(m)
      parts.push(g)
    }
  }

  // Contact ring (dark ground seam — "small dark contact shadow", ref A).
  // Per-palette ring color: bush-snow's ring is darker than the snow tile so
  // the base separates from the white tile (B3).
  parts.push(buildContactRing({ r: domeR * (1 + jitter) + 0.012, color: palette.ring ?? palette.outline }))
  return mergePropParts(parts)
}

function getGeometry(name) {
  if (!geoms.has(name)) {
    if (name === 'bush') geoms.set(name, buildBushGeometry(GREEN))
    else if (name === 'bush-snow') geoms.set(name, buildBushGeometry(SNOW))
    else if (name === 'dry-shrub') geoms.set(name, buildBushGeometry(DRY, { spiky: true }))
    else throw new Error(`bush: unknown variant "${name}"`)
  }
  return geoms.get(name)
}

function getMaterial() {
  if (!material) material = makeCelMaterial()
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  bush: {
    name: 'bush',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'grass-plain',
  },
  'bush-snow': {
    name: 'bush-snow',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'snow-plain',
  },
  'dry-shrub': {
    name: 'dry-shrub',
    socket: 'center',
    max: 1,
    height: 0.16,
    hostTile: 'sand-plain',
  },
}

/**
 * Factory: returns the merged bush-family Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='bush'] - key of VARIANTS ('bush' | 'bush-snow' | 'dry-shrub')
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'bush') {
  if (!VARIANTS[name]) {
    throw new Error(`bush: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(name), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createBush = createProp

/** Frees the module's shared geometries/material exactly once. */
export function dispose() {
  for (const g of geoms.values()) g.dispose()
  geoms.clear()
  if (material) {
    material.dispose()
    material = null
  }
}
