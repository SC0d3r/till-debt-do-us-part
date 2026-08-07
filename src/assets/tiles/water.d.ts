import type * as THREE from 'three'

/** Bright cyan-blue base. */
export const WATER_TOP: number
/** Light-cyan sparkle / rim highlight tone. */
export const WATER_LIGHT: number
/** Pure-white sparkle pixels (specular highlights). */
export const WATER_WHITE: number
/** Mid light-blue sparkle tone. */
export const WATER_MID: number
/** Deep navy depth-pool tone. */
export const WATER_NAVY: number
/** Baked-in texture outline (deep navy — never black). */
export const WATER_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const WATER_SIDE: number
/** Ribbon outlineColor (Slice B pinned: deep blue). */
export const WATER_RIBBON_OUTLINE: number

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
export function createWaterTile(variant?: string): THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void