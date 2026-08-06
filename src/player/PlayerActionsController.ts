import * as THREE from 'three'
import { InputManager } from '../core/InputManager'
import { PlayerState } from '../player/PlayerState'
import { TileType, type FarmTile } from '../farm/FarmGrid'
import { TOOLS, getItemInfo } from '../data/gameData'
import { createToolMesh, createItemDropMesh } from '../core/MeshFactory'
import { sound } from '../core/SoundManager'

/**
 * Player interaction hub — handleActions plus the harvest/tool/held-visual
 * logic it drives. Harvest is folded into this controller (design choice:
 * tryHarvestNearby/doHarvest/placeHarvestedItem are only reachable from
 * handleActions, so a separate HarvestController would be a pure passthrough).
 *
 * Every cross-subsystem call goes through the portals below; nothing here
 * imports Game or another subsystem module.
 */
export interface PlayerActionsContext {
  cooldowns: { actionCooldown: number }
  input: InputManager
  player: PlayerState
  playerModel: THREE.Group
  dogModel: THREE.Group
  pLeftArm: THREE.Group
  pRightArm: THREE.Group
  getInMine: () => boolean
  // Portal to PlayerController (movement/facing logic stays there).
  facingTile: { get(): { x: number; z: number } }
  // Portal to PlayerController's tired animation (stamina-bar shake + sweat).
  tiredPortal: { trigger(): void }
  // Portal to DialogueSystem via the composition root.
  dialoguePortal: {
    active(): boolean
    show(id: string, onChoice?: (action: string) => void, labelOverrides?: Record<string, string>): void
    close(): void
  }
  // Portal to MineController / MineSystem.
  minePortal: {
    getNearbyHole(px: number, pz: number, radius: number): { x: number; z: number } | null
    getExitChance(): number
    descend(): boolean
    enterMine(): void
    exitMine(): void
    updateMineHUD(): void
    handleMineAction(): void
  }
  // Portal to the live FarmGrid (the farm is re-created on startGame, so the
  // root hands out a call-time facade, never a stored reference).
  farmPortal: {
    width(): number
    height(): number
    getTile(x: number, z: number): FarmTile | null
    chopTree(x: number, z: number): boolean
    breakStone(x: number, z: number): boolean
    clearDebris(x: number, z: number): boolean
    till(x: number, z: number): boolean
    water(x: number, z: number): boolean
    plant(x: number, z: number, cropId: string): boolean
    harvest(x: number, z: number): string | null
    isRipe(x: number, z: number): boolean
  }
  // Portal to ShipmentController (shipping bin).
  shipmentPortal: {
    isNearBin(): boolean
    shipItems(): void
  }
  // Portal to DogController.
  dogPortal: { petDog(): void }
  // Portal to StoryController (sleep progression).
  storyPortal: { doSleep(): void }
  // Portal to Game's openShop orchestration.
  shopPortal: { openShop(): void }
}

export class PlayerActionsController {
  private heldToolMesh: THREE.Group | null = null
  // Tool animation state
  private toolAnimTimer = 0
  private toolAnimType: 'none' | 'swing' | 'pour' | 'dig' = 'none'

  constructor(private ctx: PlayerActionsContext) {}

