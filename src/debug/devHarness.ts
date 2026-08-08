/**
 * Dev-only debug/test harness — exposes `window.__debug`.
 *
 * Gating (two layers):
 *  1. `import.meta.env.DEV` in src/main.ts — Vite statically replaces it with
 *     `false` in production builds, so rollup removes the dead branch and then
 *     tree-shakes this whole module (and its fixtures-JSON import) out of the
 *     production bundle. The string `__debug` must never appear in dist/ —
 *     that is enforced by scripts/check-prod-bundle.mjs.
 *  2. `?debug=1` in the URL — runtime gate in dev.
 *
 * The `TileWorld` class in src/main.ts is intentionally NOT exported. This
 * module reaches into it through a single `(game as any)` cast (see `g`
 * below). Everything here reads/writes existing fields through the small
 * composition graph passed in from main.ts (world scene/camera + the live
 * TileMapComposer). If TileWorld's internals change, keep this file in sync.
 *
 * IMPORTANT: keep this module free of top-level side effects (only imports,
 * types and function declarations). Any module-scope statement that rollup
 * cannot prove pure would make the import in main.ts un-tree-shakeable and
 * leak `__debug` into the production bundle.
 */

import * as THREE from 'three'
import fixtures from '../../tests/scene-fixtures.json'
import { VARIANTS as TILE_VARIANTS, resolveFactory } from '../assets/tiles'
import { PROPS as PROP_VARIANTS, resolvePropFactory, createProp } from '../assets/props'
import { TileMapComposer, type TileMapRecord, type TileMapOutlineOptions } from '../world/TileMapComposer'
import { SHOWCASE_MAP, validateShowcaseMap } from '../world/showcaseMap'
import type { WorldManager } from '../world/WorldManager'
import type { GeneratedChunk } from '../world/worldGenerator'
import { SPAWN_PIN_RADIUS } from '../world/worldGenerator'
import { initDebugOverlay, type DebugOverlayHandle } from './debugOverlay'

interface FixtureDef {
  name: string
  description: string
  category: string
}

/** Debug handle for the showcase map fixture (the tile composer). Test-only
 *  read hooks: the live composer instance, the last onHover record, the last
 *  validateShowcaseMap result, and a camera projection helper for aiming
 *  synthetic pointer events at a specific tile. */
interface ShowcaseDebugHandle {
  composer: unknown
  lastHover: unknown
  validation: { ok: boolean; errors: string[] } | null
  projectTile(x: number, y: number): { x: number; y: number } | null
  /** NDC projections of the showcase maps through the CURRENT camera (B2
   *  framing regression check): every grid row center (tile map) and every
   *  staged prop (props map) must land inside NDC ±0.95 — full map visible,
   *  nothing clipped. */
  ndc(map: 'tile' | 'props'): {
    rows: Array<{ x: number; y: number; nx: number; ny: number }>
    props: Array<{ name: string; nx: number; ny: number }>
  }
}

/** Geometry inspection for the prop brightness/NaN regression checks (B1/B3):
 *  NaN vertex count, world bbox, and the color of the highest vertex (the
 *  light cap — must equal the light tone × PROP_BRIGHTNESS). */
interface PropInspect {
  nanCount: number
  bbox: { min: [number, number, number]; max: [number, number, number] }
  maxYColor: [number, number, number]
}

interface DebugApi {
  ready: boolean
  getState(): Record<string, unknown>
  gotoFixture(name: string): Promise<void>
  listFixtures(): FixtureDef[]
  setFastMode(enabled: boolean, renderEvery?: number): void
  previewAsset(name: string, opts?: Record<string, unknown>): Promise<void>
  showcaseTileMap(data?: TileMapRecord[], opts?: { outline?: TileMapOutlineOptions }): Promise<void>
  showcase: ShowcaseDebugHandle
  inspectProp(name: string): PropInspect
  // Slice C: world-state primitives (all through the settle mechanism).
  setState(patch: { timeOfDay?: number }): Promise<void>
  fastForward(minutes: number): Promise<void>
  teleport(x: number, y: number): Promise<void>
  regenerate(seed?: number): Promise<void>
  setFovRadius(r: number): Promise<void>
  world: WorldDebugHandle
}

/** Debug handle for the Slice C world (the WorldManager). Test-only read
 *  hooks: live state getters, the pure generator (determinism checks), biome
 *  / fog-factor queries, camera projection, chunk-registry inspection (void
 *  chunks produce zero meshes — fix round 1), and the last hover record. */
