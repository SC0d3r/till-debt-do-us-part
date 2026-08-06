import * as THREE from 'three'
import { createNPCModel } from '../core/MeshFactory'
import { disposeObject } from '../core/disposeObject'
import { getItemInfo } from '../data/gameData'
import type { DebugActionRegistry } from '../debug/DebugActions'
import type { FarmGrid } from '../farm/FarmGrid'

export interface MorningBuyerLine {
  name: string
  count: number
  price: number
  total: number
}

/**
 * Morning buyer NPC: walks from off-screen to the shipping bin, "counts" the
 * payment (payment overlay count-up), then leaves. Owns the buyer state
 * machine that used to live on Game. The `_buyerLines`/`_buyerTotal` values
 * that showPaymentOverlay used to read via `(this as any)` are REAL fields
 * here, passed to the payment overlay through the paymentPortal.
 */
export interface MorningBuyerContext {
  scene: THREE.Scene
  binPosition: THREE.Vector3
  getFarm: () => FarmGrid
  paymentPortal: {
    show: (lines: MorningBuyerLine[], total: number) => void
    hide: () => void
  }
  debugActions?: DebugActionRegistry
}

export class MorningBuyerController {
  active = false
  phase: 'walking' | 'counting' | 'leaving' | 'idle' = 'idle'
  npcModel: THREE.Group | null = null
  private timer = 0
  private buyerLines: MorningBuyerLine[] = []
  private buyerTotal = 0

  constructor(private ctx: MorningBuyerContext) {
    ctx.debugActions?.register('buyer', {
      triggerMorningBuyer: () => this.triggerMorningBuyer(),
    })
  }

  triggerMorningBuyer() {
    const items = this.ctx.getFarm().clearBin()
    if (items.length === 0) return

    this.active = true
    this.phase = 'walking'
    this.timer = 0

    this.npcModel = createNPCModel()
    this.npcModel.position.set(0, 0, -2)
    this.npcModel.rotation.y = Math.PI
    this.ctx.scene.add(this.npcModel)

    let totalGold = 0
    const lines: MorningBuyerLine[] = []
    for (const item of items) {
      const info = getItemInfo(item.id)
      const price = info?.sellPrice || 0
      const lineTotal = price * item.count
      totalGold += lineTotal
      lines.push({ name: info?.name || item.id, count: item.count, price, total: lineTotal })
    }

    this.buyerLines = lines
    this.buyerTotal = totalGold
  }

  update(dt: number) {
    this.timer += dt
    const npc = this.npcModel
    if (!npc) return

    if (this.phase === 'walking') {
      const dir = new THREE.Vector3().subVectors(this.ctx.binPosition, npc.position).normalize()
      const dist = npc.position.distanceTo(this.ctx.binPosition)
      if (dist > 0.5) {
        npc.position.add(dir.multiplyScalar(2.5 * dt))
        npc.rotation.y = Math.atan2(dir.x, dir.z)
      } else {
        this.phase = 'counting'
        this.timer = 0
        this.ctx.paymentPortal.show(this.buyerLines, this.buyerTotal)
      }
    } else if (this.phase === 'counting') {
      if (this.timer > 3) {
        this.phase = 'leaving'
        this.timer = 0
        this.ctx.paymentPortal.hide()
      }
    } else if (this.phase === 'leaving') {
      const exitPos = new THREE.Vector3(0, 0, -3)
      const dir = new THREE.Vector3().subVectors(exitPos, npc.position).normalize()
      const dist = npc.position.distanceTo(exitPos)
      if (dist > 0.3) {
        npc.position.add(dir.multiplyScalar(2.5 * dt))
        npc.rotation.y = Math.atan2(dir.x, dir.z)
      } else {
        this.ctx.scene.remove(npc)
        disposeObject(npc)
        this.npcModel = null
        this.active = false
        this.phase = 'idle'
      }
    }
  }

  // Dev-harness reset: drop a mid-walk buyer NPC and its state so fixtures
  // never leak a leftover NPC into the next screenshot.
  reset() {
    if (this.npcModel) {
      this.ctx.scene.remove(this.npcModel)
      disposeObject(this.npcModel)
      this.npcModel = null
    }
    this.active = false
    this.phase = 'idle'
  }
}