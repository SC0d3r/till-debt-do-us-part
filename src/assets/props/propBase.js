/**
 * Shared prop base — Slice B prop library (SOLID rework, 2026-08-07).
 *
 * Every prop in src/assets/props/ is a REAL volumetric object built from this
 * module's shared pieces — the same relationship tilePrism.js / tileTexture.js
 * / pixelPainter.js have for tiles (TILE_SYSTEM_CONVENTION.md §1-§2): NEVER
 * reimplement the texture factory, the geometry builders or the palette math
 * per prop.
 *
 * Design contract (supersedes the crossed-quad sprite era):
 *
 *  1. No paper. Props are built from extruded prism segments (hexagons by
 *     default — the tile system's diamond prism language, softened to 6 sides
 *     so small objects read rounded). Every prop is: a low solid BASE plinth
 *     (bottom sinks BASE_EMBED into the tile top face so it visibly STANDS,
 *     never floats) + a body of stacked/tapered prism tiers + small solid
 *     parts (stems, blades, arms) built the same way. ONE merged geometry,
 *     ONE material per variant — InstancedMesh-safe.
 *
 *  2. Tile shading language, applied to real faces. buildPrism mirrors
 *     tilePrism.js exactly: the top cap maps to the texture (detailed noisy
 *     art with baked jagged outline — the hero face), the side walls carry
 *     3 horizontal vertex-color bands (BAND_SHADES, shadows concentrate
 *     downward) multiplied by a per-wall shade from the above-left light
 *     (light from the NW: wall shade = 0.86 + 0.14·cos(θ − (−45°))) and by
 *     the part's own darkened palette hue. Side UVs point at the reserved
 *     white pixel (0,0) of the texture (WHITE_UV math from tilePrism.js), so
 *     the vertex colors show through the map — ONE material does everything.
 *
 *  3. Designed toward the world camera. The camera views the map from the
 *     south (+z), elevated. Every prism's local +z faces the camera: the
 *     hero wall (θ=0°) is lit (~0.96), the far-right wall falls into shadow
 *     (~0.72) — the same NW-light shading the tiles use, re-expressed for
 *     props. The texture's canvas top = world +z (camera side), matching the
 *     tile cap UV mapping (tilePrism.js: N vertex → v=1). Props are staged
 *     with rotation 0 in preview/showcase, so local +z = world +z always.
 *
 * What this module owns:
 *
 *  - makePropTexture(size, draw) — canvas texture factory (pinned nearest-
 *    filter pixel-art settings, reserved white pixel (0,0) so side UVs work).
 *  - makePropMaterial(texture) — Lambert + vertexColors + alphaTest cutout.
 *  - polygonPoints / buildPrism / buildBase / mergePropParts — the geometry
 *    kit. buildPrism takes world-space bottom/top polygons + a UV rect into
 *    the canvas; it emits a non-indexed BufferGeometry with flat normals.
 *    Parts are transformed (lean/offset) by the prop module, then merged.
 *  - paintPrismTop — the generic top-face painter: polygon fill, seeded
 *    clump noise (clumps/grain/cracks), above-left rim highlight + SE shadow
 *    pools, broken 1px outline just inside the silhouette. This is the
 *    "detailed noisy top" rule from the tile system, applied to any face
 *    polygon (no diamond-specific code).
 *  - drawSpriteRows — ASCII-art face painter, kept for small face art that
 *    is better hand-authored than seeded (flower petals, lantern glow).
 *  - Palette helpers + painter re-exports (darken/lighten, SeededRNG,
 *    setPixel, hexToRgb, clamp255, cssColor).
 *
 * Every prop module exports the tile-style manifest convention: a VARIANTS
 * object (name → entry with socket metadata), createProp(name) returning a
 * single merged Mesh (InstancedMesh-safe: one geometry, one material), and a
 * dispose() that frees the module's shared geometry/material/texture exactly
 * once. The merged registry src/assets/props/index.js merges all of them.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SeededRNG } from '../../core/procedural'
import {
  makePixelTexture,
  setPixel,
  hexToRgb,
  clamp255,
  cssColor,
} from '../pixelart/pixelPainter'

/** Base plinth bottom sinks this far into the tile top face (anti-float). */
export const BASE_EMBED = 0.004
/** Top of the shared base plinth (body tiers start here). */
export const BASE_TOP_Y = 0.036
/** Side-wall band darkening down the face (top → bottom), per tilePrism.js. */
export const BAND_SHADES = [1.0, 0.9, 0.76]
/** Above-left light azimuth: the NW (−x, +z) direction in world (matches the
 *  tile side shading: NW face brightest, SE darkest). */
