import * as THREE from 'three'
import { MineSystem } from './MineSystem'
import { GAME_CONFIG, TOOLS } from '../data/gameData'
import { COLORS, getTileTexture, createStone, SeededRNG } from '../core/MeshFactory'
import { sound } from '../core/SoundManager'
import { t } from '../core/i18n'
import { disposeObject } from '../core/disposeObject'
import type { DebugActionRegistry } from '../debug/DebugActions'
import type { PlayerState } from '../player/PlayerState'

/**
 * Mine scene + HUD + actions. Owns the mine scene construction (fog, lights,
 * torch, floor, stones — the enterMine build-out), enter/exit transitions,
 * the mine HUD/toast, the dig action and item collection, and the per-tick
 * light-follow that used to live in Game's loop. `inMine` and `scene` are
 * public because the composition root and the player subsystems read them.
 */
export interface MineControllerContext {
  mine: MineSystem
  player: PlayerState
  playerModel: THREE.Group
  scene: THREE.Scene
  getFacingTile: () => { x: number; z: number }
  playToolAnim: (type: 'swing' | 'pour' | 'dig') => void
  cooldowns: { actionCooldown: number }
  debugActions?: DebugActionRegistry
}

export class MineController {
  inMine = false
  scene: THREE.Scene | null = null
  private mineTorch: THREE.PointLight | null = null
  private minePlayerGlow: THREE.PointLight | null = null
  private mineHelmetLight: THREE.PointLight | null = null
  private mineGroundFill: THREE.PointLight | null = null
  private mineHeadSpot: THREE.SpotLight | null = null
  private mineHudFloor = -1
  private mineHudDigs = -1
  private mineToastTimer: number | null = null

  constructor(private ctx: MineControllerContext) {
    ctx.debugActions?.register('mine', {
      enterMine: () => this.enterMine(),
      exitMine: () => this.exitMine(),
    })
  }

  enterMine() {
    this.inMine = true
    this.ctx.mine.enter()
    this.ctx.playerModel.position.set(0.5, 0, 0.5)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x3a3028, 5, 25)
    this.scene.background = new THREE.Color(0x2a2018)

    const fl = this.ctx.mine.floors[this.ctx.mine.currentFloor]
    const sz = fl?.length || 10

    // Much brighter mine for visibility
    this.scene.add(new THREE.AmbientLight(0x887766, 1.0))
    const torch = new THREE.PointLight(0xffcc66, 3.0, 25)
    torch.position.set(0.5, 3, 0.5)
    torch.name = 'torch'
    this.scene.add(torch)
    const fillLight = new THREE.PointLight(0xddccbb, 1.5, 35)
    fillLight.position.set(sz / 2, 4, sz / 2)
    this.scene.add(fillLight)
    // Helmet light
    const helmetLight = new THREE.PointLight(0xffffee, 2.5, 16)
    helmetLight.position.set(0.5, 2.0, 0.5)
    helmetLight.name = 'helmetLight'
    this.scene.add(helmetLight)
    // Forward spotlight
    const headSpot = new THREE.SpotLight(0xffeedd, 3.0, 20, Math.PI / 3, 0.3, 1)
    headSpot.position.set(0.5, 1.8, 0.5)
    headSpot.target.position.set(0.5, 0, 3)
    headSpot.name = 'headSpot'
    this.scene.add(headSpot)
    this.scene.add(headSpot.target)
    const playerGlow = new THREE.PointLight(0xffeedd, 1.5, 10)
    playerGlow.position.set(0.5, 1.2, 0.5)
    playerGlow.name = 'playerGlow'
    this.scene.add(playerGlow)
    // Ground-level fill to show feet
    const groundFill = new THREE.PointLight(0xaa9977, 0.8, 8)
    groundFill.position.set(0.5, 0.3, 0.5)
    groundFill.name = 'groundFill'
    this.scene.add(groundFill)

    this.scene.add(this.ctx.playerModel)
    this.scene.add(this.ctx.mine.group)

