import type * as THREE from 'three'

/** Fresh, saturated grass top (Harvest-Moon palette): top-face texture base. */
export const GRASS_TOP: number
/** Dark grass blade tone. */
export const GRASS_BLADE_DARK: number
/** Mid grass blade tone. */
export const GRASS_BLADE_MID: number
/** Light grass blade tone. */
export const GRASS_BLADE_LIT: number
/** Above-left highlight tone. */
export const GRASS_LIGHT: number
/** South-east shadow tone. */
export const GRASS_SHADOW: number
/** Baked-in texture outline (deep green — never black). */
export const GRASS_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const GRASS_SIDE: number

/** Ribbon outline colors per biome (Slice B pinned). */
export const OUTLINE_COLORS: Record<string, number>

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
  /** ribbon outline color (Slice B) — composer reads mesh.userData.outlineColor */
  outlineColor?: number
}

/** Machine-readable variant manifest (composer + fixture registration).
 *  The grass family ships only plain variants (grass-plain/-b/-c); the
 *  edge-related optional fields above are kept for interface stability but
 *  are unused by this family. */
export const VARIANTS: Record<string, TileVariantManifestEntry>

/**
 * Factory: returns a single merged Mesh for the given variant
 * (InstancedMesh compatible — one geometry, one material, vertex colors).
 */
export function createGrassTile(variant?: string): THREE.Mesh

/** Uniform alias so the tile registry can call every family identically. */
export const createTile: (variant?: string) => THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void