const LIGHT_ANGLE = -Math.PI / 4

// Re-export the shared painter primitives so prop modules have ONE base
// module to import (reuse, never reimplementation).
export { SeededRNG, setPixel, hexToRgb, clamp255, cssColor }

// ─── Palette helpers ──────────────────────────────────────────────────────

/**
 * Darkens a color by a factor (0..1), returning sRGB byte triple [r, g, b].
 * Used to synthesize outline/shadow tones from a prop's dominant hue — the
 * "dark version of the object's own dominant hue" outline rule.
 */
export function darken(color, f) {
  const [r, g, b] = hexToRgb(color)
  return [clamp255(r * f), clamp255(g * f), clamp255(b * f)]
}

/**
 * Lightens a color toward white by a factor (0..1), returning sRGB byte
 * triple [r, g, b]. Used to synthesize highlight tones from a base hue.
 */
export function lighten(color, f) {
  const [r, g, b] = hexToRgb(color)
  return [
    clamp255(r + (255 - r) * f),
    clamp255(g + (255 - g) * f),
    clamp255(b + (255 - b) * f),
  ]
}

/**
 * Normalized 0-1 vertex color for a hex color (THREE.Color components as-is,
 * linear working space — copied from tilePrism.js; do NOT write sRGB bytes
 * here, they clamp to white as vertex colors).
 */
export function hexToColor(hex) {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

// ─── Texture factory ──────────────────────────────────────────────────────

/**
 * Shared prop texture factory: pinned pixel-art settings (NearestFilter, no
 * mipmaps, ClampToEdge, sRGB) WITH the reserved white pixel (0,0) — prop side
 * walls point their UVs at it so the vertex-color banding shows through the
 * map, exactly like the tile prism sides (see tilePrism.js WHITE_UV).
 *
 * @param {number} size - square canvas side in px (32 typical, 64 for
 *   multi-rect layouts)
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {THREE.Texture}
 */
export function makePropTexture(size, draw) {
  return makePixelTexture(size, draw) // reserveWhite defaults to true
}

/**
 * Shared prop material: Lambert (same shading model as the tile kit),
 * vertexColors (side banding + per-wall shade are vertex-color properties),
 * alphaTest 0.5 cutout (face art is a binary-alpha silhouette — opaque pass,
 * no blending/sorting), flat shading, NearestFiltered map.
 *
 * @param {THREE.Texture} texture
 * @returns {THREE.MeshLambertMaterial}
 */
export function makePropMaterial(texture) {
  return new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
    alphaTest: 0.5,
    flatShading: true,
  })
}

// ─── Geometry kit ─────────────────────────────────────────────────────────

/**
 * Regular polygon vertices in the XZ plane, centered on the origin, returned
 * as [x, z] pairs. rot=π/n gives a flat wall facing +z (hero face toward the
 * camera) and one facing −z; increasing index rotates toward +x.
 *
 * @param {number} [n=6] - side count (4 = diamond like tiles, 6 = soft hex)
 * @param {number} [r=0.1] - circumradius in world units
 * @param {number} [rot=Math.PI/n] - rotation offset (radians)
 * @returns {Array<[number, number]>}
 */
export function polygonPoints(n = 6, r = 0.1, rot = Math.PI / n) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n
    pts.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  return pts
}

