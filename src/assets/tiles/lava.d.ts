import type * as THREE from 'three'

/** Dark ember base. */
export const LAVA_TOP: number
/** Bright orange crack / glow tone. */
export const LAVA_ORANGE: number
/** Hot yellow crack / glow tone. */
export const LAVA_YELLOW: number
/** Bright yellow-white glow pool tone. */
export const LAVA_GLOW: number
/** Rim highlight (glowing ember edge). */
export const LAVA_LIGHT: number
/** Deep ember shadow. */
export const LAVA_SHADOW: number
/** Baked-in texture outline (near-black ember — never pure black). */
export const LAVA_OUTLINE: number
/** Side-face base color (1-2 steps darker than the top). */
export const LAVA_SIDE: number
/** Ribbon outlineColor (Slice B pinned: warm ember orange). */
export const LAVA_RIBBON_OUTLINE: number

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
export function createLavaTile(variant?: string): THREE.Mesh

/** Uniform alias so the tile registry can call every family identically. */
export const createTile: (variant?: string) => THREE.Mesh

/** Frees all shared geometry/materials/textures owned by this module. */
export function dispose(): void