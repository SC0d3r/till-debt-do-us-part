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
import * as grassTiles from '../assets/tiles/grass'
import { TileMapComposer, type TileMapRecord, type TileMapOutlineOptions } from '../world/TileMapComposer'
import { SHOWCASE_MAP, validateShowcaseMap } from '../world/showcaseMap'

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
}

interface DebugApi {
  ready: boolean
  getState(): Record<string, unknown>
  gotoFixture(name: string): Promise<void>
  listFixtures(): FixtureDef[]
  setFastMode(enabled: boolean, renderEvery?: number, dtScale?: number): void
  previewAsset(name: string, opts?: Record<string, unknown>): Promise<void>
  showcaseTileMap(data?: TileMapRecord[], opts?: { outline?: TileMapOutlineOptions }): Promise<void>
  showcase: ShowcaseDebugHandle
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
  composer: TileMapComposer
}

export function initDevHarness(game: unknown, graph: DevHarnessGraph): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('debug')) return

  const g = game as any
  const world = graph.world

  let dirtyAt = 0
  let pendingSettles: Array<() => void> = []

  // Showcase-map debug handle. Declared before the api object because api
  // references it directly; projectTile is a hoisted function declaration, so
  // referencing it in the literal is safe.
  const showcase: ShowcaseDebugHandle = { composer: null, lastHover: null, validation: null, projectTile }
  // Reused projection scratch (event/test-driven, not per-frame).
  const projVec = new THREE.Vector3()

  const api: DebugApi = {
    ready: false,
    getState,
    gotoFixture,
    listFixtures,
    setFastMode,
    previewAsset,
    showcaseTileMap,
    showcase,
  }
  window.__debug = api

  // `?fast=1` (dev-only): re-assert the runtime side of fast QA mode. The
  // renderer-side settings (antialias/pixelRatio) were already applied at
  // construction in src/main.ts and are NOT toggleable here — acceptable
  // asymmetry, documented in TileWorld.setFastMode.
  if (params.get('fast') === '1') api.setFastMode(true)

  function setFastMode(enabled: boolean, renderEvery = 60, dtScale = 20): void {
    g.setFastMode(enabled, renderEvery, dtScale)
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
    return {
      ready: api.ready,
      started: g.started === true,
      // Additive fast-QA-mode report.
      fastMode: {
        enabled: g.fastModeEnabled === true,
        renderEvery: g.fastRenderEvery,
        dtScale: g.fastDtScale,
        // Monotonic loop-iteration counter in fast mode (incremented once per
        // loop() run). Undefined while fast mode is off.
        ticks: g.fastTickCount,
      },
    }
  }

  // ── Asset preview (category "asset-preview" fixtures) ──
  // Loads exactly one asset into a neutral studio: plain background, standard
  // 3-point rig, camera framed to fill the viewport. Deliberately separate
  // from the showcase map — asset review needs a clean, unambiguous shot with
  // no map context, lighting variance, or occlusion.
  //
  // Iterate the family's VARIANTS manifest so new variants get previews
  // automatically (no per-variant hardcoding here).
  const assetFactories: Record<string, () => THREE.Object3D> = {}
  for (const variant of Object.keys(grassTiles.VARIANTS)) {
    assetFactories[variant] = () => grassTiles.createGrassTile(variant)
  }

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
   * tile world has no HUD/overlays (project pivot, 2026-08-07), so this list
   * is empty — kept as a mechanism in case future slices add DOM.
   */
  const PREVIEW_OVERLAY_IDS: string[] = []

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
   * started flag, stop the game loop, clear the scene and swap in the neutral
   * studio background. Everything is restored by teardownPreview() in the
   * disciplined order (objects → scene → fog → background → camera →
   * overlays → started LAST).
   */
  function beginPreviewState(): PreviewState {
    const scene = world.scene
    const cam = world.camera
    // STOP the game loop for the duration of the preview. The loop gates on
    // g.started (src/main.ts): when started is false the world is considered
    // stopped (tests assert started=false during previews). Save the previous
    // value and restore it in teardownPreview; the loop is never permanently
    // stopped.
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

    const asset = factory()
    asset.position.set(0, 0, 0)
    scene.add(asset)
    preview.previewObjects.push(asset)

    // Iso framing from the south (+z): the diamond's N-S axis is vertical on
    // screen and the two front side walls are visible. Camera pulled in tight
    // so the tile fills ~60% of the frame height.
    cam.position.set(0, 1.0, 1.28)
    cam.lookAt(0, 0.2, 0)

    markDirty()
    await waitForSettle()
  }

  // ── Showcase map (the tile composer) ──
  // Same preview state as previewAsset (loop stopped, overlays hidden, clean
  // studio background) but builds the whole SHOWCASE_MAP grid through the
  // data-driven TileMapComposer and frames the camera for the entire 9x9 map.
  // Default map-level outline config: mode 'interior' (edges touching another
  // cell) — the outline color demo lives in SHOWCASE_MAP's per-record
  // outlineColor fields (green grass columns x=0..2 vs the brown biome
  // default). Tests may override the outline config via opts.
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
        // Variant STRING → grass-family factory (the composer knows nothing
        // about families; resolveFactory is the only family knowledge and it
        // lives here, in the debug harness).
        resolveFactory: (variant) => () => grassTiles.createGrassTile(variant),
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
    // previewAsset (32° elevation, camera from the south/+z) but pulled back
    // so the 9x9 lattice fits with margin.
    cam.position.set(0, 8.2, 16.8)
    cam.lookAt(0, 0.2, 4)

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
    // Saves written by previous fixture runs must not leak into the next one.
    localStorage.removeItem('till_debt_save')
    localStorage.removeItem('till_debt_farm')
    markDirty()
    await waitForSettle()
  }

  // ── Fixture setups ──
  // Every name in tests/scene-fixtures.json MUST have a setup here; gotoFixture
  // throws a clear error otherwise. Asset-preview fixtures are dispatched by
  // category (previewAsset); only the showcase fixture needs a setup.
  const fixtureSetups: Record<string, () => void | Promise<void>> = {
    'tile-showcase': () => showcaseTileMap(),
  }

  // Initial settle: ready=true shortly after page load (covers the boot world).
  markDirty()
  requestAnimationFrame(settleTick)
}