/**
 * Builds ONE extruded prism segment: a bottom polygon extruded from y0 to y1
 * (top polygon `ptsTop` defaults to `pts`; pass a scaled copy for tapered
 * segments). Emits a non-indexed BufferGeometry with flat per-face normals:
 *
 *   - Top cap: fan triangles from the centroid, +y winding, UVs mapped from
 *     the polygon's bounding square into the `uv` texel rect (canvas top =
 *     world +z, left = world −x — the tile cap convention). White vertex
 *     colors → the texture art shows through. If `capColor` is given the cap
 *     is a solid vertex-color cap (UVs at the white pixel) — for tiny caps
 *     that don't need art.
 *   - Side walls: one quad per edge, split into 3 horizontal bands, each band
 *     BAND_SHADES[b] darker than the one above and multiplied by the wall's
 *     above-left light shade (0.86 + 0.14·cos(θ − LIGHT_ANGLE)); wall UVs at
 *     the reserved white pixel so vertex colors show through the map.
 *
 * Winding is verified per-face against the polygon centroid/up — no caller
 * can hand in a mirrored polygon.
 *
 * @param {object} opts
 * @param {Array<[number, number]>} opts.pts - bottom polygon [x, z]
 * @param {Array<[number, number]>} [opts.ptsTop] - top polygon (taper)
 * @param {number} opts.y0 - bottom height (world)
 * @param {number} opts.y1 - top height (world)
 * @param {{x:number,y:number,w:number,h:number}} opts.uv - texel rect of the
 *   top-face art inside the canvas (unused when capColor is set)
 * @param {number} opts.size - canvas side in px (UV normalization)
 * @param {number|string|number[]} opts.sideColor - side-wall base hue (bands
 *   and wall shade applied internally; pass the prop's darkened palette hue)
 * @param {number|string|number[]} [opts.capColor] - solid cap color (vertex
 *   color cap, no texture sampling)
 * @returns {THREE.BufferGeometry}
 */
