/**
 * Shared canvas-texture factory for tile top faces — Slice B.
 *
 * Every biome family's top-face texture (grass blades, dirt clumps, water
 * sparkle, ...) is drawn through this module's low-level canvas-texture
 * factory. It pins the renderer conventions every tile texture must share so
 * the whole kit reads as one material system:
 *
 * 1. Pinned resolution: the canvas is always TILE_TEXTURE_SIZE² (32x32).
 * 2. Reserved pixel: canvas pixel (0,0) is force-painted pure white after
 *    drawing. Tile prism side-wall/base-band UVs point at the center of this
 *    pixel so the material's `map` multiplies to 1.0 there and the vertex
 *    colors show through (see tilePrism.js). Because the CanvasTexture
 *    uploads with flipY=true (image row 0 ends up at v=1), the correct UV is
 *    (0.5/size, 1 - 0.5/size) — tilePrism.js encodes this as WHITE_UV /
 *    WHITE_UV_V. The top-cap UV mapping never samples the canvas corners
 *    (the diamond maps to the inscribed UV diamond), so the white pixel is
 *    invisible on the top face. Never draw important detail over (0,0).
 * 3. Textures are NearestFilter + no mipmaps + ClampToEdge: crisp, pixelated
 *    edges matching the flat/faceted tile style.
 * 4. sRGB pipeline end-to-end: every texture produced here declares
 *    `colorSpace = SRGBColorSpace` (the canvas bytes are CSS/sRGB values),
 *    and THREE.Color components are converted back to sRGB before they are
 *    written as canvas bytes. This unifies every family's top-face writers
 *    (which fill via CSS hex strings, already sRGB), so all tiles render the
 *    same color under the same light.
 *
 * `maskDiamondEdge` is the crisp-diamond-rim helper used by every family so
 * the top-face diamond silhouette renders clean under NearestFilter.
 */

import * as THREE from 'three'

/** Pinned canvas resolution for ALL tile top-face textures. */
export const TILE_TEXTURE_SIZE = 32

/**
 * Creates a configured canvas texture for tile top faces.
 * SRGBColorSpace / NearestFilter / no mipmaps / ClampToEdge /
 * white pixel (0,0) reserved.
 *
 * The colorSpace declaration is REQUIRED for the color pipeline to be
 * consistent (see module docs, point 4): canvas bytes are sRGB (the plain
 * writers fill via CSS hex strings), so the texture must tell the renderer
 * to decode them as sRGB. Without it the plain tops sampled raw sRGB bytes
 * as linear values and rendered washed out.
 *
 * @param {number} size - square canvas side in px (use TILE_TEXTURE_SIZE)
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {THREE.Texture}
 */
export function makeTileCanvasTexture(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size, size)
  // Reserved white pixel (0,0) — see module docs, point 2.
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