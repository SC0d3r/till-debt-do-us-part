import * as THREE from 'three'
import { createCoinParticle } from './MeshFactory'

/**
 * Coin particle burst: spawns spinning coin meshes above the shipping bin
 * that arc up and fall back down, then self-remove. Owns the coin rAF chain
 * that used to live on Game.
 */
export interface CoinFxContext {
  scene: THREE.Scene
  binPosition: THREE.Vector3
}

export class CoinFx {
  constructor(private ctx: CoinFxContext) {}

  spawn(count: number) {
    for (let i = 0; i < count; i++) {
      const coin = createCoinParticle()
      const startX = this.ctx.binPosition.x + (Math.random() - 0.5) * 2
      const startZ = this.ctx.binPosition.z + (Math.random() - 0.5) * 2
      coin.position.set(startX, 1.5, startZ)
      this.ctx.scene.add(coin)
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3)
      let t = 0
      const anim = () => {
        t += 0.02
        vel.y -= 9.8 * 0.02
        coin.position.x += vel.x * 0.02
        coin.position.y += vel.y * 0.02
        coin.position.z += vel.z * 0.02
        coin.rotation.x += 0.15
        coin.rotation.z += 0.1
        if (coin.position.y < 0 || t > 2) {
          this.ctx.scene.remove(coin)
        } else {
          requestAnimationFrame(anim)
        }
      }
      setTimeout(() => requestAnimationFrame(anim), i * 50)
    }
  }
}