export function buildPrism({ pts, ptsTop, y0, y1, uv, size, sideColor, capColor }) {
  const top = ptsTop || pts
  const n = pts.length
  const radius = Math.max(
    ...pts.map((p) => Math.hypot(p[0], p[1])),
    ...top.map((p) => Math.hypot(p[0], p[1])),
  )
  const positions = []
  const uvs = []
  const colors = []
  const white = [1, 1, 1]
  const baseCol = hexToColor(sideColor)
  const uvWhite = [0.5 / size, 1 - 0.5 / size]

  const capUV = (x, z) => {
    const u = (uv.x + ((x + radius) / (2 * radius)) * uv.w) / size
    const v = 1 - (uv.y + (1 - (z + radius) / (2 * radius)) * uv.h) / size
    return [u, v]
  }

  const pushTri = (v0, v1, v2, color) => {
    for (const v of [v0, v1, v2]) {
      positions.push(v.p[0], v.p[1], v.p[2])
      uvs.push(v.uv[0], v.uv[1])
      colors.push(color[0], color[1], color[2])
    }
  }

  // ── Top cap (fan from centroid, +y winding, texture or solid cap) ──
  for (let i = 1; i < n - 1; i++) {
    const v0 = { p: [0, y1, 0], uv: capUV(0, 0) }
    const v1 = { p: [top[i][0], y1, top[i][1]], uv: capUV(top[i][0], top[i][1]) }
    const v2 = { p: [top[i + 1][0], y1, top[i + 1][1]], uv: capUV(top[i + 1][0], top[i + 1][1]) }
    // Winding: triangle normal must point up (+y).
    // NOTE: nx = (v1−v0)×(v2−v0) y-component NEGATED (a.x*b.z − a.z*b.x);
    // negative nx → standard y-cross positive → (v0,v1,v2) faces up.
    const nx = (v1.p[0] - v0.p[0]) * (v2.p[2] - v0.p[2]) - (v1.p[2] - v0.p[2]) * (v2.p[0] - v0.p[0])
    const a = nx < 0 ? v1 : v2
    const b = nx < 0 ? v2 : v1
    if (capColor !== undefined) {
      pushTri(v0, a, b, hexToColor(capColor)) // capColor → white-UV solid cap
    } else {
      pushTri(v0, a, b, white)
    }
  }

  // ── Side walls (3 bands × per-wall light shade, white-UV vertex colors) ──
  const centroidX = pts.reduce((s, p) => s + p[0], 0) / n
  const centroidZ = pts.reduce((s, p) => s + p[1], 0) / n
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    // Wall outward direction (rotate the edge CCW in XZ): (ez, -ex).
    const ex = pts[j][0] - pts[i][0]
    const ez = pts[j][1] - pts[i][1]
    const nl = Math.hypot(ex, ez) || 1
    const theta = Math.atan2(ez / nl, -ex / nl)
    const wallShade = 0.86 + 0.14 * Math.cos(theta - LIGHT_ANGLE)
    const midX = (pts[i][0] + pts[j][0]) / 2
    const midZ = (pts[i][1] + pts[j][1]) / 2
    const at = (idx, t) => [
      pts[idx][0] + (top[idx][0] - pts[idx][0]) * t,
      y0 + (y1 - y0) * t,
      pts[idx][1] + (top[idx][1] - pts[idx][1]) * t,
    ]
    for (let b = 0; b < 3; b++) {
      const t0 = b / 3
      const t1 = (b + 1) / 3
      const A = { p: at(i, t0), uv: uvWhite }
      const B = { p: at(j, t0), uv: uvWhite }
      const C = { p: at(j, t1), uv: uvWhite }
      const D = { p: at(i, t1), uv: uvWhite }
      // Winding: quad normal must point away from the centroid.
      const cax = C.p[0] - A.p[0]
      const caz = C.p[2] - A.p[2]
      const bax = B.p[0] - A.p[0]
      const baz = B.p[2] - A.p[2]
      const nrmX = -baz * (C.p[1] - A.p[1]) // (B−A)×(C−A), x
      const nrmZ = bax * (C.p[1] - A.p[1]) // (B−A)×(C−A), z
      const away = (midX - centroidX) * nrmX + (midZ - centroidZ) * nrmZ
      const quad = away >= 0 ? [A, B, C, D] : [A, D, C, B]
      const f = wallShade * BAND_SHADES[b]
      const col = [baseCol[0] * f, baseCol[1] * f, baseCol[2] * f]
      pushTri(quad[0], quad[1], quad[2], col)
      pushTri(quad[0], quad[2], quad[3], col)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals() // non-indexed → per-face (flat) normals
  return geometry
}

/**
 * The shared base plinth: a low hexagon prism that all props stand on. The
 * bottom sinks BASE_EMBED below the local origin (the tile top face) so the
 * prop visibly stands flush — no floating gap — and the side band is the
 * darkest hue of the prop's palette.
 *
 * @param {object} opts
 * @param {number} opts.r - base radius (world)
 * @param {number|string|number[]} opts.sideColor - darkened palette hue
 * @param {number} opts.size - canvas side in px
 * @param {number} [opts.height=BASE_TOP_Y] - plinth height
 * @returns {THREE.BufferGeometry}
 */
export function buildBase({ r, sideColor, size, height = BASE_TOP_Y }) {
  return buildPrism({
    pts: polygonPoints(6, r),
    y0: -BASE_EMBED,
    y1: height - BASE_EMBED,
    uv: { x: 0, y: 0, w: 0, h: 0 },
    size,
    sideColor,
    capColor: sideColor,
  })
}

/**
 * Merges part geometries into ONE InstancedMesh-safe geometry. Callers apply
 * per-part transforms (geometry.applyMatrix4) BEFORE merging.
 *
 * @param {THREE.BufferGeometry[]} parts
 * @returns {THREE.BufferGeometry}
 */
export function mergePropParts(parts) {
  return mergeGeometries(parts, false)
}

// ─── Top-face painter (the "detailed noisy top" rule, any polygon) ────────

/**
 * Whether a pixel lies inside a convex polygon (ray-casting, inclusive).
 *
 * @param {number} px
 * @param {number} py
 * @param {Array<[number, number]>} poly - [x, y] pixel-space points
 * @returns {boolean}
 */
export function insidePoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Maps a world-space polygon (from polygonPoints) into a canvas rect, flipped
 * so world +z (camera side) = canvas top — matching the cap UV convention.
 *
 * @param {{x:number,y:number,w:number,h:number}} rect - canvas texel rect
 * @param {Array<[number, number]>} worldPts - [x, z] pairs
 * @returns {Array<[number, number]>} [px, py] pairs
 */
export function polyToPixels(rect, worldPts) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const r = Math.max(...worldPts.map((p) => Math.hypot(p[0], p[1])))
  const s = rect.w / (2 * r)
  return worldPts.map(([x, z]) => [cx + x * s, cy - z * s])
}