interface WorldDebugHandle {
  seed: number
  player: { x: number; y: number }
  timeOfDay: number
  fovRadius: number
  loadedChunkCount: number
  lastChunkGenMs: number
  biomeAtPlayer: string
  chunkData(cx: number, cy: number): GeneratedChunk
  biomeAt(x: number, y: number): string
  fogFactorAt(x: number, y: number): number
  projectTile(x: number, y: number): { x: number; y: number } | null
  lastHover: { x: number; y: number; variant: string; rotation: number } | null
  pendingChunkLoads(): number
  /** Chunk-registry inspection (fix round 1 QA): whether the chunk is
   *  tracked, its solid tile count, and how many meshes its scene group
   *  contains (0 for void chunks — they must produce no meshes). */
  chunkInfo(cx: number, cy: number): { tracked: boolean; tileCount: number; sceneChildCount: number }
  /** Outline-geometry report across chunks within Chebyshev `radius` of the
   *  player's chunk (fix round 1 QA): per solid chunk, each outline group's
   *  local mask + instance count + shared geometry UUID. Identical UUIDs
   *  across chunks prove the module-level OUTLINE_GEOM_CACHE dedupe (one
   *  geometry object per mask key for the whole page). */
  outlineGeometryReport(radius: number): Array<{ key: string; entries: Array<{ mask: string; count: number; uuid: string }> }>
  /** Round-2 spawn QA: how many of the origin 5×5 spawn patch tiles
   *  (max(|x|,|y|) <= SPAWN_PIN_RADIUS = 2) actually exist in the generated
   *  chunk (0,0) for the CURRENT seed — every one of the 25 MUST be present
   *  (the spawn island floor, fix round 2). */
  spawnPatchReport(): { pinRadius: number; expected: number; missing: Array<{ x: number; y: number }> }
  /** Round-2 fog QA: the live dim factor of the tile at (x, y) — the raw
   *  instanceColor channel ÷ the hover base (0.88 neutral / 1.0 hovered), so
   *  the value is directly comparable to fogFactorAt(x, y). Null when the
   *  tile is not loaded or has no instanceColor. */
  tileDimAt(x: number, y: number): { dim: number; color: [number, number, number]; hovered: boolean } | null
  /** Round-2 origin-marker QA: the red spawn marker's data tile, world
   *  position and screen projection (null when the marker is not shown). The
   *  marker must sit at the MESH CENTER of its tile, never at the
   *  data-origin corner (round-2 design fix). */
  originMarkerAt(): { data: { x: number; y: number }; world: [number, number, number]; screen: { x: number; y: number } | null; tileVariant: string | null } | null
  /** Round-2 hover-ring QA: which loaded chunk composer currently shows the
   *  hover ring (visible + world position + screen projection). */
  hoverRingInfo(): { visible: boolean; world: [number, number, number] | null; screen: { x: number; y: number } | null } | null
}

declare global {
  interface Window {
    __debug?: DebugApi
  }
}

const registry = fixtures as FixtureDef[]

// ─── Settle mechanism ───
// Any state change flips `ready` to false and stamps `dirtyAt`; a rAF loop
// flips `ready` back to true once SETTLE_MS of WALL-CLOCK time has passed.
// Wall-clock (not frame-count) so the settle takes the same 0.6s even on slow
// software renderers (~2fps headless) instead of 30 frames (~15s there). All
// async API methods resolve once the scene has settled.
const SETTLE_MS = 600

// ─── Composition graph ───
// The harness reaches into the game through this graph of subsystem handles
// plus a handful of TileWorld fields that stay in the composition root
// (`game as any`): started and setFastMode.
export interface DevHarnessGraph {
  world: { scene: THREE.Scene; camera: THREE.PerspectiveCamera }
  composer: TileMapComposer | null
  worldManager: WorldManager
}

