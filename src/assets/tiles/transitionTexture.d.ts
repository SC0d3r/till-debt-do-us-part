import type * as THREE from 'three'

export const TRANSITION_TEXTURE_SIZE: number
export const TRANSITION_STEP_PX: number
export const TRANSITION_ORIENTATIONS: string[]

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
 * Bakes the stair-step diagonal split between two biome colors into a
 * 32x32 top-face texture. colorA fills the half the orientation points at.
 */
export function makeTransitionTopTexture(
  colorA: number | string | THREE.Color,
  colorB: number | string | THREE.Color,
  orientation?: 'n' | 'e' | 's' | 'w',
  ratio?: number,
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