/**
 * Paints a detailed top face for a prism cap:
 *
 *  1. Fill the polygon silhouette with the base tone (exact — the cap's UV
 *     rect samples exactly these texels, so the face silhouette is crisp).
 *  2. Seeded clump noise (styles: clumps / grain / cracks) kept `margin` px
 *     inside the silhouette — never a uniform scatter.
 *  3. Above-left shading: a broken highlight run along the upper-left rim,
 *     shadow pools toward the lower-right (SE) — light from the NW.
 *  4. Broken 1px outline just inside the silhouette (dark hue of the
 *     material, skips pixels — the tile outline rule, generic-polygon form).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {Array<[number, number]>} opts.pts - pixel-space polygon
 * @param {SeededRNG} opts.rng
 * @param {number|string|number[]} opts.base - base fill tone
 * @param {Array<number|string|number[]>} [opts.accents] - noise accent tones
 * @param {'clumps'|'grain'|'cracks'} [opts.style='clumps']
 * @param {number} [opts.density=16] - noise clumps/centers
 * @param {number} [opts.clumpSize=2] - clump reach
 * @param {number} [opts.margin=2] - noise keeps this many px off the rim
 * @param {number|string|number[]} [opts.light] - highlight tone
 * @param {number|string|number[]} [opts.shadow] - shadow tone
 * @param {number} [opts.shadowPools=7] - SE shadow pools
 * @param {number|string|number[]} [opts.outline] - outline tone (dark hue)
 * @param {number} [opts.outlineSkip=0.32] - fraction of rim pixels skipped
 */
