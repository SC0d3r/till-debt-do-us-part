import * as THREE from 'three'

/**
 * Static shop NPC: gentle idle sway, arm gestures and head nod when the
 * player is close, plus a slow turn to face the player. Owns the shop NPC
 * animation timer that used to live on Game.
 */
export interface ShopNpcControllerContext {
  shopNpcModel: THREE.Group | null
  shopLeftArm: THREE.Group | null
  shopRightArm: THREE.Group | null
  playerModel: THREE.Group
  getInMine: () => boolean
}

export class ShopNpcController {
  private timer = 0

  constructor(private ctx: ShopNpcControllerContext) {}

  update(dt: number) {
    if (!this.ctx.shopNpcModel || this.ctx.getInMine()) return
    this.timer += dt
    const t = this.timer

    // Face toward player when nearby
    const dist = this.ctx.playerModel.position.distanceTo(this.ctx.shopNpcModel.position)
    if (dist < 5) {
      const dx = this.ctx.playerModel.position.x - this.ctx.shopNpcModel.position.x
      const dz = this.ctx.playerModel.position.z - this.ctx.shopNpcModel.position.z
      const targetRot = Math.atan2(dx, dz)
      // Smooth rotation
      let diff = targetRot - this.ctx.shopNpcModel.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.ctx.shopNpcModel.rotation.y += diff * 3 * dt
    }

    // Skip idle animation when far away (not visible through fog)
    if (dist > 20) return

    // Idle animations: gentle sway and arm movement
    // Gentle body sway
    this.ctx.shopNpcModel.children[0].rotation.z = Math.sin(t * 1.5) * 0.03
    // Arms: one hand on hip, other gestures occasionally
    if (this.ctx.shopLeftArm) this.ctx.shopLeftArm.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.1
    if (this.ctx.shopRightArm) this.ctx.shopRightArm.rotation.x = -0.5 + Math.sin(t * 1.2) * 0.15
    // Head nod when player is close
    if (dist < 3) {
      const head = this.ctx.shopNpcModel.children[1]
      if (head) head.rotation.x = Math.sin(t * 2) * 0.05
    }
  }
}