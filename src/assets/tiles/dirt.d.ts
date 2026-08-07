import type * as THREE from 'three'

/** Dirt top texture tones. */
export const DIRT_LIGHT: number
export const DIRT_DARK: number
export const DIRT_CRACK: number
export const DIRT_HILITE: number
export const DIRT_SHADOW: number
export const DIRT_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const DIRT_SIDE: number

/** Ribbon outline colors per biome (Slice B pinned). */
export const OUTLINE_COLORS: Record<string, number>

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
export function createDirtTile(variant?: string): THREE.Mesh

/** Uniform alias so the tile registry can call every family identically. */
export const createTile: (variant?: string) => THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void
