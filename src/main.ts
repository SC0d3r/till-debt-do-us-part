import * as THREE from 'three'
import { InputManager } from './core/InputManager'
import { PlayerState } from './player/PlayerState'
import { FarmGrid, TileType } from './farm/FarmGrid'
import { MineSystem } from './mine/MineSystem'
import { DialogueSystem } from './npcs/DialogueSystem'
import { UIManager } from './ui/UIManager'
import { CROPS, TOOLS, GAME_CONFIG, MINE_ITEMS, MATERIAL_ITEMS, getItemInfo, TOOL_MAX_DURABILITY } from './data/gameData'
import { COLORS, getTileTexture, createTexturedPlane, createPlayerModel, createNPCModel, createDogModel, createToolMesh, createItemDropMesh, createStone, createCoinParticle, SeededRNG } from './core/MeshFactory'
import { sound } from './core/SoundManager'
import { initLang, setLang, t, getLang } from './core/i18n'

class Game {
  private paused = false
  private tiredCooldown = 0
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private mineScene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera
  private input: InputManager
  private player: PlayerState
  private farm!: FarmGrid
  private mine: MineSystem
  private dialogue: DialogueSystem
  private ui: UIManager
  private playerModel: THREE.Group
  private heldToolMesh: THREE.Group | null = null
  private npcModel: THREE.Group | null = null
  private dogModel: THREE.Group | null = null
  private shopNpcModel: THREE.Group | null = null
  private shopNpcTimer = 0
  private sweatSprite: THREE.Sprite | null = null
  private dogHeartTimer = 0
  private dogHeartSprite: THREE.Sprite | null = null
  private clock = new THREE.Clock()
  private inMine = false
  private actionCooldown = 0
  private footstepTimer = 0
  private started = false
  private camTarget = new THREE.Vector3()
  private morningBuyerActive = false
  private morningBuyerPhase: 'walking' | 'counting' | 'leaving' | 'idle' = 'idle'
  private buyerTimer = 0
  private binPosition = new THREE.Vector3(Math.floor(GAME_CONFIG.farmWidth / 2) + 2, 0.1, 0)
  private binArrowTimer = 0
  // Tool animation state
  private toolAnimTimer = 0
  private toolAnimType: 'none' | 'swing' | 'pour' | 'dig' = 'none'
  // Dog state
  private dogTimer = 0
  private dogBarkTimer = 0
  private dogState: 'idle' | 'walk' | 'bark' | 'play' = 'idle'
  private dogTargetPos = new THREE.Vector3()
  private worldSeed = 0
  // Cached bone/part references to avoid getObjectByName per frame
  private pLeftLeg!: THREE.Group
  private pRightLeg!: THREE.Group
  private pRightArm!: THREE.Group
  private pLeftArm!: THREE.Group
  private dogTail!: THREE.Group
  private shopLeftArm!: THREE.Group
  private shopRightArm!: THREE.Group
  private mineTorch: THREE.PointLight | null = null
  private minePlayerGlow: THREE.PointLight | null = null
  private mineHelmetLight: THREE.PointLight | null = null
  private mineGroundFill: THREE.PointLight | null = null
  private mineHeadSpot: THREE.SpotLight | null = null
  private binArrow: THREE.Object3D | null = null
  // FPS tracking
  private fpsFrames = 0
  private fpsTime = 0
  private fpsDisplay = 0

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(COLORS.sky)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(COLORS.sky, 18, 40)

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.set(8, 12, 14)
    this.camera.lookAt(8, 0, 6)

