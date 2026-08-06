/**
 * Shared tile-transition texture utility — MANDATED for all biome families.
 *
 * Every transition tile (grass→dirt, sand→grass, water→sand, ...) draws its
 * top-face "stair-step diagonal" split through `makeTransitionTopTexture`;
 * no family ever reimplements the zipper pattern.
 *
 * Conventions (read before using):
 *
 * 1. Pinned resolution: the canvas is always TRANSITION_TEXTURE_SIZE² (32x32)
 *    and the stair-step size is pinned (4px steps, 4 steps across the tile).
 *    This keeps every biome's transitions visually identical in construction.
 * 2. Orientation semantics: `orientation` is one of the four diamond axis
 *    directions ('n','e','s','w'). colorA fills the half the orientation
 *    points AT, colorB fills the opposite half. So
 *    `makeTransitionTopTexture(COLORS.dirt, COLORS.grass, 'n')` is the
 *    "dirt toward the north" tile. The staircase runs along the perpendicular
 *    axis, so 'n'/'s' splits run east-west and 'e'/'w' run north-south.
 *    Ratio default 0.5 = a 50/50 split; the whole staircase shifts linearly
 *    with ratio.
 * 3. Orientation is BAKED into the texture — never rotate at runtime.
 * 4. Reserved pixel: canvas pixel (0,0) is force-painted pure white after
 *    drawing. Tile prism side-wall/base-band UVs point at the center of this
 *    pixel so the material's `map` multiplies to 1.0 there and the
 *    vertex colors show through (see grass.js buildTileGeometry). Because the
 *    CanvasTexture uploads with flipY=true (image row 0 ends up at v=1), the
 *    correct UV is (0.5/size, 1 - 0.5/size) — grass.js encodes this as
 *    WHITE_UV / WHITE_UV_V. The top-cap UV mapping never samples the canvas
 *    corners (the diamond maps to the inscribed UV diamond), so the white
 *    pixel is invisible on the top face. Never draw important detail over
 *    (0,0).
 * 5. Textures are NearestFilter + no mipmaps + ClampToEdge: crisp, pixelated
 *    edges matching the flat/faceted tile style.
 * 6. sRGB pipeline end-to-end: every texture produced here declares
 *    `colorSpace = SRGBColorSpace` (the canvas bytes are CSS/sRGB values),
 *    and THREE.Color components are converted back to sRGB before they are
 *    written as canvas bytes. This unifies the transition halves with the
 *    plain-family top writers (which fill via CSS hex strings, already sRGB),
 *    so a plain top and the matching half of every transition tile render the
 *    same color under the same light.
 *
 * `makeTileCanvasTexture` is the shared low-level canvas-texture factory
 * (sRGB colorSpace, NearestFilter, no mipmaps, white-pixel reservation) used
 * both by the transition generator and by family modules for their own
 * top-face detail (grass noise, flower dots, ...).
 */

import * as THREE from 'three'

/** Pinned canvas resolution for ALL tile top-face textures. */
export const TRANSITION_TEXTURE_SIZE = 32

/** Pinned stair-step rise per step (px) — 4 steps, ±6px around the ratio. */
export const TRANSITION_STEP_PX = 4

/** Pinned number of staircase steps across the tile (matches the reference's 4-5). */
const STAIRCASE_STEPS = 4

/** The four diamond-axis orientations. */
export const TRANSITION_ORIENTATIONS = ['n', 'e', 's', 'w']

/**
 * Creates a configured canvas texture for tile top faces.
 * SRGBColorSpace / NearestFilter / no mipmaps / ClampToEdge /
 * white pixel (0,0) reserved.
 *
 * The colorSpace declaration is REQUIRED for the color pipeline to be
 * consistent (see module docs, point 6): canvas bytes are sRGB (the plain
 * writers fill via CSS hex strings; the transition writer converts its
 * THREE.Colors back to sRGB before writing), so the texture must tell the
 * renderer to decode them as sRGB. Without it the plain tops sampled raw
 * sRGB bytes as linear values and rendered washed out.
 *
 * @param {number} size - square canvas side in px (use TRANSITION_TEXTURE_SIZE)
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {THREE.Texture}
 */
export function makeTileCanvasTexture(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size, size)
  // Reserved white pixel (0,0) — see module docs, point 4.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/** Pixel-perfect fill of a solid color over the whole canvas (sRGB bytes —
 *  see module docs point 6: THREE stores hex colors in the linear working
 *  space when color management is enabled, but canvas bytes are sRGB). */
