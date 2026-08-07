import * as THREE from 'three'
import { TileMapComposer } from './world/TileMapComposer'
import { SHOWCASE_MAP } from './world/showcaseMap'
import { createGrassTile } from './assets/tiles/grass'
import { initDevHarness } from './debug/devHarness'

// ─── Fast QA mode (dev-only) ───
// `?fast=1` switches the app into QA-fast mode BEFORE the renderer is built:
// cheap renderer settings and a setTimeout-driven loop with throttled renders.
// import.meta.env.DEV folds away in production builds, so the URL param can
// never do anything in prod (same gating as initDevHarness).
const FAST_MODE = import.meta.env.DEV && new URLSearchParams(location.search).get('fast') === '1'

/**
 * Tile-world composition root (project pivot, 2026-08-07).
 *
 * The Harvest-Moon farming game was deleted; the tile system is now the
 * product surface: the SHOWCASE_MAP (9x9 grass field with a dirt path, tilled
 * patch and oriented transitions) IS the world that loads at boot. There is no
 * player, no HUD, no day/night, no farm logic — just the data-driven
 * TileMapComposer rendering the grass tile family with hover highlighting.
 *
 * The dev harness gets a small composition graph (scene/camera/composer) via
 * `devGraph`; everything else stays private.
 */
class TileWorld {
  private started = true
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private composer: TileMapComposer
  // Fast QA mode (`?fast=1` / __debug.setFastMode): setTimeout-driven loop with
  // throttled renders. Runtime half toggled by the harness; renderer half fixed
  // at construction by the URL flag.
  private fastModeEnabled = FAST_MODE
  private fastRenderEvery = 60
  private fastTickCount = 0
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
    this.camera.position.set(0, 8.2, 16.8)
    this.camera.lookAt(0, 0.2, 4)

    // Same 3-point rig + soft ambient the harness's studio previews use.
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    key.position.set(3, 5, 4)
    const fill = new THREE.DirectionalLight(0xffffff, 0.35)
    fill.position.set(-3, 2, 1)
    const rim = new THREE.DirectionalLight(0xffffff, 0.3)
    rim.position.set(0, 3, -4)
    this.scene.add(ambient, key, fill, rim)

    // The showcase map is the world: variant STRING → grass-family factory
    // (the composer knows nothing about families; resolveFactory is the only
    // family knowledge and it lives here, in the composition root).
    this.composer = new TileMapComposer({
      parent: this.scene,
      data: SHOWCASE_MAP,
      resolveFactory: (variant) => () => createGrassTile(variant),
      raycastTarget: this.camera,
      outline: { mode: 'interior' },
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
      composer: this.composer,
    }
  }

  // Dev-harness only (src/debug/devHarness.ts): runtime toggle for fast QA
  // mode — switches the loop driver (rAF ↔ 4ms setTimeout) and the render
  // throttle. The renderer-side settings were fixed at construction by
  // `?fast=1` and cannot be undone at runtime — accepted asymmetry, documented
  // here. Loop-safety: the loop ALWAYS has exactly one pending continuation;
  // when switching drivers we schedule the NEW driver's continuation BEFORE
  // clearing the old one's pending handle. Repeated calls with the same
  // `enabled` are idempotent (early return; parameters are still re-applied).
  public setFastMode(enabled: boolean, renderEvery = 60, dtScale = 20): void {
    this.fastRenderEvery = Number.isFinite(renderEvery) && renderEvery >= 1 ? Math.floor(renderEvery) : 60
    this.fastTickCount = 0
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
