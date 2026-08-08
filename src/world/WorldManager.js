/**
 * WorldManager — the tile-world demo world (Slice C).
 *
 * Owns the whole demo world: chunk streaming (one TileMapComposer per chunk),
 * the movable player cube (WASD via InputManager + click-to-move), camera
 * follow, FOV fog dims, and the day/night lighting rig. It is PROD code
 * (imported by src/main.ts); the debug harness reaches it through the
 * devGraph handle.
 *
 * CHUNK STREAMING: chunks generate on approach (load radius) and dispose
 * beyond the same radius (fix round 1: keepRadius == loadRadius — no
 * hysteresis — so the night FOV genuinely unloads the day ring and the world
 * grows again at dawn; no churn as long as the player stays in one chunk).
 * At most 2 chunk loads per frame (1 when the last chunk took > 4ms — adaptive
 * budget); the per-chunk generation time is measured and exposed
 * (lastChunkGenMs).
 *
 * FLOATING ISLANDS (fix round 1): the generator returns EMPTY chunks for void
 * areas. Empty chunks are registered as stubs (tiles: [], composer: null) so
 * the load queue skips them without rebuilding every frame, but they produce
 * ZERO meshes — the sky background shows through between the islands.
 * loadedChunkCount counts only chunks that actually have tiles; the chunk
 * registry (this.chunks) also holds the empty stubs.
 *
 * FOV DIMMING: per tile, factor = 1 − smoothstep(distance, fovRadius,
 * loadRadius) clamped to [fogFloor, 1] — tiles fade smoothly across the band
 * near the visible radius, fully faded at the load radius. Applied through
 * composer.setInstanceDims (tiles AND outlines) and per-instance prop
 * colors. Recomputed only when the player's tile changes or chunks
 * load/unload — never per frame.
 *
 * HOVER: exactly ONE shared document pointermove listener (plus one click
 * listener for click-to-move). Every loaded chunk is raycast through its
 * composer's pure raycastFromPointer — with a cheap per-chunk bounding-sphere
 * early-out first (fix round 1: the sphere test against one shared ray skips
 * chunks that cannot contain a hit before any mesh raycast). Empty chunks are
 * skipped entirely (no composer). The nearest hit is applied to its owning
 * chunk, every other chunk is cleared. Clicks inside the debug overlay DOM
 * are ignored.
 *
 * LIGHTING: ambient + key + fill + rim directional rig (day/night lerped by
 * the DayNight module) + a warm point light attached to the player cube
 * (intensity 0 by day, ~1.6 by night — the Don't Starve-style pool). The
 * scene background dims with the same lerp (sky darkens at night).
 *
 * PERFORMANCE: zero per-frame allocations in update() — scratch vectors and
 * colors are reused; the only per-frame work is numbers + lerps. The FOV
 * tween refreshes the streaming queue ONLY when the chunk load radius
 * actually changes (tracked via _lastLoadChunkRadius — never per-frame).
 */

import * as THREE from 'three'
import { TileMapComposer } from './TileMapComposer'
import { resolveFactory } from '../assets/tiles'
import { resolvePropFactory } from '../assets/props'
import * as gen from './worldGenerator'
import { DayNight, DAY_FOV, NIGHT_FOV, DAY_LENGTH } from './DayNight'
import { InputManager } from '../core/InputManager'

/** Fade band width in tiles (dim 1.0 → fogFloor across this band). */
const FADE_BAND = 3
/** Player speed in data tiles per second. */
const PLAYER_SPEED = 3.5
/** In-game minutes per real second. */
const TIME_SCALE = 1
/** Tile top-face height (TILE_SYSTEM_CONVENTION.md §1: top face ~0.34). */
const TILE_TOP_Y = 0.34
/** Player cube center height above the tile top. */
const PLAYER_Y = 0.6
/** Max chunk loads per frame (generation budget; drops to 1 when the last
 *  chunk took > GEN_BUDGET_SLOW_MS — adaptive backstop). */
