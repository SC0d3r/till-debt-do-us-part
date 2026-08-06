import * as THREE from 'three'
import { InputManager } from './core/InputManager'
import { PlayerState } from './player/PlayerState'
import { FarmGrid, TileType } from './farm/FarmGrid'
import { MineSystem } from './mine/MineSystem'
import { DialogueSystem } from './npcs/DialogueSystem'
import { UIManager } from './ui/UIManager'
import { CROPS, TOOLS, GAME_CONFIG } from './data/gameData'
import { sound } from './core/SoundManager'
import { initLang, setLang } from './core/i18n'
import { SlotMachine } from './slot/SlotMachine'
import { initDevHarness } from './debug/devHarness'
import { isNight } from './core/DayCycle'
import { WorldBuilder } from './world/WorldBuilder'
import { DayNightDriver } from './world/DayNightDriver'
import { PlayerController } from './player/PlayerController'
import { PlayerActionsController } from './player/PlayerActionsController'
import { DogController } from './npcs/DogController'
import { ShopNpcController } from './npcs/ShopNpcController'
import { MorningBuyerController } from './npcs/MorningBuyerController'
import { ShipmentController } from './economy/ShipmentController'
import { PaymentOverlay } from './ui/PaymentOverlay'
import { CoinFx } from './core/CoinFx'
import { MineController } from './mine/MineController'
import { StoryController } from './progression/StoryController'
import { SaveController } from './persistence/SaveController'
import { DebugActionRegistry } from './debug/DebugActions'
import { initRootEvents } from './core/RootEvents'

// ─── Fast QA mode (dev-only) ───
// `?fast=1` switches the game into QA-fast mode BEFORE the renderer is built:
// cheap renderer settings, a setTimeout-driven loop with throttled renders and
// a 20x in-game clock. import.meta.env.DEV folds away in production builds, so
// the URL param can never do anything in prod (same gating as initDevHarness).
const FAST_MODE = import.meta.env.DEV && new URLSearchParams(location.search).get('fast') === '1'

class Game {
  private paused = false
  private world: WorldBuilder
  private dayNight: DayNightDriver
  private playerController: PlayerController
  private actions: PlayerActionsController
  private dog: DogController
  private shopNpc: ShopNpcController
  private buyer: MorningBuyerController
  private shipment: ShipmentController
  private paymentOverlay: PaymentOverlay
  private coinFx: CoinFx
  private mineController: MineController
  private story: StoryController
  private saveController: SaveController
  private debugActions = new DebugActionRegistry()
  private input: InputManager
  private player: PlayerState
  private farm!: FarmGrid
  private mine: MineSystem
  private dialogue: DialogueSystem
  private ui: UIManager
  private clock = new THREE.Clock()
  // Shared action cooldown: decremented by the root loop ("cooldowns" slot),
  // read/written by PlayerActionsController and MineController (both mutated
  // Game.actionCooldown before the split).
  private readonly cooldowns: { actionCooldown: number } = { actionCooldown: 0 }
  private started = false
  private worldSeed = 0
  // FPS tracking
  private fpsFrames = 0
  private fpsTime = 0
  private fpsDisplay = 0
  // Unstuck cooldown (seconds remaining)
  private unstuckCooldown = 0
  private lastUnstuckBtnSec = -1
  // Slot machine (Cascade Desire casino)
  private slot: SlotMachine | null = null
  private slotOpen = false
  // True while debugDispatch('closeSlot') is closing the slot: suppresses the
  // onClosed saveGame() so a stale slot save can't land in localStorage during
  // the next debug fixture's window. Normal R-key close keeps saving.
  private _debugClosingSlot = false
  // Fast QA mode (`?fast=1` / __debug.setFastMode): setTimeout-driven loop,
  // render throttle, 20x in-game clock. Runtime half toggled by the harness;
  // renderer half fixed at construction by the URL flag.
  private fastModeEnabled = FAST_MODE
  private fastRenderEvery = 60
  private fastDtScale = 20
  private fastTickCount = 0
  // Pending loop continuations — EXACTLY ONE live at any time: fastTimer (fast
  // driver, 4ms setTimeout) XOR rafTimer (normal driver, rAF). loop() schedules
  // the next one at the top of every iteration, and setFastMode swaps drivers
  // by scheduling the new one BEFORE clearing the old one, so a driver switch
  // can never leave the loop without a pending continuation (which used to
  // freeze the game permanently) nor double-drive.
  private fastTimer: number | null = null
  private rafTimer: number | null = null
  // Set by togglePause: forces exactly ONE render on the next loop iteration
  // after a pause on/off transition (the DOM pause overlay sits on a canvas
  // that needs one fresh frame; per-tick force-renders would be render-bound).
  private pauseRenderDirty = false

