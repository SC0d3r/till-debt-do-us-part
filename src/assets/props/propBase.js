/**
 * Shared prop base — Slice B prop library.
 *
 * Every prop in src/assets/props/ is built from this module's shared pieces,
 * the same relationship tilePrism.js / tileTexture.js / pixelPainter.js have
 * for tiles (TILE_SYSTEM_CONVENTION.md §1-§2): NEVER reimplement the texture
 * factory, the geometry builders or the palette math per prop.
 *
 * What this module owns:
 *
 *  1. makePropTexture — the shared canvas-texture factory. Props use the SAME
 *     pinned pixel-art settings as tiles (NearestFilter mag AND min, no
 *     mipmaps, ClampToEdge, SRGBColorSpace, imageSmoothingEnabled=false,
 *     hard palette only) but WITHOUT the reserved white pixel (0,0) that tile
 *     side-wall UVs rely on — prop sprites are alpha-cutout silhouettes, so a
 *     white corner texel would render as a stray dot.
 *
 *  2. buildCrossedQuadGeometry — the ROTATION-SAFE prop body. Records rotate
 *     0/90/180/270 in the isometric world, so a single south-facing quad
 *     would vanish (edge-on) or read mirrored from north rotations. The X
 *     construction is two perpendicular vertical planes, merged into ONE
 *     BufferGeometry with ONE material:
 *       - Plane A runs along (1,0,1)/√2, plane B along (−1,0,1)/√2; they
 *         cross at the prop's local vertical axis (the classic crossed
 *         billboard — from ANY rotation at least one plane faces the camera).
 *       - Each plane's world width = height · spriteAspect · √2, so when the
 *         plane is viewed at its 45° yaw the sprite renders at its NATURAL
 *         pixel aspect (no horizontal squash).
 *       - Plane B's U coordinate is flipped so the standard iso camera (from
 *         the south, +z) sees BOTH planes reading UNMIRRORED: the south
 *         camera faces plane A's front and plane B's back, and a back-face
 *         read of a flipped-U front mapping is an unmirrored read. (From the
 *         north both planes read mirrored — the inherent crossed-billboard
 *         trade-off; the prop stays readable and volume reads correctly.)
 *       - The quad's bottom edge is the sprite's bottom pixel row, so prop
 *         modules just draw their base pixels on canvas row 31 and the prop
 *         "rests" on the tile surface with the local origin at the contact
 *         point (y = 0 at the base).
 *
 *  3. buildFlatOverlayGeometry — the surface-socket prop body: a flat diamond
 *     quad (same footprint + UV mapping as the tile top cap) raised a tiny
 *     epsilon above its local origin plane so a composer can drop it at
 *     tile-top height with zero z-fighting.
 *
 *  4. makePropMaterial — the shared cutout material: Lambert (same shading
 *     model as the tiles), alphaTest 0.5 (binary-alpha cutout — no blending,
 *     no transparent sorting, opaque pass only), DoubleSide (back faces of
 *     the crossed planes must render), NearestFiltered map.
 *
 *  5. Palette helpers + painter re-exports — darken/lighten for synthesizing
 *     outline/shadow tones from a base hue, plus the pixelPainter primitives
 *     (setPixel, cssColor, insideDiamond, paintNoise, SeededRNG, ...) so prop
 *     modules import ONE base module and never reimplement painting logic.
 *
 * Every prop module exports the tile-style manifest convention: a VARIANTS
 * object (name → entry with socket metadata), createProp(name) returning a
 * single merged Mesh (InstancedMesh-safe: one geometry, one material), and a
 * dispose() that frees the module's shared geometry/material/texture exactly
 * once. The merged registry src/assets/props/index.js merges all of them.
 */

import * as THREE from 'three'
import { SeededRNG } from '../../core/procedural'
import {
  makePixelTexture,
  paintNoise,
  paintAboveLeftShading,
  paintJaggedOutline,
  setPixel,
  hexToRgb,
  clamp255,
  cssColor,
  insideDiamond,
} from '../pixelart/pixelPainter'

/** Pinned canvas resolution for ALL prop textures (same as tiles: 32x32). */
export const PROP_TEXTURE_SIZE = 32

/** Small epsilon above the tile top face — bakes the anti-z-fight offset into
 *  surface-socket overlay geometry. */
export const OVERLAY_EPS = 0.0015

// Re-export the shared painter primitives so prop modules have ONE base
// module to import (reuse, never reimplementation).
export {
  SeededRNG,
  paintNoise,
  paintAboveLeftShading,
  paintJaggedOutline,
  setPixel,
  hexToRgb,
  clamp255,
  cssColor,
  insideDiamond,
}

