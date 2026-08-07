/**
 * Shared pixel-art painter utility — Slice B (pixel-art tile & prop redesign).
 *
 * Every tile/prop texture generator in the system is a thin wrapper around
 * these primitives, the same way tile geometry factories share conventions
 * (TILE_SYSTEM_CONVENTION.md §1, "Shared noise-painting utility"). The style
 * rules (palette discipline, above-left shading, organic directional noise,
 * baked jagged outline) are pinned in
 * docs/dev-log/SLICE_B_PIXEL_ART_TILES_AND_PROPS.md and its reference
 * documents; this module is their mechanical implementation:
 *
 *   makePixelTexture(size, draw, opts?) — canvas texture factory with the
 *     pinned nearest-filter / no-mipmap / ClampToEdge / sRGB settings and the
 *     reserved white pixel (0,0) convention (side-wall vertex colors multiply
 *     through it — see tileTexture.js; the WHITE_UV math consumers use
 *     is unchanged).
 *   paintNoise(ctx, { rng, seed, base, accents, density, clumpSize, style,
 *     region, margin }) — organic DIRECTIONAL noise. ALL placement is
 *     CLUMP-BASED: seeded blobs of accent pixels around clump centers, never
 *     a uniform scatter. A checkerboard of random color squares is a
 *     rejection, not a style choice. Styles:
 *       'blades'   — 1-3px tall vertical grass strokes, slightly leaning,
 *                    irregular (reference: "grass blades 1-3 pixels tall and
 *                    irregular").
 *       'clumps'   — random-walk blobs of 4-8 px (reference: "soft irregular
 *                    clumps", "small raised mounds of 1-2 pixels").
 *       'cracks'   — meandering 1px lines with occasional branches
 *                    (reference: "subtle cracks (1-pixel dark lines that
 *                    meander)").
 *       'grain'    — tiny 2-4px near-base clusters (reference: "sand grain
 *                    that clusters rather than scatters uniformly").
 *       'sparkle'  — 1-4px bright pools (reference: "water sparkle that
 *                    pools rather than dots evenly").
 *   paintAboveLeftShading(ctx, { rng, seed, light, shadow, ... }) — light
 *     from above-left: a thin BROKEN highlight row of `light` just inside
 *     the top edge (weighted toward the NW edge), shadows of `shadow`
 *     pooling toward the lower-right of the diamond face.
 *   paintJaggedOutline(ctx, { rng, seed, color, size, ... }) — a jagged,
 *     broken, NON-black, dark-hue-of-the-material line near the texture's own
 *     edges: thickens/thins, skips pixels, jitters along the edge so it
 *     follows the surface noise.
 *   maskDiamondEdge(ctx, size, color, margin) — the crisp diamond rim
 *     helper, re-exported from tileTexture.js (logic reused verbatim,
 *     never duplicated) so the geometry silhouette stays precise; the jagged
 *     outline is painted just INSIDE the rim.
 *   hexToRgb / clamp255 / cssColor / setPixel — byte-level helpers. Canvas
 *     bytes are sRGB; THREE hex colors live in the linear working space when
 *     color management is enabled — everything converts before writing, the
 *     same pipeline tileTexture.js uses (module docs, point 4).
 *
 * Textures are 32x32 (TILE_TEXTURE_SIZE — pinned for all top faces, so every
 * plain tile stays visually consistent).
 */

import * as THREE from 'three'
import { SeededRNG } from '../../core/procedural'
import { maskDiamondEdge } from '../tiles/tileTexture'

// Re-exported so every consumer gets the ONE rim helper (reuse, not copy).
export { maskDiamondEdge }

/** Clamps a byte to 0..255 (rounded). */
export function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * sRGB byte triple for a color. Accepts hex numbers, '#rgb'/'#rrggbb' strings
 * and already-sRGB [r,g,b] triples. THREE stores hex colors in the linear
 * working space when color management is enabled — convert back before
 * writing canvas bytes or everything renders too dark.
 *
 * @param {number|string|number[]} color
 * @returns {number[]} [r, g, b] in 0..255
 */