    // Wholesome lighting
    const ambient = new THREE.AmbientLight(0xffeedd, 0.7)
    this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xfff5e0, 0.9)
    sun.position.set(15, 20, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25
    sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3)
    fill.position.set(-10, 8, -5)
    this.scene.add(fill)

    this.input = new InputManager()
    initLang()

    // Language buttons on start screen
    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang') as 'en' | 'fa'))
    })
    // Language buttons in pause menu
    document.querySelectorAll('.lang-btn[data-pause-lang]').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-pause-lang') as 'en' | 'fa'))
    })

    // Pause menu wiring
    document.getElementById('resume-btn')!.addEventListener('click', () => this.togglePause())
    const volSlider = document.getElementById('vol-slider') as HTMLInputElement
    volSlider.addEventListener('input', () => { sound.setVolume(parseInt(volSlider.value) / 100) })

    this.player = new PlayerState()
    this.mine = new MineSystem()
    this.dialogue = new DialogueSystem()
    this.ui = new UIManager()
    this.ui.setOnSelectSlot(() => this.updateHeldVisual())

    // Player model
    this.playerModel = createPlayerModel()
    this.playerModel.position.set(1, 0, 1)
    this.playerModel.castShadow = true
    this.scene.add(this.playerModel)
    this.pLeftLeg = this.playerModel.getObjectByName('leftLeg') as THREE.Group
    this.pRightLeg = this.playerModel.getObjectByName('rightLeg') as THREE.Group
    this.pRightArm = this.playerModel.getObjectByName('this.pRightArm') as THREE.Group
    this.pLeftArm = this.playerModel.getObjectByName('this.pLeftArm') as THREE.Group

    // Dog
    this.dogModel = createDogModel()
    this.dogModel.position.set(1.5, 0, 1.5)
    this.dogModel.castShadow = true
    this.scene.add(this.dogModel)
    this.dogTail = this.dogModel.getObjectByName('tail') as THREE.Group

    // Shop NPC with table
    this.shopNpcModel = createNPCModel()
    const shopX = GAME_CONFIG.farmWidth - 1
    this.shopNpcModel.position.set(shopX, 0, 1.2)
    this.shopNpcModel.rotation.y = Math.PI // face toward farm
    this.shopNpcModel.castShadow = true
    this.scene.add(this.shopNpcModel)
    this.shopLeftArm = this.shopNpcModel.getObjectByName('this.pLeftArm') as THREE.Group
    this.shopRightArm = this.shopNpcModel.getObjectByName('this.pRightArm') as THREE.Group
    // Table in front of shop
    const tableGeo = new THREE.BoxGeometry(1.2, 0.6, 0.6)
    const tableMat = new THREE.MeshLambertMaterial({ color: 0x8b5a36 })
    const table = new THREE.Mesh(tableGeo, tableMat)
    table.position.set(shopX, 0.3, 0.5)
    table.castShadow = true
    table.receiveShadow = true
    this.scene.add(table)
    // Items on table
    for (let i = 0; i < 3; i++) {
      const itemBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.15),
        new THREE.MeshLambertMaterial({ color: [0x4a8e3a, 0xffe030, 0xe84040][i] })
      )
      itemBox.position.set(shopX - 0.3 + i * 0.3, 0.68, 0.5)
      this.scene.add(itemBox)
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ui.inventoryOpen) { this.ui.closeInventory(); return }
        if (this.ui.shopOpen) { this.ui.closeShop(); return }
        if (this.started && !this.dialogue.active && !this.morningBuyerActive) this.togglePause()
        return
      }
      if (!this.started || this.paused || this.dialogue.active || this.morningBuyerActive) return
      if (e.key === 'i' || e.key === 'I') {
        if (this.ui.inventoryOpen) this.ui.closeInventory()
        else if (!this.ui.shopOpen) this.ui.openInventory(this.player)
        return
      }
      if (this.ui.shopOpen || this.ui.inventoryOpen) return
      if (e.key >= '1' && e.key <= '8') {
        this.player.selectedSlot = parseInt(e.key) - 1
        sound.menuSelect()
        this.updateHeldVisual()
      }
      if (e.key === 'b' || e.key === 'B') this.shipItems()
    })

    // Mouse wheel to cycle inventory slots
    window.addEventListener('wheel', (e) => {
      if (!this.started || this.paused || this.dialogue.active || this.ui.shopOpen || this.ui.inventoryOpen) return
      const dir = e.deltaY > 0 ? 1 : -1
      let next = this.player.selectedSlot + dir
      if (next < 0) next = 7
      if (next > 7) next = 0
      this.player.selectedSlot = next
      sound.menuSelect()
      this.updateHeldVisual()
    })

    // Start button with seed input
    const startBtn = document.getElementById('start-btn')!
    startBtn.addEventListener('click', () => {
      const seedInput = document.getElementById('world-seed') as HTMLInputElement
      const seedVal = seedInput?.value.trim()
      this.worldSeed = seedVal ? parseInt(seedVal, 10) || this.hashString(seedVal) : Date.now()

      sound.init(); sound.startMusic()
      document.getElementById('start-overlay')!.style.display = 'none'
      this.started = true

      // Create farm with seed
      this.farm = new FarmGrid(this.worldSeed)
      this.scene.add(this.farm.group)

      if (!this.player.load()) { /* defaults */ }
      else {
        const sf = localStorage.getItem('till_debt_farm')
        if (sf) try { this.farm.loadState(JSON.parse(sf)) } catch {}
      }
      this.updateHeldVisual()
    })

    this.loop()
  }

  private hashString(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0 }
    return Math.abs(h)
  }

  private togglePause() {
    this.paused = !this.paused
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

  private sweatTimer = 0

  private triggerTiredAnimation() {
    if (this.tiredCooldown > 0) return
    this.tiredCooldown = 1.5
    this.sweatTimer = 1.0
    const bar = document.getElementById('stamina-bar')!
    const fill = document.getElementById('stamina-fill')!
    bar.classList.remove('tired-shake')
    fill.classList.remove('tired-blink')
    void bar.offsetWidth // reflow
    bar.classList.add('tired-shake')
    fill.classList.add('tired-blink')
    sound.error()
    setTimeout(() => {
      bar.classList.remove('tired-shake')
      fill.classList.remove('tired-blink')
    }, 500)
  }

  private loop = () => {
    requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (!this.started) { this.renderer.render(this.scene, this.camera); return }
    if (this.paused) { this.renderer.render(this.scene, this.camera); return }

    this.tiredCooldown = Math.max(0, this.tiredCooldown - dt)
    this.input.update()
    this.actionCooldown = Math.max(0, this.actionCooldown - dt)

    if (!this.dialogue.active && !this.ui.shopOpen) {
      this.handleMovement(dt)
      if (!this.morningBuyerActive) this.handleActions()
    }
    if (this.inMine) {
      this.mine.update(dt)
      this.collectMineItems()
      // Update torch position to follow player in mine
      if (this.mineScene) {
        // Keep player grounded
        this.playerModel.position.y = 0
        const px = this.playerModel.position.x
        const pz = this.playerModel.position.z
        if (!this.mineTorch) this.mineTorch = this.mineScene.getObjectByName('torch') as THREE.PointLight
        if (!this.minePlayerGlow) this.minePlayerGlow = this.mineScene.getObjectByName('playerGlow') as THREE.PointLight
        if (!this.mineHelmetLight) this.mineHelmetLight = this.mineScene.getObjectByName('helmetLight') as THREE.PointLight
        if (!this.mineGroundFill) this.mineGroundFill = this.mineScene.getObjectByName('groundFill') as THREE.PointLight
        if (!this.mineHeadSpot) this.mineHeadSpot = this.mineScene.getObjectByName('headSpot') as THREE.SpotLight
        if (this.mineTorch) this.mineTorch.position.set(px, 1.8, pz)
        if (this.minePlayerGlow) this.minePlayerGlow.position.set(px, 1.2, pz)
        if (this.mineHelmetLight) this.mineHelmetLight.position.set(px, 2.0, pz)
        if (this.mineGroundFill) this.mineGroundFill.position.set(px, 0.3, pz)
        if (this.mineHeadSpot) {
          const rot = this.playerModel.rotation.y
          this.mineHeadSpot.position.set(px, 1.5, pz)
          this.mineHeadSpot.target.position.set(px + Math.sin(rot) * 4, 0, pz + Math.cos(rot) * 4)
        }
      }
    }
    if (this.morningBuyerActive) this.updateMorningBuyer(dt)
    this.updateToolAnimation(dt)
    this.updateDog(dt)
    this.updateShopNpc(dt)
    this.checkStoryTriggers()
    this.binArrowTimer += dt
    if (this.farm.binGroup) {
      if (!this.binArrow) this.binArrow = this.farm.binGroup.getObjectByName('binArrow') ?? null
      if (this.binArrow) this.binArrow.position.y = 2.5 + Math.sin(this.binArrowTimer * 3) * 0.15
    }
    // Sweat icon above player head
    if (this.sweatTimer > 0) {
      this.sweatTimer -= dt
      if (!this.sweatSprite) {
        const canvas = document.createElement('canvas')
        canvas.width = 64; canvas.height = 64
        const ctx = canvas.getContext('2d')!
        ctx.font = '48px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('💦', 32, 32)
        const tex = new THREE.CanvasTexture(canvas)
        tex.magFilter = THREE.NearestFilter
        this.sweatSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
        this.sweatSprite.scale.set(0.5, 0.5, 1)
      }
      if (!this.sweatSprite.parent) {
        this.sweatSprite.position.set(0, 1.5, 0)
        this.playerModel.add(this.sweatSprite)
      }
      this.sweatSprite.material.opacity = Math.min(1, this.sweatTimer * 2)
      this.sweatSprite.position.y = 1.5 + Math.sin(this.sweatTimer * 8) * 0.05
    } else if (this.sweatSprite && this.sweatSprite.parent) {
      this.playerModel.remove(this.sweatSprite)
    }

    // Dog heart icon
    if (this.dogHeartTimer > 0) {
      this.dogHeartTimer -= dt
      if (this.dogHeartSprite && this.dogHeartSprite.parent) {
        this.dogHeartSprite.material.opacity = Math.min(1, this.dogHeartTimer)
        this.dogHeartSprite.position.y = 1.0 + Math.sin(this.dogHeartTimer * 5) * 0.1
      }
    } else if (this.dogHeartSprite && this.dogHeartSprite.parent && this.dogModel) {
      this.dogModel.remove(this.dogHeartSprite)
    }

    this.ui.updateHUD(this.player)
    this.updateCamera(dt)

    // FPS counter
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsTime)
      this.fpsFrames = 0
      this.fpsTime = 0
      const fpsEl = document.getElementById('fps-display')
      if (fpsEl) fpsEl.textContent = `${this.fpsDisplay} FPS`
    }

    // Render correct scene
    this.renderer.render(this.inMine && this.mineScene ? this.mineScene : this.scene, this.camera)
  }

  private updateCamera(dt: number) {
    const p = this.playerModel.position
    let tx: number, tz: number
    if (this.inMine) {
      tx = p.x; tz = p.z
      // Lower camera in mine so feet are visible
      this.camTarget.set(tx + 4, 6, tz + 6)
    } else {
      tx = p.x; tz = p.z
      this.camTarget.set(tx + 6, 10, tz + 10)
    }
    const lerp = 1 - Math.pow(0.005, dt)
    this.camera.position.lerp(this.camTarget, lerp)
    if (this.inMine) {
      this.camera.lookAt(p.x, 0.5, p.z)
    } else {
      this.camera.lookAt(this.camera.position.x - 6, 0, this.camera.position.z - 10)
    }
  }

  private walkTime = 0

  private handleMovement(dt: number) {
    let dx = 0, dz = 0
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) dz -= 1
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) dz += 1
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) dx -= 1
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) dx += 1

    // Leg animation
    if (dx === 0 && dz === 0) {
      this.walkTime = 0
      if (this.pLeftLeg) this.pLeftLeg.rotation.x = 0
      if (this.pRightLeg) this.pRightLeg.rotation.x = 0
      return
    }

    this.walkTime += dt * 10
    const legSwing = Math.sin(this.walkTime) * 0.5
    if (this.pLeftLeg) this.pLeftLeg.rotation.x = legSwing
    if (this.pRightLeg) this.pRightLeg.rotation.x = -legSwing

    const len = Math.sqrt(dx * dx + dz * dz)
    dx /= len; dz /= len
    const speed = 3.5 * dt
    const pos = this.playerModel.position
    const nx = pos.x + dx * speed
    const nz = pos.z + dz * speed

    this.playerModel.rotation.y = Math.atan2(dx, dz)

    if (this.inMine) {
      const fl = this.mine.floors[this.mine.currentFloor]
      const sz = fl?.length || 10
      pos.x = Math.max(0.3, Math.min(sz - 0.3, nx))
      pos.z = Math.max(0.3, Math.min(sz - 0.3, nz))
    } else {
      const margin = 0.35
      const maxX = GAME_CONFIG.farmWidth - 0.8
      const maxZ = GAME_CONFIG.farmHeight - 0.8
      // Try X movement
      const testX = Math.round(nx), curZ = Math.round(pos.z)
      let movedX = false
      if (!this.farm.isSolid(testX, curZ) || Math.abs(nx - testX) > margin) {
        pos.x = Math.max(0.2, Math.min(maxX, nx))
        movedX = true
      }
      // Try Z movement
      const curX = Math.round(pos.x), testZ = Math.round(nz)
      let movedZ = false
      if (!this.farm.isSolid(curX, testZ) || Math.abs(nz - testZ) > margin) {
        pos.z = Math.max(0.2, Math.min(maxZ, nz))
        movedZ = true
      }
      // Obstacle sliding: if blocked on intended axis, try sliding perpendicular
      if (!movedX && Math.abs(dx) > 0.1) {
        // Blocked on X, try sliding Z
        const slideZ = pos.z + dz * speed * 0.7
        const sTestZ = Math.round(slideZ)
        if (!this.farm.isSolid(Math.round(pos.x), sTestZ) || Math.abs(slideZ - sTestZ) > margin)
          pos.z = Math.max(0.2, Math.min(maxZ, slideZ))
      }
      if (!movedZ && Math.abs(dz) > 0.1) {
        // Blocked on Z, try sliding X
        const slideX = pos.x + dx * speed * 0.7
        const sTestX = Math.round(slideX)
        if (!this.farm.isSolid(sTestX, Math.round(pos.z)) || Math.abs(slideX - sTestX) > margin)
          pos.x = Math.max(0.2, Math.min(maxX, slideX))
      }
    }

    this.footstepTimer += dt
    if (this.footstepTimer > 0.3) { this.footstepTimer = 0; sound.footstep() }
  }

  private getFacingTile(): { x: number; z: number } {
    const rot = this.playerModel.rotation.y
    const fx = Math.sin(rot)
    const fz = Math.cos(rot)
    const px = this.playerModel.position.x
    const pz = this.playerModel.position.z

    // Generate candidates at multiple distances and slight offsets for forgiveness
    const candidates: Array<{x:number; z:number; score:number}> = []
    for (const dist of [1.0, 0.7, 1.3, 0.5]) {
      for (const offset of [0, 0.3, -0.3]) {
        const cx = Math.round(px + fx * dist + offset * fz)
        const cz = Math.round(pz + fz * dist - offset * fx)
        const d = Math.sqrt((cx - px)**2 + (cz - pz)**2)
        candidates.push({ x: cx, z: cz, score: d })
      }
    }
    // Also include current tile
    candidates.push({ x: Math.round(px), z: Math.round(pz), score: 0 })

    // Deduplicate
    const seen = new Set<string>()
    const unique = candidates.filter(c => {
      const key = `${c.x},${c.z}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Prefer tiles that are actionable (not plain grass/dirt) and closest
    for (const c of unique.sort((a,b) => a.score - b.score)) {
      const t = this.farm?.getTile(c.x, c.z)
      if (t && t.type !== TileType.GRASS && t.type !== TileType.DIRT) return c
    }
    return unique[0] || { x: Math.round(px), z: Math.round(pz) }
  }

  private handleActions() {
    if (this.actionCooldown > 0) return
    const interact = this.input.isJustPressed('KeyE')
    const space = this.input.isJustPressed('Space')

    // Tired check: if stamina is 0 and trying to do an action
    if (space && this.player.stamina <= 0) {
      this.triggerTiredAnimation()
      this.actionCooldown = 0.6
      return
    }

    if (interact) {
      if (this.inMine) { this.exitMine(); return }

      // Check proximity to buildings (walls count, not just center)
      const px = this.playerModel.position.x
      const pz = this.playerModel.position.z
      const buildingRange = 3.5

      const housePos = new THREE.Vector3(0, 0, 0)
      const shopPos = new THREE.Vector3(this.farm.width - 1, 0, 0)
      const minePos = new THREE.Vector3(0, 0, this.farm.height - 1)
      const wellPos = new THREE.Vector3(Math.floor(this.farm.width / 2), 0, this.farm.height - 2)

      if (px ** 2 + pz ** 2 < buildingRange ** 2) {
        this.dialogue.show('sleep_confirm', (action) => {
          if (action === 'sleep') setTimeout(() => this.doSleep(), 50)
        })
        return
      }
      if ((px - shopPos.x) ** 2 + (pz - shopPos.z) ** 2 < buildingRange ** 2) { this.openShop(); return }
      if ((px - minePos.x) ** 2 + (pz - minePos.z) ** 2 < buildingRange ** 2) { this.enterMine(); return }
      if ((px - wellPos.x) ** 2 + (pz - wellPos.z) ** 2 < buildingRange ** 2) { this.player.refillWater(); sound.water(); this.actionCooldown = 0.3; return }

      // Bin interaction via E key
      if (this.isNearBin()) {
        const sel = this.player.getSelectedItem()
        if (sel && sel.count > 0) {
          const info = getItemInfo(sel.id)
          if (info && info.sellPrice > 0 && info.type !== 'Tool') {
            this.shipItems()
            this.actionCooldown = 0.5
            return
          }
        }
      }

      // Dog petting
      if (this.dogModel) {
        const dogDist = this.playerModel.position.distanceTo(this.dogModel.position)
        if (dogDist < 2.5) {
          this.petDog()
          return
        }
      }

      // Fallback: check facing tile for other interactions
      const { x, z } = this.getFacingTile()
      const ft = this.farm.getTile(x, z)
      if (!ft) return
      if (ft.type === TileType.HOUSE) {
        this.dialogue.show('sleep_confirm', (action) => {
          if (action === 'sleep') this.doSleep()
        })
        return
      }
      if (ft.type === TileType.SHOP) { this.openShop(); return }
      if (ft.type === TileType.MINE) { this.enterMine(); return }
      if (ft.type === TileType.WELL) { this.player.refillWater(); sound.water(); this.actionCooldown = 0.3; return }
      return
    }

    if (!space) return
    if (this.inMine) { this.handleMineAction(); return }

    // Throw to bin when near it
    if (this.isNearBin()) {
      const sel = this.player.getSelectedItem()
      if (sel && sel.count > 0) {
        const info = getItemInfo(sel.id)
        if (info && info.sellPrice > 0 && info.type !== 'Tool') {
          this.shipItems()
          this.actionCooldown = 0.5
          return
        }
      }
    }

    const { x, z } = this.getFacingTile()
    const ft = this.farm.getTile(x, z)
    if (!ft) return
    if ([TileType.HOUSE, TileType.SHOP, TileType.MINE, TileType.WELL, TileType.WATER, TileType.BIN, TileType.FENCE].includes(ft.type)) return

    const sel = this.player.getSelectedItem()
    const tier = this.player.toolTiers

    // Check tool durability
    const checkDurability = (toolId: string): boolean => {
      if (this.player.getToolDurability(toolId) <= 0) {
        sound.error()
        this.dialogue.show('tool_broken')
        return false
      }
      return true
    }

    if (sel?.id === 'axe') {
      if (!checkDurability('axe')) return
      if (ft.type === TileType.TREE || ft.type === TileType.SMALL_TREE || ft.type === TileType.SAPLING) {
        if (this.player.useStamina(TOOLS.axe.staminaCost - (tier.axe - 1))) {
          this.farm.chopTree(x, z)
          this.player.addItem('wood', ft.type === TileType.TREE ? 3 : ft.type === TileType.SMALL_TREE ? 2 : 1)
          this.player.useToolDurability('axe')
          this.playToolAnim('swing')
          this.actionCooldown = 0.5
        } else sound.error()
      } else if (ft.type === TileType.STUMP) {
        if (this.player.useStamina(TOOLS.axe.staminaCost - (tier.axe - 1))) {
          this.farm.clearDebris(x, z); this.player.addItem('wood', 1)
          this.player.useToolDurability('axe')
          this.playToolAnim('swing')
          this.actionCooldown = 0.4
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'pickaxe') {
      if (!checkDurability('pickaxe')) return
      if (ft.type === TileType.STONE || ft.type === TileType.ROCK) {
        if (this.player.useStamina(TOOLS.pickaxe.staminaCost - (tier.pickaxe - 1))) {
          this.farm.breakStone(x, z)
          this.player.addItem('stone_item', 1 + Math.floor(Math.random() * 2))
          this.player.useToolDurability('pickaxe')
          this.playToolAnim('swing')
          this.actionCooldown = 0.5
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'hoe') {
      if (!checkDurability('hoe')) return
      if (ft.type === TileType.WEED) {
        if (this.player.useStamina(TOOLS.hoe.staminaCost - (tier.hoe - 1))) {
          this.farm.clearDebris(x, z)
          this.player.useToolDurability('hoe')
          this.playToolAnim('dig')
          this.actionCooldown = 0.35
        } else sound.error()
      } else if (ft.type === TileType.DIRT || ft.type === TileType.GRASS) {
        if (this.player.useStamina(TOOLS.hoe.staminaCost - (tier.hoe - 1))) {
          this.farm.till(x, z)
          this.player.useToolDurability('hoe')
          this.playToolAnim('dig')
          this.actionCooldown = 0.35
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'water') {
      if (this.player.waterLevel <= 0) { this.dialogue.show('no_water'); sound.error(); return }
      if (ft.type === TileType.TILLED || (ft.cropId && !ft.watered)) {
        if (this.player.useStamina(TOOLS.water.staminaCost - (tier.water - 1))) {
          this.player.useWater()
          this.farm.water(x, z)
          this.playToolAnim('pour')
          this.actionCooldown = 0.4
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'shovel') {
      if (!checkDurability('shovel')) return
      if (ft.type === TileType.WEED || ft.type === TileType.STUMP) {
        if (this.player.useStamina(TOOLS.shovel.staminaCost - (tier.shovel - 1))) {
          this.farm.clearDebris(x, z)
          this.player.useToolDurability('shovel')
          this.playToolAnim('dig')
          this.actionCooldown = 0.35
        } else sound.error()
      } else sound.error()
      return
    }

      if (sel?.id.startsWith('seed_')) {
      if (ft.type !== TileType.TILLED && ft.type !== TileType.WATERED) {
        sound.error()
        return
      }
      const cropId = sel.id.replace('seed_', '')
      if (this.farm.plant(x, z, cropId)) {
        this.player.removeItem(sel.id)
        this.updateHeldVisual() // clears ghost if no more seeds
        this.actionCooldown = 0.25
      } else sound.error()
      return
    }

    // Harvest
    if (this.farm.isRipe(x, z)) {
      const cropId = this.farm.harvest(x, z)
      if (cropId) {
        this.showHarvestAnim(cropId)
        this.player.addItem(cropId)
        this.actionCooldown = 0.3
      }
    }
  }

  // ─── TOOL ANIMATIONS ───
  private playToolAnim(type: 'swing' | 'pour' | 'dig') {
    this.toolAnimType = type
    this.toolAnimTimer = 0
  }

  private updateToolAnimation(dt: number) {
    if (this.toolAnimType === 'none') return
    this.toolAnimTimer += dt

    
    
    if (!this.pRightArm) return

    const duration = this.toolAnimType === 'pour' ? 0.6 : 0.35
    const t = Math.min(this.toolAnimTimer / duration, 1)
    const sel = this.player.getSelectedItem()

    if (this.toolAnimType === 'swing') {
      // Axe/pickaxe: big overhead swing arc
      const swingAngle = Math.sin(t * Math.PI)
      this.pRightArm.rotation.x = -swingAngle * 2.2
      this.pRightArm.rotation.z = swingAngle * 0.4
      if (this.pLeftArm) { this.pLeftArm.rotation.x = -swingAngle * 0.8; this.pLeftArm.rotation.z = -swingAngle * 0.2 }
      // Tool mesh wobbles during swing
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.3 - swingAngle * 0.5
      }
    } else if (this.toolAnimType === 'pour') {
      // Watering can: tilt forward and pour
      const pourT = Math.sin(t * Math.PI)
      this.pRightArm.rotation.x = -0.8 - pourT * 1.0
      this.pRightArm.rotation.z = pourT * 0.3
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.5 - pourT * 0.8
      }
    } else if (this.toolAnimType === 'dig') {
      // Hoe/shovel: downward digging motion
      const digT = Math.sin(t * Math.PI)
      this.pRightArm.rotation.x = -digT * 1.4
      this.pRightArm.rotation.z = 0
      if (this.pLeftArm) { this.pLeftArm.rotation.x = -digT * 0.5 }
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.3 - digT * 0.6
      }
    }

    if (t >= 1) {
      this.toolAnimType = 'none'
      this.pRightArm.rotation.set(0, 0, 0)
      if (this.pLeftArm) this.pLeftArm.rotation.set(0, 0, 0)
      // Reset tool mesh to held position
      if (this.heldToolMesh && sel) {
        if (sel.id === 'water') {
          this.heldToolMesh.position.set(0, 0.35, 0.1)
          this.heldToolMesh.rotation.x = -0.5
        } else {
          this.heldToolMesh.position.set(0, -0.15, 0.15)
          this.heldToolMesh.rotation.x = -0.3
        }
      }
    }
  }

  private showHarvestAnim(itemId: string) {
    // Phase 1: Hold big item above head with both hands
    const mesh = createItemDropMesh(itemId, true)
    mesh.position.set(0, 1.5, 0)
    this.playerModel.add(mesh)

    // Raise both arms
    
    
    if (this.pLeftArm) this.pLeftArm.rotation.x = -2.5
    if (this.pRightArm) this.pRightArm.rotation.x = -2.5

    let phase = 0 // 0=hold, 1=throw
    let t = 0
    const binPos = this.binPosition.clone()

    const anim = () => {
      t += 0.025
      if (phase === 0) {
        // Hold above head, slight bob
        mesh.position.y = 1.5 + Math.sin(t * 6) * 0.05
        mesh.rotation.y += 0.08
        if (t > 0.8) {
          // Phase 2: Throw toward bin
          phase = 1
          t = 0
          this.playerModel.remove(mesh)
          // Get world position for thrown item
          const worldPos = new THREE.Vector3()
          this.playerModel.getWorldPosition(worldPos)
          worldPos.y = 1.5
          mesh.position.copy(worldPos)
          this.scene.add(mesh)
          // Reset arms
          if (this.pLeftArm) this.pLeftArm.rotation.x = 0
          if (this.pRightArm) this.pRightArm.rotation.x = 0
        }
        requestAnimationFrame(anim)
      } else {
        // Arc toward bin
        const progress = Math.min(t / 0.5, 1)
        const startPos = new THREE.Vector3(this.playerModel.position.x, 1.5, this.playerModel.position.z)
        mesh.position.lerpVectors(startPos, binPos, progress)
        mesh.position.y += Math.sin(progress * Math.PI) * 1.5 // Arc height
        mesh.rotation.x += 0.2
        mesh.rotation.y += 0.15
        if (progress >= 1) {
          this.scene.remove(mesh)
          sound.collect()
        } else {
          requestAnimationFrame(anim)
        }
      }
    }
    anim()
  }

  private updateHeldVisual() {
    if (this.heldToolMesh) { this.playerModel.remove(this.heldToolMesh); this.heldToolMesh = null }
    
    
    if (this.pLeftArm) this.pLeftArm.rotation.set(0, 0, 0)
    if (this.pRightArm) this.pRightArm.rotation.set(0, 0, 0)

    const sel = this.player.getSelectedItem()
    if (!sel) return

    if (TOOLS[sel.id]) {
      this.heldToolMesh = createToolMesh(sel.id)
      
      if (this.pRightArm) {
        // Watering can held above head when selected
        if (sel.id === 'water') {
          this.heldToolMesh.position.set(0, 0.35, 0.1)
          this.heldToolMesh.rotation.x = -0.5
        } else {
          this.heldToolMesh.position.set(0, -0.15, 0.15)
          this.heldToolMesh.rotation.x = -0.3
        }
        this.pRightArm.add(this.heldToolMesh)
      }
    } else if (sel.id.startsWith('seed_')) {
      // Seeds: big emoji sprite held above head with both hands, touching
      const itemMesh = createItemDropMesh(sel.id)
      itemMesh.position.set(0, 1.35, 0.25)
      itemMesh.scale.set(2.5, 2.5, 2.5)
      this.playerModel.add(itemMesh)
      this.heldToolMesh = itemMesh as unknown as THREE.Group
      const la = this.playerModel.getObjectByName('this.pLeftArm') as THREE.Group | undefined
      const ra = this.playerModel.getObjectByName('this.pRightArm') as THREE.Group | undefined
      if (la) la.rotation.x = -2.6
      if (ra) ra.rotation.x = -2.6
    } else {
      // Other items: emoji sprite held above head with both hands, touching
      const itemMesh = createItemDropMesh(sel.id)
      itemMesh.position.set(0, 1.35, 0.25)
      itemMesh.scale.set(2.0, 2.0, 2.0)
      this.playerModel.add(itemMesh)
      this.heldToolMesh = itemMesh as unknown as THREE.Group
      const la = this.playerModel.getObjectByName('this.pLeftArm') as THREE.Group | undefined
      const ra = this.playerModel.getObjectByName('this.pRightArm') as THREE.Group | undefined
      if (la) la.rotation.x = -2.5
      if (ra) ra.rotation.x = -2.5
    }
  }

  // ─── DOG NPC ───
  private petDog() {
    if (this.dogHeartTimer > 0) return
    this.dogHeartTimer = 2.0
    sound.menuSelect()
    if (!this.dogHeartSprite) {
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')!
      ctx.font = '48px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('❤️', 32, 32)
      const tex = new THREE.CanvasTexture(canvas)
      tex.magFilter = THREE.NearestFilter
      this.dogHeartSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
      this.dogHeartSprite.scale.set(0.6, 0.6, 1)
    }
    if (!this.dogHeartSprite.parent && this.dogModel) {
      this.dogHeartSprite.position.set(0, 1.0, 0)
      this.dogModel.add(this.dogHeartSprite)
    }
  }

  private updateDog(dt: number) {
    if (!this.dogModel) return
    this.dogTimer += dt
    this.dogBarkTimer += dt

    

    switch (this.dogState) {
      case 'idle':
        // Wag tail slowly
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.dogTimer * 3) * 0.3
        // Random bark
        if (this.dogBarkTimer > 8 + Math.random() * 15) {
          this.dogState = 'bark'
          this.dogTimer = 0
          this.dogBarkTimer = 0
          sound.menuSelect() // bark placeholder
        }
        // Random walk
        if (this.dogTimer > 3 + Math.random() * 5) {
          this.dogState = 'walk'
          this.dogTimer = 0
          // Pick random spot across the whole farm
          this.dogTargetPos.set(
            1 + Math.random() * (GAME_CONFIG.farmWidth - 2),
            0,
            1 + Math.random() * (GAME_CONFIG.farmHeight - 2)
          )
        }
        break

      case 'walk':
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.dogTimer * 8) * 0.5
        const dir = new THREE.Vector3().subVectors(this.dogTargetPos, this.dogModel.position)
        dir.y = 0
        const dist = dir.length()
        if (dist > 0.2) {
          dir.normalize()
          // Face the direction of movement (dog model faces +X, so offset by -PI/2)
          this.dogModel.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2
          this.dogModel.position.add(dir.multiplyScalar(1.5 * dt))
        } else {
          this.dogState = Math.random() > 0.5 ? 'play' : 'idle'
          this.dogTimer = 0
        }
        break

      case 'bark':
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.dogTimer * 12) * 0.6
        // Head bob
        this.dogModel.children[1].position.y = 0.35 + Math.sin(this.dogTimer * 15) * 0.03
        if (this.dogTimer > 0.5) {
          this.dogState = 'idle'
          this.dogTimer = 0
          this.dogModel.children[1].position.y = 0.35
        }
        break

      case 'play':
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.dogTimer * 15) * 0.8
        // Spin in circle
        this.dogModel.rotation.y += 3 * dt
        if (this.dogTimer > 1.5) {
          this.dogState = 'idle'
          this.dogTimer = 0
        }
        break
    }
  }

  // ─── SHOP NPC ───
  private updateShopNpc(dt: number) {
    if (!this.shopNpcModel || this.inMine) return
    this.shopNpcTimer += dt
    const t = this.shopNpcTimer

    // Face toward player when nearby
    const dist = this.playerModel.position.distanceTo(this.shopNpcModel.position)
    if (dist < 5) {
      const dx = this.playerModel.position.x - this.shopNpcModel.position.x
      const dz = this.playerModel.position.z - this.shopNpcModel.position.z
      const targetRot = Math.atan2(dx, dz)
      // Smooth rotation
      let diff = targetRot - this.shopNpcModel.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.shopNpcModel.rotation.y += diff * 3 * dt
    }

    // Skip idle animation when far away (not visible through fog)
    if (dist > 20) return

    // Idle animations: gentle sway and arm movement
    // Gentle body sway
    this.shopNpcModel.children[0].rotation.z = Math.sin(t * 1.5) * 0.03
    // Arms: one hand on hip, other gestures occasionally
    if (this.shopLeftArm) this.shopLeftArm.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.1
    if (this.shopRightArm) this.shopRightArm.rotation.x = -0.5 + Math.sin(t * 1.2) * 0.15
    // Head nod when player is close
    if (dist < 3) {
      const head = this.shopNpcModel.children[1]
      if (head) head.rotation.x = Math.sin(t * 2) * 0.05
    }
  }

  // ─── SHIPPING BIN ───
  private isNearBin(): boolean {
    const dist = this.playerModel.position.distanceTo(this.binPosition)
    return dist < 3.5
  }

  private shipItems() {
    const sel = this.player.getSelectedItem()
    if (!sel || sel.count <= 0) { sound.error(); return }
    const info = getItemInfo(sel.id)
    if (!info || info.sellPrice <= 0 || info.type === 'Tool') { sound.error(); return }

    const count = sel.count
    this.player.removeItem(sel.id, count)
    this.farm.addToBin(sel.id, count)
    this.updateHeldVisual()

    // Bin wobble animation
    if (this.farm.binGroup) {
      const bin = this.farm.binGroup
      let wt = 0
      const wobble = () => {
        wt += 0.15
        bin.rotation.z = Math.sin(wt * 8) * 0.06 * Math.max(0, 1 - wt / 1.5)
        bin.rotation.x = Math.cos(wt * 6) * 0.04 * Math.max(0, 1 - wt / 1.5)
        if (wt < 1.5) requestAnimationFrame(wobble)
        else { bin.rotation.z = 0; bin.rotation.x = 0 }
      }
      wobble()
    }

    // Only one sound (addToBin already plays collect)

    // Hand throw animation
    
    if (this.pRightArm) {
      const origRot = this.pRightArm.rotation.x
      this.pRightArm.rotation.x = -2.0
      setTimeout(() => { this.pRightArm.rotation.x = origRot }, 300)
    }
  }

  // ─── MORNING BUYER NPC ───
  private triggerMorningBuyer() {
    const items = this.farm.clearBin()
    if (items.length === 0) return

    this.morningBuyerActive = true
    this.morningBuyerPhase = 'walking'
    this.buyerTimer = 0

    this.npcModel = createNPCModel()
    this.npcModel.position.set(0, 0, -2)
    this.npcModel.rotation.y = Math.PI
    this.scene.add(this.npcModel)

    let totalGold = 0
    const lines: Array<{name:string; count:number; price:number; total:number}> = []
    for (const item of items) {
      const info = getItemInfo(item.id)
      const price = info?.sellPrice || 0
      const lineTotal = price * item.count
      totalGold += lineTotal
      lines.push({ name: info?.name || item.id, count: item.count, price, total: lineTotal })
    }

    ;(this as any)._buyerLines = lines
    ;(this as any)._buyerTotal = totalGold
  }

  private updateMorningBuyer(dt: number) {
    this.buyerTimer += dt
    const npc = this.npcModel
    if (!npc) return

    if (this.morningBuyerPhase === 'walking') {
      const dir = new THREE.Vector3().subVectors(this.binPosition, npc.position).normalize()
      const dist = npc.position.distanceTo(this.binPosition)
      if (dist > 0.5) {
        npc.position.add(dir.multiplyScalar(2.5 * dt))
        npc.rotation.y = Math.atan2(dir.x, dir.z)
      } else {
        this.morningBuyerPhase = 'counting'
        this.buyerTimer = 0
        this.showPaymentOverlay()
      }
    } else if (this.morningBuyerPhase === 'counting') {
      if (this.buyerTimer > 3) {
        this.morningBuyerPhase = 'leaving'
        this.buyerTimer = 0
        document.getElementById('payment-overlay')!.style.display = 'none'
      }
    } else if (this.morningBuyerPhase === 'leaving') {
      const exitPos = new THREE.Vector3(0, 0, -3)
      const dir = new THREE.Vector3().subVectors(exitPos, npc.position).normalize()
      const dist = npc.position.distanceTo(exitPos)
      if (dist > 0.3) {
        npc.position.add(dir.multiplyScalar(2.5 * dt))
        npc.rotation.y = Math.atan2(dir.x, dir.z)
      } else {
        this.scene.remove(npc)
        this.npcModel = null
        this.morningBuyerActive = false
        this.morningBuyerPhase = 'idle'
      }
    }
  }

  private showPaymentOverlay() {
    const lines = (this as any)._buyerLines as Array<{name:string; count:number; price:number; total:number}>
    const total = (this as any)._buyerTotal as number

    const overlay = document.getElementById('payment-overlay')!
    const linesEl = document.getElementById('pay-lines')!
    const totalEl = document.getElementById('pay-total')!

    linesEl.innerHTML = ''
    lines.forEach((line, i) => {
      const div = document.createElement('div')
      div.className = 'pay-line'
      div.innerHTML = `<span>${line.name} x${line.count}</span><span class="pay-amt">+${line.total}g</span>`
      div.style.opacity = '0'; div.style.transform = 'translateX(-20px)'; div.style.transition = 'all 0.4s ease-out'
      linesEl.appendChild(div)
      setTimeout(() => {
        div.style.opacity = '1'; div.style.transform = 'translateX(0)'
        sound.menuSelect()
        // Spawn coin particles for each line
        this.spawnCoinParticles(3)
      }, i * 500)
    })

    totalEl.textContent = ''
    setTimeout(() => {
      let current = 0
      const step = Math.max(1, Math.floor(total / 25))
      const countInterval = setInterval(() => {
        current = Math.min(current + step, total)
        totalEl.textContent = `💰 ${current}g`
        totalEl.style.transform = `scale(${1 + Math.sin(current * 0.1) * 0.05})`
        if (current >= total) {
          clearInterval(countInterval)
          this.player.gold += total
          totalEl.style.transform = 'scale(1.2)'
          setTimeout(() => { totalEl.style.transform = 'scale(1)' }, 200)
          sound.harvest()
          this.spawnCoinParticles(15)
        }
      }, 40)
    }, lines.length * 500 + 300)

    overlay.style.display = 'block'
  }

  private spawnCoinParticles(count: number) {
    for (let i = 0; i < count; i++) {
      const coin = createCoinParticle()
      const startX = this.binPosition.x + (Math.random() - 0.5) * 2
      const startZ = this.binPosition.z + (Math.random() - 0.5) * 2
      coin.position.set(startX, 1.5, startZ)
      this.scene.add(coin)
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3)
      let t = 0
      const anim = () => {
        t += 0.02
        vel.y -= 9.8 * 0.02
        coin.position.add(vel.clone().multiplyScalar(0.02))
        coin.rotation.x += 0.15
        coin.rotation.z += 0.1
        if (coin.position.y < 0 || t > 2) {
          this.scene.remove(coin)
        } else {
          requestAnimationFrame(anim)
        }
      }
      setTimeout(() => requestAnimationFrame(anim), i * 50)
    }
  }

  // ─── MINE SCENE TRANSITION ───
  private enterMine() {
    this.inMine = true
    this.mine.enter()
    this.playerModel.position.set(0.5, 0, 0.5)

    this.mineScene = new THREE.Scene()
    this.mineScene.fog = new THREE.Fog(0x3a3028, 5, 25)
    this.mineScene.background = new THREE.Color(0x2a2018)

    const fl = this.mine.floors[this.mine.currentFloor]
    const sz = fl?.length || 10

    // Much brighter mine for visibility
    this.mineScene.add(new THREE.AmbientLight(0x887766, 1.0))
    const torch = new THREE.PointLight(0xffcc66, 3.0, 25)
    torch.position.set(0.5, 3, 0.5)
    torch.name = 'torch'
    this.mineScene.add(torch)
    const fillLight = new THREE.PointLight(0xddccbb, 1.5, 35)
    fillLight.position.set(sz / 2, 4, sz / 2)
    this.mineScene.add(fillLight)
    // Helmet light
    const helmetLight = new THREE.PointLight(0xffffee, 2.5, 16)
    helmetLight.position.set(0.5, 2.0, 0.5)
    helmetLight.name = 'helmetLight'
    this.mineScene.add(helmetLight)
    // Forward spotlight
    const headSpot = new THREE.SpotLight(0xffeedd, 3.0, 20, Math.PI / 3, 0.3, 1)
    headSpot.position.set(0.5, 1.8, 0.5)
    headSpot.target.position.set(0.5, 0, 3)
    headSpot.name = 'headSpot'
    this.mineScene.add(headSpot)
    this.mineScene.add(headSpot.target)
    const playerGlow = new THREE.PointLight(0xffeedd, 1.5, 10)
    playerGlow.position.set(0.5, 1.2, 0.5)
    playerGlow.name = 'playerGlow'
    this.mineScene.add(playerGlow)
    // Ground-level fill to show feet
    const groundFill = new THREE.PointLight(0xaa9977, 0.8, 8)
    groundFill.position.set(0.5, 0.3, 0.5)
    groundFill.name = 'groundFill'
    this.mineScene.add(groundFill)

    this.mineScene.add(this.playerModel)
    this.mineScene.add(this.mine.group)

    const floorTex = getTileTexture('mineFloor')
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(3, 3)
    const floorGeo = new THREE.PlaneGeometry(sz + 8, sz + 8)
    floorGeo.rotateX(-Math.PI / 2)
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: floorTex }))
    floorMesh.position.set(sz / 2 - 0.5, -0.01, sz / 2 - 0.5)
    floorMesh.receiveShadow = true
    this.mineScene.add(floorMesh)

    const mineRng = new SeededRNG(this.mine.currentFloor * 1337)
    for (let i = 0; i < 4 + this.mine.currentFloor * 2; i++) {
      const sx = mineRng.range(0, sz - 1)
      const sz2 = mineRng.range(0, sz - 1)
      const stone = createStone(mineRng.int(0, 1))
      stone.position.set(sx, 0, sz2)
      stone.scale.set(0.7, 0.7, 0.7)
      this.mineScene.add(stone)
    }

    const torchSpots: number[][] = []
    for (let i = 0; i < 3 + this.mine.currentFloor; i++) {
      torchSpots.push([mineRng.range(0, sz - 1), mineRng.range(0, sz - 1)])
    }
    for (const [tx, tz] of torchSpots) {
      const tl = new THREE.PointLight(0xff9944, 0.8, 8)
      tl.position.set(tx, 2, tz)
      this.mineScene.add(tl)
      const torchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), new THREE.MeshLambertMaterial({ color: COLORS.wood }))
      torchMesh.position.set(tx, 0.12, tz)
      this.mineScene.add(torchMesh)
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffaa33 }))
      flame.position.set(tx, 0.28, tz)
      this.mineScene.add(flame)
    }

    sound.menuOpen()
  }

  private exitMine() {
    const result = this.mine.exit()
    this.inMine = false

    // Move player back to farm scene
    if (this.mineScene) {
      this.mineScene.remove(this.playerModel)
      this.mineScene.remove(this.mine.group)
      this.mineScene = null
    }
    this.scene.add(this.playerModel)

    this.playerModel.position.set(0.5, 0, GAME_CONFIG.farmHeight - 0.5)
    for (const [id, count] of Object.entries(result.items)) this.player.addItem(id, count)
    sound.menuClose()
  }

  private handleMineAction() {
    const sel = this.player.getSelectedItem()
    if (sel?.id !== 'shovel' && sel?.id !== 'pickaxe') { sound.error(); return }
    if (sel && this.player.getToolDurability(sel.id) <= 0) { sound.error(); return }

    const { x, z } = this.getFacingTile()
    const result = this.mine.dig(x, z, this.player.toolTiers[sel?.id || 'pickaxe'] || 1)
    if (result.blocked) { sound.error(); return }
    if (result.success) {
      const toolId = sel?.id || 'pickaxe'
      this.player.useStamina(TOOLS[toolId]?.staminaCost || 5)
      this.player.useToolDurability(toolId)
      this.playToolAnim('dig')
      this.actionCooldown = 0.3
      if (result.foundLadder) {
        if (this.mine.isLastFloor()) {
          // Exit ladder on last floor
          this.exitMine()
        } else {
          this.mine.descend()
        }
      }
      if (this.mine.digsLeft <= 0) this.exitMine()
    }
  }

  private collectMineItems() {
    const items = this.mine.collectNearby(this.playerModel.position.x, this.playerModel.position.z, 0.8)
    for (const id of items) {
      if (this.player.isFull()) { sound.error(); break }
      this.player.addItem(id)
    }
  }

  // ─── SLEEP ───
  private doSleep() {
    sound.sleep()
    this.player.advanceDay()
    const spoiled = this.farm.advanceDay()
    this.saveGame()

    // Debt collector warning: day before grimes visit (every 5 days)
    if (!this.player.debtPaid && this.player.day % 5 === 4 && this.player.debt > 0) {
      const warnMsg = t('debtWarning').replace('{amount}', String(this.player.debt))
      setTimeout(() => this.dialogue.showRaw('⚠️', warnMsg), 600)
    }

    setTimeout(() => this.triggerMorningBuyer(), 500)

    if (spoiled.length > 0) { this.dialogue.show('spoil_notice'); return }
    if (this.player.debt <= 0 && !this.player.debtPaid) {
      this.player.debtPaid = true
      this.dialogue.show('win', a => { if (a === 'reset') this.player.reset() })
    } else if (this.player.day > GAME_CONFIG.debtDeadline && this.player.debt > 0) {
      this.dialogue.show('lose', a => { if (a === 'reset') this.player.reset() })
    }
  }

  private checkStoryTriggers() {
    if (!this.started) return
    if (!this.player.introSeen) { this.player.introSeen = true; this.dialogue.show('intro_1'); return }
    if (!this.player.grimesFirstSeen && this.player.day >= 2) { this.player.grimesFirstSeen = true; this.dialogue.show('grimes_first'); return }
    if (this.player.grimesFirstSeen && !this.player.debtPaid && this.player.day % 5 === 0 && !this.dialogue.active && !this.morningBuyerActive) {
      this.dialogue.show('grimes_visit', action => {
        if (action === 'pay_full' && this.player.gold >= this.player.debt) { this.player.gold -= this.player.debt; this.player.debt = 0; this.dialogue.show('grimes_paid') }
        else if (action === 'pay_partial' && this.player.gold >= 500) { this.player.gold -= 500; this.player.debt -= 500; this.dialogue.show('grimes_partial') }
      })
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
      this.updateHeldVisual()
    })
  }

  private saveGame() {
    this.player.save()
    localStorage.setItem('till_debt_farm', JSON.stringify(this.farm.saveState()))
  }
}

new Game()
