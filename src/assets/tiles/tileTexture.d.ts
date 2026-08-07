import type * as THREE from 'three'

/** Pinned canvas resolution for ALL tile top-face textures. */
export const TILE_TEXTURE_SIZE: number

/**
 * Creates a configured canvas texture for tile top faces.
 * SRGBColorSpace / NearestFilter / no mipmaps / ClampToEdge /
 * white pixel (0,0) reserved.
 */
export function makeTileCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.Texture

/**
 * Repaints texels at/near the inscribed UV diamond boundary with a solid
 * color so the top-face diamond silhouette renders crisp (NearestFilter).
 */
export function maskDiamondEdge(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: number | string | THREE.Color,
  margin?: number,
): void
