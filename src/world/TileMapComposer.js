/**
 * TileMapComposer — generic data-driven isometric tile-map composer.
 *
 * Slice A of the Modular Isometric Biome Tile System (see
 * docs/dev-log/TILE_SYSTEM_CONVENTION.md §3 — the composer convention; this
 * module follows it exactly).
 *
 * The composer is a PASSIVE object: it takes a plain data structure and a
 * variant-string → factory resolver, builds one THREE.InstancedMesh per
 * variant group, adds them to a parent, and wires the hover contract. It
 * knows NOTHING about farming, the player, or any specific level layout —
 * no game module imports it (showcase wiring is debug-harness-only this
 * slice).
 *
 * DATA MODEL (convention §3 + slice-A brief):
 *   data = array of { x, y, variant, rotation? } records. Optional
 *   `elevation` is accepted as 0 / undefined ONLY; any nonzero value throws
 *   loudly (no elevation support yet). `x`/`y` are data-grid coordinates
 *   (axis-aligned integers); the tile at (x, y) is placed at world
 *   ((x − y) · 0.5, 0, (x + y) · 0.5) — the DIAGONAL LATTICE (pinned user
 *   revision 2026-08-06). The tile modules' diamond footprint is 1.0 along
 *   world X/Z (N vertex +z, E vertex +x; see grass.js cap order), so adjacent
 *   data cells (diff exactly 1 in one axis) end up 0.7071 apart at 45° and
 *   share FULL edges — solid ground, zero holes, zero overlap (zero overlap
 *   also keeps raycast picking unambiguous). Axis-aligned `(x, 0, y)`
 *   placement is gone: it only made diamonds touch at corner tips and left
 *   star-shaped holes between every four tiles.
 *
 * ROTATION (convention §2, pinned user revision): each record may carry
 *   `rotation` 0 | 90 | 180 | 270 — degrees clockwise when viewed from above
 *   +Y, default 0; anything else (or a non-number) throws at build time,
 *   same style as the elevation guard. Rotation is applied per instance via
 *   the instance matrix; the diamond footprint is 90°-symmetric, so packing
 *   is unchanged — only internal detail and edge orientations turn. Rotation
 *   is NEVER a group key: instances of one variant may mix rotations within
 *   a single InstancedMesh.
 *
 * OUTLINES (convention §3, pinned user revision): the composer can draw
 *   crisp gamey outline lines around tile edges. Map-level option
 *   `outline: { mode, color?, width? }` with mode 'all' | 'none' |
 *   'interior' | 'exterior' — ABSENT outline option = no outline meshes at
 *   all (zero cost). Per-record `outline` overrides the mode (same strings)
 *   or IS an explicit DATA-space side list like ['n', 'e', 's', 'w'].
 *   'interior' = only edges touching another cell in the data; 'exterior' =
 *   only edges with no adjacent cell. Masks are authored in DATA space and
 *   resolved to the tile's LOCAL edges by rotating side names
 *   COUNTER-CLOCKWISE by the record's rotation in 90° steps (data 'e' at
 *   rotation 90 → local 'n'; the tile's diamond: N vertex +z, E vertex +x,
 *   so local 'e' = the N→E edge, and rotating the instance clockwise turns
 *   the local W→N edge to face data-east).
 *   SEAM RESOLUTION — ONE line per seam (convention §3, pinned user
 *   revision 2026-08-06): on touching tiles ONLY ONE tile renders a shared
 *   edge, so seams read as a single line instead of doubled/thick. The
 *   desired DATA mask is computed per record first (PASS 1: 'all' → all 4
 *   sides; 'interior' → sides with a neighbor cell; 'exterior' → sides
 *   without one; explicit side lists are deduped so ['n','n'] == ['n'];
 *   'none' → no sides), then an ownership pass (PASS 2) resolves every
 *   desired side that HAS a neighbor: the OWNER renders the seam — owner =
 *   the tile whose outline color MATCHES ITS OWN BIOME when exactly one side
 *   of the seam is biome-colored (a record is biome-matched when its
 *   resolved color EXACTLY equals the variant's manifest palette color;
 *   edges use their fromBiome owner color), otherwise the tile with
 *   lexicographically smaller data coords (x, then y) — and the non-owner
 *   drops the side IF the owner also desires it; if the owner does NOT
 *   desire it, the non-owner's desire stands. Border sides (no neighbor)
 *   are unaffected by ownership — they render iff desired. The
 *   RENDERED mask feeds the existing local-edge resolution + rotation
 *   unchanged. Every record yields EXACTLY ONE outline instance: a record
 *   whose rendered mask is empty (e.g. the (8,8) corner under interior
 *   ownership) lands in the '' mask group with a zero-triangle frame — an
 *   invisible placeholder that keeps the "one outline instance per record"
 *   invariant, so hover-sync and instance counts stay deterministic.
 *   The frame is ONE InstancedMesh per resolved local mask: thin ribbon
 *   quads — one along each masked diamond top edge just above the cap (topY
 *   + ~0.002, no z-fight), width `outline.width` default ~0.03, CENTERED on
 *   the edge line (the seam ribbon is the only ribbon for that edge — the
 *   ownership pass guarantees no coplanar pairs) — plus the two vertical
 *   corner-line quads per masked edge (full prism height, offset outward
 *   ~0.004 radially; verticals shared by two adjacent masked edges are
 *   deduped). Frame
 *   heights are derived from the FAMILY's constants (mesh.userData.
 *   outlineTop/outlineBase — the geometry bounding box would be inflated by
 *   merged decorations like the grass bush), with a bounding-box fallback
 *   for families that expose neither.
 *   COLOR (per-instance): the material is WHITE; each instance's
 *   instanceColor = resolved color × the hover dim factor (0.88 neutral,
 *   initialized for EVERY outline instance at build; × 1.0 on hover, synced
 *   with the tile's own hover brightness). Resolution order: record
 *   `outlineColor` (hex) > the variant's manifest outlineColor (the biome
 *   default palette — edges use their fromBiome owner color) > map-level
 *   `outline.color` > global default. The resolution runs ONCE per record in
 *   PASS 1 and its result is SHARED by the seam-ownership pass and the
 *   instanceColor build — no re-resolution, no drift. Outline meshes are
 *   NEVER raycast (hover picks tiles only; their raycast is stubbed to a
 *   no-op).
 *   The composer exposes read-only `outlineGroups: [{ mask, count, records,
 *   mesh }]`; dispose() removes the outline meshes from the parent and
 *   disposes the cached frame geometries + the shared material.
 *
 * GROUPING (convention §3, pinned): groups are keyed by VARIANT STRING only
 * (never by biome/module) — biome routing breaks when placeholder variants
 * move between family modules, string routing is the convention's guarantee.
 * One InstancedMesh per group, count = tiles in that group. Geometry +
 * material are read OFF the factory mesh (single merged geometry + single
 * material per variant, per the InstancedMesh-safety convention) and are
 * SHARED — this module never disposes them (they are owned by the family
 * modules, e.g. grass.js dispose()).
 *
 * INSTANCE COLOR (design-critic Major): every instance's instanceColor is
 * initialized to (0.88, 0.88, 0.88) at build, so hover highlighting is a
 * neutral brightness bump to (1,1,1) — no black flashes from uninitialized
 * colors.
 *
 * HOVER CONTRACT (design-critic Major, locked): raycast happens ONLY on
 * pointermove events (last pointer is stored; there is no per-frame
 * raycast — the composer has no render-loop involvement at all). On hover:
 * setColorAt(instanceId, 1,1,1) + instanceColor.needsUpdate = true; the
 * previously hovered instance is restored to (0.88) on move-off. Hover
 * CLEARS on document pointerout AND window blur (not just the next
 * pointermove). `onHover(tileRecord | null)` fires on every hover CHANGE,
 * where tileRecord = { x, y, variant, rotation, instanceId, group }.
 *
 * PERFORMANCE: zero per-frame allocations — no tick/update method, no loop
 * hookup; the only per-event allocations are in the pointermove handler
 * (event-driven, acceptable) and the onHover record object.
 */

