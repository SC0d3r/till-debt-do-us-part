/**
 * WorldManager — the tile-world demo world (Slice C).
 *
 * Owns the whole demo world: chunk streaming (one TileMapComposer per chunk),
 * the movable player cube (WASD via InputManager + click-to-move), camera
 * follow, FOV fog dims, and the day/night lighting rig. It is PROD code
 * (imported by src/main.ts); the debug harness reaches it through the
 * devGraph handle.
 *
 * CHUNK STREAMING: chunks generate on approach (load radius) and dispose on
 * distance (keep radius + hysteresis — no gen/dispose churn when the cube
 * oscillates across a boundary). At most 2 chunk loads per frame; the
 * per-chunk generation time is measured and exposed (lastChunkGenMs).
 *
 * FOV DIMMING: per tile, factor = 1 − smoothstep(fovRadius, loadRadius,
 * distance) clamped to [fogFloor, 1] — tiles fade smoothly across the band
 * near the visible radius, fully faded at the load radius. Applied through
 * composer.setInstanceDims (tiles AND outlines) and per-instance prop
 * colors. Recomputed only when the player's tile changes or chunks
 * load/unload — never per frame.
 *
 * HOVER: exactly ONE shared document pointermove listener (plus one click
 * listener for click-to-move). Every loaded chunk is raycast through its
 * composer's pure raycastFromPointer; the nearest hit is applied to its
 * owning chunk, every other chunk is cleared. Clicks inside the debug
 * overlay DOM are ignored.
 *
 * LIGHTING: ambient + key + fill + rim directional rig (day/night lerped by
 * the DayNight module) + a warm point light attached to the player cube
 * (intensity 0 by day, ~1.6 by night — the Don't Starve-style pool).
 *
 * PERFORMANCE: zero per-frame allocations in update() — scratch vectors and
 * colors are reused; the only per-frame work is numbers + lerps.
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
/** Max chunk loads per frame (generation budget). */
const MAX_CHUNK_LOADS_PER_FRAME = 2
/** Click-to-move arrival tolerance (tiles). */
const MOVE_ARRIVE_DIST = 0.15
/** Camera follow smoothing rate (1/s). */
const CAMERA_LERP_RATE = 8
/** Minimum dim factor at the load radius (near-black fog tone). */
const FOG_FLOOR = 0.06

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
    this.keepRadius = this.loadRadius + 2
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
    this._camOffset = new THREE.Vector3(0, 6.5, 9)
    this._projVec = new THREE.Vector3()
    this._snapCamera = true

    // Streaming bookkeeping.
    this._playerChunkX = 0
    this._playerChunkY = 0
    this._lastTileX = 0
    this._lastTileY = 0
    this._loadQueue = []

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
    // dispose out-of-range chunks; then load at most 2 chunks this frame.
    const pcx = Math.floor(this.player.x / gen.CHUNK_SIZE)
    const pcy = Math.floor(this.player.y / gen.CHUNK_SIZE)
    if (pcx !== this._playerChunkX || pcy !== this._playerChunkY) {
      this._playerChunkX = pcx
      this._playerChunkY = pcy
      this._refreshStreaming()
    }
    let loaded = 0
    while (loaded < MAX_CHUNK_LOADS_PER_FRAME && this._loadQueue.length > 0) {
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

  /** Applies the day/night rig for the current timeOfDay and tweens the FOV
   *  radius with the same phase lerp (unless a live override is set). */
  _applyDayNight() {
    const dayFactor = this.dayNight.apply(this.rig, this.timeOfDay)
    if (this._fovOverride === null) {
      const fov = NIGHT_FOV + (DAY_FOV - NIGHT_FOV) * dayFactor
      if (Math.abs(fov - this.fovRadius) > 0.001) {
        this.fovRadius = fov
        this._updateRadii()
      }
    }
  }

  _updateRadii() {
    this.loadRadius = this.fovRadius + FADE_BAND
    this.keepRadius = this.loadRadius + 2
  }

  // ─── Camera ───────────────────────────────────────────────────────────

  /** Lerps the camera toward playerWorld + (0, 6.5, 9) looking at playerWorld
   *  + (0, 0.2, 3). SNAPS instantly in fast mode (deterministic for tests). */
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
   *  load radius in tiles. */
  _loadChunkRadius() {
    return Math.ceil(this.loadRadius / gen.CHUNK_SIZE) + 1
  }

  /** Chunk distance beyond which chunks are disposed (keep radius +
   *  hysteresis margin). */
  _keepChunkRadius() {
    return Math.ceil(this.keepRadius / gen.CHUNK_SIZE) + 1
  }

  /** Rebuilds the load queue for every chunk within the load radius of the
   *  player's chunk and disposes chunks outside the keep radius. Called on
   *  player chunk change, teleport, setSeed, setFovRadius and time changes —
   *  never per frame. */
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
    this.loadedChunkCount = this.chunks.size
  }

  /** Builds one chunk: composer (bindOwnHoverEvents: false, interior
   *  outlines) + one InstancedMesh per prop name. Applies FOV dims to the
   *  new chunk immediately. */
  _buildChunk(key) {
    const comma = key.indexOf(',')
    const cx = Number(key.slice(0, comma))
    const cy = Number(key.slice(comma + 1))
    const t0 = performance.now()
    const data = gen.generateChunk(this.seed, cx, cy)
    const group = new THREE.Group()
    const composer = new TileMapComposer({
      parent: group,
      data: data.tiles,
      resolveFactory: (variant) => resolveFactory(variant),
      raycastTarget: this.camera,
      outline: { mode: 'interior' },
      bindOwnHoverEvents: false,
    })
    const propMeshes = this._buildPropMeshes(data.props, group)
    this.scene.add(group)
    const chunk = {
      cx,
      cy,
      group,
      composer,
      tiles: data.tiles,
      props: data.props,
      propMeshes,
      applyHover: (hit) => composer.applyHover(hit),
    }
    this.chunks.set(key, chunk)
    this.loadedChunkCount = this.chunks.size
    const ms = performance.now() - t0
    this.lastChunkGenMs = ms
    this._genTimes.push([performance.now(), ms])
    while (this._genTimes.length > 0 && performance.now() - this._genTimes[0][0] > 1000) this._genTimes.shift()
    this._lastChunkGenMsMax = 0
    for (const [, t] of this._genTimes) if (t > this._lastChunkGenMsMax) this._lastChunkGenMsMax = t
    this._applyFovDimsToChunk(chunk)
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
    chunk.composer.dispose()
    for (const pm of chunk.propMeshes) pm.mesh.dispose()
    this.scene.remove(chunk.group)
  }

  // ─── FOV dims ──────────────────────────────────────────────────────────

  /** The dim factor for a tile at distance from the player: 1.0 inside the
   *  visible radius, fading to fogFloor across the band, clamped. */
  _fogFactor(x, y) {
    const dx = x - this.player.x
    const dy = y - this.player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const f = 1 - THREE.MathUtils.smoothstep(this.fovRadius, this.loadRadius, dist)
    return Math.max(this.fogFloor, Math.min(1, f))
  }

  /** Recomputes dims for every loaded chunk (tiles + outlines + props). */
  _applyFovDims() {
    for (const chunk of this.chunks.values()) this._applyFovDimsToChunk(chunk)
  }

  _applyFovDimsToChunk(chunk) {
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
    let best = null
    let bestChunk = null
    for (const chunk of this.chunks.values()) {
      const hit = chunk.composer.raycastFromPointer(ndcX, ndcY)
      if (hit && (!best || hit.distance < best.distance)) {
        best = hit
        bestChunk = chunk
      }
    }
    for (const chunk of this.chunks.values()) {
      if (chunk === bestChunk) chunk.applyHover(best)
      else chunk.composer.clearHover()
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
    let best = null
    for (const chunk of this.chunks.values()) {
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

  /** Biome for a global tile coordinate. */
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