  handleActions() {
    if (this.ctx.cooldowns.actionCooldown > 0) return
    const interact = this.ctx.input.isJustPressed('KeyE')
    const space = this.ctx.input.isJustPressed('Space')

    // Tired check: if stamina is 0 and trying to do an action
    if (space && this.ctx.player.stamina <= 0) {
      this.ctx.tiredPortal.trigger()
      this.ctx.cooldowns.actionCooldown = 0.6
      return
    }

    if (interact) {
      if (this.ctx.getInMine()) {
        const hole = this.ctx.minePortal.getNearbyHole(this.ctx.playerModel.position.x, this.ctx.playerModel.position.z, 1.8)
        if (hole) {
          this.ctx.dialoguePortal.show('mine_descend', (action) => {
            if (action === 'descend') {
              sound.menuClose()
              // Small chance the old ladder gives way: tumble back to the surface
              if (Math.random() < this.ctx.minePortal.getExitChance()) {
                this.ctx.dialoguePortal.show('ladder_mishap', () => this.ctx.minePortal.exitMine())
              } else {
                this.ctx.minePortal.descend()
                this.ctx.playerModel.position.set(hole.x, 0, hole.z + 0.5)
                this.ctx.minePortal.updateMineHUD()
              }
            }
          })
        } else {
          this.ctx.minePortal.exitMine()
        }
        return
      }

      // Check proximity to buildings (walls count, not just center)
      const px = this.ctx.playerModel.position.x
      const pz = this.ctx.playerModel.position.z
      const buildingRange = 3.5

      const housePos = new THREE.Vector3(0, 0, 0)
      const shopPos = new THREE.Vector3(this.ctx.farmPortal.width() - 1, 0, 0)
      const minePos = new THREE.Vector3(0, 0, this.ctx.farmPortal.height() - 1)
      const wellPos = new THREE.Vector3(Math.floor(this.ctx.farmPortal.width() / 2), 0, this.ctx.farmPortal.height() - 2)

      if (px ** 2 + pz ** 2 < buildingRange ** 2) {
        this.ctx.dialoguePortal.show('sleep_confirm', (action) => {
          if (action === 'sleep') setTimeout(() => this.ctx.storyPortal.doSleep(), 50)
        })
        return
      }
      if ((px - shopPos.x) ** 2 + (pz - shopPos.z) ** 2 < buildingRange ** 2) { this.ctx.shopPortal.openShop(); return }
      if ((px - minePos.x) ** 2 + (pz - minePos.z) ** 2 < buildingRange ** 2) { this.ctx.minePortal.enterMine(); return }
      if ((px - wellPos.x) ** 2 + (pz - wellPos.z) ** 2 < buildingRange ** 2) { this.ctx.player.refillWater(); sound.water(); this.ctx.cooldowns.actionCooldown = 0.3; return }

      // Bin interaction via E key
      if (this.ctx.shipmentPortal.isNearBin()) {
        const sel = this.ctx.player.getSelectedItem()
        if (sel && sel.count > 0) {
          const info = getItemInfo(sel.id)
          if (info && info.sellPrice > 0 && info.type !== 'Tool') {
            this.ctx.shipmentPortal.shipItems()
            this.ctx.cooldowns.actionCooldown = 0.5
            return
          }
        }
      }

      // Dog petting
      if (this.ctx.dogModel) {
        const dogDist = this.ctx.playerModel.position.distanceTo(this.ctx.dogModel.position)
        if (dogDist < 2.5) {
          this.ctx.dogPortal.petDog()
          return
        }
      }

      // Fallback: check facing tile for other interactions
      const { x, z } = this.ctx.facingTile.get()
      const ft = this.ctx.farmPortal.getTile(x, z)
      if (!ft) return
      if (ft.type === TileType.HOUSE) {
        this.ctx.dialoguePortal.show('sleep_confirm', (action) => {
          if (action === 'sleep') this.ctx.storyPortal.doSleep()
        })
        return
      }
      if (ft.type === TileType.SHOP) { this.ctx.shopPortal.openShop(); return }
      if (ft.type === TileType.MINE) { this.ctx.minePortal.enterMine(); return }
      if (ft.type === TileType.WELL) { this.ctx.player.refillWater(); sound.water(); this.ctx.cooldowns.actionCooldown = 0.3; return }
      // Pick ripe crops with E (facing tile, then the tile we're standing on)
      if (this.tryHarvestNearby()) return
      return
    }

    if (!space) return
    if (this.ctx.getInMine()) { this.ctx.minePortal.handleMineAction(); return }

    // Throw to bin when near it
    if (this.ctx.shipmentPortal.isNearBin()) {
      const sel = this.ctx.player.getSelectedItem()
      if (sel && sel.count > 0) {
        const info = getItemInfo(sel.id)
        if (info && info.sellPrice > 0 && info.type !== 'Tool') {
          this.ctx.shipmentPortal.shipItems()
          this.ctx.cooldowns.actionCooldown = 0.5
          return
        }
      }
    }

    const { x, z } = this.ctx.facingTile.get()
    const ft = this.ctx.farmPortal.getTile(x, z)
    if (!ft) return
    if ([TileType.HOUSE, TileType.SHOP, TileType.MINE, TileType.WELL, TileType.WATER, TileType.BIN, TileType.FENCE].includes(ft.type)) return

    const sel = this.ctx.player.getSelectedItem()

    // Pick ripe crops with SPACE using any item except the watering can
    if (sel?.id !== 'water' && this.tryHarvestNearby()) return
    const tier = this.ctx.player.toolTiers

    // Check tool durability
    const checkDurability = (toolId: string): boolean => {
      if (this.ctx.player.getToolDurability(toolId) <= 0) {
        sound.error()
        this.ctx.dialoguePortal.show('tool_broken')
        return false
      }
      return true
    }

    if (sel?.id === 'axe') {
      if (!checkDurability('axe')) return
      if (ft.type === TileType.TREE || ft.type === TileType.SMALL_TREE || ft.type === TileType.SAPLING) {
        if (this.ctx.player.useStamina(TOOLS.axe.staminaCost - (tier.axe - 1))) {
          this.ctx.farmPortal.chopTree(x, z)
          this.ctx.player.addItem('wood', ft.type === TileType.TREE ? 3 : ft.type === TileType.SMALL_TREE ? 2 : 1)
          this.ctx.player.useToolDurability('axe')
          this.playToolAnim('swing')
          this.ctx.cooldowns.actionCooldown = 0.5
        } else sound.error()
      } else if (ft.type === TileType.STUMP) {
        if (this.ctx.player.useStamina(TOOLS.axe.staminaCost - (tier.axe - 1))) {
          this.ctx.farmPortal.clearDebris(x, z); this.ctx.player.addItem('wood', 1)
          this.ctx.player.useToolDurability('axe')
          this.playToolAnim('swing')
          this.ctx.cooldowns.actionCooldown = 0.4
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'pickaxe') {
      if (!checkDurability('pickaxe')) return
      if (ft.type === TileType.STONE || ft.type === TileType.ROCK) {
        if (this.ctx.player.useStamina(TOOLS.pickaxe.staminaCost - (tier.pickaxe - 1))) {
          this.ctx.farmPortal.breakStone(x, z)
          this.ctx.player.addItem('stone_item', 1 + Math.floor(Math.random() * 2))
          this.ctx.player.useToolDurability('pickaxe')
          this.playToolAnim('swing')
          this.ctx.cooldowns.actionCooldown = 0.5
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'hoe') {
      if (!checkDurability('hoe')) return
      if (ft.type === TileType.WEED) {
        if (this.ctx.player.useStamina(TOOLS.hoe.staminaCost - (tier.hoe - 1))) {
          this.ctx.farmPortal.clearDebris(x, z)
          this.ctx.player.useToolDurability('hoe')
          this.playToolAnim('dig')
          this.ctx.cooldowns.actionCooldown = 0.35
        } else sound.error()
      } else if (ft.type === TileType.DIRT || ft.type === TileType.GRASS) {
        if (this.ctx.player.useStamina(TOOLS.hoe.staminaCost - (tier.hoe - 1))) {
          this.ctx.farmPortal.till(x, z)
          this.ctx.player.useToolDurability('hoe')
          this.playToolAnim('dig')
          this.ctx.cooldowns.actionCooldown = 0.35
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'water') {
      if (this.ctx.player.waterLevel <= 0) { this.ctx.dialoguePortal.show('no_water'); sound.error(); return }
      if (ft.type === TileType.TILLED || (ft.cropId && !ft.watered)) {
        if (this.ctx.player.useStamina(TOOLS.water.staminaCost - (tier.water - 1))) {
          this.ctx.player.useWater()
          this.ctx.farmPortal.water(x, z)
          this.playToolAnim('pour')
          this.ctx.cooldowns.actionCooldown = 0.4
        } else sound.error()
      } else sound.error()
      return
    }

    if (sel?.id === 'shovel') {
      if (!checkDurability('shovel')) return
      if (ft.type === TileType.WEED || ft.type === TileType.STUMP) {
        if (this.ctx.player.useStamina(TOOLS.shovel.staminaCost - (tier.shovel - 1))) {
          this.ctx.farmPortal.clearDebris(x, z)
          this.ctx.player.useToolDurability('shovel')
          this.playToolAnim('dig')
          this.ctx.cooldowns.actionCooldown = 0.35
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
      if (this.ctx.farmPortal.plant(x, z, cropId)) {
        this.ctx.player.removeItem(sel.id)
        this.updateHeldVisual() // clears ghost if no more seeds
        this.ctx.cooldowns.actionCooldown = 0.25
      } else sound.error()
      return
    }
  }

  // Harvest a ripe crop on the facing tile, or the tile the player is standing on
  private tryHarvestNearby(): boolean {
    const { x, z } = this.ctx.facingTile.get()
    if (this.ctx.farmPortal.isRipe(x, z)) { this.doHarvest(x, z); return true }
    const px = Math.round(this.ctx.playerModel.position.x)
    const pz = Math.round(this.ctx.playerModel.position.z)
    if ((px !== x || pz !== z) && this.ctx.farmPortal.isRipe(px, pz)) { this.doHarvest(px, pz); return true }
    return false
  }

  private doHarvest(x: number, z: number) {
    const cropId = this.ctx.farmPortal.harvest(x, z)
    if (!cropId) return
    this.showHarvestAnim(cropId)
    this.placeHarvestedItem(cropId)
    this.ctx.cooldowns.actionCooldown = 0.3
    // Celebrate the very first harvest with a gamey tutorial
    if (!this.ctx.player.hasFarmed) {
      this.ctx.player.hasFarmed = true
      this.ctx.dialoguePortal.show('first_harvest')
    }
  }

  // Harvested crops always land in the hotbar and get auto-selected:
  // stack if one exists, else the first empty slot; if the hotbar is full,
  // the crop takes the last slot and the rest shift one slot lower
  // (the front item moves to the bag).
  private placeHarvestedItem(id: string) {
    const inv = this.ctx.player.inventory
    for (let i = 0; i < 8; i++) {
      const s = inv[i]
      if (s && s.id === id) { s.count++; this.selectSlot(i); return }
    }
    for (let i = 0; i < 8; i++) {
      if (inv[i] === null) { inv[i] = { id, count: 1 }; this.selectSlot(i); return }
    }
    const front = inv[0]
    for (let i = 1; i < 8; i++) inv[i - 1] = inv[i]
    inv[7] = { id, count: 1 }
    if (front) {
      const bagIdx = inv.findIndex((s, i) => i >= 8 && s === null)
      if (bagIdx >= 0) inv[bagIdx] = front
    }
    this.selectSlot(7)
  }

  private selectSlot(i: number) {
    this.ctx.player.selectedSlot = i
    this.updateHeldVisual()
  }

  // ─── TOOL ANIMATIONS ───
  playToolAnim(type: 'swing' | 'pour' | 'dig') {
    this.toolAnimType = type
    this.toolAnimTimer = 0
  }

  // Loop "tool anim" slot.
  updateToolAnim(dt: number) {
    this.updateToolAnimation(dt)
  }

  private updateToolAnimation(dt: number) {
    if (this.toolAnimType === 'none') return
    this.toolAnimTimer += dt

    
    
    if (!this.ctx.pRightArm) return

    const duration = this.toolAnimType === 'pour' ? 0.6 : 0.35
    const t = Math.min(this.toolAnimTimer / duration, 1)
    const sel = this.ctx.player.getSelectedItem()

    if (this.toolAnimType === 'swing') {
      // Axe/pickaxe: big overhead swing arc
      const swingAngle = Math.sin(t * Math.PI)
      this.ctx.pRightArm.rotation.x = -swingAngle * 2.2
      this.ctx.pRightArm.rotation.z = swingAngle * 0.4
      if (this.ctx.pLeftArm) { this.ctx.pLeftArm.rotation.x = -swingAngle * 0.8; this.ctx.pLeftArm.rotation.z = -swingAngle * 0.2 }
      // Tool mesh wobbles during swing
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.3 - swingAngle * 0.5
      }
    } else if (this.toolAnimType === 'pour') {
      // Watering can: tilt forward and pour
      const pourT = Math.sin(t * Math.PI)
      this.ctx.pRightArm.rotation.x = -0.8 - pourT * 1.0
      this.ctx.pRightArm.rotation.z = pourT * 0.3
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.5 - pourT * 0.8
      }
    } else if (this.toolAnimType === 'dig') {
      // Hoe/shovel: downward digging motion
      const digT = Math.sin(t * Math.PI)
      this.ctx.pRightArm.rotation.x = -digT * 1.4
      this.ctx.pRightArm.rotation.z = 0
      if (this.ctx.pLeftArm) { this.ctx.pLeftArm.rotation.x = -digT * 0.5 }
      if (this.heldToolMesh) {
        this.heldToolMesh.rotation.x = -0.3 - digT * 0.6
      }
    }

    if (t >= 1) {
      this.toolAnimType = 'none'
      this.ctx.pRightArm.rotation.set(0, 0, 0)
      if (this.ctx.pLeftArm) this.ctx.pLeftArm.rotation.set(0, 0, 0)
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
    // Hold the freshly picked item above the head with both hands, then pocket it
    const mesh = createItemDropMesh(itemId, true)
    mesh.position.set(0, 1.5, 0)
    this.ctx.playerModel.add(mesh)

    // Raise both arms
    if (this.ctx.pLeftArm) this.ctx.pLeftArm.rotation.x = -2.5
    if (this.ctx.pRightArm) this.ctx.pRightArm.rotation.x = -2.5

    let t = 0
    const anim = () => {
      t += 0.025
      // Hold above head, slight bob
      mesh.position.y = 1.5 + Math.sin(t * 6) * 0.05
      mesh.rotation.y += 0.08
      if (t > 0.8) {
        // Pocket it: item vanishes into the bag, arms lower
        this.ctx.playerModel.remove(mesh)
        if (this.ctx.pLeftArm) this.ctx.pLeftArm.rotation.x = 0
        if (this.ctx.pRightArm) this.ctx.pRightArm.rotation.x = 0
        sound.collect()
        return
      }
      requestAnimationFrame(anim)
    }
    anim()
  }

  updateHeldVisual() {
    if (this.heldToolMesh) { this.ctx.playerModel.remove(this.heldToolMesh); this.heldToolMesh = null }
    
    
    if (this.ctx.pLeftArm) this.ctx.pLeftArm.rotation.set(0, 0, 0)
    if (this.ctx.pRightArm) this.ctx.pRightArm.rotation.set(0, 0, 0)

    const sel = this.ctx.player.getSelectedItem()
    if (!sel) return

    if (TOOLS[sel.id]) {
      this.heldToolMesh = createToolMesh(sel.id)
      
      if (this.ctx.pRightArm) {
        // Watering can held above head when selected
        if (sel.id === 'water') {
          this.heldToolMesh.position.set(0, 0.35, 0.1)
          this.heldToolMesh.rotation.x = -0.5
        } else {
          this.heldToolMesh.position.set(0, -0.15, 0.15)
          this.heldToolMesh.rotation.x = -0.3
        }
        this.ctx.pRightArm.add(this.heldToolMesh)
      }
    } else if (sel.id.startsWith('seed_')) {
      // Seeds: big emoji sprite held above head with both hands, touching
      const itemMesh = createItemDropMesh(sel.id)
      itemMesh.position.set(0, 1.35, 0.25)
      itemMesh.scale.set(2.5, 2.5, 2.5)
      this.ctx.playerModel.add(itemMesh)
      this.heldToolMesh = itemMesh as unknown as THREE.Group
      const la = this.ctx.playerModel.getObjectByName('this.pLeftArm') as THREE.Group | undefined
      const ra = this.ctx.playerModel.getObjectByName('this.pRightArm') as THREE.Group | undefined
      if (la) la.rotation.x = -2.6
      if (ra) ra.rotation.x = -2.6
    } else {
      // Other items: emoji sprite held above head with both hands, touching
      const itemMesh = createItemDropMesh(sel.id)
      itemMesh.position.set(0, 1.35, 0.25)
      itemMesh.scale.set(2.0, 2.0, 2.0)
      this.ctx.playerModel.add(itemMesh)
      this.heldToolMesh = itemMesh as unknown as THREE.Group
      const la = this.ctx.playerModel.getObjectByName('this.pLeftArm') as THREE.Group | undefined
      const ra = this.ctx.playerModel.getObjectByName('this.pRightArm') as THREE.Group | undefined
      if (la) la.rotation.x = -2.5
      if (ra) ra.rotation.x = -2.5
    }
  }
}