import * as THREE from 'three'

/** Neutral per-instance color set for EVERY instance at build (brightness
 *  bump to 1,1,1 on hover). */
const NEUTRAL_COLOR = new THREE.Color(0.88, 0.88, 0.88)
/** Hover highlight color. */
const HOVER_COLOR = new THREE.Color(1, 1, 1)

// ─── Outline constants (convention §3, pinned) ───
/** Outline modes. */
const OUTLINE_MODES = ['all', 'none', 'interior', 'exterior']
/** Data-side names in clockwise order (n→e→s→w→n); used for the
 *  counter-clockwise data→local mask resolution. */
const SIDE_DIRS = ['n', 'e', 's', 'w']
/** Data-space offset of each side. */
const SIDE_OFFSET = { n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] }
/** The side of the seam's OTHER tile (opposite side name). */
const OPPOSITE_SIDE = { n: 's', e: 'w', s: 'n', w: 'e' }
/** Neutral dim factor for every outline instanceColor at build; hover bumps
 *  it to 1.0 (in sync with the tile's own 0.88/1.0 hover brightness). */
const OUTLINE_DIM = 0.88
const OUTLINE_HOVER = 1.0
/** Default outline ribbon width (centered on the edge line). */
const DEFAULT_OUTLINE_WIDTH = 0.03
/** How far above the cap top the ribbon quad floats (z-fight avoidance). */
const OUTLINE_LIFT = 0.002
/** How far the vertical corner quads sit outside the diamond corner line. */
const OUTLINE_RADIAL_OFFSET = 0.004
/** Global fallback outline color (biomes outside the manifest palette, no
 *  map-level color): a neutral dark that reads as a gamey ink line. */
