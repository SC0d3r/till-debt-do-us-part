import * as THREE from 'three'
import { WorldManager } from './world/WorldManager'
import { initDevHarness } from './debug/devHarness'

// ─── Fast QA mode (dev-only) ───
// `?fast=1` switches the app into QA-fast mode BEFORE the renderer is built:
// cheap renderer settings and a setTimeout-driven loop with throttled renders.
// import.meta.env.DEV folds away in production builds, so the URL param can
// never do anything in prod (same gating as initDevHarness).
const FAST_MODE = import.meta.env.DEV && new URLSearchParams(location.search).get('fast') === '1'

// ─── World seed ───
// `?seed=<n>` overrides the default seed (1337). The world manager is PROD
// code; the seed is read at boot and stored, never the generated result.
const BOOT_SEED = Number(new URLSearchParams(location.search).get('seed') ?? 1337) | 0

/**
 * Tile-world composition root (project pivot, 2026-08-07; Slice C).
 *
 * The product surface is the Slice C demo world: a procedurally generated,
 * seeded, chunked isometric tile map (WorldManager) with a movable player
 * cube (WASD + click-to-move), camera follow, FOV fog dims and a day/night
 * lighting rig. There is no gameplay — the cube moves freely across every
 * tile. main.ts stays a thin composition root: it owns the render loop, the
 * fast-mode machinery and the resize handler; everything else lives in the
 * world manager.
 *
 * The dev harness gets a small composition graph (scene/camera/worldManager)
 * via `devGraph`; everything else stays private.
 */
class TileWorld {
  private started = true
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private worldManager: WorldManager
  // Frame clock for world updates (dt clamped to 0.05 in the manager).
  private clock = new THREE.Clock()
  // Fast QA mode (`?fast=1` / __debug.setFastMode): setTimeout-driven loop
  // with throttled renders. Runtime half toggled by the harness; renderer
  // half fixed at construction by the URL flag.
  private fastModeEnabled = FAST_MODE
  private fastRenderEvery = 60
  private fastTickCount = 0
  // Fast mode runs ~250 logical ticks/s; dtScale (default 20) rescales the
  // world update dt so the world logic runs at ~real speed in fast mode.
  private fastDtScale = 20
  // Pending loop continuations — EXACTLY ONE live at any time: fastTimer (fast
  // driver, 4ms setTimeout) XOR rafTimer (normal driver, rAF). loop() schedules
  // the next one at the top of every iteration, and setFastMode swaps drivers
  // by scheduling the new one BEFORE clearing the old one, so a driver switch
  // can never leave the loop without a pending continuation nor double-drive.
  private fastTimer: number | null = null
  private rafTimer: number | null = null

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: !FAST_MODE })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(FAST_MODE ? 1 : Math.min(window.devicePixelRatio, 2))
    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)

    // The world owns the lighting rig (day/night) — no static rig here.
    this.worldManager = new WorldManager(this.scene, this.camera, {
      seed: BOOT_SEED,
      isActive: () => this.started,
    })

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })

    this.loop()
  }

  // Dev-harness only: the composition graph the harness reads/writes.
  get devGraph() {
    return {
      world: { scene: this.scene, camera: this.camera },
      composer: null,
      worldManager: this.worldManager,
    }
  }

  // Dev-harness only (src/debug/devHarness.ts): runtime toggle for fast QA
  // mode — switches the loop driver (rAF ↔ 4ms setTimeout), the render
  // throttle, and forwards to the world manager (camera snap + InputManager
  // fast-latch). The renderer-side settings were fixed at construction by
  // `?fast=1` and cannot be undone at runtime — accepted asymmetry,
  // documented here. Loop-safety: the loop ALWAYS has exactly one pending
  // continuation; when switching drivers we schedule the NEW driver's
  // continuation BEFORE clearing the old one's pending handle. Repeated calls
  // with the same `enabled` are idempotent (early return; parameters are
  // still re-applied).
  public setFastMode(enabled: boolean, renderEvery = 60, dtScale = 20): void {
    this.fastRenderEvery = Number.isFinite(renderEvery) && renderEvery >= 1 ? Math.floor(renderEvery) : 60
    this.fastDtScale = Number.isFinite(dtScale) && dtScale >= 1 ? dtScale : 20
    this.fastTickCount = 0
    this.worldManager.setFastMode(enabled)
    if (this.fastModeEnabled === enabled) return
    this.fastModeEnabled = enabled
    if (enabled) {
      this.fastTimer = window.setTimeout(() => this.loop(), 4)
      if (this.rafTimer !== null) {
        cancelAnimationFrame(this.rafTimer)
        this.rafTimer = null
      }
    } else {
      this.rafTimer = requestAnimationFrame(this.loop)
      if (this.fastTimer !== null) {
        window.clearTimeout(this.fastTimer)
        this.fastTimer = null
      }
    }
  }

  private loop = () => {
    // Fast QA mode drives the loop with a 4ms setTimeout (~250 ticks/s);
    // normal mode keeps rAF. Schedule the next continuation for the CURRENT
    // driver before doing any work (see setFastMode).
    if (this.fastModeEnabled) {
      if (this.rafTimer !== null) { cancelAnimationFrame(this.rafTimer); this.rafTimer = null }
      this.fastTimer = window.setTimeout(() => this.loop(), 4)
    } else {
      if (this.fastTimer !== null) { window.clearTimeout(this.fastTimer); this.fastTimer = null }
      this.rafTimer = requestAnimationFrame(this.loop)
    }
    if (this.fastModeEnabled) this.fastTickCount++
    // World update every tick (dt clamped to 0.05 inside the manager); fast
    // mode rescales dt so the world runs at real-time speed. Skipped during
    // harness previews (started=false) — the manager also checks isActive.
    const dt = this.clock.getDelta() * (this.fastModeEnabled ? this.fastDtScale : 1)
    if (this.started) this.worldManager.update(dt)
    // The world always renders (started stays true; the harness flips it off
    // during asset previews, and the loop still renders the preview scene).
    if (!this.fastModeEnabled || this.fastTickCount % this.fastRenderEvery === 0) {
      this.renderer.render(this.scene, this.camera)
    }
  }
}

const game = new TileWorld()
if (import.meta.env.DEV) {
  initDevHarness(game, game.devGraph)
}