import type * as THREE from 'three'
import type * as grass from './grass'
import type * as water from './water'
import type * as sand from './sand'
import type * as lava from './lava'
import type * as snow from './snow'

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

export const FAMILIES: Array<typeof grass | typeof water | typeof sand | typeof lava | typeof snow>

/** Merged variant manifest: variant name → TileVariantManifestEntry. */
export const VARIANTS: Record<string, TileVariantManifestEntry>

/** All variant names, in family order. */
export const VARIANT_NAMES: string[]

/** Returns a zero-arg factory for the given variant (composer-compatible). */
export function resolveFactory(variant: string): () => THREE.Mesh

/** Creates a tile mesh directly. */
export function createTile(variant: string): THREE.Mesh

/** Frees every family's shared geometry/materials/textures. */
export function dispose(): void

export { grass, water, sand, lava, snow }