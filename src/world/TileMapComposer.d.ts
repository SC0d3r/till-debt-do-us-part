import type * as THREE from 'three'

/** Outline modes (convention §3): 'interior' = only edges touching another
 *  cell in the data, 'exterior' = only edges with no adjacent cell. */
export type OutlineMode = 'all' | 'none' | 'interior' | 'exterior'

/** A data-space side name of the tile diamond ('n' = +y/z, 'e' = +x,
 *  's' = -y/z, 'w' = -x in data coordinates). */
export type TileSide = 'n' | 'e' | 's' | 'w'

/** A tile record the composer consumes: data-grid coordinates + variant string.
 *  `rotation` is 0/90/180/270 degrees clockwise from above +Y (default 0).
 *  `elevation` is accepted as 0/omitted ONLY — any nonzero value throws.
 *  `outline` overrides the map-level outline mode for this record (a mode
 *  string, or an explicit DATA-space side list like ['n', 'e']); the mask
 *  resolves to the record's LOCAL edges by rotating side names
 *  counter-clockwise by `rotation` in 90° steps.
 *  `outlineColor` (hex number or '#rgb'/'#rrggbb') overrides the resolved
 *  outline color. */
export interface TileMapRecord {
  x: number
  y: number
  variant: string
  rotation?: number
  elevation?: number
  outline?: OutlineMode | TileSide[]
  outlineColor?: number | string
}

/** Hover notification payload delivered via onHover. */
export interface TileMapHoverRecord {
  x: number
  y: number
  variant: string
  rotation: number
  instanceId: number
  group: TileMapGroup
}

/** Per-variant group descriptor (one InstancedMesh per group). Instances are
 *  stored in data order, so instanceId == index into `records`. */
export interface TileMapGroup {
  variant: string
  count: number
  records: TileMapRecord[]
  mesh: THREE.InstancedMesh
}

/** Per-RESOLVED-LOCAL-mask outline group descriptor (one InstancedMesh per
 *  mask). `mask` is the comma-joined local side names in n/e/s/w order; a
 *  record whose RENDERED mask is empty after seam resolution (owner
 *  suppressed every side, or mode 'none') lands in the `''` group with a
 *  zero-triangle frame — every record still owns exactly one outline
 *  instance. instanceId == index into `records`. */
export interface TileMapOutlineGroup {
  mask: string
  count: number
  records: TileMapRecord[]
  mesh: THREE.InstancedMesh
}

/** Map-level outline config (convention §3). Absent `outline` option on the
 *  composer → no outline meshes at all. */
export interface TileMapOutlineOptions {
  mode: OutlineMode
  /** Map-level color override (below the biome palette, above the global
   *  default). Hex number or '#rgb'/'#rrggbb'. */
  color?: number | string
  /** Ribbon width centered on the edge line (default 0.03). */
  width?: number
}

export interface TileMapComposerOptions {
  /** object the InstancedMeshes are added to (scene or group) */
  parent: THREE.Object3D
  /** tile records; grouped by variant STRING (never biome/module) */
  data: TileMapRecord[]
  /** maps a variant string to a factory returning a THREE.Mesh; geometry +
   *  material are read off that mesh (shared, never disposed here) */
  resolveFactory: (variant: string) => () => THREE.Mesh
  /** camera hover rays are cast through (pointermove-only picking) */
  raycastTarget: THREE.Camera
  /** map-level outline config; ABSENT → no outline meshes (zero cost) */
  outline?: TileMapOutlineOptions
  /** called on every hover change; null = pointer moved off/left/blur */
  onHover?: ((record: TileMapHoverRecord | null) => void) | null
}

/**
 * Data-driven isometric tile-map composer: one InstancedMesh per variant
 * string, instances at the diagonal-lattice world position
 * ((x − y)·0.5, 0, (x + y)·0.5) with per-instance rotation (0/90/180/270,
 * clockwise from above +Y), instanceColor initialized to (0.88, 0.88, 0.88)
 * for every instance, pointermove-only hover raycasting with the onHover
 *  contract. Optional tile outlines (one InstancedMesh per resolved local
 *  mask, white material, per-instance instanceColor = resolved color ×
 *  0.88/1.0 following the tile's hover brightness; ONE line per seam —
 *  ownership resolution renders each shared edge on the tile whose outline
 *  color matches its own biome when exactly one side is biome-colored
 *  (resolved color == the variant's manifest palette color, exact hex),
 *  else on the tile with lexicographically smaller (x, y) — so seams never
 *  render doubled). Passive after build — no render-loop hooks.
 */
export class TileMapComposer {
  constructor(opts: TileMapComposerOptions)
  /** read-only group descriptors, one per variant string */
  readonly groups: TileMapGroup[]
  /** read-only outline group descriptors, one per resolved local mask
   *  (empty when the outline option is absent) */
  readonly outlineGroups: TileMapOutlineGroup[]
  /** Removes meshes from the parent, disposes outline frame geometry +
   *  material, and unbinds hover listeners. Shared tile geometry/materials
   *  are NOT disposed (owned by the tile family modules). */
  dispose(): void
}
