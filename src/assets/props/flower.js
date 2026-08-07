/**
 * FLOWER prop — center socket, tiny white two-bloom wildflower (SOLID rework).
 *
 * Reference document two, item 1, re-imagined as a real 3D object instead of
 * a painted card: a low dark-green base plinth stands flush on the tile; two
 * thin tapered hexagon stems rise from it (leaning slightly, one toward the
 * camera); each stem carries a small solid hexagon bloom whose TOP FACE is
 * the pixel-art head — pure white petals, yellow 3x3 center, one gray
 * right-side volume pixel (reference: "the right side receives a single gray
 * pixel for volume"), dark-olive outline hugging the bloom. The bloom side
 * walls carry the darker white band; the stems carry the stem-green banded
 * sides. The whole thing reads as a lit solid from the south camera: hero
 * faces toward +z, above-left shading everywhere (propBase.js buildPrism).
 *
 * World height 0.12 — tiny, low visual weight.
 *
 * Palette (6 colors incl. outline): pure white petals, light gray (right-side
 * volume), bright + dark stem green, dark green base, dark olive outline.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry (base +
 * 2 stems + 2 blooms) + ONE material (see propBase.js buildPrism / merge).
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
  drawSpriteRows,
  polygonPoints,
  polyToPixels,
} from './propBase'

// ─── Palette (reference item 1 — bright white against the dark base) ───
const W = 0xffffff // petal — purest white
const G = 0xd6d8da // stigma / right-side volume gray
const Y = 0xffd23f // bloom center — warm yellow
const S = 0x4fa03c // stem, upper (bright)
const s = 0x3e8a31 // stem, lower (darker)
const B = 0x2e6b24 // base clump / plinth
const O = 0x274d20 // outline — dark olive

/** Canvas side (32): bloom art rect + reserved white pixel. */
const SIZE = 32
/** Bloom top-face art rect (the hero face — white petal cluster). */
const HEAD_UV = { x: 8, y: 8, w: 16, h: 16 }

/** Hand-authored bloom: 11x11 petal cluster + 3x3 yellow center + gray
 *  volume pixel on the right. Painted on the bloom cap via drawSpriteRows. */
const HEAD_ART = [
  '...W..W..W...',
  '...W..W..W...',
  '....WW..W....',
  '..WW.YY.WW...',
  '..W.YYYY.W...',
  '...YYYYYG....',
  '..W.YYYY.W...',
  '..WW.YY.WW...',
  '....W..WW....',
  '...W..W..W...',
  '...W..W..W...',
]

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function leanMatrix(xoff, zoff, pivotY, rotX) {
  const m = new THREE.Matrix4()
  m.makeTranslation(xoff, 0, zoff)
  const rot = new THREE.Matrix4().makeRotationX(rotX)
  const toPivot = new THREE.Matrix4().makeTranslation(0, pivotY, 0)
  const fromPivot = new THREE.Matrix4().makeTranslation(0, -pivotY, 0)
  return m.multiply(toPivot).multiply(rot).multiply(fromPivot)
}

function getGeometry() {
  if (!geometry) {
    const parts = []
    // Plinth (dark olive-green, flush on the tile top face).
    parts.push(buildBase({ r: 0.07, sideColor: B, size: SIZE }))
    // Two leaning stems (thin tapered hexagons, stem-green banded sides).
    const stemR = 0.011
    const stemTopR = 0.007
    const stems = [
      { off: [-0.024, 0.0], lean: -0.1 },
      { off: [0.026, 0.006], lean: 0.09 },
    ]
    for (const st of stems) {
      const m = leanMatrix(st.off[0], st.off[1], 0.036, st.lean)
      const stem = buildPrism({
        pts: polygonPoints(6, stemR),
        ptsTop: polygonPoints(6, stemTopR),
        y0: 0.036,
        y1: 0.09,
        uv: HEAD_UV,
        size: SIZE,
        sideColor: S,
        capColor: s,
      })
      stem.applyMatrix4(m)
      parts.push(stem)
      // Bloom head — same lean matrix so it rides the stem tip.
      const head = buildPrism({
        pts: polygonPoints(6, 0.042),
        y0: 0.09,
        y1: 0.12,
        uv: HEAD_UV,
        size: SIZE,
        sideColor: W,
      })
      head.applyMatrix4(m)
      parts.push(head)
    }
    geometry = mergePropParts(parts)
  }
  return geometry
}

function getMaterial() {
  if (!material) {
    material = makePropMaterial(
      makePropTexture(SIZE, (ctx) => {
        const rng = new SeededRNG(777)
        // Bloom face: hex silhouette base + soft white/lavender-gray shading.
        const pts = polyToPixels(HEAD_UV, polygonPoints(6, 0.042))
        paintPrismTop(ctx, {
          pts,
          rng,
          base: W,
          accents: [G],
          density: 5,
          style: 'clumps',
          light: W,
          shadow: G,
          shadowPools: 3,
          outline: O,
          outlineSkip: 0.4,
        })
        // Hand-authored petal cluster over the shaded base (canvas row 0 =
        // art top, same as the cap UV convention).
        drawSpriteRows(ctx, HEAD_ART, { W, G, Y }, 10, 10)
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
    height: 0.12,
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
