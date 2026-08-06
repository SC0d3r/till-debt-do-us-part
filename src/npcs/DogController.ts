import * as THREE from 'three'
import { PlayerState } from '../player/PlayerState'
import { sound } from '../core/SoundManager'
import { GAME_CONFIG } from '../data/gameData'

/**
 * Dog NPC: idle/walk/bark/play state machine, petting (heart sprite) and the
 * per-tick heart-sprite fade. Owns all dog state that used to live on Game.
 * Cross-subsystem calls go ONLY through the context the composition root
 * passes in; nothing here imports Game.
 */
export interface DogControllerContext {
  dogModel: THREE.Group | null
  dogTail: THREE.Group | null
  player: PlayerState
}

export class DogController {
  private dogTimer = 0
  private dogBarkTimer = 0
  private dogState: 'idle' | 'walk' | 'bark' | 'play' = 'idle'
  private dogTargetPos = new THREE.Vector3()
  private scratchVec = new THREE.Vector3()
  private dogHeartTimer = 0
  private dogHeartSprite: THREE.Sprite | null = null

  constructor(private ctx: DogControllerContext) {}

  petDog() {
    if (this.dogHeartTimer > 0) return
    this.dogHeartTimer = 2.0
    this.ctx.player.petDog()
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
    if (!this.dogHeartSprite.parent && this.ctx.dogModel) {
      this.dogHeartSprite.position.set(0, 1.0, 0)
      this.ctx.dogModel.add(this.dogHeartSprite)
    }
  }

  update(dt: number) {
    if (!this.ctx.dogModel) return
    this.dogTimer += dt
    this.dogBarkTimer += dt

    switch (this.dogState) {
      case 'idle':
        // Wag tail slowly
        if (this.ctx.dogTail) this.ctx.dogTail.rotation.y = Math.sin(this.dogTimer * 3) * 0.3
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
        if (this.ctx.dogTail) this.ctx.dogTail.rotation.y = Math.sin(this.dogTimer * 8) * 0.5
        const dir = this.scratchVec.subVectors(this.dogTargetPos, this.ctx.dogModel.position)
        dir.y = 0
        const dist = dir.length()
        if (dist > 0.2) {
          dir.normalize()
          // Face the direction of movement (dog model faces +X, so offset by -PI/2)
          this.ctx.dogModel.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2
          this.ctx.dogModel.position.add(dir.multiplyScalar(1.5 * dt))
        } else {
          this.dogState = Math.random() > 0.5 ? 'play' : 'idle'
          this.dogTimer = 0
        }
        break

      case 'bark':
        if (this.ctx.dogTail) this.ctx.dogTail.rotation.y = Math.sin(this.dogTimer * 12) * 0.6
        // Head bob
        this.ctx.dogModel.children[1].position.y = 0.35 + Math.sin(this.dogTimer * 15) * 0.03
        if (this.dogTimer > 0.5) {
          this.dogState = 'idle'
          this.dogTimer = 0
          this.ctx.dogModel.children[1].position.y = 0.35
        }
        break

      case 'play':
        if (this.ctx.dogTail) this.ctx.dogTail.rotation.y = Math.sin(this.dogTimer * 15) * 0.8
        // Spin in circle
        this.ctx.dogModel.rotation.y += 3 * dt
        if (this.dogTimer > 1.5) {
          this.dogState = 'idle'
          this.dogTimer = 0
        }
        break
    }
  }

  // Per-tick heart-sprite fade/bob (moved verbatim from the Game loop's
  // "dog heart icon" block).
  updateHeart(dt: number) {
    if (this.dogHeartTimer > 0) {
      this.dogHeartTimer -= dt
      if (this.dogHeartSprite && this.dogHeartSprite.parent) {
        this.dogHeartSprite.material.opacity = Math.min(1, this.dogHeartTimer)
        this.dogHeartSprite.position.y = 1.0 + Math.sin(this.dogHeartTimer * 5) * 0.1
      }
    } else if (this.dogHeartSprite && this.dogHeartSprite.parent && this.ctx.dogModel) {
      this.ctx.dogModel.remove(this.dogHeartSprite)
    }
  }
}