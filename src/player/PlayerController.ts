import * as THREE from 'three'
import { InputManager } from '../core/InputManager'
import { FarmGrid, TileType } from '../farm/FarmGrid'
import { MineSystem } from '../mine/MineSystem'
import { GAME_CONFIG } from '../data/gameData'
import { sound } from '../core/SoundManager'
import { t } from '../core/i18n'

/**
 * Player movement/camera/cooldown controller. Owns the movement + facing-tile
 * logic, the unstuck teleport + its (dead) button update, the tired
 * animation + sweat sprite, and the camera follow. Cross-subsystem calls go
 * ONLY through the context portals the composition root passes in.
 */
export interface PlayerControllerContext {
  input: InputManager
  getFarm: () => FarmGrid
  mine: MineSystem
  playerModel: THREE.Group
  pLeftLeg: THREE.Group
  pRightLeg: THREE.Group
  camera: THREE.PerspectiveCamera
  isStarted: () => boolean
  getInMine: () => boolean
  exitMine: () => void
  isPaused: () => boolean
  togglePause: () => void
}

export class PlayerController {
  private tiredCooldown = 0
  private footstepTimer = 0
  private camTarget = new THREE.Vector3()
  private walkTime = 0
  // Unstuck cooldown (seconds remaining)
  private unstuckCooldown = 0
  private lastUnstuckBtnSec = -1
  private sweatTimer = 0
  private sweatSprite: THREE.Sprite | null = null

  constructor(private ctx: PlayerControllerContext) {}

  // Cooldown decrements for the loop's "cooldowns" slot (tired + unstuck).
  updateCooldowns(dt: number) {
    this.tiredCooldown = Math.max(0, this.tiredCooldown - dt)
    this.unstuckCooldown = Math.max(0, this.unstuckCooldown - dt)
  }

  // Teleport the player out of a stuck spot to a random walkable tile in the yard
  useUnstuck() {
    if (!this.ctx.isStarted()) return
    if (this.unstuckCooldown > 0) { sound.error(); return }
    this.unstuckCooldown = 60
    if (this.ctx.getInMine()) this.ctx.exitMine()
    let px = 0.5, pz = 0.5
    const farm = this.ctx.getFarm()
    for (let i = 0; i < 40; i++) {
      const tx = 0.3 + Math.random() * (farm.width - 0.6)
      const tz = 0.3 + Math.random() * (farm.height - 0.6)
      if (!farm.isSolid(Math.round(tx), Math.round(tz))) { px = tx; pz = tz; break }
    }
    this.ctx.playerModel.position.set(px, 0, pz)
    this.ctx.playerModel.rotation.y = Math.PI
    sound.menuSelect()
    if (this.ctx.isPaused()) this.ctx.togglePause()
  }

  // NOTE: updateUnstuckBtn is called from the loop AFTER the paused
  // early-return (in the live path), so it is unconditionally unreachable
  // today — the unstuck button never receives visual state. Preserved verbatim
  // by contract; do NOT rewire.
  updateUnstuckBtn() {
    const btn = document.getElementById('unstuck-btn')
    if (!btn) return
    if (this.unstuckCooldown > 0) {
      const sec = Math.ceil(this.unstuckCooldown)
      if (sec === this.lastUnstuckBtnSec) return
      this.lastUnstuckBtnSec = sec
      btn.textContent = t('unstuck_cd').replace('{s}', String(sec))
      btn.setAttribute('disabled', '')
      btn.style.opacity = '0.5'
    } else {
      if (this.lastUnstuckBtnSec === -1) return
      this.lastUnstuckBtnSec = -1
      btn.textContent = t('unstuck')
      btn.removeAttribute('disabled')
      btn.style.opacity = '1'
    }
  }