const DEFAULT_OUTLINE_COLOR = 0x222222
/** Local diamond edges per side ('n' = W→N, 'e' = N→E, 's' = E→S, 'w' =
 *  S→W — matches the family's cap vertex order N +z, E +x). */
const SIDE_EDGE = { n: ['w', 'n'], e: ['n', 'e'], s: ['e', 's'], w: ['s', 'w'] }
/** Outward radial direction of each diamond corner (for the vertical
 *  quads' offset). */
const CORNER_RADIAL = { n: [0, 0, 1], e: [1, 0, 0], s: [0, 0, -1], w: [-1, 0, 0] }

/** Valid hex color check for the outline options (numbers or '#rgb' /
 *  '#rrggbb' strings — THREE.Color swallows garbage silently, so we reject
 *  it here with a clear error). */
function isValidColor(v) {
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
}

/**
 * Builds the shared frame geometry for one resolved LOCAL mask: a top-edge
 * ribbon quad per masked side (just above the cap) + one vertical quad per
 * diamond corner touched by any masked side (deduped), spanning the full
 * prism height. Family-agnostic — every tile shares the same ±0.5 diamond,
 * so a frame built from the derived topY/baseY works for any variant.
 */
function buildOutlineFrameGeometry(sides, topY, baseY, width) {
  const halfW = width / 2
  const corners = {
    n: [0, topY, 0.5],
    e: [0.5, topY, 0],
    s: [0, topY, -0.5],
    w: [-0.5, topY, 0],
  }
  const positions = []
  const pushTri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }
  // Ribbon winding: (inA, outA, outB, inB) with n̂ = edge outward normal —
  // the two triangles get a +y normal (the ribbon faces straight up, like
  // the cap it sits on). Vertical winding: (cTop1, cTop2, cBot2, cBot1) —
  // outward-facing (toward the neighbor tile).
  const pushQuad = (a, b, c, d) => {
    pushTri(a, b, c)
    pushTri(a, c, d)
  }

  const verticalsDone = new Set()
  for (const side of sides) {
    const [sA, sB] = SIDE_EDGE[side]
    const A = corners[sA]
    const B = corners[sB]
    // Outward in-plane normal of this edge (unit), from the edge midpoint.
    const mx = A[0] + B[0]
    const mz = A[2] + B[2]
    const ml = Math.hypot(mx, mz)
    const nx = mx / ml
    const nz = mz / ml
    // Top ribbon: quad centered on the edge line, just above the cap.
    const ribbonY = topY + OUTLINE_LIFT
    pushQuad(
      [A[0] - nx * halfW, ribbonY, A[2] - nz * halfW],
      [A[0] + nx * halfW, ribbonY, A[2] + nz * halfW],
      [B[0] + nx * halfW, ribbonY, B[2] + nz * halfW],
      [B[0] - nx * halfW, ribbonY, B[2] - nz * halfW],
    )
    // Vertical corner-line quads at both endpoints (deduped per corner).
    const el = Math.hypot(B[0] - A[0], B[2] - A[2])
    const ex = (B[0] - A[0]) / el
    const ez = (B[2] - A[2]) / el
    for (const corner of [sA, sB]) {
      if (verticalsDone.has(corner)) continue
      verticalsDone.add(corner)
      const C = corners[corner]
      const rx = CORNER_RADIAL[corner][0]
      const rz = CORNER_RADIAL[corner][2]
      const cTop1 = [C[0] + rx * OUTLINE_RADIAL_OFFSET + ex * halfW, topY, C[2] + rz * OUTLINE_RADIAL_OFFSET + ez * halfW]
      const cTop2 = [C[0] + rx * OUTLINE_RADIAL_OFFSET - ex * halfW, topY, C[2] + rz * OUTLINE_RADIAL_OFFSET - ez * halfW]
      pushQuad(cTop1, cTop2, [cTop2[0], baseY, cTop2[2]], [cTop1[0], baseY, cTop1[2]])
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals() // non-indexed → per-face (flat) normals
  return geometry
}

export class TileMapComposer {
  /**
   * @param {object} opts
   * @param {THREE.Object3D} opts.parent - object the InstancedMeshes are added
   *   to (scene or group). Meshes are removed from it in dispose().
   * @param {Array<{x: number, y: number, variant: string, rotation?: number, elevation?: number}>}
   *   opts.data - tile records. rotation must be 0/90/180/270 (default 0);
   *   elevation must be 0/undefined (throws otherwise).
   * @param {(variant: string) => () => THREE.Mesh} opts.resolveFactory - maps a
   *   variant STRING to a factory returning a THREE.Mesh; the composer reads
   *   geometry + material off that mesh for the group's InstancedMesh.
   * @param {THREE.Camera} opts.raycastTarget - the camera hover rays are cast
   *   through (the raycast origin for pointermove hover picking).
   * @param {{mode: string, color?: number|string, width?: number}} [opts.outline] -
   *   map-level outline config (convention §3): mode 'all' | 'none' |
   *   'interior' | 'exterior' (interior = edges touching another cell,
   *   exterior = edges with no adjacent cell). ABSENT → no outline meshes.
   *   Per-record `outline` (mode string or data-space side list) and
   *   `outlineColor` override this per tile.
   * @param {(record: {x: number, y: number, variant: string, rotation: number,
   *   instanceId: number, group: object} | null) => void} [opts.onHover] -
   *   called on every hover change; null means the pointer moved off / left /
   *   window lost focus.
   */
  constructor({ parent, data, resolveFactory, raycastTarget, outline, onHover }) {
    if (!parent || typeof parent.add !== 'function') {
      throw new Error('TileMapComposer: `parent` must be a THREE.Object3D (scene or group)')
    }
    if (!Array.isArray(data)) {
      throw new Error('TileMapComposer: `data` must be an array of { x, y, variant } records')
    }
    if (typeof resolveFactory !== 'function') {
      throw new Error('TileMapComposer: `resolveFactory` must be a function (variant) => factory')
    }
    if (!raycastTarget || typeof raycastTarget.updateMatrixWorld !== 'function') {
      throw new Error('TileMapComposer: `raycastTarget` must be a THREE.Camera (hover raycast origin)')
    }
    if (outline !== undefined) {
      if (typeof outline !== 'object' || outline === null || Array.isArray(outline)) {
        throw new Error('TileMapComposer: `outline` must be an object { mode, color?, width? }')
      }
      if (outline.mode !== undefined && !OUTLINE_MODES.includes(outline.mode)) {
        throw new Error(
          `TileMapComposer: outline mode must be 'all' | 'none' | 'interior' | 'exterior', got ${JSON.stringify(outline.mode)}`,
        )
      }
      if (outline.color !== undefined && !isValidColor(outline.color)) {
        throw new Error(`TileMapComposer: outline color must be a hex number or '#rgb'/'#rrggbb' string, got ${JSON.stringify(outline.color)}`)
      }
      if (outline.width !== undefined && (!Number.isFinite(outline.width) || outline.width <= 0)) {
        throw new Error(`TileMapComposer: outline width must be a positive number, got ${JSON.stringify(outline.width)}`)
      }
    }

    this.parent = parent
    this.raycastTarget = raycastTarget
    this.onHover = onHover || null
    /** @type {Array<{variant: string, count: number, records: object[], mesh: THREE.InstancedMesh}>}
     *  Read-only group descriptors, one per variant string (instanceId == index
     *  into `records`, in build order). */
    this.groups = []
    /** @type {Array<{mask: string, count: number, records: object[], mesh: THREE.InstancedMesh}>}
     *  Read-only outline group descriptors, one per RESOLVED LOCAL mask (mask
     *  = comma-joined local side names in n/e/s/w order). Empty when the
     *  outline option is absent. */
    this.outlineGroups = []

    /** @type {{x: number, y: number} | null} last pointer NDC — stored so the
     *  hover contract never needs a per-frame raycast. */
    this._lastPointer = null
    /** @type {{group: object, instanceId: number, record: object} | null} */
    this._hovered = null

    this._meshes = []
    this._groupByMesh = new Map()
    this._raycaster = new THREE.Raycaster()
    this._ndc = new THREE.Vector2()

    // Outline state (only touched when the outline option is present).
    this._outlineMeshes = []
    this._outlineGeomCache = new Map()
    this._outlineMaterial = null
    /** record object → { mesh, instanceId, color } for hover sync. */
    this._outlineByRecord = new Map()
    /** variant → { color, topY, baseY } outline metadata (from userData). */
    this._variantOutlineMeta = new Map()

    this._build(data, resolveFactory, outline)
    this._bindHoverEvents()
  }

  // ─── Build ────────────────────────────────────────────────────────────

  _build(data, resolveFactory, outlineOpts) {
    // Group by variant STRING (convention §3). Every record is validated up
    // front so a bad map can never produce half-built groups.
    const byVariant = new Map()
    for (const rec of data) {
      this._validateRecord(rec)
      let list = byVariant.get(rec.variant)
      if (!list) {
        list = []
        byVariant.set(rec.variant, list)
      }
      list.push(rec)
    }

    // Reused matrix composer (build-time only, never in a render path).
    const dummy = new THREE.Object3D()
    try {
      for (const [variant, records] of byVariant) {
        const factory = resolveFactory(variant)
        if (typeof factory !== 'function') {
          throw new Error(`TileMapComposer: resolveFactory("${variant}") must return a factory function`)
        }
        let source
        try {
          source = factory()
        } catch (e) {
          throw new Error(`TileMapComposer: factory for variant "${variant}" failed: ${e instanceof Error ? e.message : String(e)}`)
        }
        if (!source || !source.geometry || !source.material) {
          throw new Error(`TileMapComposer: factory for variant "${variant}" must return a THREE.Mesh with geometry + material`)
        }

        const mesh = new THREE.InstancedMesh(source.geometry, source.material, records.length)
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        mesh.castShadow = source.castShadow === true
        mesh.receiveShadow = source.receiveShadow === true

        // Outline metadata for this variant (convention §3): the family's
        // prism-height constants (never the geometry bounding box — merged
        // decorations would inflate it) and the manifest's biome-default
        // outline color (edges use their fromBiome owner color). Families
        // that expose neither fall back to the geometry bounding box.
        let outlineTop = source.userData && source.userData.outlineTop
        let outlineBase = source.userData && source.userData.outlineBase
        if (!Number.isFinite(outlineTop) || !Number.isFinite(outlineBase)) {
          source.geometry.computeBoundingBox()
          const bb = source.geometry.boundingBox
          outlineTop = bb ? bb.max.y : 0.45
          outlineBase = bb ? bb.min.y : 0
        }
        this._variantOutlineMeta.set(variant, {
          color: source.userData && source.userData.outlineColor,
          topY: outlineTop,
          baseY: outlineBase,
        })

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          // Tile at (x, y) → world ((x−y)·0.5, 0, (x+y)·0.5): the diagonal
          // lattice that makes diamonds share full edges (convention §1,
          // pinned user revision — no holes, no overlap).
          dummy.position.set((r.x - r.y) * 0.5, 0, (r.x + r.y) * 0.5)
          // Per-instance rotation (convention §2, pinned): 0/90/180/270
          // clockwise from above +Y. Rotation is per-instance only — it is
          // NEVER a group key, so a group may mix rotations freely.
          dummy.rotation.y = THREE.MathUtils.degToRad(r.rotation || 0)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          // instanceColor for EVERY instance at build: neutral (0.88) so hover
          // is a brightness bump, never a black flash.
          mesh.setColorAt(i, NEUTRAL_COLOR)
        }
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor.needsUpdate = true

        this.parent.add(mesh)
        const group = { variant, count: records.length, records, mesh }
        this.groups.push(group)
        this._meshes.push(mesh)
        this._groupByMesh.set(mesh, group)
      }

      // Outline pass (convention §3): built AFTER every tile group, so a
      // group-level failure can never leave outline meshes behind.
      if (outlineOpts !== undefined) {
        this._buildOutlines(data, outlineOpts, dummy)
      }
    } catch (e) {
      // Mid-build failure (e.g. a factory threw AFTER earlier groups were
      // created and added): never leave half-built state behind — remove
      // every tile AND outline mesh we already added and dispose the outline
      // geometry/material, then let the error propagate. Shared tile
      // geometry/material are NOT disposed (owned by the family modules).
      for (const mesh of this._meshes) this.parent.remove(mesh)
      this.groups = []
      this._meshes = []
      this._groupByMesh.clear()
      this._teardownOutlineMeshes()
      throw e
    }
  }

  /** Removes every outline mesh from the parent and disposes the frame
   *  geometries + the shared material (used by mid-build cleanup AND
   *  dispose()). */
  _teardownOutlineMeshes() {
    for (const im of this._outlineMeshes) this.parent.remove(im)
    this._outlineMeshes = []
    this.outlineGroups = []
    this._outlineByRecord.clear()
    this._variantOutlineMeta.clear()
    for (const geom of this._outlineGeomCache.values()) geom.dispose()
    this._outlineGeomCache.clear()
    if (this._outlineMaterial) {
      this._outlineMaterial.dispose()
      this._outlineMaterial = null
    }
  }

  /** Builds the outline InstancedMeshes (convention §3): one per resolved
   *  LOCAL mask. PASS 1 computes the desired data masks + each record's
   *  resolved outline color and biome-match flag (cached per record); PASS 2
   *  resolves seam ownership (biome-matched tile wins when exactly one side
   *  is biome-colored, data-order otherwise); rendered masks then rotate to
   *  local space. Every record's outline/outlineColor was already validated
   *  in _validateRecord, so this pass cannot fail on data — only on
   *  unexpected errors, which the _build catch cleans up. */
  _buildOutlines(data, outlineOpts, dummy) {
    const width = outlineOpts.width !== undefined ? outlineOpts.width : DEFAULT_OUTLINE_WIDTH
    const mode = outlineOpts.mode

    // Data adjacency (interior/exterior modes are computed from the DATA
    // grid — any cell counts as a neighbor, regardless of variant).
    const byCoord = new Map()
    for (const rec of data) byCoord.set(`${rec.x},${rec.y}`, rec)
    const hasCell = (x, y) => byCoord.has(`${x},${y}`)

    // ── PASS 1 — DESIRED DATA-space mask per record (convention §3,
    // pinned user revision 2026-08-06): 'all' → all four sides; 'interior'
    // → sides with a neighbor cell; 'exterior' → sides without one;
    // explicit side lists are deduped (['n','n'] == ['n']); 'none' → no
    // sides. Record-level outline overrides the map-level mode.
    // PASS 1 ALSO resolves each record's outline color ONCE (record >
    // manifest biome palette > map-level > global) and its BIOME-MATCH flag
    // (resolved color EXACTLY equals the variant's manifest palette color;
    // edges use their fromBiome owner color). The result is cached per
    // record and SHARED by the seam-ownership pass (PASS 2) and the
    // instanceColor build — the same color always decides ownership and
    // rendering, so no drift is possible.
    const desired = new Map()
    const colorInfo = new Map()
    const paletteHexCache = new Map()
    const paletteHexOf = (variant) => {
      if (paletteHexCache.has(variant)) return paletteHexCache.get(variant)
      const meta = this._variantOutlineMeta.get(variant)
      const hex = meta && meta.color !== undefined ? new THREE.Color(meta.color).getHex() : null
      paletteHexCache.set(variant, hex)
      return hex
    }
    for (const rec of data) {
      const o = rec.outline
      let sides
      if (Array.isArray(o)) {
        sides = [...new Set(o)]
      } else {
        const m = typeof o === 'string' ? o : mode
        switch (m) {
          case 'all': sides = SIDE_DIRS.slice(); break
          case 'none': sides = []; break
          case 'interior': sides = SIDE_DIRS.filter(s => hasCell(rec.x + SIDE_OFFSET[s][0], rec.y + SIDE_OFFSET[s][1])); break
          case 'exterior': sides = SIDE_DIRS.filter(s => !hasCell(rec.x + SIDE_OFFSET[s][0], rec.y + SIDE_OFFSET[s][1])); break
          default: sides = [] // unreachable — mode was validated
        }
      }
      desired.set(rec, sides)
      const resolved = this._resolveOutlineColor(rec, outlineOpts)
      const paletteHex = paletteHexOf(rec.variant)
      colorInfo.set(rec, {
        color: resolved,
        matched: paletteHex !== null && resolved.getHex() === paletteHex,
      })
    }

    // ── PASS 2 — OWNERSHIP resolution (ONE line per seam): for every
    // desired side that HAS a neighbor, the owner renders the seam — owner =
    // the tile whose outline color MATCHES ITS OWN BIOME when exactly one
    // side of the seam is biome-colored, otherwise the tile with
    // lexicographically smaller data coords (x, then y) — and the non-owner
    // drops the side IF the owner also desires it; if the owner does NOT
    // desire it, the non-owner's desire stands. Border sides (no neighbor)
    // are unaffected by ownership — they render iff desired.
    const rendered = new Map()
    for (const rec of data) {
      const out = []
      for (const s of desired.get(rec)) {
        const nx = rec.x + SIDE_OFFSET[s][0]
        const ny = rec.y + SIDE_OFFSET[s][1]
        if (!hasCell(nx, ny)) {
          out.push(s) // border side — no seam, no ownership
          continue
        }
        const neighbor = byCoord.get(`${nx},${ny}`)
        const meMatched = colorInfo.get(rec).matched
        const nbMatched = colorInfo.get(neighbor).matched
        const meOwns = meMatched !== nbMatched
          ? meMatched
          : rec.x < nx || (rec.x === nx && rec.y < ny)
        if (meOwns) {
          out.push(s) // I'm the owner — the seam renders on my side
          continue
        }
        if (!desired.get(neighbor).includes(OPPOSITE_SIDE[s])) {
          out.push(s) // owner does NOT want this seam — my desire stands
        }
      }
      rendered.set(rec, out)
    }

    // RENDERED DATA mask per record → resolved LOCAL mask (side names
    // rotated counter-clockwise by the record's rotation in 90° steps: data
    // 'e' at rotation 90 → local 'n'). Masks are canonicalized in n/e/s/w
    // order so the same mask always shares one InstancedMesh. An EMPTY
    // rendered mask still emits one instance (zero-triangle frame geometry)
    // — every record owns exactly one outline instance, so counts and
    // hover-sync stay deterministic.
    const maskGroups = new Map()
    for (const rec of data) {
      const steps = (rec.rotation || 0) / 90
      const localSides = rendered.get(rec)
        .map(s => SIDE_DIRS[(SIDE_DIRS.indexOf(s) - steps + 4) % 4])
        .sort((a, b) => SIDE_DIRS.indexOf(a) - SIDE_DIRS.indexOf(b))
      const key = localSides.join(',')
      let list = maskGroups.get(key)
      if (!list) {
        list = []
        maskGroups.set(key, list)
      }
      list.push(rec)
    }

    for (const [key, records] of maskGroups) {
      // Frame dimensions from the variants present in this mask (max top /
      // min base over the mask's variants).
      let topY = -Infinity
      let baseY = Infinity
      for (const rec of records) {
        const meta = this._variantOutlineMeta.get(rec.variant)
        if (meta.topY > topY) topY = meta.topY
        if (meta.baseY < baseY) baseY = meta.baseY
      }
      if (baseY === Infinity) baseY = 0

      let geom = this._outlineGeomCache.get(key)
      if (!geom) {
        // '' mask → zero-triangle frame (split('') would yield ['']).
        const sides = key === '' ? [] : key.split(',')
        geom = buildOutlineFrameGeometry(sides, topY, baseY, width)
        this._outlineGeomCache.set(key, geom)
      }
      if (!this._outlineMaterial) {
        // ONE white material per composer — all outline color lives in
        // instanceColor (resolved color × dim factor).
        this._outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
      }
      const mesh = new THREE.InstancedMesh(geom, this._outlineMaterial, records.length)
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      // Outline meshes are NEVER hover-picked — the composer only raycasts
      // its tile meshes, and this stub guarantees no other raycaster can hit
      // them either.
      mesh.raycast = () => {}

      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        // The frame is authored in LOCAL space; the instance matrix bakes in
        // the same lattice position + rotation as the tile itself, so the
        // outline tracks the tile exactly.
        dummy.position.set((r.x - r.y) * 0.5, 0, (r.x + r.y) * 0.5)
        dummy.rotation.y = THREE.MathUtils.degToRad(r.rotation || 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        // The color was already resolved + cached in PASS 1 — reuse it
        // (the ownership pass and the rendered color can never disagree).
        const resolved = colorInfo.get(r).color
        mesh.setColorAt(i, resolved.clone().multiplyScalar(OUTLINE_DIM))
        this._outlineByRecord.set(r, { mesh, instanceId: i, color: resolved })
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true

      this.parent.add(mesh)
      this.outlineGroups.push({ mask: key, count: records.length, records, mesh })
      this._outlineMeshes.push(mesh)
    }
  }

  /** Resolves a record's outline color per the pinned order. */
  _resolveOutlineColor(rec, outlineOpts) {
    if (rec.outlineColor !== undefined) return new THREE.Color(rec.outlineColor)
    const meta = this._variantOutlineMeta.get(rec.variant)
    if (meta && meta.color !== undefined) return new THREE.Color(meta.color)
    if (outlineOpts.color !== undefined) return new THREE.Color(outlineOpts.color)
    return new THREE.Color(DEFAULT_OUTLINE_COLOR)
  }

  _validateRecord(rec) {
    if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) {
      throw new Error(`TileMapComposer: every data record must be an object { x, y, variant, rotation?, elevation? }`)
    }
    if (!Number.isFinite(rec.x) || !Number.isFinite(rec.y)) {
      throw new Error(`TileMapComposer: tile has non-finite x/y (${rec.x}, ${rec.y})`)
    }
    if (typeof rec.variant !== 'string' || rec.variant.length === 0) {
      throw new Error(`TileMapComposer: tile at (${rec.x}, ${rec.y}) must have a non-empty variant string`)
    }
    const elevation = rec.elevation
    if (elevation !== undefined && elevation !== 0) {
      throw new Error(
        `TileMapComposer: elevation is not supported yet — tile (${rec.x}, ${rec.y}) has elevation=${elevation}; only 0 or omitted is allowed`,
      )
    }
    const rotation = rec.rotation
    if (rotation !== undefined && rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      throw new Error(
        `TileMapComposer: rotation must be 0, 90, 180 or 270 — tile (${rec.x}, ${rec.y}) has rotation=${String(rotation)}; only 0 | 90 | 180 | 270 are allowed`,
      )
    }
    const outline = rec.outline
    if (outline !== undefined) {
      if (typeof outline === 'string') {
        if (!OUTLINE_MODES.includes(outline)) {
          throw new Error(
            `TileMapComposer: record outline must be a mode ('all' | 'none' | 'interior' | 'exterior') or a data-space side list — tile (${rec.x}, ${rec.y}) has outline=${JSON.stringify(outline)}`,
          )
        }
      } else if (Array.isArray(outline)) {
        if (outline.length === 0 || !outline.every(s => SIDE_DIRS.includes(s))) {
          throw new Error(
            `TileMapComposer: record outline side list must contain only 'n' | 'e' | 's' | 'w' — tile (${rec.x}, ${rec.y}) has outline=${JSON.stringify(outline)}`,
          )
        }
      } else {
        throw new Error(
          `TileMapComposer: record outline must be a mode string or a side list — tile (${rec.x}, ${rec.y}) has outline=${JSON.stringify(outline)}`,
        )
      }
    }
    if (rec.outlineColor !== undefined && !isValidColor(rec.outlineColor)) {
      throw new Error(
        `TileMapComposer: record outlineColor must be a hex number or '#rgb'/'#rrggbb' string — tile (${rec.x}, ${rec.y}) has outlineColor=${JSON.stringify(rec.outlineColor)}`,
      )
    }
  }

  // ─── Hover contract (design-critic Major) ─────────────────────────────

  _bindHoverEvents() {
    this._onPointerMove = (e) => this._handlePointerMove(e)
    this._onPointerOut = () => this._setHover(null)
    this._onBlur = () => this._setHover(null)
    // Document-level: pointermove raycasts while the pointer is anywhere over
    // the page; document pointerout fires when the pointer leaves the
    // document; window blur clears on focus loss. No per-frame raycast — the
    // composer never touches a render loop.
    document.addEventListener('pointermove', this._onPointerMove)
    document.addEventListener('pointerout', this._onPointerOut)
    window.addEventListener('blur', this._onBlur)
  }

  _handlePointerMove(e) {
    this._lastPointer = {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
    }
    this._ndc.set(this._lastPointer.x, this._lastPointer.y)
    this._raycaster.setFromCamera(this._ndc, this.raycastTarget)
    const hits = this._raycaster.intersectObjects(this._meshes, false)
    const hit = hits[0]
    if (hit && hit.instanceId !== undefined && hit.instanceId < hit.object.count) {
      const group = this._groupByMesh.get(hit.object)
      this._setHover(group, hit.instanceId, group.records[hit.instanceId])
    } else {
      this._setHover(null)
    }
  }

  /** Sets/clears the hovered instance; restores the previous instance's color
   *  to neutral on move-off. The record's outline instance (if any) follows
   *  the tile's brightness in sync (convention §3). Notifies onHover only
   *  when the hover CHANGES. */
  _setHover(group, instanceId, record) {
    if (this._hovered) {
      if (group && this._hovered.group === group && this._hovered.instanceId === instanceId) {
        return // pointer moved within the same tile — nothing changes
      }
      this._restoreHoveredColor()
    } else if (!group) {
      return // nothing was hovered, nothing to clear
    }
    this._hovered = group
      ? { group, instanceId, record }
      : null
    if (group) {
      group.mesh.setColorAt(instanceId, HOVER_COLOR)
      group.mesh.instanceColor.needsUpdate = true
      const outline = this._outlineByRecord.get(record)
      if (outline) this._setOutlineFactor(outline, OUTLINE_HOVER)
    }
    if (this.onHover) {
      this.onHover(
        this._hovered
          ? {
              x: record.x,
              y: record.y,
              variant: record.variant,
              rotation: record.rotation || 0,
              instanceId,
              group,
            }
          : null,
      )
    }
  }

  _restoreHoveredColor() {
    if (!this._hovered) return
    this._hovered.group.mesh.setColorAt(this._hovered.instanceId, NEUTRAL_COLOR)
    this._hovered.group.mesh.instanceColor.needsUpdate = true
    const outline = this._outlineByRecord.get(this._hovered.record)
    if (outline) this._setOutlineFactor(outline, OUTLINE_DIM)
  }

  /** Writes an outline instance's instanceColor = resolved color × factor
   *  (event-driven only, never in a render path). */
  _setOutlineFactor(outline, factor) {
    const color = outline.color.clone().multiplyScalar(factor)
    outline.mesh.setColorAt(outline.instanceId, color)
    outline.mesh.instanceColor.needsUpdate = true
  }

  // ─── Teardown ─────────────────────────────────────────────────────────

  /**
   * Removes every InstancedMesh (tile groups AND outline frames) from the
   * parent, disposes the outline frame geometries + shared outline material,
   * and unbinds the hover listeners. Shared tile geometry/materials/textures
   * are NOT disposed — they are owned by the tile family modules (see
   * grass.js dispose()).
   */
  dispose() {
    this._setHover(null)
    for (const group of this.groups) this.parent.remove(group.mesh)
    this.groups = []
    this._meshes = []
    this._groupByMesh.clear()
    this._teardownOutlineMeshes()
    this._lastPointer = null
    document.removeEventListener('pointermove', this._onPointerMove)
    document.removeEventListener('pointerout', this._onPointerOut)
    window.removeEventListener('blur', this._onBlur)
    this.raycastTarget = null
    this.onHover = null
  }
}