export function hexToRgb(color) {
  if (Array.isArray(color)) return color
  const c = new THREE.Color(color)
  if (THREE.ColorManagement.enabled) c.convertLinearToSRGB()
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]
}

/** CSS rgb() string for canvas fills (same sRGB pipeline as hexToRgb). */
export function cssColor(color) {
  const [r, g, b] = hexToRgb(color)
  return `rgb(${r},${g},${b})`
}

/** Paints one hard pixel (integer coords, no smoothing). */
export function setPixel(ctx, x, y, color) {
  const [r, g, b] = hexToRgb(color)
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(x, y, 1, 1)
}

/**
 * Whether a texel's center lies inside the inscribed diamond, at least
 * `margin` texels from the boundary (margin 0 = the crisp rim ring itself).
 * Uses maskDiamondEdge's distance convention:
 *   dist = |x + 0.5 - half| + |y + 0.5 - half| - half, inside = dist <= -margin.
 */
export function insideDiamond(px, py, size, margin = 0) {
  const half = size / 2
  return Math.abs(px + 0.5 - half) + Math.abs(py + 0.5 - half) <= half - margin
}

/**
 * Canvas texture factory for pixel-art assets.
 *
 * Pinned settings (TILE_SYSTEM_CONVENTION.md §1, Slice B): NearestFilter for
 * mag AND min, no mipmaps, ClampToEdge, SRGBColorSpace, and the reserved
 * white pixel (0,0) painted AFTER `draw` (side-wall vertex colors multiply
 * through it — keep the WHITE_UV math from tileTexture.js; never draw
 * important detail over (0,0), which is outside the inscribed diamond anyway).
 *
 * @param {number} size - square canvas side in px (use TILE_TEXTURE_SIZE)
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @param {{reserveWhite?: boolean}} [opts]
 * @returns {THREE.Texture}
 */
export function makePixelTexture(size, draw, opts = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  draw(ctx, size, size)
  if (opts.reserveWhite !== false) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 1, 1)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ─── Noise ──────────────────────────────────────────────────────────────

/** Darkens a color by a factor (0..1). */
function darken(color, f) {
  const [r, g, b] = hexToRgb(color)
  return [clamp255(r * f), clamp255(g * f), clamp255(b * f)]
}

/** Lightens a color toward white by a factor. */
function lighten(color, f) {
  const [r, g, b] = hexToRgb(color)
  return [
    clamp255(r + (255 - r) * f),
    clamp255(g + (255 - g) * f),
    clamp255(b + (255 - b) * f),
  ]
}

/**
 * Weighted accent picker. `accents` entries are hex colors or
 * { color, weight } objects.
 */
function makeAccentPicker(accents, rng) {
  const total = accents.reduce((s, a) => s + (a.weight ?? 1), 0)
  return () => {
    let t = rng.next() * total
    for (const a of accents) {
      t -= a.weight ?? 1
      if (t <= 0) return a.color ?? a
    }
    return accents[accents.length - 1].color ?? accents[accents.length - 1]
  }
}

/**
 * Organic, DIRECTIONAL noise — clump-based placement, never uniform scatter.
 *
 * All accent pixels belong to a seeded clump (blob / blade tuft / crack /
 * grain cluster / sparkle pool) around a random clump center, so the result
 * reads as a material's surface structure, not a checkerboard of random
 * squares.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {SeededRNG} [opts.rng] - shared rng (preferred; advances deterministically)
 * @param {number} [opts.seed] - fallback: seed used to create a fresh rng
 * @param {number|string|number[]} [opts.base] - the material's base tone
 *   (used to synthesize default accents when `accents` is empty)
 * @param {Array<number|string|number[]|{color, weight?}>} [opts.accents] -
 *   accent palette (required for real character; defaults derived from base)
 * @param {number} [opts.density=22] - number of clump centers
 * @param {number} [opts.clumpSize=2] - max reach of a clump from its center
 * @param {'blades'|'clumps'|'cracks'|'grain'|'sparkle'} [opts.style='clumps']
 * @param {(x: number, y: number) => boolean} [opts.region] - placement filter
 *   (e.g. the A-half of a transition zipper); noise never escapes it
 * @param {number} [opts.margin=2] - keep noise this many texels inside the
 *   diamond rim (the rim stays base color + jagged outline territory)
 */
