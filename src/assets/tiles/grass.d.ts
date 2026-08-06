import type * as THREE from 'three'

/** Fresh, saturated grass top (Harvest-Moon palette): top-face texture base
 *  and cap-edge riser color of grass sides. */
export const GRASS_TOP: number
/** Dark soil under grass — warm dark brown, lifted off black. */
export const GRASS_ROOT: number
/** Deep rich earth under dirt — warmer/more saturated than GRASS_ROOT. */
export const DIRT_ROOT: number
/** Dark tilled loam under tilled soil — cool/desaturated, darkest of the
 *  three roots. */
export const TILLED_ROOT: number

export interface TileVariantManifestEntry {
  name: string
  biome: string
  kind: 'plain' | 'decorated' | 'edge'
  /** edge variants only */
  fromBiome?: string
  toBiome?: string
  /** edge variants only — diamond axis direction the toBiome half points at */
  orientation?: 'n' | 'e' | 's' | 'w'
  /** plain/decorated variants */
  topColor?: number
  baseColor?: number
  /** edge variants: per-biome colors of the two halves (top face + root band) */
  topColors?: Record<string, number>
  baseColors?: Record<string, number>
}

/** Machine-readable variant manifest (composer + fixture registration). */
export const VARIANTS: Record<string, TileVariantManifestEntry>

/**
 * Factory: returns a single merged Mesh for the given variant
 * (InstancedMesh compatible — one geometry, one material, vertex colors).
 */
export function createGrassTile(variant?: string): THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void