  constructor() {
    // Farm-scene construction (renderer, scene, camera, lights, moon, player/
    // dog/shop models with bone refs) lives in WorldBuilder; Game wires it in.
    this.world = new WorldBuilder({ fastMode: FAST_MODE })
    this.dayNight = new DayNightDriver({
      renderer: this.world.renderer,
      scene: this.world.scene,
      ambient: this.world.ambient,
      sun: this.world.sun,
      fill: this.world.fill,
      moonMesh: this.world.moonMesh,
      camera: this.world.camera,
      updateClock: (minutes) => this.ui.updateClock(minutes),
    })
    this.input = new InputManager()
    this.input.setFastLatch(FAST_MODE)
    initLang()
    this.player = new PlayerState()
    this.mine = new MineSystem()
    this.dialogue = new DialogueSystem()
    this.ui = new UIManager()
    // NPC / economy / mine subsystems (Shipment owns the bin position; CoinFx
    // and the buyer walk around it; MineController owns the mine scene/inMine).
    this.shipment = new ShipmentController({
      player: this.player,
      playerModel: this.world.playerModel,
      pRightArm: this.world.pRightArm,
      getFarm: () => this.farm,
      updateHeldVisual: () => this.actions.updateHeldVisual(),
    })
    this.coinFx = new CoinFx({ scene: this.world.scene, binPosition: this.shipment.binPosition })
    this.paymentOverlay = new PaymentOverlay({ player: this.player, coinFx: this.coinFx })
    this.buyer = new MorningBuyerController({
      scene: this.world.scene,
      binPosition: this.shipment.binPosition,
      getFarm: () => this.farm,
      paymentPortal: {
        show: (lines, total) => this.paymentOverlay.show(lines, total),
        hide: () => this.paymentOverlay.hide(),
      },
      debugActions: this.debugActions,
    })
    this.dog = new DogController({
      dogModel: this.world.dogModel,
      dogTail: this.world.dogTail,
      player: this.player,
    })
    this.shopNpc = new ShopNpcController({
      shopNpcModel: this.world.shopNpcModel,
      shopLeftArm: this.world.shopLeftArm,
      shopRightArm: this.world.shopRightArm,
      playerModel: this.world.playerModel,
      getInMine: () => this.mineController.inMine,
    })
    this.mineController = new MineController({
      mine: this.mine,
      player: this.player,
      playerModel: this.world.playerModel,
      scene: this.world.scene,
      getFacingTile: () => this.playerController.getFacingTile(),
      playToolAnim: (type) => this.actions.playToolAnim(type),
      cooldowns: this.cooldowns,
      debugActions: this.debugActions,
    })
    // Persistence + story progression (slot onClosed + doSleep save via portal).
    this.saveController = new SaveController({
      player: this.player,
      getFarm: () => this.farm,
    })
    this.story = new StoryController({
      player: this.player,
      getFarm: () => this.farm,
      isStarted: () => this.started,
      savePortal: { saveGame: () => this.saveController.saveGame() },
      buyerPortal: {
        active: () => this.buyer.active,
        triggerMorningBuyer: () => this.buyer.triggerMorningBuyer(),
      },
      dialoguePortal: {
        active: () => this.dialogue.active,
        show: (id, cb, overrides) => this.dialogue.show(id, cb, overrides),
        showRaw: (speaker, text, cb) => this.dialogue.showRaw(speaker, text, cb),
      },
    })
    // Root-owned debug actions; subsystems register their own in constructors.
    this.debugActions.register('root', {
      start: (arg) => this.startGame(typeof arg === 'number' ? arg : undefined),
      openShop: () => this.openShop(),
      closeShop: () => this.ui.closeShop(),
      openInventory: () => this.ui.openInventory(this.player),
      closeInventory: () => this.ui.closeInventory(),
      openSlot: () => this.openSlot(),
      closeSlot: () => {
        // Force the end state synchronously (slot.close() animates a ~430ms
        // fade and only then flips flags via its onClosed callback).
        this._debugClosingSlot = true
        this.slotOpen = false
        document.body.classList.remove('slot-open')
        sound.resumeMusic()
        this.slot?.close()
      },
      slotSpin: () => {
        // Populate the reel grid (cells only exist after a spin; random result).
        if (this.slotOpen) this.slot?.pressSpin()
      },
    })
    // Player subsystems (movement + interaction hub); farm via call-time facade.
    this.playerController = new PlayerController({
      input: this.input,
      getFarm: () => this.farm,
      mine: this.mine,
      playerModel: this.world.playerModel,
      pLeftLeg: this.world.pLeftLeg,
      pRightLeg: this.world.pRightLeg,
      camera: this.world.camera,
      isStarted: () => this.started,
      getInMine: () => this.mineController.inMine,
      exitMine: () => this.mineController.exitMine(),
      isPaused: () => this.paused,
      togglePause: () => this.togglePause(),
    })
    this.actions = new PlayerActionsController({
      cooldowns: this.cooldowns,
      input: this.input,
      player: this.player,
      playerModel: this.world.playerModel,
      dogModel: this.world.dogModel,
      pLeftArm: this.world.pLeftArm,
      pRightArm: this.world.pRightArm,
      getInMine: () => this.mineController.inMine,
      facingTile: { get: () => this.playerController.getFacingTile() },
      tiredPortal: { trigger: () => this.playerController.triggerTiredAnimation() },
      dialoguePortal: {
        active: () => this.dialogue.active,
        show: (id, cb, overrides) => this.dialogue.show(id, cb, overrides),
        close: () => this.dialogue.close(),
      },
      minePortal: {
        getNearbyHole: (x, z, r) => this.mine.getNearbyHole(x, z, r),
        getExitChance: () => this.mine.getExitChance(),
        descend: () => this.mine.descend(),
        enterMine: () => this.mineController.enterMine(),
        exitMine: () => this.mineController.exitMine(),
        updateMineHUD: () => this.mineController.updateMineHUD(),
        handleMineAction: () => this.mineController.handleMineAction(),
      },
      farmPortal: {
        width: () => this.farm.width,
        height: () => this.farm.height,
        getTile: (x, z) => this.farm.getTile(x, z),
        chopTree: (x, z) => this.farm.chopTree(x, z),
        breakStone: (x, z) => this.farm.breakStone(x, z),
        clearDebris: (x, z) => this.farm.clearDebris(x, z),
        till: (x, z) => this.farm.till(x, z),
        water: (x, z) => this.farm.water(x, z),
        plant: (x, z, cropId) => this.farm.plant(x, z, cropId),
        harvest: (x, z) => this.farm.harvest(x, z),
        isRipe: (x, z) => this.farm.isRipe(x, z),
      },
      shipmentPortal: {
        isNearBin: () => this.shipment.isNearBin(),
        shipItems: () => this.shipment.shipItems(),
      },
      dogPortal: { petDog: () => this.dog.petDog() },
      storyPortal: { doSleep: () => this.story.doSleep() },
      shopPortal: { openShop: () => this.openShop() },
    })
    this.ui.setOnSelectSlot(() => this.actions.updateHeldVisual())
    // Slot machine scene (opened with R; the farm scene stops rendering while open)
    this.slot = new SlotMachine(this.player, () => this.ui.updateHUD(this.player), () => {
      this.slotOpen = false
      document.body.classList.remove('slot-open')
      sound.resumeMusic()
      if (this._debugClosingSlot) {
        // Debug-driven close (devHarness reset): skip the save.
        this._debugClosingSlot = false
      } else {
        this.saveController.saveGame()
      }
    })
    // DOM/input event wiring (start screen, pause menu, keyboard, wheel,
    // resize, volume) — handlers route back through this root's orchestration.
    initRootEvents({
      started: () => this.started,
      paused: () => this.paused,
      slotOpen: () => this.slotOpen,
      inventoryOpen: () => this.ui.inventoryOpen,
      shopOpen: () => this.ui.shopOpen,
      dialogueActive: () => this.dialogue.active,
      buyerActive: () => this.buyer.active,
      selectedSlot: {
        get: () => this.player.selectedSlot,
        set: (n) => { this.player.selectedSlot = n },
      },
      togglePause: () => this.togglePause(),
      openSlot: () => this.openSlot(),
      closeSlot: () => this.slot?.close(),
      closeInventory: () => this.ui.closeInventory(),
      closeShop: () => this.ui.closeShop(),
      closeDialogue: () => this.dialogue.close(),
      openInventory: () => this.ui.openInventory(this.player),
      pressSpin: () => this.slot?.pressSpin(),
      changeBet: (delta) => this.slot?.changeBet(delta),
      shipItems: () => this.shipment.shipItems(),
      updateHeldVisual: () => this.actions.updateHeldVisual(),
      menuSelect: () => sound.menuSelect(),
      startGame: (seed) => this.startGame(seed),
      setLang: (lang) => setLang(lang),
      setVolume: (v) => sound.setVolume(v),
      useUnstuck: () => this.playerController.useUnstuck(),
      camera: this.world.camera,
      renderer: this.world.renderer,
    })
    this.loop()
  }
  // Dev-harness only: the composition graph the harness reads/writes.
  get devGraph() {
    return {
      world: this.world,
      player: this.player,
      playerController: this.playerController,
      playerActions: this.actions,
      mine: this.mineController,
      mineSystem: this.mine,
      buyer: this.buyer,
      ui: this.ui,
      dialogue: this.dialogue,
      farm: { get: () => this.farm },
    }
  }

