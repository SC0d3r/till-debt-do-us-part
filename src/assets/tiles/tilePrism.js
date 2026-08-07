/**
 * Shared single-section tile prism geometry — Slice B.
 *
 * Every tile in the system is ONE solid prism from its top face to its base
 * (no top band + root band split — TILE_SYSTEM_CONVENTION.md §1, Slice B).
 * This helper builds that prism once per side-color set:
 *
 *   - Footprint: the exact ±0.5 diamond (vertices at (±0.5, 0, ±0.5), N
 *     vertex +z, E vertex +x) — the SAME clean silhouette as before. The
 *     geometry is NEVER deformed: all "organic, jagged, hand-drawn" quality
 *     comes from texture content (see pixelPainter.js), never from moving
 *     vertices.
 *   - Top cap: 2 triangles mapping the diamond to the full UV square, white
 *     vertex colors — the top-face texture shows through exactly.
 *   - Sides: 4 faces × 3 horizontal color bands (top/mid/bottom), each band
 *     one step darker than the one above (shadows concentrate toward the
 *     bottom of the side faces, per the reference). Sides are also shaded
 *     per-face by the above-left light: the NW face is brightest, the SE
 *     face darkest. Side UVs point at the reserved white pixel (0,0) of the
 *     texture (WHITE_UV / WHITE_UV_V — the map multiplies to 1.0 there and
 *     the vertex colors show through), so the side banding is a vertex-color
 *     property of ONE material — never a second geometry section.
 *
 * InstancedMesh-safe: one merged BufferGeometry, flat per-face normals,
 * vertex colors for hover. The composer groups by variant string and reads
 * geometry + material off the factory mesh.
 *
 * Poly budget: 26 triangles (2 cap + 24 sides) per geometry.
 */

import * as THREE from 'three'
import { TRANSITION_TEXTURE_SIZE } from './transitionTexture'
import { hexToRgb } from '../pixelart/pixelPainter'

/** UV of the center of the reserved white pixel (0,0) of every top texture.
 *  NOTE: CanvasTexture uploads with flipY=true (image row 0 = top ends up at
 *  v=1), so the white pixel lives at v = 1 - WHITE_UV, not v = WHITE_UV. */
const WHITE_UV = 0.5 / TRANSITION_TEXTURE_SIZE
const WHITE_UV_V = 1 - WHITE_UV

const WHITE = [1, 1, 1]

/** Per-side brightness from the above-left light (NE, SE, SW, NW): the NW
 *  face catches the light, the SE face falls into shadow. */
const SIDE_SHADES = [0.95, 0.82, 0.95, 1.0]

/** Per-band darkening down the side (top → bottom). */
const BAND_SHADES = [1.0, 0.9, 0.76]

function pushTri(arrays, v0, v1, v2, color) {
  for (const v of [v0, v1, v2]) {
    arrays.positions.push(v.p[0], v.p[1], v.p[2])
    arrays.uvs.push(v.uv[0], v.uv[1])
    arrays.colors.push(color[0], color[1], color[2])
  }
}

/** Quad as 2 triangles with outward winding (v0,v2,v1),(v0,v3,v2). */
function pushQuad(arrays, v0, v1, v2, v3, color) {
  pushTri(arrays, v0, v2, v1, color)
  pushTri(arrays, v0, v3, v2, color)
}

/**
 * Builds the single-section prism geometry.
 *
 * @param {number} topY - top-face height (Slice B: ~0.34)
 * @param {number} baseY - prism base (0)
 * @param {Array<number|string|number[]>} sideColors - [NE, SE, SW, NW] side
 *   base colors (one per side; banding + lighting applied internally)
 * @returns {THREE.BufferGeometry}
 */
export function buildTilePrism(topY, baseY, sideColors) {
  const arrays = { positions: [], uvs: [], colors: [] }

  // ── Top cap (2 triangles, diamond mapped to the full UV square) ──
  const cap = [
    { p: [0, topY, 0.5], uv: [0.5, 1] }, // N
    { p: [0.5, topY, 0], uv: [1, 0.5] }, // E
    { p: [0, topY, -0.5], uv: [0.5, 0] }, // S
    { p: [-0.5, topY, 0], uv: [0, 0.5] }, // W
  ]
  pushTri(arrays, cap[0], cap[1], cap[2], WHITE)
  pushTri(arrays, cap[0], cap[2], cap[3], WHITE)

  // ── Side faces: 4 edges × 3 bands, straight ±0.5 footprint ──
  const edges = [
    [0, 1], // NE
    [1, 2], // SE
    [2, 3], // SW
    [3, 0], // NW
  ]
  for (let i = 0; i < 4; i++) {
    const [a, b] = edges[i]
    const [br, bg, bb] = hexToRgb(sideColors[i])
    const sideShade = SIDE_SHADES[i]
    for (let band = 0; band < 3; band++) {
      const yTop = topY - (topY - baseY) * (band / 3)
      const yBot = topY - (topY - baseY) * ((band + 1) / 3)
      const f = sideShade * BAND_SHADES[band]
      const color = [
        Math.min(255, Math.round(br * f)),
        Math.min(255, Math.round(bg * f)),
        Math.min(255, Math.round(bb * f)),
      ]
      const aTop = { p: [cap[a].p[0], yTop, cap[a].p[2]], uv: [WHITE_UV, WHITE_UV_V] }
      const bTop = { p: [cap[b].p[0], yTop, cap[b].p[2]], uv: [WHITE_UV, WHITE_UV_V] }
      const bBot = { p: [cap[b].p[0], yBot, cap[b].p[2]], uv: [WHITE_UV, WHITE_UV_V] }
      const aBot = { p: [cap[a].p[0], yBot, cap[a].p[2]], uv: [WHITE_UV, WHITE_UV_V] }
      pushQuad(arrays, aTop, bTop, bBot, aBot, color)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colors, 3))
  geometry.computeVertexNormals() // non-indexed → per-face (flat) normals
  return geometry
}