    const floorTex = getTileTexture('mineFloor')
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(3, 3)
    const floorGeo = new THREE.PlaneGeometry(sz + 8, sz + 8)
    floorGeo.rotateX(-Math.PI / 2)
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: floorTex }))
    floorMesh.position.set(sz / 2 - 0.5, -0.01, sz / 2 - 0.5)
    floorMesh.receiveShadow = true
    this.scene.add(floorMesh)

    const mineRng = new SeededRNG(this.ctx.mine.currentFloor * 1337)
    for (let i = 0; i < 4 + this.ctx.mine.currentFloor * 2; i++) {
      const sx = mineRng.range(0, sz - 1)
      const sz2 = mineRng.range(0, sz - 1)
      const stone = createStone(mineRng.int(0, 1))
      stone.position.set(sx, 0, sz2)
      stone.scale.set(0.7, 0.7, 0.7)
      this.scene.add(stone)
    }

    const torchSpots: number[][] = []
    for (let i = 0; i < 3 + this.ctx.mine.currentFloor; i++) {
      torchSpots.push([mineRng.range(0, sz - 1), mineRng.range(0, sz - 1)])
    }
    for (const [tx, tz] of torchSpots) {
      const tl = new THREE.PointLight(0xff9944, 0.8, 8)
      tl.position.set(tx, 2, tz)
      this.scene.add(tl)
      const torchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), new THREE.MeshLambertMaterial({ color: COLORS.wood }))
      torchMesh.position.set(tx, 0.12, tz)
      this.scene.add(torchMesh)
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffaa33 }))
      flame.position.set(tx, 0.28, tz)
      this.scene.add(flame)
    }

    sound.menuOpen()
    this.updateMineHUD()
  }

  exitMine() {
    const result = this.ctx.mine.exit()
    this.inMine = false

    // Move player back to farm scene
    if (this.scene) {
      this.scene.remove(this.ctx.playerModel)
      this.scene.remove(this.ctx.mine.group)
      // Dispose mine-only resources (floor, stones, torches, flames) so
      // repeated enter/exit cycles from the debug harness don't leak GPU
      // buffers. playerModel and mine.group were removed above — they persist.
      disposeObject(this.scene)
      this.scene = null
    }
    this.ctx.scene.add(this.ctx.playerModel)

    // Spawn in front of the mine door, facing the farm (toward home)
    this.ctx.playerModel.position.set(0.7, 0, GAME_CONFIG.farmHeight - 1.8)
    this.ctx.playerModel.rotation.y = Math.PI
    for (const [id, count] of Object.entries(result.items)) this.ctx.player.addItem(id, count)
    sound.menuClose()
    this.updateMineHUD()
  }

  // ─── MINE HUD ───
  updateMineHUD() {
    const hud = document.getElementById('mine-hud')
    const mainHud = document.getElementById('hud')
    if (mainHud) mainHud.style.display = this.inMine ? 'none' : ''
    if (!hud) return
    if (!this.inMine) {
      hud.style.display = 'none'
      this.hideMineToast()
      return
    }
    hud.style.display = 'flex'
    const lvl = this.ctx.mine.currentFloor + 1
    document.getElementById('mine-level')!.textContent = String(lvl)
    document.getElementById('mine-exit')!.textContent = `${Math.round(this.ctx.mine.getExitChance() * 100)}%`

    const digs = this.ctx.mine.digsLeft
    if (digs !== this.mineHudDigs) {
      this.mineHudDigs = digs
      const digsEl = document.getElementById('mine-digs')!
      digsEl.textContent = `${digs}/${GAME_CONFIG.mineDigsPerFloor}`
      hud.classList.toggle('low', digs <= 0)
    }
    if (lvl !== this.mineHudFloor) {
      this.mineHudFloor = lvl
      const pips = document.getElementById('mine-pips')!
      pips.innerHTML = ''
      for (let i = 1; i <= GAME_CONFIG.mineFloors; i++) {
        const pip = document.createElement('div')
        pip.className = i <= lvl ? 'mine-pip filled' : 'mine-pip'
        if (i === lvl) pip.classList.add('current')
        pips.appendChild(pip)
      }
    }
  }

  showMineToast(msg: string) {
    const toast = document.getElementById('mine-toast')
    if (!toast) return
    toast.textContent = msg
    toast.classList.add('show')
    if (this.mineToastTimer) clearTimeout(this.mineToastTimer)
    this.mineToastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400)
  }

  hideMineToast() {
    if (this.mineToastTimer) { clearTimeout(this.mineToastTimer); this.mineToastTimer = null }
    const toast = document.getElementById('mine-toast')
    if (toast) toast.classList.remove('show')
  }

  handleMineAction() {
    const sel = this.ctx.player.getSelectedItem()
    if (sel?.id !== 'shovel' && sel?.id !== 'pickaxe') { sound.error(); return }
    if (sel && this.ctx.player.getToolDurability(sel.id) <= 0) { sound.error(); return }

    if (this.ctx.mine.digsLeft <= 0) {
      sound.error()
      this.showMineToast(t('mine_toast_energy'))
      this.updateMineHUD()
      return
    }

    const { x, z } = this.ctx.getFacingTile()
    const result = this.ctx.mine.dig(x, z, this.ctx.player.toolTiers[sel?.id || 'pickaxe'] || 1)
    if (result.blocked) { sound.error(); return }
    if (result.success) {
      const toolId = sel?.id || 'pickaxe'
      const tier = this.ctx.player.toolTiers[toolId] || 1
      let cost = TOOLS[toolId]?.staminaCost || 5
      if (toolId === 'shovel') cost = Math.max(1, cost - (tier - 1) * 2)
      this.ctx.player.useStamina(cost)
      this.ctx.player.useToolDurability(toolId)
      this.ctx.playToolAnim('dig')
      this.ctx.cooldowns.actionCooldown = 0.3
      if (result.exitMine) {
        sound.menuOpen()
        this.exitMine()
        return
      }
      if (result.foundHole) {
        sound.collectRare()
        this.showMineToast(t('mine_toast_hole'))
      }
      this.updateMineHUD()
    }
  }

  collectMineItems() {
    const items = this.ctx.mine.collectNearby(this.ctx.playerModel.position.x, this.ctx.playerModel.position.z, 0.8)
    for (const id of items) {
      if (this.ctx.player.isFull()) { sound.error(); break }
      this.ctx.player.addItem(id)
      this.ctx.player.totalItemsMined++
    }
  }

  // Per-tick torch/light follow (moved verbatim from the Game loop's mine block).
  updateLightFollow() {
    if (!this.scene) return
    // Keep player grounded
    this.ctx.playerModel.position.y = 0
    const px = this.ctx.playerModel.position.x
    const pz = this.ctx.playerModel.position.z
    if (!this.mineTorch) this.mineTorch = this.scene.getObjectByName('torch') as THREE.PointLight
    if (!this.minePlayerGlow) this.minePlayerGlow = this.scene.getObjectByName('playerGlow') as THREE.PointLight
    if (!this.mineHelmetLight) this.mineHelmetLight = this.scene.getObjectByName('helmetLight') as THREE.PointLight
    if (!this.mineGroundFill) this.mineGroundFill = this.scene.getObjectByName('groundFill') as THREE.PointLight
    if (!this.mineHeadSpot) this.mineHeadSpot = this.scene.getObjectByName('headSpot') as THREE.SpotLight
    if (this.mineTorch) this.mineTorch.position.set(px, 1.8, pz)
    if (this.minePlayerGlow) this.minePlayerGlow.position.set(px, 1.2, pz)
    if (this.mineHelmetLight) this.mineHelmetLight.position.set(px, 2.0, pz)
    if (this.mineGroundFill) this.mineGroundFill.position.set(px, 0.3, pz)
    if (this.mineHeadSpot) {
      const rot = this.ctx.playerModel.rotation.y
      this.mineHeadSpot.position.set(px, 1.5, pz)
      this.mineHeadSpot.target.position.set(px + Math.sin(rot) * 4, 0, pz + Math.cos(rot) * 4)
    }
  }
}