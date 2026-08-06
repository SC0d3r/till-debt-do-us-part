import * as THREE from 'three'
import { getItemInfo, GAME_CONFIG } from '../data/gameData'
import { sound } from '../core/SoundManager'
import type { FarmGrid } from '../farm/FarmGrid'
import type { PlayerState } from '../player/PlayerState'

/**
 * Shipping bin: proximity check, the B-key/space ship action (with the bin
 * wobble + arm-throw animation), and the per-tick bin-arrow bob. Owns the bin
 * position (a constant derived from the farm size) and the cached binArrow
 * reference that used to live on Game.
 */
export interface ShipmentContext {
  player: PlayerState
  playerModel: THREE.Group
  pRightArm: THREE.Group | null
  getFarm: () => FarmGrid
  updateHeldVisual: () => void
}

export class ShipmentController {
  readonly binPosition = new THREE.Vector3(Math.floor(GAME_CONFIG.farmWidth / 2) + 2, 0.1, 0)
  private binArrowTimer = 0
  private binArrow: THREE.Object3D | null = null

  constructor(private ctx: ShipmentContext) {}

  isNearBin(): boolean {
    const dist = this.ctx.playerModel.position.distanceTo(this.binPosition)
    return dist < 3.5
  }

  shipItems() {
    const sel = this.ctx.player.getSelectedItem()
    if (!sel || sel.count <= 0) { sound.error(); return }
    const info = getItemInfo(sel.id)
    if (!info || info.sellPrice <= 0 || info.type === 'Tool') { sound.error(); return }

    const count = sel.count
    this.ctx.player.removeItem(sel.id, count)
    const farm = this.ctx.getFarm()
    farm.addToBin(sel.id, count)
    this.ctx.updateHeldVisual()

    // Bin wobble animation
    if (farm.binGroup) {
      const bin = farm.binGroup
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
    if (this.ctx.pRightArm) {
      const arm = this.ctx.pRightArm
      const origRot = arm.rotation.x
      arm.rotation.x = -2.0
      setTimeout(() => { arm.rotation.x = origRot }, 300)
    }
  }

  // Per-tick bin-arrow bob (moved verbatim from the Game loop's binArrow block).
  update(dt: number) {
    this.binArrowTimer += dt
    const farm = this.ctx.getFarm()
    if (farm.binGroup) {
      if (!this.binArrow) this.binArrow = farm.binGroup.getObjectByName('binArrow') ?? null
      if (this.binArrow) this.binArrow.position.y = 2.5 + Math.sin(this.binArrowTimer * 3) * 0.15
    }
  }

  // startGame() replaces the farm group; the cached bin-arrow reference would
  // point at the disposed farm, so drop it.
  resetFarmRefs() {
    this.binArrow = null
  }
}