export function paintPrismTop(ctx, opts) {
  const { pts, rng, base, accents = [], style = 'clumps', density = 16, clumpSize = 2, margin = 2, light, shadow, shadowPools = 7, outline, outlineSkip = 0.32 } = opts
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)))
  const x1 = Math.min(ctx.canvas.width - 1, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(ctx.canvas.height - 1, Math.ceil(Math.max(...ys)))
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  const nearEdge = (x, y, m) => {
    for (let k = 1; k <= m; k++) {
      if (!insidePoly(x - k, y, pts) || !insidePoly(x + k, y, pts) || !insidePoly(x, y - k, pts) || !insidePoly(x, y + k, pts)) return true
    }
    return false
  }
  const rim = (x, y) => insidePoly(x, y, pts) && !insidePoly(x + 1, y, pts) || insidePoly(x, y, pts) && !insidePoly(x - 1, y, pts) || insidePoly(x, y, pts) && !insidePoly(x, y + 1, pts) || insidePoly(x, y, pts) && !insidePoly(x, y - 1, pts)

  // 1. Base fill (exact silhouette).
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (insidePoly(x, y, pts)) setPixel(ctx, x, y, base)
    }
  }

  // 2. Seeded clump noise.
  if (accents.length > 0) {
    const pick = () => accents[Math.floor(rng.next() * accents.length)]
    for (let i = 0; i < density; i++) {
      let cx0 = -1
      let cy0 = -1
      for (let tries = 0; tries < 12; tries++) {
        cx0 = x0 + Math.floor(rng.next() * (x1 - x0 + 1))
        cy0 = y0 + Math.floor(rng.next() * (y1 - y0 + 1))
        if (insidePoly(cx0, cy0, pts) && !nearEdge(cx0, cy0, margin)) break
      }
      if (!insidePoly(cx0, cy0, pts) || nearEdge(cx0, cy0, margin)) continue
      if (style === 'grain') {
        const n = 2 + Math.floor(rng.next() * 3)
        for (let k = 0; k < n; k++) {
          const gx = cx0 + Math.floor(rng.next() * (clumpSize * 2 + 1)) - clumpSize
          const gy = cy0 + Math.floor(rng.next() * (clumpSize * 2 + 1)) - clumpSize
          if (insidePoly(gx, gy, pts) && !nearEdge(gx, gy, 1)) setPixel(ctx, gx, gy, pick())
        }
      } else if (style === 'cracks') {
        const len = 4 + Math.floor(rng.next() * 7)
        let x = cx0
        let y = cy0
        let dir = rng.next() * Math.PI * 2
        const col = pick()
        for (let s = 0; s < len; s++) {
          if (insidePoly(x, y, pts) && !nearEdge(x, y, 1)) setPixel(ctx, x, y, col)
          dir += (rng.next() - 0.5) * 0.9
          x += Math.round(Math.cos(dir))
          y += Math.round(Math.sin(dir))
        }
      } else {
        const col = pick()
        const n = 3 + Math.floor(rng.next() * 4)
        let x = cx0
        let y = cy0
        for (let k = 0; k < n; k++) {
          if (insidePoly(x, y, pts) && !nearEdge(x, y, 1)) setPixel(ctx, x, y, col)
          x += Math.floor(rng.next() * 3) - 1
          y += Math.floor(rng.next() * 3) - 1
          if (Math.abs(x - cx0) > clumpSize) x += cx0 > x ? 1 : -1
          if (Math.abs(y - cy0) > clumpSize) y += cy0 > y ? 1 : -1
        }
      }
    }
  }

  // 3. Above-left shading: broken highlight along the upper-left rim, shadow
  //    pools toward the lower-right (SE).
  if (light !== undefined) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!insidePoly(x, y, pts) || !nearEdge(x, y, 2)) continue
        if (y < cy && x < cx && rng.next() < 0.5) setPixel(ctx, x, y, light)
        else if (y < cy - 1 && rng.next() < 0.16) setPixel(ctx, x, y, light)
      }
    }
  }
  if (shadow !== undefined) {
    for (let i = 0; i < shadowPools; i++) {
      const sx = Math.round(cx + rng.next() * (cx - x0))
      const sy = Math.round(cy + rng.next() * (cy - y0))
      const n = 1 + Math.floor(rng.next() * 3)
      for (let k = 0; k < n; k++) {
        const px = sx + Math.floor(rng.next() * 3) - 1
        const py = sy + Math.floor(rng.next() * 3) - 1
        if (insidePoly(px, py, pts) && !nearEdge(px, py, 1)) setPixel(ctx, px, py, shadow)
      }
    }
  }

  // 4. Broken 1px outline just inside the silhouette.
  if (outline !== undefined) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!rim(x, y)) continue
        if (rng.next() < outlineSkip) continue
        setPixel(ctx, x, y, outline)
        // occasional thickening one pixel toward the centroid
        if (rng.next() < 0.2) {
          const tx = x + Math.round(Math.sign(cx - x))
          const ty = y + Math.round(Math.sign(cy - y))
          if (insidePoly(tx, ty, pts)) setPixel(ctx, tx, ty, outline)
        }
      }
    }
  }
}

/**
 * Draws an ASCII-art face onto the canvas at an offset (kept from the sprite
 * era as a face-art painter — it paints pixels into a region, which is
 * exactly how small hand-authored face art like flower petals or lantern
 * glow are made; it is NOT a geometry technique). Each row's chars map
 * through `legend` ('.' or ' ' = transparent); row 0 is the face's TOP —
 * canvas row 0 is also the top (the flipY upload is handled by the geometry's
 * UV mapping, never by flipping the art).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} rows
 * @param {Record<string, number|string|number[]>} legend - char → color
 * @param {number} ox - canvas x of the art's left column
 * @param {number} oy - canvas y of the art's top row
 */
export function drawSpriteRows(ctx, rows, legend, ox, oy) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '.' || ch === ' ') continue
      const color = legend[ch]
      if (color === undefined) {
        throw new Error(`drawSpriteRows: unknown legend char "${ch}" in row ${r}`)
      }
      setPixel(ctx, ox + c, oy + r, color)
    }
  }
}