// ─── Texture factory ──────────────────────────────────────────────────────

/**
 * Shared prop texture factory: the pinned pixel-art canvas texture settings
 * (NearestFilter / no mipmaps / ClampToEdge / sRGB) WITHOUT the tile-side
 * reserved white pixel — prop textures are alpha cutouts, not material maps
 * for side-wall vertex colors.
 *
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {THREE.Texture}
 */
export function makePropTexture(draw) {
  return makePixelTexture(PROP_TEXTURE_SIZE, draw, { reserveWhite: false })
}

// ─── Palette helpers ──────────────────────────────────────────────────────

/**
 * Darkens a color by a factor (0..1), returning sRGB byte triple [r, g, b].
 * Used to synthesize outline/shadow tones from a prop's dominant hue —
 * the "dark version of the object's own dominant hue" outline rule.
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
 * Draws an ASCII-art sprite onto the canvas at an offset.
 * Each row string's chars map through `legend` ('.' or ' ' = transparent);
 * every other char must exist in the legend. Row 0 is the sprite's TOP —
 * canvas row 0 is also the top (the flipY upload is handled by the geometry's
 * UV mapping, never by flipping the art).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} rows
 * @param {Record<string, number|string|number[]>} legend - char → color
 * @param {number} ox - canvas x of the sprite's left column
 * @param {number} oy - canvas y of the sprite's top row
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

/**
 * Paints a dense organic blob sprite (bushes, stones, mounds, drifts) from
 * seeded clumps, then applies a broken outline that follows the silhouette —
 * the same "organic clumped noise" rule as the tiles, applied to prop sprites.
 *
 * Palette keys: `e` = base tone, `d` = dark, `k` = darkest (shadow pockets),
 * `l` = light (upper-left highlights), `O` = outline (a dark hue of the
 * prop's own dominant hue — NEVER black). All placement is seeded-clump based
 * and deterministic; the silhouette is deliberately jagged (pixels stick out
 * 1-2 steps). The bottom pixel row is filled with base/dark tones and is
 * EXEMPT from the outline pass, so the prop visually rests on the tile
 * surface instead of being ringed by a line.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SeededRNG} rng - deterministic placement stream
 * @param {Record<'e'|'d'|'k'|'l'|'O', number|string|number[]>} palette
 * @param {object} [opts]
 * @param {{x0:number,y0:number,x1:number,y1:number}} [opts.bounds] - clamp
 *   area for the whole sprite (usually the sprite's pixel rect)
 * @param {number} [opts.cx] - blob center x (defaults to bounds center)
 * @param {number} [opts.cy] - blob center y
 * @param {number} [opts.radius=7] - blob radius
 * @param {number} [opts.clumpCount=8] - seeded leaf/mound clumps
 * @param {number} [opts.clumpSize=3] - base clump pixel count
 * @param {number} [opts.spikeCount=8] - 1px silhouette protrusions (leafy
 *   spikes / lumpy stone bumps)
 * @param {number} [opts.outlineSkip=0.18] - fraction of silhouette pixels the
 *   outline skips (the "broken" outline rule)
 * @param {number} [opts.lightBias=0.4] - chance an upper-left pixel takes the
 *   light tone
 * @param {boolean} [opts.forceGround=true] - stamp a base footprint on the
 *   bottom row so the prop rests on the surface
 */