  // Starts a new farm. Idempotent: drops any existing farm group first.
  public startGame(seed?: number) {
    this.worldSeed = seed ?? Date.now()
    sound.init(); sound.startMusic()
    document.getElementById('start-overlay')!.style.display = 'none'
    this.started = true
    // Drop any existing farm (dispose GPU resources so repeated harness starts
    // don't leak instanced-mesh buffers).
    if (this.farm) {
      this.world.scene.remove(this.farm.group)
      this.farm.dispose()
      this.shipment.resetFarmRefs()
    }
    // Create farm with seed
    this.farm = new FarmGrid(this.worldSeed)
    this.world.scene.add(this.farm.group)

    this.saveController.loadGame()
    this.actions.updateHeldVisual()
  }

  // Dev-harness only: drives actions via the DebugActionRegistry (subsystems
  // register their own in constructors; the root registers the rest).
  debugDispatch(action: string, arg?: unknown): void {
    this.debugActions.dispatch(action, arg)
  }
  private togglePause() {
    this.paused = !this.paused
    this.pauseRenderDirty = true
    const overlay = document.getElementById('pause-overlay')!
    if (this.paused) {
      overlay.style.display = 'flex'
      document.getElementById('pause-fps')!.textContent = `${Math.round(1 / Math.max(this.clock.getDelta() || 0.016, 0.001))} FPS`
      sound.pauseMusic()
    } else {
      overlay.style.display = 'none'
      sound.resumeMusic()
      this.clock.getDelta() // reset delta
    }
  }
  // ─── SLOT MACHINE (Cascade Desire) ───
  private openSlot() {
    this.slotOpen = true
    document.body.classList.add('slot-open')
    sound.pauseMusic()
    this.slot!.open()
  }
  private loop = () => {
    // Fast QA mode drives the loop with a 4ms setTimeout (~250 ticks/s);
    // normal mode keeps rAF. This invocation consumed the one pending
    // continuation, so schedule the next one for the CURRENT driver before
    // doing any work — a mid-iteration setFastMode() always finds the pending
    // handle to swap (and never a dead loop, see setFastMode). The stray-handle
    // cleanup below is belt-and-suspenders for a continuation that fired
    // during a driver switch window.
    if (this.fastModeEnabled) {
      if (this.rafTimer !== null) { cancelAnimationFrame(this.rafTimer); this.rafTimer = null }
      this.fastTimer = window.setTimeout(() => this.loop(), 4)
    } else {
      if (this.fastTimer !== null) { window.clearTimeout(this.fastTimer); this.fastTimer = null }
      this.rafTimer = requestAnimationFrame(this.loop)
    }
    const rawDt = this.clock.getDelta()
    // Physics/movement/stamina/tools keep the 0.05 clamp even in fast mode: a
    // slow render tick must never teleport the player or fast-forward stamina
    // drain. Only the in-game clock uses the scaled timeDt below.
    const dt = Math.min(rawDt, 0.05)
    if (this.fastModeEnabled) this.fastTickCount++
    if (!this.started) { this.renderFrame(this.world.scene); return }
    // In-game clock: advances whenever the game is running and not paused, in
    // every scene (farm, mine, slot); it does NOT stop for shop/dialogue/
    // inventory. Sleep (PlayerState.advanceDay) resets it to 06:00. Fast mode
    // scales ONLY this clock: timeDt = min(rawDt, 0.25) * fastScale (20x → a QA
    // day in ~30 real seconds); the 0.25 raw cap prevents multi-hour leaps.
    if (!this.paused) {
      const timeDt = this.fastModeEnabled ? Math.min(rawDt, 0.25) * this.fastDtScale : dt
      this.player.timeOfDay = (this.player.timeOfDay + timeDt * GAME_CONFIG.minutesPerRealSecond) % 1440
    }
    // Slot machine open: farm scene is NOT rendered at all (keeps FPS high)
    if (this.slotOpen) {
      this.slot!.update(dt)
      return
    }
    if (this.paused) {
      // Force exactly ONE render per pause transition (togglePause sets
      // pauseRenderDirty), not per tick: the overlay is DOM and only needs a
      // fresh canvas backdrop once.
      if (this.pauseRenderDirty) {
        this.renderFrame(this.world.scene, true)
        this.pauseRenderDirty = false
      }
      return
    }
    this.dayNight.update(this.player.timeOfDay)
    this.playerController.updateCooldowns(dt)
    if (this.paused) this.playerController.updateUnstuckBtn()
    this.input.update()
    this.cooldowns.actionCooldown = Math.max(0, this.cooldowns.actionCooldown - dt)
    if (!this.mineController.inMine) {
      this.farm.updateRipeAnim(dt)
      this.farm.setNightGlow(isNight(this.player.timeOfDay))
    }
    if (!this.dialogue.active && !this.ui.shopOpen) {
      this.playerController.handleMovement(dt)
      this.actions.handleActions()
    }
    if (this.mineController.inMine) {
      this.mine.update(dt)
      this.mineController.collectMineItems()
      this.mineController.updateLightFollow()
    }
    if (this.buyer.active) this.buyer.update(dt)
    this.actions.updateToolAnim(dt)
    this.dog.update(dt)
    this.shopNpc.update(dt)
    this.story.checkStoryTriggers()
    this.shipment.update(dt)
    // Sweat icon above player head
    this.playerController.updateSprites(dt)
    // Dog heart icon
    this.dog.updateHeart(dt)
    // HUD DOM throttling: in fast mode the gold/day/stamina/FPS DOM writes
    // ride the render-tick throttle (every `fastRenderEvery` ticks) — game
    // state still updates every tick, only DOM writes are throttled. EXCEPTION
    // by design: the HUD clock (updateClock via updateDayCycle, below) writes
    // every tick, diff-gated to the displayed "HH:MM" string, so the DOM clock
    // tracks the live clock race-free for the clock-assertion tests.
    const hudTick = !this.fastModeEnabled || this.fastTickCount % this.fastRenderEvery === 0
    if (hudTick) this.ui.updateHUD(this.player)
    this.playerController.updateCamera(dt)
    // FPS counter (DOM write rides the same render-tick throttle in fast mode)
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsTime)
      this.fpsFrames = 0
      this.fpsTime = 0
      if (hudTick) {
        const fpsEl = document.getElementById('fps-display')
        if (fpsEl) fpsEl.textContent = `${this.fpsDisplay} FPS`
      }
    }
    // Render correct scene (forced once right after an unpause transition so
    // the canvas behind the disappearing pause overlay is fresh)
    this.renderFrame(this.mineController.inMine && this.mineController.scene ? this.mineController.scene : this.world.scene, this.pauseRenderDirty)
    this.pauseRenderDirty = false
  }

  // Single render choke point — every renderer.render call in the game loop
  // routes through here. In fast mode the main-loop call sites render only
  // every `fastRenderEvery` ticks (one SwiftShader frame takes 300-500ms);
  // force=true always renders (pause on/off transitions — one frame each).
  private renderFrame(scene: THREE.Scene, force = false) {
    if (force || !this.fastModeEnabled || this.fastTickCount % this.fastRenderEvery === 0) {
      this.world.renderer.render(scene, this.world.camera)
    }
  }
  // Dev-harness only (src/debug/devHarness.ts): runtime toggle for fast QA
  // mode — switches the loop driver (rAF ↔ 4ms setTimeout), the render
  // throttle and the in-game clock scale. The renderer-side settings were
  // fixed at construction by `?fast=1` and cannot be undone at runtime —
  // accepted asymmetry, documented here.
  //
  // Loop-safety: the loop ALWAYS has exactly one pending continuation. When
  // switching drivers we schedule the NEW driver's continuation BEFORE
  // clearing the old one's pending handle, so the chain can never die (the
  // disable path used to clear the pending setTimeout without ever scheduling
  // a rAF, permanently freezing the game) and never double-drives. Repeated
  // calls with the same `enabled` are idempotent (early return; parameters
  // are still re-applied for reconfiguration).
  public setFastMode(enabled: boolean, renderEvery = 60, dtScale = 20): void {
    this.fastRenderEvery = Number.isFinite(renderEvery) && renderEvery >= 1 ? Math.floor(renderEvery) : 60
    this.fastDtScale = Number.isFinite(dtScale) && dtScale >= 1 ? dtScale : 20
    this.fastTickCount = 0
    if (this.fastModeEnabled === enabled) return
    this.fastModeEnabled = enabled
    this.input.setFastLatch(enabled)
    if (enabled) {
      // Schedule the fast driver first, then drop the pending rAF: at every
      // instant of the switch exactly one continuation remains pending.
      this.fastTimer = window.setTimeout(() => this.loop(), 4)
      if (this.rafTimer !== null) {
        cancelAnimationFrame(this.rafTimer)
        this.rafTimer = null
      }
    } else {
      // Schedule the rAF driver first, then drop the pending fast timer.
      this.rafTimer = requestAnimationFrame(this.loop)
      if (this.fastTimer !== null) {
        window.clearTimeout(this.fastTimer)
        this.fastTimer = null
      }
    }
  }
  private openShop() {
    this.ui.openShop(this.player, (action, id) => {
      if (action === 'buy_seed') {
        const crop = CROPS[id]
        if (crop && this.player.gold >= crop.seedPrice) { this.player.gold -= crop.seedPrice; this.player.addItem(`seed_${id}`); sound.menuSelect() }
        else sound.error()
      } else if (action === 'upgrade_tool') {
        const tool = TOOLS[id]; const tier = this.player.toolTiers[id] || 1; const cost = tool.upgradeCost * tier
        if (tier < 3 && this.player.gold >= cost) { this.player.gold -= cost; this.player.toolTiers[id] = tier + 1; sound.harvest() }
        else sound.error()
      } else if (action === 'repair_tool') {
        const cost = this.player.repairTool(id)
        if (cost > 0 && this.player.gold >= cost) { this.player.gold -= cost; sound.harvest() }
        else sound.error()
      }
      this.ui.updateHUD(this.player)
      this.actions.updateHeldVisual()
    })
  }
}
const game = new Game()
if (import.meta.env.DEV) {
  initDevHarness(game, game.devGraph)
}