const MAX_CHUNK_LOADS_PER_FRAME = 2
/** Per-chunk gen time above which the next frame loads only 1 chunk. */
const GEN_BUDGET_SLOW_MS = 4
/** Click-to-move arrival tolerance (tiles). */
const MOVE_ARRIVE_DIST = 0.15
/** Camera follow smoothing rate (1/s). */
const CAMERA_LERP_RATE = 8
/** Minimum dim factor at the load radius (near-black fog tone). */
const FOG_FLOOR = 0.06
/** Night sky background tone (lerped from the scene's day background by the
 *  same day/night factor as the light rig — the fix-round-1 camera pitch puts
 *  the sky in frame, so it must darken with the terrain). */
const NIGHT_BACKGROUND = 0x0a1020
/** Bounding-sphere radius per chunk for the hover/click raycast early-out.
 *  The chunk tile diamond spans ±3.5 world units in x/z around its center
 *  ((cx−cy)·4, (cy+cx)·4 + 3.5); radius 5.2 covers the corners (~4.95) +
 *  tile/prop height. */
const CHUNK_BOUNDS_RADIUS = 5.2

export class WorldManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {{seed?: number, isActive: () => boolean}} opts - isActive returns
   *   the game's `started` flag; the manager skips update + hover raycast
   *   when inactive so harness previews are never polluted.
   */
  constructor(scene, camera, { seed = 1337, isActive }) {
    this.scene = scene
    this.camera = camera
    this.isActive = isActive

    this.seed = seed | 0
    this.timeOfDay = 720 // boot at noon (day)
    this.fovRadius = DAY_FOV
    this._fovOverride = null
    this.loadRadius = this.fovRadius + FADE_BAND
    this.keepRadius = this.loadRadius
    this.fogFloor = FOG_FLOOR

    /** @type {{x: number, y: number}} player data coords (floats). */
    this.player = { x: 0, y: 0 }
    /** @type {{x: number, y: number} | null} click-to-move target (data
     *  coords of the target tile center). */
    this.moveTarget = null
    /** @type {Map<string, object>} chunk registry: "cx,cy" → chunk wrapper. */
    this.chunks = new Map()
    this.loadedChunkCount = 0
    this.lastChunkGenMs = 0
    this._lastChunkGenMsMax = 0
    this._genTimes = []
    /** @type {object | null} last hover record ({x, y, variant, rotation}). */
    this.lastHover = null

    this.input = new InputManager()
    this.dayNight = new DayNight()

    // Player cube (plain BoxGeometry — no model yet).
    this.playerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff8c42 }),
    )
    this.playerMesh.position.set(0, PLAYER_Y, 0)

    // Lighting rig (the world owns it — main.ts has no static rig anymore).
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55)
    this.key = new THREE.DirectionalLight(0xffffff, 0.9)
    this.key.position.set(3, 5, 4)
    this.fill = new THREE.DirectionalLight(0xffffff, 0.35)
    this.fill.position.set(-3, 2, 1)
    this.rim = new THREE.DirectionalLight(0xffffff, 0.3)
    this.rim.position.set(0, 3, -4)
    this.playerLight = new THREE.PointLight(0xffb066, 0, 6, 2)
    this.playerLight.position.set(0, 1.2, 0)
    this.playerMesh.add(this.playerLight)
    this.rig = { ambient: this.ambient, key: this.key, fill: this.fill, rim: this.rim, playerLight: this.playerLight }
    this.scene.add(this.ambient, this.key, this.fill, this.rim, this.playerMesh)

    // Scratch objects (update path: zero allocations).
    this._scratchColor = new THREE.Color(1, 1, 1)
    this._camPos = new THREE.Vector3()
    this._camLook = new THREE.Vector3()
    // Day background + night-lerp scratch (the rig dims the meshes; the
    // background must dim with it — the pitched camera shows the sky).
    this._dayBackground = this.scene.background instanceof THREE.Color
      ? this.scene.background.clone()
      : new THREE.Color(0x87ceeb)
    this._nightBackground = new THREE.Color(NIGHT_BACKGROUND)
    this._bgScratch = new THREE.Color()
    // Camera offset pulled back + up vs. the original (0, 6.5, 9): the
    // floating-island composition (fix round 1) needs the sky to occupy the
    // top of the frame — pitch ~39° puts the horizon above the islands.
    this._camOffset = new THREE.Vector3(0, 9, 14)
    this._projVec = new THREE.Vector3()
    this._snapCamera = true

    // Streaming bookkeeping.
    this._playerChunkX = 0
    this._playerChunkY = 0
    this._lastTileX = 0
    this._lastTileY = 0
    this._loadQueue = []
    /** Last chunk-space load radius that a streaming refresh was issued for.
     *  -1 forces the first refresh. Fix round 1: the day/night FOV tween must
     *  refresh the queue when the load radius crosses a chunk boundary, but
     *  NOT every frame — track the value, refresh only on change. */
    this._lastLoadChunkRadius = -1

    // Shared hover/click raycast scratch (one ray for all chunk early-outs).
    this._raycaster = new THREE.Raycaster()
    this._ndcScratch = new THREE.Vector2()

    // ONE shared pointermove listener + ONE click listener (hover + click-to-
    // move). The per-chunk composers are built with bindOwnHoverEvents: false.
    this._onPointerMove = (e) => this._handlePointerMove(e)
    this._onClick = (e) => this._handleClick(e)
    document.addEventListener('pointermove', this._onPointerMove)
    document.addEventListener('click', this._onClick)

    this._applyDayNight()
    this._refreshStreaming()
    this._snapCamera = true
    this._updateCamera(0)
  }

  // ─── Loop ─────────────────────────────────────────────────────────────

  /**
   * Per-frame update (called by main.ts; dt clamped to 0.05). Skips
   * everything when the game is inactive (harness previews).
   *
   * @param {number} dt seconds
   */
  update(dt) {
    if (!this.isActive()) return
    dt = Math.min(dt, 0.05)
    this.input.update()

    // Clock + day/night lighting (fovRadius tweens with the phase).
    this.timeOfDay = (this.timeOfDay + dt * TIME_SCALE) % DAY_LENGTH
    this._applyDayNight()

    // Movement: WASD (cancels any click-to-move target) or click-to-move.
    const dx = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0)
    const dy = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0)
    if (dx !== 0 || dy !== 0) {
      this.moveTarget = null
      const len = Math.hypot(dx, dy)
      this.player.x += (dx / len) * PLAYER_SPEED * dt
      this.player.y += (dy / len) * PLAYER_SPEED * dt
    } else if (this.moveTarget) {
      const cx = this.moveTarget.x - this.player.x
      const cy = this.moveTarget.y - this.player.y
      const dist = Math.hypot(cx, cy)
      if (dist <= MOVE_ARRIVE_DIST) {
        this.moveTarget = null
      } else {
        const step = Math.min(PLAYER_SPEED * dt, dist)
        this.player.x += (cx / dist) * step
        this.player.y += (cy / dist) * step
      }
    }

    // Player mesh at the lattice point.
    this.playerMesh.position.set(
      (this.player.x - this.player.y) * 0.5,
      PLAYER_Y,
      (this.player.x + this.player.y) * 0.5,
    )

    // Camera follow.
    this._updateCamera(dt)

    // Chunk streaming: on player chunk change, refresh the load queue and
    // dispose out-of-range chunks; then load at most `budget` chunks this
    // frame (adaptive: 1 chunk when the last chunk generation was slow).
    const pcx = Math.floor(this.player.x / gen.CHUNK_SIZE)
    const pcy = Math.floor(this.player.y / gen.CHUNK_SIZE)
    if (pcx !== this._playerChunkX || pcy !== this._playerChunkY) {
      this._playerChunkX = pcx
      this._playerChunkY = pcy
      this._refreshStreaming()
    }
    const budget = this.lastChunkGenMs > GEN_BUDGET_SLOW_MS ? 1 : MAX_CHUNK_LOADS_PER_FRAME
    let loaded = 0
    while (loaded < budget && this._loadQueue.length > 0) {
      const key = this._loadQueue.shift()
      if (!this.chunks.has(key)) {
        this._buildChunk(key)
        loaded++
      }
    }

    // FOV dims: only when the player's TILE changes (or chunks load/unload —
    // new chunks get dims at build).
    const ptileX = Math.floor(this.player.x)
    const ptileY = Math.floor(this.player.y)
    if (ptileX !== this._lastTileX || ptileY !== this._lastTileY) {
      this._lastTileX = ptileX
      this._lastTileY = ptileY
      this._applyFovDims()
    }
  }

  // ─── Day/night ────────────────────────────────────────────────────────

  /** Applies the day/night rig for the current timeOfDay (lights + sky
   *  background — same lerp, zero allocations) and tweens the FOV radius
   *  with the same phase lerp (unless a live override is set). */
  _applyDayNight() {
    const dayFactor = this.dayNight.apply(this.rig, this.timeOfDay)
    const night = 1 - dayFactor
    this._bgScratch.copy(this._dayBackground).lerp(this._nightBackground, night)
    this.scene.background = this._bgScratch
    if (this._fovOverride === null) {
      const fov = NIGHT_FOV + (DAY_FOV - NIGHT_FOV) * dayFactor
      if (Math.abs(fov - this.fovRadius) > 0.001) {
        this.fovRadius = fov
        this._updateRadii()
      }
    }
  }

  /** Recomputes the tile-space radii and — when the CHUNK-space load radius
   *  changed (design-critic Major 3: dawn/dusk FOV tween must refill the
   *  streaming queue when the radius grows) — refreshes streaming AND
   *  reapplies the FOV dims to every retained chunk, so the fog band tracks
   *  the natural day/night tween (corrective round 3: the dims reapply was
   *  missing — only the harness set* paths refreshed dims, the natural
   *  dawn/dusk tween left retained chunks at their old fov's dims). The
   *  ceil-comparison guarantees a refresh only when a chunk-boundary is
   *  crossed, never per frame. */
  _updateRadii() {
    this.loadRadius = this.fovRadius + FADE_BAND
    this.keepRadius = this.loadRadius
    const loadChunkR = this._loadChunkRadius()
    if (loadChunkR !== this._lastLoadChunkRadius) {
      this._lastLoadChunkRadius = loadChunkR
      this._refreshStreaming()
      this._applyFovDims()
    }
  }

  // ─── Camera ───────────────────────────────────────────────────────────

  /** Lerps the camera toward playerWorld + _camOffset (0, 9, 14 — pitched up
   *  for the floating-island composition) looking at playerWorld + (0, 0.2, 3).
   *  SNAPS instantly in fast mode (deterministic for tests). */
  _updateCamera(dt) {
    const px = (this.player.x - this.player.y) * 0.5
    const pz = (this.player.x + this.player.y) * 0.5
    this._camPos.set(px, 0, pz).add(this._camOffset)
    this._camLook.set(px, 0.2, pz + 3)
    if (this._snapCamera) {
      this.camera.position.copy(this._camPos)
      this.camera.lookAt(this._camLook)
      this._snapCamera = false
    } else {
      const k = 1 - Math.exp(-dt * CAMERA_LERP_RATE)
      this.camera.position.lerp(this._camPos, k)
      this.camera.lookAt(this._camLook)
    }
  }

  // ─── Chunk streaming ───────────────────────────────────────────────────

  /** Chunk distance (Chebyshev, in chunks) that must be loaded to cover the
   *  load radius in tiles. Chunk (d, 0) covers tile distances up to 8d, so
   *  ceil(loadRadius / CHUNK_SIZE) is exact (fix round 1: the old +1 loaded
   *  a full extra ring of fully-fogged chunks — 49 vs 25 at day — the source
   *  of the 900-1200 draw-call budget). */
  _loadChunkRadius() {
    return Math.ceil(this.loadRadius / gen.CHUNK_SIZE)
  }

  /** Chunk distance beyond which chunks are disposed. keepRadius ==
   *  loadRadius (fix round 1): a chunk inside the load radius is always kept
   *  while the player stays in the same chunk (a chunk at Chebyshev distance
   *  d from the player's chunk can only get closer or farther as the player
   *  moves, and anything beyond the load ring is disposable). The night FOV
   *  (radius 5 → 9 chunks) genuinely unloads the day ring — the world
   *  shrinks at night and grows again at dawn. */
  _keepChunkRadius() {
    return Math.ceil(this.keepRadius / gen.CHUNK_SIZE)
  }

  /** Rebuilds the load queue for every chunk within the load radius of the
   *  player's chunk and disposes chunks outside the keep radius. Called on
   *  player chunk change, teleport, setSeed, setFovRadius and when the FOV
   *  tween crosses a chunk radius boundary — never per frame. */
  _refreshStreaming() {
    const pcx = this._playerChunkX
    const pcy = this._playerChunkY
    const loadR = this._loadChunkRadius()
    const keepR = this._keepChunkRadius()
    const queue = []
    for (let dy = -loadR; dy <= loadR; dy++) {
      for (let dx = -loadR; dx <= loadR; dx++) {
        const key = `${pcx + dx},${pcy + dy}`
        if (!this.chunks.has(key)) queue.push(key)
      }
    }
    this._loadQueue = queue
    for (const [key, chunk] of this.chunks) {
      const comma = key.indexOf(',')
      const cx = Number(key.slice(0, comma))
      const cy = Number(key.slice(comma + 1))
      if (Math.max(Math.abs(cx - pcx), Math.abs(cy - pcy)) > keepR) {
        this._disposeChunk(chunk)
        this.chunks.delete(key)
      }
    }
    this._recountLoaded()
  }

  /** Rebuilds the loadedChunkCount: only chunks that actually HAVE tiles
   *  count as loaded (void chunks are tracked stubs — fix round 1). */
  _recountLoaded() {
    let n = 0
    for (const chunk of this.chunks.values()) {
      if (chunk.tiles.length > 0) n++
    }
    this.loadedChunkCount = n
  }

  /** Builds one chunk: empty (void) chunks register a stub (no composer, no
   *  group, no meshes — the sky shows through); solid chunks build one
   *  composer (bindOwnHoverEvents: false, interior outlines) + one
   *  InstancedMesh per prop name. Applies FOV dims to the new chunk
   *  immediately. */
  _buildChunk(key) {
    const comma = key.indexOf(',')
    const cx = Number(key.slice(0, comma))
    const cy = Number(key.slice(comma + 1))
    const t0 = performance.now()
    const data = gen.generateChunk(this.seed, cx, cy)
    let group = null
    let composer = null
    let propMeshes = []
    let boundsSphere = null
    if (data.tiles.length > 0) {
      group = new THREE.Group()
      composer = new TileMapComposer({
        parent: group,
        data: data.tiles,
        resolveFactory: (variant) => resolveFactory(variant),
        raycastTarget: this.camera,
        outline: { mode: 'interior' },
        bindOwnHoverEvents: false,
      })
      propMeshes = this._buildPropMeshes(data.props, group)
      this.scene.add(group)
      // Chunk diamond center: tile (x,y) world position is
      // ((x−y)·0.5, ·, (x+y)·0.5); chunk (cx,cy) spans x,y ∈ [cx·8, cx·8+8),
      // so the diamond's true center is ((cx−cy)·4, ·, (cx+cy)·4 + 3.5) —
      // the z offset (+3.5) was missing and left the far-corner tiles (e.g.
      // (7,7) in chunk (0,0), world z = 7) OUTSIDE the radius-5.2 sphere, so
      // hover + click-to-move silently failed on the far corner of every
      // chunk (corrective round 3). With the corrected center every corner
      // is ~sqrt(3.5² + 3.5²) ≈ 4.95 < 5.2 from the center. The sphere is
      // the raycast early-out (fix round 1: cheap distance check before any
      // mesh raycast).
      boundsSphere = new THREE.Sphere(
        new THREE.Vector3((cx - cy) * 4, 0.3, (cx + cy) * 4 + 3.5),
        CHUNK_BOUNDS_RADIUS,
      )
    }
    const chunk = {
      cx,
      cy,
      group,
      composer,
      tiles: data.tiles,
      props: data.props,
      propMeshes,
      boundsSphere,
      applyHover: composer ? (hit) => composer.applyHover(hit) : null,
    }
    this.chunks.set(key, chunk)
    this._recountLoaded()
    const ms = performance.now() - t0
    this.lastChunkGenMs = ms
    this._genTimes.push([performance.now(), ms])
    while (this._genTimes.length > 0 && performance.now() - this._genTimes[0][0] > 1000) this._genTimes.shift()
    this._lastChunkGenMsMax = 0
    for (const [, t] of this._genTimes) if (t > this._lastChunkGenMsMax) this._lastChunkGenMsMax = t
    if (composer) this._applyFovDimsToChunk(chunk)
  }

  /** Builds the chunk's prop InstancedMeshes: one per prop name, instance
   *  matrices = lattice position + tile-top height + jitter + yaw, instance
   *  color = dim factor (initial 1.0; updated with the FOV pass). Prop
   *  meshes are never raycast. Shared geometry/material are NOT disposed
   *  here (owned by the prop modules). */
  _buildPropMeshes(props, parent) {
    const byName = new Map()
    for (const p of props) {
      let list = byName.get(p.name)
      if (!list) {
        list = []
        byName.set(p.name, list)
      }
      list.push(p)
    }
    const meshes = []
    const dummy = new THREE.Object3D()
    for (const [name, list] of byName) {
      const source = resolvePropFactory(name)()
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, list.length)
      mesh.raycast = () => {}
      for (let i = 0; i < list.length; i++) {
        const p = list[i]
        dummy.position.set((p.x - p.y) * 0.5 + p.dx, TILE_TOP_Y, (p.x + p.y) * 0.5 + p.dz)
        dummy.rotation.y = THREE.MathUtils.degToRad(p.rotation)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, this._scratchColor.setScalar(1))
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true
      parent.add(mesh)
      meshes.push({ mesh, props: list })
    }
    return meshes
  }

  _disposeChunk(chunk) {
    // Void chunks have no composer/group — every field is null-guarded.
    if (chunk.composer) chunk.composer.dispose()
    for (const pm of chunk.propMeshes) pm.mesh.dispose()
    if (chunk.group) this.scene.remove(chunk.group)
  }

  // ─── FOV dims ──────────────────────────────────────────────────────────

  /** The dim factor for a tile at distance from the player: 1.0 inside the
   *  visible radius, fading to fogFloor across the band, clamped. (Fix round
   *  2: the smoothstep ARGUMENTS were inverted — the code passed
   *  (fovRadius, loadRadius, dist) to THREE's (x, min, max) signature, so
   *  x=fovRadius <= min=loadRadius always returned 0 and the fog band was a
   *  silent no-op: every tile stayed full-bright.) */
  _fogFactor(x, y) {
    const dx = x - this.player.x
    const dy = y - this.player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const f = 1 - THREE.MathUtils.smoothstep(dist, this.fovRadius, this.loadRadius)
    return Math.max(this.fogFloor, Math.min(1, f))
  }

  /** Recomputes dims for every loaded chunk (tiles + outlines + props). */
  _applyFovDims() {
    for (const chunk of this.chunks.values()) this._applyFovDimsToChunk(chunk)
  }

  _applyFovDimsToChunk(chunk) {
    if (chunk.tiles.length === 0) return // void chunk stub — nothing to dim
    const dims = []
    for (const tile of chunk.tiles) dims.push({ record: tile, factor: this._fogFactor(tile.x, tile.y) })
    chunk.composer.setInstanceDims(dims)
    for (const pm of chunk.propMeshes) {
      for (let i = 0; i < pm.props.length; i++) {
        const p = pm.props[i]
        this._scratchColor.setScalar(this._fogFactor(p.x, p.y))
        pm.mesh.setColorAt(i, this._scratchColor)
      }
      pm.mesh.instanceColor.needsUpdate = true
    }
  }

  // ─── Hover + click (ONE shared listener each) ──────────────────────────

  _handlePointerMove(e) {
    if (!this.isActive()) return
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1
    // ONE ray for every chunk early-out (fix round 1: cheap bounding-sphere
    // test before any per-mesh raycast — far chunks never reach the raycaster).
    this._ndcScratch.set(ndcX, ndcY)
    this._raycaster.setFromCamera(this._ndcScratch, this.camera)
    const ray = this._raycaster.ray
    let best = null
    let bestChunk = null
    for (const chunk of this.chunks.values()) {
      if (!chunk.composer) continue // void chunk — no meshes to hit
      if (chunk.boundsSphere && !ray.intersectsSphere(chunk.boundsSphere)) continue
      const hit = chunk.composer.raycastFromPointer(ndcX, ndcY)
      if (hit && (!best || hit.distance < best.distance)) {
        best = hit
        bestChunk = chunk
      }
    }
    for (const chunk of this.chunks.values()) {
      if (chunk === bestChunk) {
        if (chunk.applyHover) chunk.applyHover(best)
      } else if (chunk.composer) {
        chunk.composer.clearHover()
      }
    }
    this.lastHover = best
      ? { x: best.record.x, y: best.record.y, variant: best.record.variant, rotation: best.record.rotation || 0 }
      : null
  }

  _handleClick(e) {
    if (!this.isActive()) return
    // Ignore clicks that originate inside the debug overlay DOM.
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('#debug-overlay')) return
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1
    this._ndcScratch.set(ndcX, ndcY)
    this._raycaster.setFromCamera(this._ndcScratch, this.camera)
    const ray = this._raycaster.ray
    let best = null
    for (const chunk of this.chunks.values()) {
      if (!chunk.composer) continue // void chunk — no meshes to hit
      if (chunk.boundsSphere && !ray.intersectsSphere(chunk.boundsSphere)) continue
      const hit = chunk.composer.raycastFromPointer(ndcX, ndcY)
      if (hit && (!best || hit.distance < best.distance)) best = hit
    }
    if (best) this.moveTarget = { x: best.record.x + 0.5, y: best.record.y + 0.5 }
  }

  // ─── Public API (harness + main) ───────────────────────────────────────

  /** Rebuilds the world with a new seed (player back to spawn). */
  setSeed(seed) {
    this.seed = seed | 0
    for (const chunk of this.chunks.values()) this._disposeChunk(chunk)
    this.chunks.clear()
    this.loadedChunkCount = 0
    this.player.x = 0
    this.player.y = 0
    this.moveTarget = null
    this._playerChunkX = 0
    this._playerChunkY = 0
    this._lastTileX = 0
    this._lastTileY = 0
    this._refreshStreaming()
    this._applyFovDims()
    this._snapCamera = true
  }

  /** Teleports the player to data coords (x, y). */
  teleport(x, y) {
    this.player.x = x
    this.player.y = y
    this.moveTarget = null
    this._playerChunkX = Math.floor(x / gen.CHUNK_SIZE)
    this._playerChunkY = Math.floor(y / gen.CHUNK_SIZE)
    this._lastTileX = Math.floor(x)
    this._lastTileY = Math.floor(y)
    this._refreshStreaming()
    this._applyFovDims()
    this._snapCamera = true
  }

  /** Sets the clock (0..1439, wraps). */
  setTimeOfDay(minutes) {
    this.timeOfDay = ((Math.round(minutes) % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH
    this._applyDayNight()
    this._refreshStreaming()
    this._applyFovDims()
  }

  /** Advances the clock (wraps at 1440). */
  fastForward(minutes) {
    this.setTimeOfDay(this.timeOfDay + minutes)
  }

  /** Live FOV radius override (day/night tween resumes only if unset). */
  setFovRadius(r) {
    this._fovOverride = Math.max(1, r)
    this.fovRadius = this._fovOverride
    this._updateRadii()
    this._refreshStreaming()
    this._applyFovDims()
  }

  /** Clears a live FOV override — the day/night tween (day 9 / night 5)
   *  takes over again. Harness helper for deterministic fixtures. */
  resetFovOverride() {
    this._fovOverride = null
    this._applyDayNight()
    this._refreshStreaming()
    this._applyFovDims()
  }

  /** Fast QA mode: InputManager fast-latch + instant camera snap. */
  setFastMode(enabled) {
    this.input.setFastLatch(enabled)
    if (enabled) this._snapCamera = true
  }

  /** Plain serializable snapshot (harness getState additions). */
  getState() {
    return {
      seed: this.seed,
      player: { x: this.player.x, y: this.player.y },
      timeOfDay: this.timeOfDay,
      fovRadius: this.fovRadius,
      loadedChunkCount: this.loadedChunkCount,
      lastChunkGenMs: this.lastChunkGenMs,
      lastChunkGenMsMax: this._lastChunkGenMsMax,
      biomeAtPlayer: this.biomeAt(Math.floor(this.player.x), Math.floor(this.player.y)),
      dayNightPhase: this.dayNight.phaseAt(this.timeOfDay).phase,
    }
  }

  /** The pure generator output for a chunk (determinism tests). */
  chunkData(cx, cy) {
    return gen.generateChunk(this.seed, cx, cy)
  }

  /** Chunks still waiting to be built (harness helper: fixtures poll this to
   *  wait for the streaming queue to drain before screenshotting). */
  pendingChunkLoads() {
    return this._loadQueue.length
  }

  /** Biome for a global tile coordinate. Returns 'void' for void (non-solid)
   *  tiles — the island mask is applied AFTER the biome gate pass (fix round
   *  1); solid tiles report their chunk's gate-passed biome. */
  biomeAt(x, y) {
    return gen.biomeAt(this.seed, x, y)
  }

  /** The computed dim factor for a tile (QA hook). */
  fogFactorAt(x, y) {
    return this._fogFactor(x, y)
  }

  /** Client pixel coords of a tile center through the current camera (same
   *  math as the harness's projectTile). Null if behind the camera. */
  projectTile(x, y) {
    this._projVec.set((x - y) * 0.5, 0.25, (x + y) * 0.5).project(this.camera)
    if (this._projVec.z > 1 || this._projVec.z < -1) return null
    return {
      x: (this._projVec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this._projVec.y * 0.5 + 0.5) * window.innerHeight,
    }
  }

  /** Full teardown: unbind listeners, dispose every chunk, remove the player
   *  mesh + lights. Shared tile/prop geometry and materials are NOT disposed
   *  (owned by the asset modules). */
  dispose() {
    document.removeEventListener('pointermove', this._onPointerMove)
    document.removeEventListener('click', this._onClick)
    for (const chunk of this.chunks.values()) this._disposeChunk(chunk)
    this.chunks.clear()
    this.loadedChunkCount = 0
    this.scene.remove(this.ambient, this.key, this.fill, this.rim, this.playerMesh)
    this.playerMesh = null
  }
}