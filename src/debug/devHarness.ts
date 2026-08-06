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
 * The `Game` class in src/main.ts is intentionally NOT exported. This module
 * reaches into it through a single `(game as any)` cast (see `g` below).
 * Game's only public addition is `debugDispatch(action, arg)`; everything else
 * here reads/writes existing fields. If Game's internals change, keep this
 * file in sync — docs/dev-log/DEBUG_HARNESS.md Part B makes that a standing
 * rule.
 *
 * IMPORTANT: keep this module free of top-level side effects (only imports,
 * types and function declarations). Any module-scope statement that rollup
 * cannot prove pure would make the import in main.ts un-tree-shakeable and
 * leak `__debug` into the production bundle.
 */

import { PlayerState, type InventoryItem } from '../player/PlayerState'
import { TileType, type FarmGrid } from '../farm/FarmGrid'
import { CROPS, TOOLS, GAME_CONFIG } from '../data/gameData'
import { sound } from '../core/SoundManager'
import type { MineTile } from '../mine/MineSystem'
import * as THREE from 'three'
import fixtures from '../../tests/scene-fixtures.json'
import * as grassTiles from '../assets/tiles/grass'

interface FixtureDef {
  name: string
  description: string
  category: string
}

interface DebugApi {
  ready: boolean
  setState(partial: Record<string, unknown>): Promise<void>
  getState(): Record<string, unknown>
  gotoFixture(name: string): Promise<void>
  fastForward(days: number): Promise<void>
  triggerEvent(name: string, payload?: unknown): Promise<void>
  listFixtures(): FixtureDef[]
  setFastMode(enabled: boolean, renderEvery?: number, dtScale?: number): void
  previewAsset(name: string, opts?: Record<string, unknown>): Promise<void>
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
const FIXED_SEED = 42

// ─── Composition graph ───
// The harness reaches into the game through this graph of subsystem handles
// (grown as src/main.ts modularizes) plus a handful of Game fields that stay
// in the composition root (`game as any`): started/paused/slotOpen, the fast
// mode fields, setFastMode and debugDispatch. Every private member the harness
// used to poke via (game as any) routes through here instead.
export interface DevHarnessGraph {
  world: { scene: THREE.Scene; playerModel: THREE.Group; camera: THREE.PerspectiveCamera }
  player: PlayerState
  playerController: {
    getFacingTile: () => { x: number; z: number }
    useUnstuck: () => void
  }
  playerActions: {
    updateHeldVisual: () => void
  }
  mine: {
    inMine: boolean
    updateMineHUD: () => void
  }
  mineSystem: {
    currentFloor: number
    digsLeft: number
    floors: MineTile[][][]
    descend: () => void
  }
  buyer: {
    reset: () => void
  }
  ui: {
    shopOpen: boolean
    inventoryOpen: boolean
    updateHUD: (player: PlayerState) => void
    invalidateHotbarCache: () => void
    openInventory: (player: PlayerState) => void
    closeShop: () => void
    closeInventory: () => void
  }
  dialogue: {
    active: boolean
    close: () => void
    show: (id: string, onChoice?: (action: string) => void, labelOverrides?: Record<string, string>) => void
    showRaw: (speaker: string, text: string, onChoice?: (action: string) => void) => void
  }
  farm: {
    get: () => FarmGrid | null
  }
}

export function initDevHarness(game: unknown, graph: DevHarnessGraph): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('debug')) return

  const g = game as any
  const world = graph.world
  const player = graph.player
  const playerActions = graph.playerActions
  const mineCtrl = graph.mine
  const mineSys = graph.mineSystem
  const buyer = graph.buyer
  const ui = graph.ui
  const dialogue = graph.dialogue
  const farm = graph.farm
  const freshPlayer = new PlayerState()

  let dirtyAt = 0
  let pendingSettles: Array<() => void> = []

  const api: DebugApi = {
    ready: false,
    setState,
    getState,
    gotoFixture,
    fastForward,
    triggerEvent,
    listFixtures,
    setFastMode,
    previewAsset,
  }
  window.__debug = api

  // `?fast=1` (dev-only): re-assert the runtime side of fast QA mode. The
  // renderer-side settings (antialias/pixelRatio/sun shadow) were already
  // applied at construction in src/main.ts and are NOT toggleable here —
  // acceptable asymmetry, documented in Game.setFastMode.
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

  // ── Validation helpers ──
  function requireNum(v: unknown, path: string): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`setState: ${path} must be a finite number, got ${String(v)}`)
    }
    return v
  }

  function requireBool(v: unknown, path: string): boolean {
    if (typeof v !== 'boolean') {
      throw new Error(`setState: ${path} must be a boolean, got ${String(v)}`)
    }
    return v
  }

  function requireString(v: unknown, path: string): string {
    if (typeof v !== 'string') {
      throw new Error(`setState: ${path} must be a string, got ${String(v)}`)
    }
    return v
  }

  function copyInventory(value: unknown): (InventoryItem | null)[] {
    if (!Array.isArray(value)) throw new Error('setState: player.inventory must be an array')
    if (value.length > 16) {
      throw new Error(`setState: player.inventory length ${value.length} exceeds 16`)
    }
    const inv: (InventoryItem | null)[] = []
    for (let i = 0; i < value.length; i++) {
      const slot = value[i]
      if (slot === null) { inv.push(null); continue }
      if (typeof slot !== 'object' || slot === null || typeof (slot as any).id !== 'string' || typeof (slot as any).count !== 'number') {
        throw new Error(`setState: player.inventory[${i}] must be null or {id: string, count: number}`)
      }
      inv.push({ id: (slot as any).id, count: (slot as any).count })
    }
    while (inv.length < 16) inv.push(null)
    return inv
  }

  function copyRecord(value: unknown, path: string): Record<string, number> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`setState: ${path} must be an object`)
    }
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = requireNum(v, `${path}.${k}`)
    }
    return out
  }

  function copyBinItems(value: unknown, path = 'binItems'): Array<{ id: string; count: number }> {
    if (!Array.isArray(value)) throw new Error(`setState: ${path} must be an array of {id, count}`)
    return value.map((entry, i) => {
      if (typeof entry !== 'object' || entry === null || typeof (entry as any).id !== 'string' || typeof (entry as any).count !== 'number') {
        throw new Error(`setState: ${path}[${i}] must be {id: string, count: number}`)
      }
      return { id: (entry as any).id, count: (entry as any).count }
    })
  }

  // ── setState ──
  async function setState(partial: Record<string, unknown>): Promise<void> {
    if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) {
      throw new Error('setState: partial must be an object')
    }
    let playerChanged = false
    let mineChanged = false
    for (const [key, value] of Object.entries(partial)) {
      switch (key) {
        case 'player': applyPlayer(value); playerChanged = true; break
        case 'position': applyPosition(value); break
        case 'farm': applyFarm(value); break
        case 'mine': applyMine(value); mineChanged = true; break
        case 'ui': applyUi(value); break
        case 'started': applyStarted(value); break
        default:
          throw new Error(`setState: unknown key "${key}" (supported: player, position, farm, mine, ui, started)`)
      }
    }
    // Refresh visuals after any mutation.
    ui.updateHUD(player)
    playerActions.updateHeldVisual()
    if (playerChanged) ui.invalidateHotbarCache()
    if (mineChanged) mineCtrl.updateMineHUD()
    markDirty()
    await waitForSettle()
  }

  function applyPlayer(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: player must be an object')
    }
    const p = player
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      switch (k) {
        case 'gold': p.gold = requireNum(v, 'player.gold'); break
        case 'debt': p.debt = requireNum(v, 'player.debt'); break
        case 'day': p.day = requireNum(v, 'player.day'); break
        case 'timeOfDay': {
          const tod = requireNum(v, 'player.timeOfDay')
          if (!Number.isInteger(tod) || tod < 0 || tod > 1439) {
            throw new Error(`setState: player.timeOfDay must be an integer in 0..1439, got ${tod}`)
          }
          p.timeOfDay = tod
          break
        }
        case 'stamina': p.stamina = requireNum(v, 'player.stamina'); break
        case 'waterLevel': p.waterLevel = requireNum(v, 'player.waterLevel'); break
        case 'selectedSlot': p.selectedSlot = requireNum(v, 'player.selectedSlot'); break
        case 'inventory': p.inventory = copyInventory(v); break
        case 'toolTiers': p.toolTiers = copyRecord(v, 'player.toolTiers'); break
        case 'toolDurability': p.toolDurability = copyRecord(v, 'player.toolDurability'); break
        case 'introSeen': p.introSeen = requireBool(v, 'player.introSeen'); break
        case 'grimesFirstSeen': p.grimesFirstSeen = requireBool(v, 'player.grimesFirstSeen'); break
        case 'hasFarmed': p.hasFarmed = requireBool(v, 'player.hasFarmed'); break
        case 'debtPaid': p.debtPaid = requireBool(v, 'player.debtPaid'); break
        case 'grimesVisitCount': p.grimesVisitCount = requireNum(v, 'player.grimesVisitCount'); break
        case 'totalGoldEarned': p.totalGoldEarned = requireNum(v, 'player.totalGoldEarned'); break
        case 'totalItemsSold': p.totalItemsSold = requireNum(v, 'player.totalItemsSold'); break
        case 'totalItemsMined': p.totalItemsMined = requireNum(v, 'player.totalItemsMined'); break
        case 'dogPettedToday': p.dogPettedToday = requireBool(v, 'player.dogPettedToday'); break
        case 'daysWithoutPettingDog': p.daysWithoutPettingDog = requireNum(v, 'player.daysWithoutPettingDog'); break
        case 'debtDeadlineBonus': p.debtDeadlineBonus = requireNum(v, 'player.debtDeadlineBonus'); break
        default:
          throw new Error(`setState: unknown player key "${k}"`)
      }
    }
  }

  function applyPosition(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: position must be an object')
    }
    const v = value as Record<string, unknown>
    let x: number | undefined
    let z: number | undefined
    if (v.x !== undefined) x = requireNum(v.x, 'position.x')
    if (v.z !== undefined) z = requireNum(v.z, 'position.z')
    const pos = world.playerModel.position
    let minX = 0.2, maxX = GAME_CONFIG.farmWidth - 0.8
    let minZ = 0.2, maxZ = GAME_CONFIG.farmHeight - 0.8
    if (mineCtrl.inMine) {
      const fl = mineSys.floors[mineSys.currentFloor]
      const sz = fl?.length || 10
      minX = 0.3; maxX = sz - 0.3
      minZ = 0.3; maxZ = sz - 0.3
    }
    if (x !== undefined) pos.x = Math.max(minX, Math.min(maxX, x))
    if (z !== undefined) pos.z = Math.max(minZ, Math.min(maxZ, z))
    pos.y = 0
  }

  function applyFarm(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: farm must be an object')
    }
    const farmGrid = farm.get()
    if (!farmGrid) throw new Error('setState: farm is not created yet (start the game first)')
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'tiles') applyFarmTiles(farmGrid, val)
      else if (key === 'binItems') farmGrid.binItems = copyBinItems(val, 'farm.binItems')
      else throw new Error(`setState: unknown farm key "${key}" (supported: tiles, binItems)`)
    }
  }

  function applyFarmTiles(farm: any, value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: farm.tiles must be an object keyed "x,z"')
    }
    for (const [key, spec] of Object.entries(value as Record<string, unknown>)) {
      const m = /^(-?\d+),(-?\d+)$/.exec(key)
      if (!m) throw new Error(`setState: farm.tiles key "${key}" is not "x,z"`)
      const x = parseInt(m[1], 10)
      const z = parseInt(m[2], 10)
      const tile = farm.getTile(x, z)
      if (!tile) throw new Error(`setState: farm.tiles key "${key}" is out of bounds`)
      if (typeof spec !== 'object' || spec === null) {
        throw new Error(`setState: farm.tiles["${key}"] must be an object`)
      }
      for (const [sk, sv] of Object.entries(spec as Record<string, unknown>)) {
        switch (sk) {
          case 'type': tile.type = resolveTileType(sv); break
          case 'cropId': tile.cropId = sv === null ? null : requireString(sv, `farm.tiles["${key}"].cropId`); break
          case 'growthDay': tile.growthDay = requireNum(sv, `farm.tiles["${key}"].growthDay`); break
          case 'watered': tile.watered = requireBool(sv, `farm.tiles["${key}"].watered`); break
          case 'treeAge': tile.treeAge = requireNum(sv, `farm.tiles["${key}"].treeAge`); break
          default:
            throw new Error(`setState: unknown farm.tiles["${key}"] key "${sk}" (supported: type, cropId, growthDay, watered, treeAge)`)
        }
      }
      farm.updateTileVisual(x, z)
    }
  }

  function resolveTileType(value: unknown): TileType {
    if (typeof value === 'number') {
      if (TileType[value] !== undefined) return value as TileType
      throw new Error(`setState: unknown tile type number ${value}`)
    }
    if (typeof value === 'string') {
      const n = (TileType as any)[value]
      if (typeof n === 'number') return n
      throw new Error(`setState: unknown tile type name "${value}" (use a TileType enum name like "WATERED" or a number)`)
    }
    throw new Error('setState: tile type must be a number or a TileType enum name string')
  }

  function applyMine(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: mine must be an object')
    }
    const v = value as Record<string, unknown>
    const wantsIn = v.inMine === undefined ? mineCtrl.inMine : requireBool(v.inMine, 'mine.inMine')
    if (wantsIn && !mineCtrl.inMine) {
      g.debugDispatch('enterMine')
    } else if (!wantsIn && mineCtrl.inMine) {
      g.debugDispatch('exitMine')
    }
    if (v.floor !== undefined) {
      const floor = requireNum(v.floor, 'mine.floor')
      if (floor < 0 || floor >= GAME_CONFIG.mineFloors) {
        throw new Error(`setState: mine.floor ${floor} out of range 0..${GAME_CONFIG.mineFloors - 1}`)
      }
      if (mineCtrl.inMine) {
        while (mineSys.currentFloor < floor) mineSys.descend()
      }
    }
    if (v.digsLeft !== undefined) mineSys.digsLeft = requireNum(v.digsLeft, 'mine.digsLeft')
  }

  function applyUi(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('setState: ui must be an object')
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      switch (key) {
        case 'shopOpen':
          if (requireBool(val, 'ui.shopOpen')) { if (!ui.shopOpen) g.debugDispatch('openShop') }
          else { if (ui.shopOpen) g.debugDispatch('closeShop') }
          break
        case 'inventoryOpen':
          if (requireBool(val, 'ui.inventoryOpen')) { if (!ui.inventoryOpen) g.debugDispatch('openInventory') }
          else { if (ui.inventoryOpen) g.debugDispatch('closeInventory') }
          break
        case 'dialogue':
          if (val === null) {
            if (dialogue.active) dialogue.close()
          } else {
            if (typeof val !== 'object' || val === null) throw new Error('setState: ui.dialogue must be {speaker, text} or null')
            const d = val as Record<string, unknown>
            const speaker = requireString(d.speaker, 'ui.dialogue.speaker')
            const text = requireString(d.text, 'ui.dialogue.text')
            dialogue.showRaw(speaker, text)
          }
          break
        case 'slotOpen':
          if (requireBool(val, 'ui.slotOpen')) { if (!g.slotOpen) g.debugDispatch('openSlot') }
          else { if (g.slotOpen) g.debugDispatch('closeSlot') }
          break
        default:
          throw new Error(`setState: unknown ui key "${key}" (supported: shopOpen, inventoryOpen, dialogue, slotOpen)`)
      }
    }
  }

  function applyStarted(value: unknown) {
    if (requireBool(value, 'started') !== true) {
      throw new Error('setState: started=false is not supported (use gotoFixture for a fresh state)')
    }
    if (!g.started) g.debugDispatch('start')
  }

  // ── getState ──
  function getState(): Record<string, unknown> {
    const p = player
    const farmGrid = farm.get()
    const startOverlay = document.getElementById('start-overlay')
    const pauseOverlay = document.getElementById('pause-overlay')
    const paymentOverlay = document.getElementById('payment-overlay')
    const slotScreen = document.getElementById('slot-screen')
    const dialogSpeaker = document.getElementById('dialog-speaker')
    const dialogText = document.getElementById('dialog-text')
    return {
      ready: api.ready,
      started: g.started,
      paused: g.paused,
      inMine: mineCtrl.inMine,
      slotOpen: g.slotOpen,
      scene: g.slotOpen ? 'slot' : mineCtrl.inMine ? 'mine' : g.started ? 'farm' : 'menu',
      player: {
        gold: p.gold, debt: p.debt, day: p.day, timeOfDay: p.timeOfDay, stamina: p.stamina, maxStamina: p.maxStamina,
        waterLevel: p.waterLevel, maxWater: p.maxWater, selectedSlot: p.selectedSlot,
        inventory: p.inventory.map(s => s ? { id: s.id, count: s.count } : null),
        toolTiers: { ...p.toolTiers },
        toolDurability: { ...p.toolDurability },
        introSeen: p.introSeen, grimesFirstSeen: p.grimesFirstSeen, hasFarmed: p.hasFarmed,
        debtPaid: p.debtPaid, grimesVisitCount: p.grimesVisitCount,
        totalGoldEarned: p.totalGoldEarned, totalItemsSold: p.totalItemsSold, totalItemsMined: p.totalItemsMined,
        dogPettedToday: p.dogPettedToday, daysWithoutPettingDog: p.daysWithoutPettingDog,
        debtDeadlineBonus: p.debtDeadlineBonus,
      },
      position: { x: world.playerModel.position.x, y: world.playerModel.position.y, z: world.playerModel.position.z },
      farm: farmGrid ? {
        width: farmGrid.width, height: farmGrid.height,
        binItems: farmGrid.binItems.map(b => ({ id: b.id, count: b.count })),
        tiles: farmGrid.tiles.map(row => row.map(t => ({
          type: t.type, cropId: t.cropId, growthDay: t.growthDay, watered: t.watered, treeAge: t.treeAge,
        }))),
      } : null,
      mine: { currentFloor: mineSys.currentFloor, digsLeft: mineSys.digsLeft },
      ui: {
        shopOpen: ui.shopOpen,
        inventoryOpen: ui.inventoryOpen,
        dialogueActive: dialogue.active,
        startOverlayVisible: !!startOverlay && startOverlay.style.display !== 'none',
        pauseOverlayVisible: !!pauseOverlay && pauseOverlay.style.display !== 'none',
        paymentOverlayVisible: !!paymentOverlay && paymentOverlay.style.display !== 'none',
        slotScreenVisible: !!slotScreen && slotScreen.classList.contains('show'),
      },
      dialogue: {
        active: dialogue.active,
        speaker: dialogSpeaker ? dialogSpeaker.textContent : '',
        text: dialogText ? dialogText.textContent : '',
      },
      // Additive fast-QA-mode report (never changes the fields above).
      fastMode: {
        enabled: g.fastModeEnabled === true,
        renderEvery: g.fastRenderEvery,
        dtScale: g.fastDtScale,
        // Monotonic loop-iteration counter in fast mode (incremented once per
        // loop() run): lets tests measure per-TICK clock increments instead of
        // dividing by wall-clock frame counts (which broke under throttled
        // renders). Undefined while fast mode is off.
        ticks: g.fastTickCount,
      },
    }
  }

  // ── Asset preview (category "asset-preview" fixtures) ──
  // Loads exactly one asset into a neutral studio: plain background, standard
  // 3-point rig, camera framed to fill the viewport. Deliberately separate from
  // gotoFixture's in-game scenes — asset review needs a clean, unambiguous shot
  // with no gameplay context, lighting variance, or occlusion.
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
  }
  let previewState: PreviewState | null = null

  /**
   * Overlay/HUD DOM elements that must be hidden for the duration of an asset
   * preview so the screenshot is a clean studio shot of just the tile. The
   * game loop never re-shows these during a preview: the start overlay is only
   * hidden by startGame() and re-shown by the main-menu fixture setup, the
   * HUD DOM writes only touch children of #hud (which is itself hidden here),
   * and the hotbar (#inventory-bar) is a sibling of #hud that the loop writes
   * directly — hiding it here keeps it out of the shot.
   */
  const PREVIEW_OVERLAY_IDS = [
    'start-overlay',
    'pause-overlay',
    'payment-overlay',
    'slot-screen',
    'dialog-box',
    'delete-confirm-overlay',
    'shop-panel',
    'inventory-panel',
    'hud',
    'inventory-bar',
    'controls-hint',
    'fps-display',
    'unstuck-btn',
    'unstuck-hint',
    'mine-hud',
    'item-tooltip',
  ]

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

  function teardownPreview() {
    if (!previewState) return
    const scene = world.scene
    const cam = world.camera
    for (const obj of previewState.previewObjects) scene.remove(obj)
    for (const child of previewState.savedChildren) scene.add(child)
    scene.fog = previewState.savedFog
    scene.background = previewState.savedBackground
    cam.position.copy(previewState.savedCameraPos)
    cam.quaternion.copy(previewState.savedCameraQuat)
    restorePreviewOverlays(previewState.savedOverlays)
    // Restore the game loop LAST, after the scene/fog are fully restored: the
    // loop's DayNightDriver.update() dereferences scene.fog every tick when
    // started, so it must never run while fog is null.
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
    const scene = world.scene
    const cam = world.camera
    // STOP the game loop for the duration of the preview. The loop gates on
    // g.started (src/main.ts): when started is false it only renders the
    // current scene and returns — no DayNightDriver.update (which dereferences
    // scene.fog and would crash on the studio's null fog), no
    // PlayerController.updateCamera (which would fight the studio framing
    // every tick). Save the previous value and restore it in teardownPreview;
    // the loop is never permanently stopped.
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

    // Standard 3-point studio rig (key / fill / rim + soft ambient)
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    key.position.set(3, 5, 4)
    const fill = new THREE.DirectionalLight(0xffffff, 0.35)
    fill.position.set(-3, 2, 1)
    const rim = new THREE.DirectionalLight(0xffffff, 0.3)
    rim.position.set(0, 3, -4)
    scene.add(ambient, key, fill, rim)
    preview.previewObjects.push(ambient, key, fill, rim)

    const asset = factory()
    asset.position.set(0, 0, 0)
    scene.add(asset)
    preview.previewObjects.push(asset)

    // Iso framing from the south (+z): the diamond's N-S axis is vertical on
    // screen and the two front side walls are visible, like reference image 3.
    // Camera pulled in tight so the tile fills ~60% of the frame height (the
    // previous 2.7-unit distance left the shot half empty gray).
    cam.position.set(0, 1.0, 1.28)
    cam.lookAt(0, 0.2, 0)

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

  // ── fastForward ──
  async function fastForward(days: number): Promise<void> {
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      throw new Error(`fastForward: days must be a non-negative number, got ${String(days)}`)
    }
    const farmGrid = farm.get()
    if (!farmGrid) throw new Error('fastForward: game not started')
    // Exit the mine and close every overlay first, mirroring what a sleeping
    // player would do, so advancing days can't interact with an open panel.
    if (mineCtrl.inMine) g.debugDispatch('exitMine')
    if (ui.shopOpen) g.debugDispatch('closeShop')
    if (ui.inventoryOpen) g.debugDispatch('closeInventory')
    if (dialogue.active) dialogue.close()
    if (g.slotOpen) g.debugDispatch('closeSlot')
    if (g.paused) {
      g.paused = false
      const pauseOverlay = document.getElementById('pause-overlay')
      if (pauseOverlay) pauseOverlay.style.display = 'none'
      sound.resumeMusic()
    }
    for (let i = 0; i < days; i++) {
      player.advanceDay()
      farmGrid.advanceDay()
    }
    ui.updateHUD(player)
    playerActions.updateHeldVisual()
    ui.invalidateHotbarCache()
    mineCtrl.updateMineHUD()
    markDirty()
    await waitForSettle()
  }

  // ── triggerEvent ──
  async function triggerEvent(name: string, payload?: unknown): Promise<void> {
    switch (name) {
      case 'cropMatured': {
        const { x, z } = requireXZ(payload, 'cropMatured')
        const farmGrid = farm.get()
        if (!farmGrid) throw new Error('triggerEvent cropMatured: game not started')
        const tile = farmGrid.getTile(x, z)
        if (!tile) throw new Error(`triggerEvent cropMatured: no tile at ${x},${z}`)
        if (!tile.cropId) throw new Error(`triggerEvent cropMatured: no crop planted at ${x},${z}`)
        const crop = CROPS[tile.cropId]
        if (!crop) throw new Error(`triggerEvent cropMatured: unknown crop "${tile.cropId}"`)
        tile.growthDay = crop.growthDays
        farmGrid.updateTileVisual(x, z)
        break
      }
      case 'toolBroke': {
        const payloadObj = (payload ?? {}) as Record<string, unknown>
        const toolId = requireString(payloadObj.toolId, 'toolBroke.toolId')
        if (!TOOLS[toolId]) throw new Error(`triggerEvent toolBroke: unknown tool "${toolId}"`)
        player.toolDurability[toolId] = 0
        sound.error()
        dialogue.show('tool_broken')
        break
      }
      case 'buyerArrives': {
        const payloadObj = (payload ?? {}) as Record<string, unknown>
        const items = copyBinItems(payloadObj.items, 'buyerArrives.items')
        const farmGrid = farm.get()
        if (!farmGrid) throw new Error('triggerEvent buyerArrives: game not started')
        farmGrid.binItems = items
        g.debugDispatch('triggerMorningBuyer')
        break
      }
      default:
        throw new Error(`triggerEvent: unknown event "${name}" (supported: cropMatured, toolBroke, buyerArrives)`)
    }
    ui.updateHUD(player)
    playerActions.updateHeldVisual()
    ui.invalidateHotbarCache()
    markDirty()
    await waitForSettle()
  }

  function requireXZ(payload: unknown, event: string): { x: number; z: number } {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(`triggerEvent ${event}: payload must be an object with x and z`)
    }
    const p = payload as Record<string, unknown>
    return { x: requireNum(p.x, `${event}.x`), z: requireNum(p.z, `${event}.z`) }
  }

  function listFixtures(): FixtureDef[] {
    return registry
  }

  // ── Reset / leak prevention ──
  async function reset(): Promise<void> {
    // Restore the game scene if the previous fixture was an asset preview.
    teardownPreview()
    // Close every open panel/overlay so nothing leaks into the next fixture.
    if (dialogue?.active) dialogue.close()
    if (ui?.shopOpen) ui.closeShop()
    if (ui?.inventoryOpen) ui.closeInventory()
    if (g.paused) {
      g.paused = false
      const pauseOverlay = document.getElementById('pause-overlay')
      if (pauseOverlay) pauseOverlay.style.display = 'none'
      sound.resumeMusic()
    }
    if (g.slotOpen) g.debugDispatch('closeSlot')
    if (mineCtrl.inMine) g.debugDispatch('exitMine')
    const paymentOverlay = document.getElementById('payment-overlay')
    if (paymentOverlay) paymentOverlay.style.display = 'none'
    const deleteOverlay = document.getElementById('delete-confirm-overlay')
    if (deleteOverlay) deleteOverlay.style.display = 'none'
    // Remove the morning-buyer NPC if a previous triggerEvent left one walking.
    buyer.reset()
    const farmGrid = farm.get()
    if (farmGrid) farmGrid.binItems = []
    // Fresh player state: Game constructs PlayerState once in its constructor,
    // so overwrite every field from a pristine template instead of trying to
    // re-instantiate it.
    copyFreshPlayer()
    // The game loop runs during the 600ms settle window and checkStoryTriggers()
    // (src/main.ts) fires intro_1 every frame while introSeen is false — force
    // both story flags so no dialogue can pop over a fixture mid-settle.
    const freshP = player
    freshP.introSeen = true
    freshP.grimesFirstSeen = true
    // Saves written by previous fixture runs must not leak into the next one.
    localStorage.removeItem('till_debt_save')
    localStorage.removeItem('till_debt_farm')
    markDirty()
    await waitForSettle()
  }

  function copyFreshPlayer() {
    const p = player
    const f = freshPlayer
    p.gold = f.gold
    p.debt = f.debt
    p.day = f.day
    p.timeOfDay = f.timeOfDay
    p.stamina = f.stamina
    p.waterLevel = f.waterLevel
    p.selectedSlot = f.selectedSlot
    p.inventory = f.inventory.map(s => s ? { id: s.id, count: s.count } : null)
    p.toolTiers = { ...f.toolTiers }
    p.toolDurability = { ...f.toolDurability }
    p.introSeen = f.introSeen
    p.grimesFirstSeen = f.grimesFirstSeen
    p.hasFarmed = f.hasFarmed
    p.debtPaid = f.debtPaid
    p.grimesVisitCount = f.grimesVisitCount
    p.totalGoldEarned = f.totalGoldEarned
    p.totalItemsSold = f.totalItemsSold
    p.totalItemsMined = f.totalItemsMined
    p.dogPettedToday = f.dogPettedToday
    p.daysWithoutPettingDog = f.daysWithoutPettingDog
    p.debtDeadlineBonus = f.debtDeadlineBonus
  }

  // ── Fixture setups ──
  // Every name in tests/scene-fixtures.json MUST have a setup here; gotoFixture
  // throws a clear error otherwise. All non-menu fixtures start the game with a
  // fixed seed and set introSeen=true so the auto-intro dialogue never pops
  // over the screenshot (day stays 1 so Grimes never shows up either).
  const fixtureSetups: Record<string, () => void | Promise<void>> = {
    'main-menu': () => {
      // Fresh page state: do NOT start the game. The start overlay is up by
      // default; re-show it in case a previous fixture started the game.
      g.started = false
      const startOverlay = document.getElementById('start-overlay')
      if (startOverlay) startOverlay.style.display = 'flex'
    },

    'farm-day': async () => {
      g.debugDispatch('start', FIXED_SEED)
      // timeOfDay 720 (noon) keeps this baseline pixel-identical to the
      // pre-day-cycle screenshots (keyframe 720 == original sky/lights).
      await setState({ player: { introSeen: true, timeOfDay: 720 } })
    },

    'farm-crops-grown': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({
        player: { introSeen: true, timeOfDay: 720 },
        farm: {
          tiles: {
            '7,5': { type: 'WATERED', cropId: 'turnip', growthDay: CROPS.turnip.growthDays, watered: false },
            '8,5': { type: 'WATERED', cropId: 'potato', growthDay: CROPS.potato.growthDays, watered: false },
            '9,5': { type: 'WATERED', cropId: 'tomato', growthDay: CROPS.tomato.growthDays, watered: false },
            '7,6': { type: 'WATERED', cropId: 'corn', growthDay: CROPS.corn.growthDays, watered: false },
            '8,6': { type: 'WATERED', cropId: 'flower', growthDay: CROPS.flower.growthDays, watered: false },
            '9,6': { type: 'WATERED', cropId: 'rare', growthDay: CROPS.rare.growthDays, watered: false },
          },
        },
        position: { x: 8, z: 8.5 },
      })
      // Face the ripe patch (patch at z=5..6, player at z=8.5 → facing -z).
      world.playerModel.rotation.y = Math.PI
    },

    'farm-night': async () => {
      // Same ripe patch as farm-crops-grown, but at 22:00: dark indigo sky,
      // moon up, and the ripe Moonpetal (flower at 8,6) glowing.
      g.debugDispatch('start', FIXED_SEED)
      await setState({
        player: { introSeen: true, timeOfDay: 1320 },
        farm: {
          tiles: {
            '7,5': { type: 'WATERED', cropId: 'turnip', growthDay: CROPS.turnip.growthDays, watered: false },
            '8,5': { type: 'WATERED', cropId: 'potato', growthDay: CROPS.potato.growthDays, watered: false },
            '9,5': { type: 'WATERED', cropId: 'tomato', growthDay: CROPS.tomato.growthDays, watered: false },
            '7,6': { type: 'WATERED', cropId: 'corn', growthDay: CROPS.corn.growthDays, watered: false },
            '8,6': { type: 'WATERED', cropId: 'flower', growthDay: CROPS.flower.growthDays, watered: false },
            '9,6': { type: 'WATERED', cropId: 'rare', growthDay: CROPS.rare.growthDays, watered: false },
          },
        },
        position: { x: 8, z: 8.5 },
      })
      // Face the ripe patch (patch at z=5..6, player at z=8.5 → facing -z).
      world.playerModel.rotation.y = Math.PI
    },

    'shop-open': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({ player: { introSeen: true }, ui: { shopOpen: true } })
      // Scroll the shop panel to the bottom so the Upgrades section is visible
      // in the baseline screenshot.
      const shopPanel = document.getElementById('shop-panel')
      if (shopPanel) shopPanel.scrollTop = shopPanel.scrollHeight
      markDirty()
      await waitForSettle()
    },

    'inventory-open': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({ player: { introSeen: true }, ui: { inventoryOpen: true } })
    },

    'dialogue-open': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({ player: { introSeen: true } })
      // Use the REAL dialogue system (real speaker + real choice button) instead
      // of showRaw's hardcoded "Try Again" reset button. The intro is ~178 chars
      // at 25ms/char (~4.5s) — far longer than the 600ms settle — so right after
      // show() we click the dialog box to run DialogueSystem's own skip handler:
      // it clears the typewriter interval, renders the full text and calls
      // showChoices() synchronously. The settle then captures the complete intro
      // with its real choice button visible (typewriter skipped).
      dialogue.show('intro_1')
      const dialogBox = document.getElementById('dialog-box')
      if (dialogBox) dialogBox.click()
      markDirty()
      await waitForSettle()
    },

    'mine-floor-1': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({ player: { introSeen: true }, mine: { inMine: true, floor: 0 } })
    },

    'slot-machine': async () => {
      g.debugDispatch('start', FIXED_SEED)
      await setState({ player: { introSeen: true }, ui: { slotOpen: true } })
      // Populate the reel grid: open() → resetToIdle() → clearGrid(), and cells
      // only exist after a spin. The spin result is random (Math.random) —
      // acceptable for a baseline screenshot; the grid is guaranteed populated.
      g.debugDispatch('slotSpin')
      markDirty()
      await waitForSettle()
    },
  }

  // Initial settle: ready=true shortly after page load (covers main-menu).
  markDirty()
  requestAnimationFrame(settleTick)
}