export function initDevHarness(game: unknown, graph: DevHarnessGraph): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('debug')) return

  const g = game as any
  const world = graph.world
  const wm = graph.worldManager

  let dirtyAt = 0
  let pendingSettles: Array<() => void> = []

  // Showcase-map debug handle. Declared before the api object because api
  // references it directly; projectTile is a hoisted function declaration, so
  // referencing it in the literal is safe.
  const showcase: ShowcaseDebugHandle = { composer: null, lastHover: null, validation: null, projectTile, ndc }
  // Slice C world handle: live getters over the WorldManager (declared before
  // the api literal — the api references it directly).
  const worldHandle: WorldDebugHandle = {
    get seed() { return wm.getState().seed },
    get player() { return wm.getState().player },
    get timeOfDay() { return wm.getState().timeOfDay },
    get fovRadius() { return wm.getState().fovRadius },
    get loadedChunkCount() { return wm.getState().loadedChunkCount },
    get lastChunkGenMs() { return wm.getState().lastChunkGenMs },
    get biomeAtPlayer() { return wm.getState().biomeAtPlayer },
    chunkData: (cx, cy) => wm.chunkData(cx, cy),
    biomeAt: (x, y) => wm.biomeAt(x, y),
    fogFactorAt: (x, y) => wm.fogFactorAt(x, y),
    projectTile: (x, y) => wm.projectTile(x, y),
    get lastHover() { return wm.lastHover },
    pendingChunkLoads: () => wm.pendingChunkLoads(),
    chunkInfo: (cx, cy) => {
      const chunk = wm.chunks.get(`${cx},${cy}`)
      if (!chunk) return { tracked: false, tileCount: 0, sceneChildCount: 0 }
      return {
        tracked: true,
        tileCount: chunk.tiles.length,
        sceneChildCount: chunk.group ? chunk.group.children.length : 0,
      }
    },
    outlineGeometryReport: (radius) => {
      const out = []
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const chunk = wm.chunks.get(`${dx},${dy}`)
          if (!chunk?.composer) continue
          out.push({
            key: `${dx},${dy}`,
            entries: chunk.composer.outlineGroups.map(g => ({ mask: g.mask, count: g.count, uuid: g.mesh.geometry.uuid })),
          })
        }
      }
      return out
    },
    spawnPatchReport: () => {
      // The patch max(|x|,|y|) <= 2 CROSSES chunk borders (negative tiles
      // live in chunks (-1,0) / (0,-1) / (-1,-1)) — scan every loaded chunk.
      const present = new Set<string>()
      for (const chunk of wm.chunks.values()) {
        for (const t of chunk.tiles) present.add(`${t.x},${t.y}`)
      }
      const missing: Array<{ x: number; y: number }> = []
      for (let x = -SPAWN_PIN_RADIUS; x <= SPAWN_PIN_RADIUS; x++) {
        for (let y = -SPAWN_PIN_RADIUS; y <= SPAWN_PIN_RADIUS; y++) {
          if (Math.max(Math.abs(x), Math.abs(y)) <= SPAWN_PIN_RADIUS && !present.has(`${x},${y}`)) {
            missing.push({ x, y })
          }
        }
      }
      return { pinRadius: SPAWN_PIN_RADIUS, expected: 25, missing }
    },
    tileDimAt: (x, y) => {
      const cx = Math.floor(x / 8)
      const cy = Math.floor(y / 8)
      const chunk = wm.chunks.get(`${cx},${cy}`)
      if (!chunk?.composer) return null
      const composer = chunk.composer as any
      const record = chunk.tiles.find((t: { x: number; y: number }) => t.x === x && t.y === y)
      if (!record) return null
      const entry = composer._indexByRecord.get(record)
      if (!entry) return null
      const col = entry.group.mesh.instanceColor
      if (!col) return null
      const hovered = !!(composer._hovered && composer._hovered.record === record)
      // instanceColor = dim × (hovered ? 1.0 : 0.88) — divide out the base.
      const base = hovered ? 1 : 0.88
      const r = col.getX(entry.instanceId)
      return {
        dim: base > 0 ? Math.max(0, r / base) : 0,
        color: [r, col.getY(entry.instanceId), col.getZ(entry.instanceId)],
        hovered,
      }
    },
    originMarkerAt: () => {
      if (!originMarker) return null
      const p = originMarker.position
      const wpos: [number, number, number] = [p.x, p.y, p.z]
      projVec.copy(p).project(world.camera)
      const screen =
        projVec.z > 1 || projVec.z < -1
          ? null
          : { x: (projVec.x * 0.5 + 0.5) * window.innerWidth, y: (-projVec.y * 0.5 + 0.5) * window.innerHeight }
      const chunk = wm.chunks.get(`${Math.floor(ORIGIN_MARKER_TILE.x / 8)},${Math.floor(ORIGIN_MARKER_TILE.y / 8)}`)
      const tile = chunk ? chunk.tiles.find((t: { x: number; y: number }) => t.x === ORIGIN_MARKER_TILE.x && t.y === ORIGIN_MARKER_TILE.y) : null
      return { data: { ...ORIGIN_MARKER_TILE }, world: wpos, screen, tileVariant: tile ? tile.variant : null }
    },
    hoverRingInfo: () => {
      for (const chunk of wm.chunks.values()) {
        const composer = chunk.composer as any
        const ring = composer && composer._ring
        if (!ring || !ring.visible) continue
        const p = ring.position
        const rpos: [number, number, number] = [p.x, p.y, p.z]
        projVec.copy(p).project(world.camera)
        const screen =
          projVec.z > 1 || projVec.z < -1
            ? null
            : { x: (projVec.x * 0.5 + 0.5) * window.innerWidth, y: (-projVec.y * 0.5 + 0.5) * window.innerHeight }
        return { visible: true, world: rpos, screen }
      }
      return { visible: false, world: null, screen: null }
    },
  }
  // Reused projection scratch (event/test-driven, not per-frame).
  const projVec = new THREE.Vector3()

  // ── Origin marker (round-2 fix) ──
  // A red diamond outline at the MESH CENTER of the origin tile — data (8,8),
  // world (0, topY+lift, 8) — per the round-2 evaluation directive ("the
  // origin marker was drawn at the wrong position: it should be at the mesh
  // center of the origin tile — tile (8,8) — not at the data-origin corner").
  // Dev-harness-owned (demo fixtures + the QA spawn scene show it; reset()
  // removes it), so production code never knows about it.
  const ORIGIN_MARKER_TILE = { x: 8, y: 8 }
  const ORIGIN_MARKER_LIFT = 0.02
  /** @type {THREE.LineLoop | null} */
  let originMarker: THREE.LineLoop | null = null

  function ensureOriginMarker(): void {
    if (originMarker) return
    const topY = 0.34 // TILE_SYSTEM_CONVENTION §1: top face ~0.34
    const y = topY + ORIGIN_MARKER_LIFT
    const pts = [
      new THREE.Vector3(0, y, 0.5),
      new THREE.Vector3(0.5, y, 0),
      new THREE.Vector3(0, y, -0.5),
      new THREE.Vector3(-0.5, y, 0),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const material = new THREE.LineBasicMaterial({ color: 0xff5555 })
    originMarker = new THREE.LineLoop(geometry, material)
    // Mesh center of tile (8,8): ((8−8)·0.5, y, (8+8)·0.5) = (0, y, 8).
    originMarker.position.set(
      (ORIGIN_MARKER_TILE.x - ORIGIN_MARKER_TILE.y) * 0.5,
      y,
      (ORIGIN_MARKER_TILE.x + ORIGIN_MARKER_TILE.y) * 0.5,
    )
    world.scene.add(originMarker)
  }

  function clearOriginMarker(): void {
    if (!originMarker) return
    world.scene.remove(originMarker)
    originMarker.geometry.dispose()
    if (Array.isArray(originMarker.material)) {
      for (const m of originMarker.material) m.dispose()
    } else {
      originMarker.material.dispose()
    }
    originMarker = null
  }

  const api: DebugApi = {
    ready: false,
    getState,
    gotoFixture,
    listFixtures,
    setFastMode,
    previewAsset,
    showcaseTileMap,
    showcase,
    inspectProp,
    setState,
    fastForward,
    teleport,
    regenerate,
    setFovRadius,
    world: worldHandle,
  }
  window.__debug = api

  // The debug overlay (backtick panel) — dev-only, imported only from here.
  // Initialized right after the api object so the fixture setups can use it.
  const overlay: DebugOverlayHandle = initDebugOverlay(api)

  // `?fast=1` (dev-only): re-assert the runtime side of fast QA mode. The
  // renderer-side settings (antialias/pixelRatio) were already applied at
  // construction in src/main.ts and are NOT toggleable here — acceptable
  // asymmetry, documented in TileWorld.setFastMode.
  if (params.get('fast') === '1') api.setFastMode(true)

  function setFastMode(enabled: boolean, renderEvery = 60): void {
    g.setFastMode(enabled, renderEvery)
  }

  // ── Slice C world primitives (all through the settle mechanism) ──
  // Minimal setState revival per DEBUG_HARNESS.md Part B: the world's only
  // mutable state is the clock, so { timeOfDay } is the only accepted key.
  async function setState(patch: { timeOfDay?: number }): Promise<void> {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new Error('setState: patch must be an object')
    }
    for (const key of Object.keys(patch)) {
      if (key !== 'timeOfDay') throw new Error(`setState: unknown key "${key}" (only timeOfDay is supported)`)
    }
    if (patch.timeOfDay !== undefined) {
      if (!Number.isFinite(patch.timeOfDay) || patch.timeOfDay < 0 || patch.timeOfDay > 1439) {
        throw new Error(`setState: timeOfDay must be 0..1439, got ${patch.timeOfDay}`)
      }
      wm.setTimeOfDay(patch.timeOfDay)
    }
    markDirty()
    await waitForSettle()
  }

  async function fastForward(minutes: number): Promise<void> {
    if (!Number.isFinite(minutes)) throw new Error(`fastForward: minutes must be a number, got ${minutes}`)
    wm.fastForward(minutes)
    markDirty()
    await waitForSettle()
  }

  async function teleport(x: number, y: number): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`teleport: x/y must be numbers, got (${x}, ${y})`)
    }
    wm.teleport(x, y)
    markDirty()
    await waitForSettle()
  }

  async function regenerate(seed?: number): Promise<void> {
    if (seed !== undefined && (!Number.isInteger(seed) || seed < 0)) {
      throw new Error(`regenerate: seed must be a non-negative integer, got ${seed}`)
    }
    wm.setSeed(seed !== undefined ? seed : wm.getState().seed + 1)
    markDirty()
    await waitForSettle()
  }

  async function setFovRadius(r: number): Promise<void> {
    if (!Number.isFinite(r) || r < 1) throw new Error(`setFovRadius: radius must be >= 1, got ${r}`)
    wm.setFovRadius(r)
    markDirty()
    await waitForSettle()
  }

  function markDirty() {
    api.ready = false
    dirtyAt = performance.now()
  }

  function waitForSettle(): Promise<void> {
    if (api.ready) return Promise.resolve()
    return new Promise(resolve => pendingSettles.push(resolve))
  }

  function settleTick() {
    if (!api.ready && performance.now() - dirtyAt >= SETTLE_MS) {
      api.ready = true
      const cbs = pendingSettles
      pendingSettles = []
      for (const cb of cbs) cb()
    }
    requestAnimationFrame(settleTick)
  }

  // ── getState ──
  function getState(): Record<string, unknown> {
    const ws = wm.getState()
    return {
      ready: api.ready,
      started: g.started === true,
      // Additive fast-QA-mode report.
      fastMode: {
        enabled: g.fastModeEnabled === true,
        renderEvery: g.fastRenderEvery,
        // Monotonic loop-iteration counter in fast mode (incremented once per
        // loop() run). Undefined while fast mode is off.
        ticks: g.fastTickCount,
      },
      // Slice C world state (live from the WorldManager).
      seed: ws.seed,
      timeOfDay: ws.timeOfDay,
      fovRadius: ws.fovRadius,
      loadedChunkCount: ws.loadedChunkCount,
      lastChunkGenMs: ws.lastChunkGenMs,
      player: ws.player,
      biomeAtPlayer: ws.biomeAtPlayer,
      dayNightPhase: ws.dayNightPhase,
    }
  }

  // ── Asset preview (category "asset-preview" fixtures) ──
  // Loads exactly one asset into a neutral studio: plain background, standard
  // 3-point rig, camera framed to fill the viewport. Deliberately separate
  // from the showcase map — asset review needs a clean, unambiguous shot with
  // no map context, lighting variance, or occlusion.
  //
  // Iterate the MERGED tile registry so every family's variants get previews
  // automatically (no per-family hardcoding here), then the merged PROP
  // registry — prop previews add a host tile + prop framing via previewAsset
  // below (assetFactories entries are just the prop factories).
  const assetFactories: Record<string, () => THREE.Object3D> = {}
  for (const variant of Object.keys(TILE_VARIANTS)) {
    assetFactories[variant] = resolveFactory(variant)
  }
  for (const name of Object.keys(PROP_VARIANTS)) {
    assetFactories[name] = resolvePropFactory(name)
  }

  // Tile top-face height (TILE_SYSTEM_CONVENTION.md §1: top face ~0.34).
  // Prop local origins sit at their base contact point, so placing a prop at
  // this height rests it exactly on the tile surface.
  const TILE_TOP_Y = 0.34

  interface PreviewState {
    savedChildren: THREE.Object3D[]
    savedFog: THREE.FogBase | null
    savedBackground: THREE.Color | THREE.Texture | null
    savedCameraPos: THREE.Vector3
    savedCameraQuat: THREE.Quaternion
    savedOverlays: Array<{ el: HTMLElement; display: string }>
    savedStarted: boolean
    previewObjects: THREE.Object3D[]
    /** Called FIRST in teardown (before scene restore) so map-sized fixtures
     *  (showcaseTileMap) can dispose their composers while still in preview. */
    onTeardown?: () => void
  }
  let previewState: PreviewState | null = null

  /**
   * Overlay/HUD DOM elements that must be hidden for the duration of an asset
   * preview so the screenshot is a clean studio shot of just the tile. The
   * Slice C debug panel (backtick overlay) is the only DOM overlay — previews
   * hide it; the demo fixtures re-show it explicitly.
   */
  const PREVIEW_OVERLAY_IDS: string[] = ['debug-overlay']

  function hidePreviewOverlays(): Array<{ el: HTMLElement; display: string }> {
    const saved: Array<{ el: HTMLElement; display: string }> = []
    for (const id of PREVIEW_OVERLAY_IDS) {
      const el = document.getElementById(id)
      if (!el) continue
      saved.push({ el, display: el.style.display })
      el.style.display = 'none'
    }
    return saved
  }

  function restorePreviewOverlays(saved: Array<{ el: HTMLElement; display: string }>) {
    for (const { el, display } of saved) el.style.display = display
  }

  /**
   * Shared preview staging (single-tile previewAsset AND map-sized
   * showcaseTileMap): save the previous scene contents/camera/fog/overlays/
   * started flag, clear the scene and swap in the neutral studio background.
   * Everything is restored by teardownPreview() in the disciplined order
   * (objects → scene → fog → background → camera → overlays → started LAST).
   * The loop itself keeps running (it renders whatever is in the scene); the
   * started flag is harness bookkeeping that getState() reports.
   */
  function beginPreviewState(): PreviewState {
    const scene = world.scene
    const cam = world.camera
    // The loop itself never reads g.started (src/main.ts renders every frame),
    // but getState() reports it and the surviving tests assert started=false
    // during previews — so flip it off here and restore it in teardownPreview.
    const savedStarted = g.started
    g.started = false
    const preview: PreviewState = {
      savedChildren: scene.children.slice(),
      savedFog: scene.fog,
      savedBackground: scene.background,
      savedCameraPos: cam.position.clone(),
      savedCameraQuat: cam.quaternion.clone(),
      savedOverlays: hidePreviewOverlays(),
      savedStarted,
      previewObjects: [],
    }
    previewState = preview
    while (scene.children.length) scene.remove(scene.children[0])
    scene.fog = null
    scene.background = new THREE.Color(0xe8e8e8)
    return preview
  }

  /** Standard 3-point studio rig (key / fill / rim + soft ambient) shared by
   *  the asset preview and the showcase map so both read as the same neutral
   *  studio. */
  function addStudioRig(): THREE.Object3D[] {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    key.position.set(3, 5, 4)
    const fill = new THREE.DirectionalLight(0xffffff, 0.35)
    fill.position.set(-3, 2, 1)
    const rim = new THREE.DirectionalLight(0xffffff, 0.3)
    rim.position.set(0, 3, -4)
    world.scene.add(ambient, key, fill, rim)
    return [ambient, key, fill, rim]
  }

  function teardownPreview() {
    if (!previewState) return
    const scene = world.scene
    const cam = world.camera
    if (previewState.onTeardown) previewState.onTeardown()
    for (const obj of previewState.previewObjects) scene.remove(obj)
    for (const child of previewState.savedChildren) scene.add(child)
    scene.fog = previewState.savedFog
    scene.background = previewState.savedBackground
    cam.position.copy(previewState.savedCameraPos)
    cam.quaternion.copy(previewState.savedCameraQuat)
    restorePreviewOverlays(previewState.savedOverlays)
    // Restore the game loop LAST, after the scene is fully restored.
    g.started = previewState.savedStarted
    previewState = null
  }

  async function previewAsset(name: string, opts?: Record<string, unknown>): Promise<void> {
    const def = registry.find(f => f.name === name)
    if (!def) throw new Error(`previewAsset: unknown asset "${name}"`)
    const factory = assetFactories[name]
    if (!factory) {
      throw new Error(`previewAsset: no factory registered for "${name}" (add it to the family's VARIANTS manifest)`)
    }
    teardownPreview()
    const preview = beginPreviewState()
    const scene = world.scene
    const cam = world.camera
    preview.previewObjects.push(...addStudioRig())

    // Props preview ON a neutral host tile so the "rests on the surface"
    // behavior is reviewable: the host tile variant comes from the prop's
    // manifest metadata (per-biome hosts: sand for cactus/dry-shrub, snow for
    // snow props, lava for lava-rock, grass/dirt for the rest).
    const propEntry = PROP_VARIANTS[name]
    if (propEntry) {
      const hostVariant = propEntry.hostTile ?? 'grass-plain'
      const host = resolveFactory(hostVariant)()
      host.position.set(0, 0, 0)
      scene.add(host)
      preview.previewObjects.push(host)

      const asset = factory()
      const topY = (host.userData?.outlineTop as number | undefined) ?? TILE_TOP_Y
      asset.position.set(0, topY, 0)
      scene.add(asset)
      preview.previewObjects.push(asset)

      // Slight pull-back vs. the bare-tile framing so the prop's vertical
      // accent (tall-grass 0.26, torch 0.24) stays inside the frame.
      cam.position.set(0, 1.15, 1.52)
      cam.lookAt(0, 0.17, 0)
    } else {
      const asset = factory()
      asset.position.set(0, 0, 0)
      scene.add(asset)
      preview.previewObjects.push(asset)

      // Iso framing from the south (+z): the diamond's N-S axis is vertical on
      // screen and the two front side walls are visible. Camera pulled in tight
      // so the tile fills ~60% of the frame height.
      cam.position.set(0, 1.0, 1.28)
      cam.lookAt(0, 0.2, 0)
    }

    markDirty()
    await waitForSettle()
  }

  // ── Showcase map (the tile composer) ──
  // Same preview state as previewAsset (loop stopped, overlays hidden, clean
  // studio background) but builds the whole SHOWCASE_MAP grid through the
  // data-driven TileMapComposer and frames the camera for the entire 9x9 map.
  // Default map-level outline config: mode 'interior' (edges touching another
  // cell) — the outline color demo lives in SHOWCASE_MAP's per-record
  // outlineColor fields (green grass columns x=0..2 vs the biome-default deep
  // green on x=3..8). Tests may override the outline config via opts.
  async function showcaseTileMap(data?: TileMapRecord[], opts?: { outline?: TileMapOutlineOptions }): Promise<void> {
    const mapData = data ?? SHOWCASE_MAP
    // Data-level acceptance gate FIRST: a bad map throws before any staging
    // happens, so the harness is never left half-entered by bad data.
    const validation = validateShowcaseMap(mapData)
    showcase.validation = validation
    if (!validation.ok) {
      throw new Error(`showcaseTileMap: invalid map data (${validation.errors.length} error(s)):\n  - ${validation.errors.join('\n  - ')}`)
    }
    teardownPreview()
    const preview = beginPreviewState()
    const scene = world.scene
    const cam = world.camera
    preview.previewObjects.push(...addStudioRig())

    let composer: TileMapComposer
    try {
      composer = new TileMapComposer({
        parent: scene,
        data: mapData,
        // Variant STRING → tile-registry factory (the composer knows nothing
        // about families; resolveFactory is the only family knowledge and it
        // lives in the registry, src/assets/tiles/index.js).
        resolveFactory: (variant) => resolveFactory(variant),
        raycastTarget: cam,
        onHover: (record) => { showcase.lastHover = record },
        outline: opts?.outline ?? { mode: 'interior' },
      })
    } catch (e) {
      // Composer build failed (bad variant/elevation/data): restore the
      // previous scene immediately so the harness stays usable.
      teardownPreview()
      throw e
    }
    showcase.composer = composer
    preview.onTeardown = () => {
      composer.dispose()
      showcase.composer = null
      showcase.lastHover = null
    }

    // 3/4 isometric framing of the WHOLE map: same neutral rig look as
    // previewAsset (32° elevation, camera from the south/+z). B2 (re-review):
    // the previous pull-in hit ≥75% fill but CLIPPED the map — front row
    // (grid y=8) projected below the frame and side columns cut. At 50° FOV /
    // 4:3 the 9×9 diamond can't fully fit at ≥75% fill; relax to "full map
    // visible with balanced margins" per the visual-critic's numbers.
    cam.position.set(0, 6.5, 13.5)
    cam.lookAt(0, 0.25, 4.0)

    markDirty()
    await waitForSettle()
  }

  /** Projects a data-grid tile center to client pixel coordinates through the
   *  current camera (test hook — lets the composer regression test aim
   *  synthetic pointer events at a specific tile). Applies the composer's
   *  diagonal-lattice transform ((x−y)·0.5, 0, (x+y)·0.5) so the projection
   *  lands on the same world point the instance occupies. Returns null if the
   *  point is behind the camera. */
  function projectTile(x: number, y: number): { x: number; y: number } | null {
    projVec.set((x - y) * 0.5, 0.25, (x + y) * 0.5).project(world.camera)
    if (projVec.z > 1 || projVec.z < -1) return null
    return {
      x: (projVec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-projVec.y * 0.5 + 0.5) * window.innerHeight,
    }
  }

  /** B2 framing regression hook: projects every 9×9 grid row center (tile
   *  map) or every staged prop position (props map) through the CURRENT
   *  camera and returns raw NDC. The QA suite asserts all values stay inside
   *  ±0.95 so the maps are fully visible with balanced margins. */
  function ndc(map: 'tile' | 'props'): { rows: Array<{ x: number; y: number; nx: number; ny: number }>; props: Array<{ name: string; nx: number; ny: number }> } {
    const rows: Array<{ x: number; y: number; nx: number; ny: number }> = []
    const props: Array<{ name: string; nx: number; ny: number }> = []
    if (map === 'tile') {
      for (let y = 0; y <= 8; y++) {
        for (let x = 0; x <= 8; x++) {
          projVec.set((x - y) * 0.5, 0.25, (x + y) * 0.5).project(world.camera)
          rows.push({ x, y, nx: projVec.x, ny: projVec.y })
        }
      }
    } else {
      for (const p of PROPS_SHOWCASE_PLACEMENTS) {
        projVec.set((p.x - p.y) * 0.5 + p.dx, TILE_TOP_Y, (p.x + p.y) * 0.5 + p.dz).project(world.camera)
        props.push({ name: p.name, nx: projVec.x, ny: projVec.y })
      }
    }
    return { rows, props }
  }

  /** Geometry inspection for the B1/B3 regression checks: NaN vertex count,
   *  world bbox, and the vertex color at the highest point (the light cap —
   *  must equal the light tone × PROP_BRIGHTNESS, not the raw hex). */
  function inspectProp(name: string): PropInspect {
    const mesh = createProp(name)
    const geo = mesh.geometry
    const pos = geo.attributes.position
    const col = geo.attributes.color
    let nanCount = 0
    let maxY = -Infinity
    let maxYIdx = -1
    const min = [Infinity, Infinity, Infinity] as [number, number, number]
    const max = [-Infinity, -Infinity, -Infinity] as [number, number, number]
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nanCount++
      if (x < min[0]) min[0] = x
      if (y < min[1]) min[1] = y
      if (z < min[2]) min[2] = z
      if (x > max[0]) max[0] = x
      if (y > max[1]) max[1] = y
      if (z > max[2]) max[2] = z
      if (y > maxY) { maxY = y; maxYIdx = i }
    }
    const maxYColor: [number, number, number] = maxYIdx >= 0
      ? [col.getX(maxYIdx), col.getY(maxYIdx), col.getZ(maxYIdx)]
      : [0, 0, 0]
    return { nanCount, bbox: { min, max }, maxYColor }
  }

  // ── Props showcase (a 7x6 mixed-terrain DIORAMA with all 15 props) ──
  // Same preview staging + studio rig as showcaseTileMap, but the tile grid
  // is a small biome diorama (reference B section 6: grass border ring,
  // diagonal dirt/sand checkerboard interior, water pool back-right, snow
  // band + lava pocket) and every prop in the library is staged sparsely and
  // asymmetrically — one prop per tile, slight offsets, themed placement
  // (flowers up the grass ridge, rocks tucked into corners, cactus on sand,
  // torch + lantern along the dirt path, snow props on snow, lava on lava).
  const PROPS_SHOWCASE_MAP: TileMapRecord[] = [
    // y=0: grass border
    { x: 0, y: 0, variant: 'grass-plain' },
    { x: 1, y: 0, variant: 'grass-plain' },
    { x: 2, y: 0, variant: 'grass-plain' },
    { x: 3, y: 0, variant: 'grass-plain' },
    { x: 4, y: 0, variant: 'grass-plain' },
    { x: 5, y: 0, variant: 'grass-plain' },
    { x: 6, y: 0, variant: 'grass-plain' },
    // y=1: dirt path start, snow band, lava pocket
    { x: 0, y: 1, variant: 'grass-plain' },
    { x: 1, y: 1, variant: 'dirt-plain' },
    { x: 2, y: 1, variant: 'dirt-plain' },
    { x: 3, y: 1, variant: 'snow-plain' },
    { x: 4, y: 1, variant: 'lava-plain' },
    { x: 5, y: 1, variant: 'lava-plain' },
    { x: 6, y: 1, variant: 'grass-plain' },
    // y=2: dirt/sand checker, snow band
    { x: 0, y: 2, variant: 'grass-plain' },
    { x: 1, y: 2, variant: 'dirt-plain' },
    { x: 2, y: 2, variant: 'sand-plain' },
    { x: 3, y: 2, variant: 'snow-plain' },
    { x: 4, y: 2, variant: 'grass-plain' },
    { x: 5, y: 2, variant: 'grass-plain' },
    { x: 6, y: 2, variant: 'grass-plain' },
    // y=3: sand band, dirt, water pool (back-right)
    { x: 0, y: 3, variant: 'grass-plain' },
    { x: 1, y: 3, variant: 'sand-plain' },
    { x: 2, y: 3, variant: 'sand-plain' },
    { x: 3, y: 3, variant: 'dirt-plain' },
    { x: 4, y: 3, variant: 'water-plain' },
    { x: 5, y: 3, variant: 'water-plain' },
    { x: 6, y: 3, variant: 'grass-plain' },
    // y=4: sand + dirt, water pool continues
    { x: 0, y: 4, variant: 'grass-plain' },
    { x: 1, y: 4, variant: 'grass-plain' },
    { x: 2, y: 4, variant: 'sand-plain' },
    { x: 3, y: 4, variant: 'dirt-plain' },
    { x: 4, y: 4, variant: 'water-plain' },
    { x: 5, y: 4, variant: 'water-plain' },
    { x: 6, y: 4, variant: 'grass-plain' },
    // y=5: grass border
    { x: 0, y: 5, variant: 'grass-plain' },
    { x: 1, y: 5, variant: 'grass-plain' },
    { x: 2, y: 5, variant: 'grass-plain' },
    { x: 3, y: 5, variant: 'grass-plain' },
    { x: 4, y: 5, variant: 'grass-plain' },
    { x: 5, y: 5, variant: 'grass-plain' },
    { x: 6, y: 5, variant: 'grass-plain' },
  ]

  // Prop placements: data tile (x, y) + local offset (dx, dz) within the
  // tile's diamond footprint. Sparse + asymmetric — one prop per tile, never
  // the tile center, slight random-feel offsets (±0.1-0.2) and themed
  // positioning per reference B section 6. The prop's local origin is its
  // base contact point; TILE_TOP_Y lifts it onto the tile top face.
  const PROPS_SHOWCASE_PLACEMENTS: Array<{ name: string; x: number; y: number; dx: number; dz: number }> = [
    // flowers up the grass ridge, grass tuft on the top border
    { name: 'flower', x: 0, y: 4, dx: -0.16, dz: 0.14 },
    { name: 'tall-grass', x: 2, y: 5, dx: 0.2, dz: -0.05 },
    // rocks tucked into grass corners
    { name: 'rock', x: 6, y: 4, dx: -0.2, dz: 0.08 },
    { name: 'bush', x: 0, y: 1, dx: -0.06, dz: -0.16 },
    // stone trio on the dirt path / sand edge, tucked into corners
    { name: 'small-stone', x: 1, y: 2, dx: 0.28, dz: 0.3 },
    { name: 'big-stone', x: 3, y: 4, dx: 0.04, dz: -0.12 },
    { name: 'pebble-cluster', x: 2, y: 4, dx: 0.26, dz: 0.3 },
    // desert on the sand band
    { name: 'cactus', x: 2, y: 2, dx: 0.02, dz: 0.06 },
    { name: 'dry-shrub', x: 2, y: 3, dx: -0.18, dz: 0.14 },
    // snow props on the snow band
    { name: 'bush-snow', x: 3, y: 2, dx: 0.06, dz: -0.08 },
    { name: 'snow-patch', x: 3, y: 1, dx: 0.04, dz: 0.02 },
    // lava on the lava pocket
    { name: 'lava-rock', x: 4, y: 1, dx: 0.02, dz: -0.02 },
    // torch + lantern along the dirt path / border edge
    { name: 'torch', x: 1, y: 1, dx: 0.36, dz: 0.08 },
    { name: 'lantern', x: 6, y: 0, dx: -0.38, dz: 0.02 },
    // gravel on the dirt path
    { name: 'gravel-patch', x: 2, y: 1, dx: -0.12, dz: -0.16 },
  ]

  async function propsShowcase(): Promise<void> {
    const validation = validateShowcaseMap(PROPS_SHOWCASE_MAP)
    if (!validation.ok) {
      throw new Error(`propsShowcase: invalid tile data (${validation.errors.length} error(s)):\n  - ${validation.errors.join('\n  - ')}`)
    }
    teardownPreview()
    const preview = beginPreviewState()
    const scene = world.scene
    const cam = world.camera
    preview.previewObjects.push(...addStudioRig())

    let composer: TileMapComposer
    try {
      composer = new TileMapComposer({
        parent: scene,
        data: PROPS_SHOWCASE_MAP,
        resolveFactory: (variant) => resolveFactory(variant),
        raycastTarget: cam,
        onHover: () => { /* props showcase is static staging — no hover test */ },
        outline: { mode: 'all' },
      })
    } catch (e) {
      teardownPreview()
      throw e
    }
    preview.onTeardown = () => {
      composer.dispose()
    }

    for (const p of PROPS_SHOWCASE_PLACEMENTS) {
      const asset = resolvePropFactory(p.name)()
      asset.position.set((p.x - p.y) * 0.5 + p.dx, TILE_TOP_Y, (p.x + p.y) * 0.5 + p.dz)
      scene.add(asset)
      preview.previewObjects.push(asset)
    }

    // Same 32° iso framing as showcaseTileMap, fitted to the 7x6 diorama
    // (world span ~5.5 x ~5.5 units). B2 (re-review): pulled back per the
    // visual-critic's numbers so the LANTERN prop (6,0) and the front border
    // row land inside NDC ±0.95 — full diorama visible, balanced margins.
    cam.position.set(0.5, 5.0, 10.0)
    cam.lookAt(0.25, 0.2, 3.3)

    markDirty()
    await waitForSettle()
  }

  // ── gotoFixture ──
  async function gotoFixture(name: string): Promise<void> {
    if (typeof name !== 'string') throw new Error('gotoFixture: name must be a string')
    const def = registry.find(f => f.name === name)
    if (!def) throw new Error(`gotoFixture: unknown fixture "${name}" (see tests/scene-fixtures.json)`)
    await reset()
    if (def.category === 'asset-preview') {
      await previewAsset(name)
      return
    }
    const setup = fixtureSetups[name]
    if (!setup) {
      throw new Error(`gotoFixture: fixture "${name}" is registered in tests/scene-fixtures.json but has no setup in src/debug/devHarness.ts`)
    }
    await setup()
    await waitForSettle()
  }

  function listFixtures(): FixtureDef[] {
    return registry
  }

  // ── Reset / leak prevention ──
  async function reset(): Promise<void> {
    // Restore the game scene if the previous fixture was a preview.
    teardownPreview()
    clearOriginMarker()
    markDirty()
    await waitForSettle()
  }

  // ── Fixture setups ──
  // Every name in tests/scene-fixtures.json MUST have a setup here; gotoFixture
  // throws a clear error otherwise. Asset-preview fixtures are dispatched by
  // category (previewAsset); showcase + demo fixtures have setups here.
  // The demo fixtures do NOT use beginPreviewState — the demo IS the boot
  // world, so teardownPreview() first restores it, then the world manager is
  // configured directly. Both fixtures reset the FOV override (canonical
  // day/night radii) and wait for the streaming queue to drain so the
  // screenshot is a fully-loaded, deterministic world even on slow software
  // renderers.
  async function waitForChunksLoaded(): Promise<void> {
    const deadline = performance.now() + 15000
    while (wm.pendingChunkLoads() > 0 && performance.now() < deadline) {
      await new Promise(r => window.setTimeout(r, 100))
    }
  }

  const fixtureSetups: Record<string, () => void | Promise<void>> = {
    'tile-showcase': () => showcaseTileMap(),
    'props-showcase': () => propsShowcase(),
    'slice-c-demo': async () => {
      teardownPreview()
      wm.setSeed(1337)
      wm.teleport(0, 0)
      wm.resetFovOverride()
      wm.setTimeOfDay(720) // noon → day fov 9
      ensureOriginMarker()
      overlay.show()
      await waitForChunksLoaded()
      markDirty()
      await waitForSettle()
    },
    'slice-c-demo-night': async () => {
      teardownPreview()
      wm.setSeed(1337)
      wm.teleport(0, 0)
      wm.resetFovOverride()
      wm.setTimeOfDay(1320) // 22:00 → night fov 5
      ensureOriginMarker()
      overlay.hide()
      await waitForChunksLoaded()
      markDirty()
      await waitForSettle()
    },
    // Round-2 spawn QA scene: the round-2 boot-to-1-tile seed (777) at noon,
    // debug overlay off, the red origin marker at the mesh center of tile
    // (8,8). The 5×5 spawn patch (max(|x|,|y|) <= 2) must be fully solid
    // grass — the marker + patch are screenshot-verified and probed by
    // tests/qa-spawn-round2.mjs.
    'qa-spawn-island-scene': async () => {
      teardownPreview()
      wm.setSeed(777)
      wm.teleport(0, 0)
      wm.resetFovOverride()
      wm.setTimeOfDay(720) // noon → day fov 9
      ensureOriginMarker()
      overlay.hide()
      await waitForChunksLoaded()
      markDirty()
      await waitForSettle()
    },
  }

  // Initial settle: ready=true shortly after page load (covers the boot world).
  markDirty()
  requestAnimationFrame(settleTick)
}