export function paintNoise(ctx, opts = {}) {
  const size = ctx.canvas.width
  const rng = opts.rng || new SeededRNG(opts.seed ?? 1)
  let accents = opts.accents || []
  if (accents.length === 0 && opts.base !== undefined) {
    // Synthesize a minimal accent set from the base tone.
    accents =
      opts.style === 'grain' || opts.style === 'sparkle'
        ? [lighten(opts.base, 0.35), darken(opts.base, 0.75)]
        : [darken(opts.base, 0.7)]
  }
  if (accents.length === 0) return
  const density = opts.density ?? 22
  const clumpSize = opts.clumpSize ?? 2
  const style = ['blades', 'clumps', 'cracks', 'grain', 'sparkle'].includes(opts.style)
    ? opts.style
    : 'clumps'
  const region = opts.region || null
  const margin = opts.margin ?? 2
  const pickAccent = makeAccentPicker(accents, rng)

  // Per-call paint guard: bounds, diamond margin, region filter, and a used
  // set so clumps never stack into a uniform mush.
  const used = new Set()
  const paint = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    if (!insideDiamond(x, y, size, margin)) return false
    if (region && !region(x, y)) return false
    const key = y * size + x
    if (used.has(key)) return false
    used.add(key)
    return true
  }

  const paintBlades = (cx, cy) => {
    const count = 1 + Math.floor(rng.next() * 3) // 1..3 tufts per clump
    for (let k = 0; k < count; k++) {
      const bx = cx + Math.floor(rng.next() * 3) - 1
      const by = cy + Math.floor(rng.next() * 3) - 1
      const h = 1 + Math.floor(rng.next() * 3) // 1-3px tall
      const lean = (rng.next() - 0.5) * 1.6 // blades lean ±0.8px per step
      const col = pickAccent()
      for (let s = 0; s < h; s++) {
        const x = Math.round(bx + lean * s)
        const y = by - s // blades grow upward (canvas row 0 = north/top)
        if (paint(x, y)) setPixel(ctx, x, y, col)
      }
      // occasional 2px-wide tuft base
      if (rng.next() < 0.3) {
        const x = Math.round(bx + lean * 0.5) + (rng.next() < 0.5 ? 1 : -1)
        if (paint(x, by)) setPixel(ctx, x, by, col)
      }
    }
  }

  const paintClump = (cx, cy) => {
    const col = pickAccent()
    const n = 4 + Math.floor(rng.next() * 5) // 4..8 px
    let x = cx
    let y = cy
    for (let i = 0; i < n; i++) {
      if (paint(x, y)) setPixel(ctx, x, y, col)
      // random-walk step, kept near the clump center (organic blob)
      x += Math.floor(rng.next() * 3) - 1
      y += Math.floor(rng.next() * 3) - 1
      if (Math.abs(x - cx) > clumpSize) x += cx > x ? 1 : -1
      if (Math.abs(y - cy) > clumpSize) y += cy > y ? 1 : -1
    }
  }

  const paintCrack = (cx, cy) => {
    const col = pickAccent()
    const len = 4 + Math.floor(rng.next() * 8) // 4..11 px meander
    let x = cx
    let y = cy
    let dir = rng.next() * Math.PI * 2
    for (let i = 0; i < len; i++) {
      if (paint(x, y)) setPixel(ctx, x, y, col)
      dir += (rng.next() - 0.5) * 0.9 // meander
      x += Math.round(Math.cos(dir))
      y += Math.round(Math.sin(dir))
      // occasional branch
      if (i % 4 === 3 && rng.next() < 0.4) {
        const bdir = dir + (rng.next() - 0.5) * 1.6
        let bx = x + Math.round(Math.cos(bdir))
        let by = y + Math.round(Math.sin(bdir))
        for (let b = 0; b < 2; b++) {
          if (paint(bx, by)) setPixel(ctx, bx, by, col)
          bx += Math.round(Math.cos(bdir))
          by += Math.round(Math.sin(bdir))
        }
      }
    }
  }

  const paintGrain = (cx, cy) => {
    const n = 2 + Math.floor(rng.next() * 3) // 2..4 px per cluster
    for (let i = 0; i < n; i++) {
      const x = cx + Math.floor(rng.next() * (clumpSize * 2 + 1)) - clumpSize
      const y = cy + Math.floor(rng.next() * (clumpSize * 2 + 1)) - clumpSize
      if (paint(x, y)) setPixel(ctx, x, y, pickAccent())
    }
  }

  const paintSparkle = (cx, cy) => {
    const col = pickAccent()
    // pools: mostly 1-3px clusters, sometimes a 4px blob
    const n = 1 + Math.floor(rng.next() * (rng.next() < 0.3 ? 4 : 3))
    for (let i = 0; i < n; i++) {
      const x = cx + Math.floor(rng.next() * 2)
      const y = cy + Math.floor(rng.next() * 2)
      if (paint(x, y)) setPixel(ctx, x, y, col)
    }
  }

  for (let i = 0; i < density; i++) {
    // clump center inside the diamond, away from the rim
    let cx = -1
    let cy = -1
    for (let tries = 0; tries < 12; tries++) {
      cx = Math.floor(rng.next() * size)
      cy = Math.floor(rng.next() * size)
      if (insideDiamond(cx, cy, size, margin + 1)) break
    }
    if (!insideDiamond(cx, cy, size, margin + 1)) continue
    switch (style) {
      case 'blades': paintBlades(cx, cy); break
      case 'cracks': paintCrack(cx, cy); break
      case 'grain': paintGrain(cx, cy); break
      case 'sparkle': paintSparkle(cx, cy); break
      default: paintClump(cx, cy); break
    }
  }
}