export function paintBlobSprite(ctx, rng, palette, opts = {}) {
  const size = ctx.canvas.width
  const bounds = opts.bounds || { x0: 0, y0: 0, x1: size - 1, y1: size - 1 }
  const cx = opts.cx ?? Math.round((bounds.x0 + bounds.x1) / 2)
  const cy = opts.cy ?? Math.round((bounds.y0 + bounds.y1) / 2)
  const radius = opts.radius ?? 7
  const clumpCount = opts.clumpCount ?? 8
  const clumpSize = opts.clumpSize ?? 3
  const spikeCount = opts.spikeCount ?? 8
  const outlineSkip = opts.outlineSkip ?? 0.18
  const lightBias = opts.lightBias ?? 0.4
  const forceGround = opts.forceGround !== false
  const groundRow = size - 1

  const inBounds = (x, y) =>
    x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1
  const key = (x, y) => `${x},${y}`
  const filled = new Map()
  const set = (x, y, t) => {
    if (inBounds(x, y)) filled.set(key(x, y), t)
  }

  // 1. Seeded leaf/mound clumps around the blob center (squashed vertically
  //    so blobs sit low like plants/rocks, not balls).
  for (let i = 0; i < clumpCount; i++) {
    const a = rng.next() * Math.PI * 2
    const r = radius * (0.3 + rng.next() * 0.75)
    let x = Math.round(cx + Math.cos(a) * r)
    let y = Math.round(cy + Math.sin(a) * r * 0.8)
    const n = clumpSize + Math.floor(rng.next() * 3)
    for (let k = 0; k < n; k++) {
      let t = 'e'
      if (y < cy - 1 && x < cx && rng.next() < lightBias) t = 'l'
      else if (y > cy + radius * 0.25 && rng.next() < 0.5) t = 'd'
      else if (rng.next() < 0.18) t = 'k'
      else if (rng.next() < 0.28) t = 'd'
      set(x, y, t)
      x += Math.floor(rng.next() * 3) - 1
      y += Math.floor(rng.next() * 3) - 1
    }
  }

  // 2. Gap fill: 2 passes of filling empty 4-neighbors of filled pixels
  //    within the blob radius — dense pack, no holes (never a checkerboard).
  for (let pass = 0; pass < 2; pass++) {
    const add = []
    for (const [k2] of filled) {
      const [x, y] = k2.split(',').map(Number)
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (filled.has(key(nx, ny))) continue
        if (!inBounds(nx, ny)) continue
        const dist = Math.hypot(nx - cx, ny - cy)
        if (dist <= radius + 1.5) add.push([nx, ny])
      }
    }
    for (const [nx, ny] of add) {
      if (filled.has(key(nx, ny))) continue
      const t = ny > cy ? 'd' : 'e'
      set(nx, ny, t)
    }
  }

  // 3. Silhouette spikes: 1px protrusions just outside the blob, mostly on
  //    the upper half (leafy spikes / bumpy lumps).
  for (let i = 0; i < spikeCount; i++) {
    const a = rng.next() * Math.PI * 2
    const r = radius + 0.4 + rng.next() * 1.2
    const sx = Math.round(cx + Math.cos(a) * r)
    const sy = Math.round(cy + Math.sin(a) * r * 0.8)
    if (filled.has(key(sx, sy))) continue
    // only attach to the blob (must touch a filled 8-neighbor)
    let attached = false
    for (let dy = -1; dy <= 1 && !attached; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        if (filled.has(key(sx + dx, sy + dy))) {
          attached = true
          break
        }
      }
    }
    if (!attached) continue
    const t = sy < cy && sx < cx && rng.next() < 0.5 ? 'l' : 'e'
    set(sx, sy, t)
  }

  // 4. Ground footprint: stamp base/dark pixels on the bottom row so the
  //    prop sits flush on the tile surface.
  if (forceGround) {
    for (let dx = -2; dx <= 2; dx++) {
      set(cx + dx, groundRow, dx <= 0 ? 'd' : 'e')
    }
  }

  // 5. Outline pass: every silhouette pixel (empty 8-neighbor) takes the
  //    outline tone, with a skip chance for the broken-line rule; the bottom
  //    row is exempt so the prop is rooted, not ringed.
  const outlines = []
  for (const [k2, t] of filled) {
    const [x, y] = k2.split(',').map(Number)
    if (y >= groundRow) continue
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        if (!filled.has(key(x + dx, y + dy))) {
          edge = true
          break
        }
      }
    }
    if (edge && rng.next() > outlineSkip) outlines.push([x, y])
  }
  for (const [x, y] of outlines) filled.set(key(x, y), 'O')

  // 6. Paint (one setPixel per filled texel — hard pixels only).
  for (const [k2, t] of filled) {
    const [x, y] = k2.split(',').map(Number)
    setPixel(ctx, x, y, palette[t])
  }
}

// ─── Geometry ─────────────────────────────────────────────────────────────

/**
 * Builds the rotation-safe crossed-quad geometry for a sprite prop.
 *
 * Two perpendicular vertical planes (plane A along (1,0,1)/√2, plane B along
 * (−1,0,1)/√2) crossing at the local Y axis, merged into ONE BufferGeometry.
 * The planes are sized so the sprite, viewed from the standard iso camera
 * (south, +z), renders at its natural pixel aspect; the local origin is the
 * base contact point (y = 0 at the sprite's bottom pixel row).
 *
 * @param {object} opts
 * @param {number} opts.worldHeight - on-screen world height of the drawn
 *   sprite (the prop's real-world height, e.g. 0.12 for the flower)
 * @param {{x: number, y: number, w: number, h: number}} opts.spriteRect -
 *   pixel rect (canvas coords, top-down y) the sprite occupies within the
 *   PROP_TEXTURE_SIZE canvas
 * @param {boolean} [opts.flipSecond=true] - mirror plane B's U so the south
 *   camera reads both planes unmirrored
 * @returns {THREE.BufferGeometry}
 */
