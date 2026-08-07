import type * as THREE from 'three'

export interface PropManifestEntry {
  name: string
  /** Socket type — center (max 1) | corner (max 4) | edge (max 4) | surface (max 1). */
  socket: 'center' | 'corner' | 'edge' | 'surface'
  max: number
  /** On-screen world height of the prop sprite (0 for surface overlays). */
  height: number
  /** Neutral host tile variant used by the asset-preview studio staging. */
  hostTile: string
  /** Secondary socket types this prop may legally occupy (e.g. big-stone). */
  alsoSockets?: string[]
}

export const PROP_MODULES: Array<{
  VARIANTS: Record<string, PropManifestEntry>
  createProp: (name: string) => THREE.Mesh
  dispose: () => void
}>

/** Merged prop manifest: prop name → PropManifestEntry (socket metadata). */
export const PROPS: Record<string, PropManifestEntry>

/** All prop names, in module order. */
export const PROP_NAMES: string[]

/** Returns a zero-arg factory for the given prop (composer-compatible). */
export function resolvePropFactory(name: string): () => THREE.Mesh

/** Creates a prop mesh directly. */
export function createProp(name: string): THREE.Mesh

/** Frees every prop module's shared geometry/materials/textures. */
export function dispose(): void