function fillSolid(ctx, size, color) {
  const img = ctx.createImageData(size, size)
  const d = img.data
  const c = new THREE.Color(color)
  if (THREE.ColorManagement.enabled) c.convertLinearToSRGB()
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Crisp-diamond-edge mask for top-face detail textures.
 *
 * The top cap maps the tile diamond to the FULL UV square, so the texels
 * straddling the inscribed diamond boundary are what the diamond's rim
 * samples. With NearestFilter those texels are noise/detail pixels, which
 * renders the top-face silhouette as a jagged staircase instead of a clean
 * straight edge. This helper repaints every texel whose center is within
 * `margin` texels of the diamond boundary (or outside it) with a solid
 * `color` — normally the texture's base fill — so the rim is one uniform
 * color and the diamond edge reads crisp.
 *
 * The reserved white pixel (0,0) is painted AFTER this mask by
 * `makeTileCanvasTexture`, so the (0,0) texel stays white regardless.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size - square canvas side in px
 * @param {number|string|THREE.Color} color - solid rim color (usually the base fill)
 * @param {number} [margin=1] - rim thickness in texels
 */
export function maskDiamondEdge(ctx, size, color, margin = 1) {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  const c = new THREE.Color(color)
  // THREE stores hex colors in the working (linear) space when color
  // management is enabled, but the canvas is sRGB — convert back so the rim
  // matches the intended base color instead of a dark linear-space value.
  if (THREE.ColorManagement.enabled) c.convertLinearToSRGB()
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const half = size / 2
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Inscribed diamond: |x - half| + |y - half| <= half. Distance of the
      // texel center from the boundary (negative = strictly inside).
      const dist = Math.abs(px + 0.5 - half) + Math.abs(py + 0.5 - half) - half
      if (dist > -margin) {
        const i = (py * size + px) * 4
        d[i] = r
        d[i + 1] = g
        d[i + 2] = b
        d[i + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Stair-step boundary values for the STAIRCASE_STEPS bands, centered on
 * `baseline`. Monotonic staircase (rises as the band index grows) so it reads
 * as a diagonal split, matching reference image 3's "zipper" family.
 *
 * @param {number} baseline - center value of the staircase
 * @returns {number[]} STAIRCASE_STEPS boundary values
 */
function staircaseBoundaries(baseline) {
  const out = []
  for (let i = 0; i < STAIRCASE_STEPS; i++) {
    // i=0..3 → offsets -6,-2,+2,+6 (monotonic, centered on the baseline)
    const off = (i - (STAIRCASE_STEPS - 1) / 2) * TRANSITION_STEP_PX
    out.push(baseline + off)
  }
  return out
}

/**
 * Bakes the stair-step diagonal split between two biome colors into a
 * 32x32 top-face texture. See module docs for orientation/ratio semantics.
 *
 * @param {number|string|THREE.Color} colorA - color of the half the orientation points at
 * @param {number|string|THREE.Color} colorB - color of the opposite half
 * @param {string} orientation - 'n' | 'e' | 's' | 'w' (diamond axis direction, default 'n')
 * @param {number} ratio - split position along the axis (0..1, default 0.5)
 * @returns {THREE.Texture}
 */
export function makeTransitionTopTexture(colorA, colorB, orientation = 'n', ratio = 0.5) {
  const size = TRANSITION_TEXTURE_SIZE
  const a = new THREE.Color(colorA)
  const b = new THREE.Color(colorB)
  // Both halves are written as sRGB canvas bytes (same pipeline as fillSolid
  // and maskDiamondEdge): THREE keeps hex colors in the linear working space
  // when color management is enabled, so convert back before writing or the
  // transition half would render darker than the plain writer's CSS-hex fill.
  if (THREE.ColorManagement.enabled) a.convertLinearToSRGB()
  const baseline = Math.max(2, Math.min(size - 2, Math.round(ratio * size)))
  const bounds = staircaseBoundaries(baseline)
  const bandPx = size / STAIRCASE_STEPS // 8 px per staircase band

  // band index of a pixel coordinate
  const band = (p) => Math.min(STAIRCASE_STEPS - 1, Math.floor(p / bandPx))

  return makeTileCanvasTexture(size, (ctx) => {
    fillSolid(ctx, size, b)
    const img = ctx.getImageData(0, 0, size, size)
    const d = img.data
    const r = Math.round(a.r * 255)
    const g = Math.round(a.g * 255)
    const bl = Math.round(a.b * 255)
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        let isA
        switch (orientation) {
          case 'e': // colorA on the east/right half
            isA = px >= bounds[band(py)]
            break
          case 'w': // colorA on the west/left half
            isA = px < bounds[band(py)]
            break
          case 's': // colorA on the south/bottom half
            isA = py > bounds[band(px)]
            break
          case 'n': // colorA on the north/top half
          default:
            isA = py < bounds[band(px)]
            break
        }
        if (isA) {
          const i = (py * size + px) * 4
          d[i] = r
          d[i + 1] = g
          d[i + 2] = bl
          d[i + 3] = 255
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  })
}