// ─── Shading ─────────────────────────────────────────────────────────────

/**
 * Above-left shading on the top face: a thin BROKEN highlight row of `light`
 * just inside the top edge (weighted toward the NW edge — light comes from
 * above-left), and shadows of `shadow` pooling toward the lower-right (SE)
 * of the diamond. Painted after the noise, before the outline.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {SeededRNG} [opts.rng]
 * @param {number} [opts.seed]
 * @param {number|string|number[]} opts.light - highlight tone (may be omitted
 *   to skip the highlight pass)
 * @param {number|string|number[]} opts.shadow - shadow tone (may be omitted
 *   to skip the shadow pass)
 * @param {number} [opts.shadowDensity=12] - shadow pools/clusters
 * @param {(x: number, y: number) => boolean} [opts.region]
 */
export function paintAboveLeftShading(ctx, opts = {}) {
  const size = ctx.canvas.width
  const rng = opts.rng || new SeededRNG(opts.seed ?? 7)
  const { light, shadow } = opts
  if (light === undefined && shadow === undefined) return
  const half = size / 2
  const region = opts.region || null

  const paint = (x, y, col) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    if (!insideDiamond(x, y, size, 1)) return
    if (region && !region(x, y)) return
    setPixel(ctx, x, y, col)
  }

  // ── Highlight row just inside the TOP edge ──
  if (light !== undefined) {
    // The two edges meeting at the N vertex (canvas top). The NW edge is
    // weighted more heavily (light from above-LEFT).
    const edges = [
      { a: [half, 0], b: [0, half], weight: 1.0 }, // N → W
      { a: [half, 0], b: [size, half], weight: 0.55 }, // N → E
    ]
    for (const { a, b, weight } of edges) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const steps = Math.max(1, Math.round(len * 0.6 * weight))
      for (let k = 0; k <= steps; k++) {
        if (rng.next() < 0.38) continue // broken — follows the noise
        const t = k / steps
        const ex = a[0] + (b[0] - a[0]) * t
        const ey = a[1] + (b[1] - a[1]) * t
        // inward normal toward the diamond center
        const nx = half - ex
        const ny = half - ey
        const nl = Math.hypot(nx, ny) || 1
        const off = 1 + (rng.next() < 0.3 ? 1 : 0)
        const px = Math.round(ex + (nx / nl) * off)
        const py = Math.round(ey + (ny / nl) * off)
        paint(px, py, light)
        // occasional 2px run along the edge
        if (rng.next() < 0.25) paint(px + Math.round((b[0] - a[0]) / len), py + Math.round((b[1] - a[1]) / len), light)
      }
    }
  }

  // ── Shadows pooling toward the lower-right (SE) ──
  if (shadow !== undefined) {
    const pools = (opts.shadowDensity ?? 12)
    for (let i = 0; i < pools; i++) {
      // bias toward the SE corner: both coords in the lower-right half
      const cx = Math.round(half + rng.next() * (half - 2))
      const cy = Math.round(half + rng.next() * (half - 2))
      const n = 1 + Math.floor(rng.next() * 3)
      for (let k = 0; k < n; k++) {
        const x = Math.round(cx + (rng.next() - 0.5) * 2)
        const y = Math.round(cy + (rng.next() - 0.5) * 2)
        paint(x, y, shadow)
      }
    }
    // sparse flecks across the bottom half (S edge reads slightly recessed)
    for (let i = 0; i < 5; i++) {
      const x = Math.round(2 + rng.next() * (size - 4))
      const y = Math.round(half + rng.next() * (half - 2))
      paint(x, y, shadow)
    }
  }
}