export function buildCrossedQuadGeometry(opts) {
  const { worldHeight, spriteRect, flipSecond = true } = opts
  const canvasSize = PROP_TEXTURE_SIZE
  // Plane height covers the full canvas; the sprite's pixel rect maps to the
  // on-screen worldHeight.
  const quadH = (worldHeight * canvasSize) / spriteRect.h
  // Plane width compensates the 45° yaw foreshortening (cos 45° = 1/√2) so
  // the sprite keeps its pixel aspect when viewed from the south.
  const quadW = (quadH * (spriteRect.w * Math.SQRT2)) / canvasSize
  const hw = quadW / 2

  // Sprite rect → UV rect (flipY: canvas row 0 = v 1).
  const u0 = spriteRect.x / canvasSize
  const u1 = (spriteRect.x + spriteRect.w) / canvasSize
  const v0 = 1 - (spriteRect.y + spriteRect.h) / canvasSize
  const v1 = 1 - spriteRect.y / canvasSize

  const invSqrt2 = 1 / Math.SQRT2
  const dirA = [invSqrt2, 0, invSqrt2] // plane A horizontal axis (NE-SW)
  const dirB = [-invSqrt2, 0, invSqrt2] // plane B horizontal axis (NW-SE)

  const positions = []
  const uvs = []
  const indices = []

  // Plane A: front face normal (−1,0,1)/√2 (faces the south-west; the south
  // camera sees its FRONT — standard UVs read unmirrored).
  // Plane B: front face normal (−1,0,−1)/√2 (the south camera sees its BACK,
  // so its U is flipped: the back-read of a flipped front is unmirrored).
  const planes = [
    { dir: dirA, flipU: false },
    { dir: dirB, flipU: flipSecond },
  ]
  for (let p = 0; p < 2; p++) {
    const { dir, flipU } = planes[p]
    // Local plane corners: bottom-left, bottom-right, top-right, top-left.
    const corners = [
      [dir[0] * -hw, 0, dir[2] * -hw],
      [dir[0] * hw, 0, dir[2] * hw],
      [dir[0] * hw, quadH, dir[2] * hw],
      [dir[0] * -hw, quadH, dir[2] * -hw],
    ]
    const base = p * 4
    for (let v = 0; v < 4; v++) {
      positions.push(corners[v][0], corners[v][1], corners[v][2])
      let u
      if (!flipU) u = v === 0 || v === 3 ? u0 : u1
      else u = v === 0 || v === 3 ? u1 : u0
      const vv = v < 2 ? v0 : v1
      uvs.push(u, vv)
    }
    indices.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals() // per-face (flat) normals
  return geometry
}

/**
 * Builds the surface-socket overlay geometry: a flat diamond quad matching
 * the tile top cap's footprint (vertices at (±0.5, eps, ±0.5)) and UV mapping
 * (the inscribed diamond maps to the full UV square, exactly like the tile
 * cap in tilePrism.js), raised OVERLAY_EPS above the local origin plane so it
 * sits cleanly on a tile top face with no z-fighting.
 *
 * @param {number} [eps=OVERLAY_EPS]
 * @returns {THREE.BufferGeometry}
 */
export function buildFlatOverlayGeometry(eps = OVERLAY_EPS) {
  // Same cap order as tilePrism: N (+z), E (+x), S (−z), W (−x).
  const cap = [
    [0, eps, 0.5],
    [0.5, eps, 0],
    [0, eps, -0.5],
    [-0.5, eps, 0],
  ]
  const uv = [
    [0.5, 1],
    [1, 0.5],
    [0.5, 0],
    [0, 0.5],
  ]
  const positions = []
  const uvs = []
  for (let v = 0; v < 4; v++) {
    positions.push(cap[v][0], cap[v][1], cap[v][2])
    uvs.push(uv[v][0], uv[v][1])
  }
  const indices = [0, 1, 2, 0, 2, 3]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// ─── Material ─────────────────────────────────────────────────────────────

/**
 * Shared prop material: Lambert (same shading model as the tile kit),
 * alphaTest 0.5 cutout (prop textures are binary-alpha silhouettes — opaque
 * pass, no blending/sorting), DoubleSide so the crossed planes' back faces
 * render, flat shading, NearestFiltered map.
 *
 * @param {THREE.Texture} texture
 * @returns {THREE.MeshLambertMaterial}
 */
export function makePropMaterial(texture) {
  return new THREE.MeshLambertMaterial({
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
  })
}