  triggerTiredAnimation() {
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

  updateCamera(dt: number) {
    const p = this.ctx.playerModel.position
    let tx: number, tz: number
    if (this.ctx.getInMine()) {
      tx = p.x; tz = p.z
      // Lower camera in mine so feet are visible
      this.camTarget.set(tx + 4, 6, tz + 6)
    } else {
      tx = p.x; tz = p.z
      this.camTarget.set(tx + 6, 10, tz + 10)
    }
    const lerp = 1 - Math.pow(0.005, dt)
    this.ctx.camera.position.lerp(this.camTarget, lerp)
    if (this.ctx.getInMine()) {
      this.ctx.camera.lookAt(p.x, 0.5, p.z)
    } else {
      this.ctx.camera.lookAt(this.ctx.camera.position.x - 6, 0, this.ctx.camera.position.z - 10)
    }
  }

  handleMovement(dt: number) {
    let dx = 0, dz = 0
    if (this.ctx.input.isDown('KeyW') || this.ctx.input.isDown('ArrowUp')) dz -= 1
    if (this.ctx.input.isDown('KeyS') || this.ctx.input.isDown('ArrowDown')) dz += 1
    if (this.ctx.input.isDown('KeyA') || this.ctx.input.isDown('ArrowLeft')) dx -= 1
    if (this.ctx.input.isDown('KeyD') || this.ctx.input.isDown('ArrowRight')) dx += 1

    // Leg animation
    if (dx === 0 && dz === 0) {
      this.walkTime = 0
      if (this.ctx.pLeftLeg) this.ctx.pLeftLeg.rotation.x = 0
      if (this.ctx.pRightLeg) this.ctx.pRightLeg.rotation.x = 0
      return
    }

    this.walkTime += dt * 10
    const legSwing = Math.sin(this.walkTime) * 0.5
    if (this.ctx.pLeftLeg) this.ctx.pLeftLeg.rotation.x = legSwing
    if (this.ctx.pRightLeg) this.ctx.pRightLeg.rotation.x = -legSwing

    const len = Math.sqrt(dx * dx + dz * dz)
    dx /= len; dz /= len
    const speed = 3.5 * dt
    const pos = this.ctx.playerModel.position
    const nx = pos.x + dx * speed
    const nz = pos.z + dz * speed

    this.ctx.playerModel.rotation.y = Math.atan2(dx, dz)

    if (this.ctx.getInMine()) {
      const fl = this.ctx.mine.floors[this.ctx.mine.currentFloor]
      const sz = fl?.length || 10
      pos.x = Math.max(0.3, Math.min(sz - 0.3, nx))
      pos.z = Math.max(0.3, Math.min(sz - 0.3, nz))
    } else {
      const farm = this.ctx.getFarm()
      const margin = 0.35
      const maxX = GAME_CONFIG.farmWidth - 0.8
      const maxZ = GAME_CONFIG.farmHeight - 0.8
      // Try X movement
      const testX = Math.round(nx), curZ = Math.round(pos.z)
      let movedX = false
      if (!farm.isSolid(testX, curZ) || Math.abs(nx - testX) > margin) {
        pos.x = Math.max(0.2, Math.min(maxX, nx))
        movedX = true
      }
      // Try Z movement
      const curX = Math.round(pos.x), testZ = Math.round(nz)
      let movedZ = false
      if (!farm.isSolid(curX, testZ) || Math.abs(nz - testZ) > margin) {
        pos.z = Math.max(0.2, Math.min(maxZ, nz))
        movedZ = true
      }
      // Obstacle sliding: if blocked on intended axis, try sliding perpendicular
      if (!movedX && Math.abs(dx) > 0.1) {
        // Blocked on X, try sliding Z
        const slideZ = pos.z + dz * speed * 0.7
        const sTestZ = Math.round(slideZ)
        if (!farm.isSolid(Math.round(pos.x), sTestZ) || Math.abs(slideZ - sTestZ) > margin)
          pos.z = Math.max(0.2, Math.min(maxZ, slideZ))
      }
      if (!movedZ && Math.abs(dz) > 0.1) {
        // Blocked on Z, try sliding X
        const slideX = pos.x + dx * speed * 0.7
        const sTestX = Math.round(slideX)
        if (!farm.isSolid(sTestX, Math.round(pos.z)) || Math.abs(slideX - sTestX) > margin)
          pos.x = Math.max(0.2, Math.min(maxX, slideX))
      }
    }

    this.footstepTimer += dt
    if (this.footstepTimer > 0.3) { this.footstepTimer = 0; sound.footstep() }
  }

  getFacingTile(): { x: number; z: number } {
    const rot = this.ctx.playerModel.rotation.y
    const fx = Math.sin(rot)
    const fz = Math.cos(rot)
    const px = this.ctx.playerModel.position.x
    const pz = this.ctx.playerModel.position.z

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
      const t = this.ctx.getFarm()?.getTile(c.x, c.z)
      if (t && t.type !== TileType.GRASS && t.type !== TileType.DIRT) return c
    }
    return unique[0] || { x: Math.round(px), z: Math.round(pz) }
  }

  // Sweat icon above player head (loop "sweat/heart sprites" slot).
  updateSprites(dt: number) {
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
        this.ctx.playerModel.add(this.sweatSprite)
      }
      this.sweatSprite.material.opacity = Math.min(1, this.sweatTimer * 2)
      this.sweatSprite.position.y = 1.5 + Math.sin(this.sweatTimer * 8) * 0.05
    } else if (this.sweatSprite && this.sweatSprite.parent) {
      this.ctx.playerModel.remove(this.sweatSprite)
    }
  }
}