// ─── Outline ─────────────────────────────────────────────────────────────

/**
 * Baked-in jagged outline: a broken, NON-black, dark-hue-of-the-material line
 * just inside the texture's own edges (inside the crisp maskDiamondEdge rim).
 * It thickens/thins, skips pixels, and jitters along the edge so it follows
 * the surface noise — the hand-drawn character of every tile, independent of
 * (and compatible with) the composer's ribbon outline system.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {SeededRNG} [opts.rng]
 * @param {number} [opts.seed]
 * @param {number|string|number[]} opts.color - dark hue of the material
 * @param {number} [opts.size] - texture side (defaults to ctx.canvas.width)
 * @param {number} [opts.skipChance=0.34] - fraction of edge steps skipped
 * @param {number} [opts.thickness=2] - max px inside the rim
 */
export function paintJaggedOutline(ctx, opts = {}) {
  const size = opts.size || ctx.canvas.width
  const rng = opts.rng || new SeededRNG(opts.seed ?? 13)
  const color = opts.color
  if (color === undefined) return
  const half = size / 2
  const skipChance = opts.skipChance ?? 0.34
  const thickness = opts.thickness ?? 2

  // Diamond corners in canvas coords (row 0 = north/top): N, E, S, W.
  const corners = [
    [half, 0],
    [size, half],
    [half, size],
    [0, half],
  ]
  const edges = [
    [0, 1], // NE
    [1, 2], // SE
    [2, 3], // SW
    [3, 0], // NW
  ]
  for (const [ai, bi] of edges) {
    const a = corners[ai]
    const b = corners[bi]
    const len = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))
    // inward unit normal (toward the diamond center)
    const nx = half - (a[0] + b[0]) / 2
    const ny = half - (a[1] + b[1]) / 2
    const nl = Math.hypot(nx, ny) || 1
    const ux = nx / nl
    const uy = ny / nl
    const tx = (b[0] - a[0]) / len
    const ty = (b[1] - a[1]) / len
    for (let k = 0; k <= len; k++) {
      if (rng.next() < skipChance) continue // broken line
      const t = k / len
      const ex = a[0] + (b[0] - a[0]) * t
      const ey = a[1] + (b[1] - a[1]) * t
      // jitter along the edge — the outline "follows the surface noise"
      const jx = Math.round((rng.next() - 0.5) * 2)
      const jy = Math.round((rng.next() - 0.5) * 2)
      const off = 1 + Math.floor(rng.next() * (thickness - 1)) // 1..thickness px inside
      const px = Math.round(ex + ux * off) + jx
      const py = Math.round(ey + uy * off) + jy
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      setPixel(ctx, px, py, color)
      // occasional thickening (2px run along the edge)
      if (rng.next() < 0.22) {
        const qx = px + Math.round(tx)
        const qy = py + Math.round(ty)
        if (qx >= 0 && qy >= 0 && qx < size && qy < size) setPixel(ctx, qx, qy, color)
      }
    }
  }
}
