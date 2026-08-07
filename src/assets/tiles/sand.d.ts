import type * as THREE from 'three'

/** Warm beige / light tan base. */
export const SAND_TOP: number
/** Darker tan grain. */
export const SAND_DARK: number
/** Soft brown pebble grain. */
export const SAND_BROWN: number
/** Almost-white highlight on the highest grains. */
export const SAND_LIGHT: number
/** Gentle shadow tone. */
export const SAND_SHADOW: number
/** Baked-in texture outline (dark warm brown — never black). */
export const SAND_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const SAND_SIDE: number
/** Ribbon outlineColor (Slice B pinned: warm brown). */
export const SAND_RIBBON_OUTLINE: number

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
export function createSandTile(variant?: string): THREE.Mesh

/** Uniform alias so the tile registry can call every family identically. */
export const createTile: (variant?: string) => THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void