import type * as THREE from 'three'

/** Cool pale blue-white base. */
export const SNOW_TOP: number
/** Pure-white grain highlight. */
export const SNOW_WHITE: number
/** Cool gray-blue grain. */
export const SNOW_GRAY: number
/** Cool shadow tone. */
export const SNOW_SHADOW: number
/** Baked-in texture outline (cool pale blue — never black). */
export const SNOW_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const SNOW_SIDE: number
/** Ribbon outlineColor (Slice B pinned: cool pale blue). */
export const SNOW_RIBBON_OUTLINE: number

export interface TileVariantManifestEntry {
  name: string
  biome: string
  kind: 'plain' | 'decorated' | 'edge'
  fromBiome?: string
  toBiome?: string
  orientation?: 'n' | 'e' | 's' | 'w'
  topColor?: number
  baseColor?: number
  topColors?: Record<string, number>
  baseColors?: Record<string, number>
  outlineColor?: number
}

/** Machine-readable variant manifest (composer + fixture registration). */
export const VARIANTS: Record<string, TileVariantManifestEntry>

/**
 * Factory: returns a single merged Mesh for the given variant
 * (InstancedMesh compatible — one geometry, one material, vertex colors).
 */
export function createSnowTile(variant?: string): THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void