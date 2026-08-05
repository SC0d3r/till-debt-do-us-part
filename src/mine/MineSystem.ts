import * as THREE from 'three'
import { GAME_CONFIG, MINE_ITEMS } from '../data/gameData'
import { loadTexture, createSprite } from '../core/AssetLoader'
import { createHoleModel } from '../core/MeshFactory'
import { sound } from '../core/SoundManager'

export interface MineTile {
  dug: boolean
  hasHole: boolean
  itemId: string | null
  isRock: boolean
  mesh: THREE.Object3D | null
  holeModel: THREE.Group | null
}

interface BouncingItem {
  sprite: THREE.Sprite
  itemId: string
  velocity: THREE.Vector3
  baseY: number
  time: number
  collected: boolean
  settled: boolean
}

export interface DigResult {
  success: boolean
  foundHole: boolean
  exitMine: boolean
  itemId: string | null
  blocked: boolean
  outOfEnergy: boolean
}

export class MineSystem {
  group: THREE.Group
  currentFloor = 0
  digsLeft = GAME_CONFIG.mineDigsPerFloor
  floors: MineTile[][][] = []
  active = false
  private bouncingItems: BouncingItem[] = []
  private holeModels: THREE.Group[] = []
  private digsThisFloor = 0
  private holeRevealed = false

  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false
  }

  generateFloor(floorNum: number) {
    if (this.floors[floorNum]) return this.floors[floorNum]
    const size = 14 + Math.min(floorNum, 6)
    const floor: MineTile[][] = []
    for (let x = 0; x < size; x++) {
      floor[x] = []
      for (let z = 0; z < size; z++) {
        const isRock = Math.random() < 0.15 + floorNum * 0.04
        let itemId: string | null = null
        // Item chance scales with depth
        const itemChance = 0.16 + floorNum * 0.025
        if (!isRock && Math.random() < itemChance) {
          // Shift rarity toward rarer items on deeper levels
          const depthBonus = 0.035 * (floorNum + 1)
          const roll = Math.random()
          let cumulative = 0
          for (const item of MINE_ITEMS) {
            const adjustedRarity = item.rarity + (item.tier !== 'common' ? depthBonus : 0)
            cumulative += adjustedRarity
            if (roll <= cumulative) { itemId = item.id; break }
          }
        }
        floor[x][z] = { dug: false, hasHole: false, itemId, isRock, mesh: null, holeModel: null }
      }
    }
    this.floors[floorNum] = floor
    return floor
  }

  buildFloorVisuals(floorNum: number) {
    while (this.group.children.length > 0) this.group.remove(this.group.children[0])
    this.bouncingItems = []
    this.holeModels = []
    this.digsThisFloor = 0
    this.holeRevealed = false
    const floor = this.generateFloor(floorNum)
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x666666, side: THREE.FrontSide })
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x5a3c28, side: THREE.FrontSide })

    for (let x = 0; x < floor.length; x++) {
      for (let z = 0; z < floor[x].length; z++) {
        const tile = floor[x][z]
        // Clone so dig color change is per-tile, not shared
        const mat = (tile.isRock ? rockMat : dirtMat).clone()
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, 0.01, z)
        this.group.add(mesh)
        tile.mesh = mesh
      }
    }
  }

  enter() {
    this.active = true
    this.currentFloor = 0
    this.digsLeft = GAME_CONFIG.mineDigsPerFloor
    this.buildFloorVisuals(0)
    this.group.visible = true
  }

  exit(): { items: Record<string, number>; floorReached: number } {
    this.active = false
    this.group.visible = false
    const items: Record<string, number> = {}
    // Collect any remaining bouncing items on exit
    for (const bi of this.bouncingItems) {
      if (!bi.collected) {
        items[bi.itemId] = (items[bi.itemId] || 0) + 1
      }
    }
    this.bouncingItems = []
    return { items, floorReached: this.currentFloor }
  }

  // Only one ladder per level. It's a gamble: each dig has a small flat chance
  // to reveal it (early finds are lucky), with only a small pity bump after
  // many misses so it stays a real search. Deeper levels are harder to find.
  getHoleChance(): number {
    if (this.holeRevealed || this.isLastFloor()) return 0
    const flat = Math.max(0.02, 0.05 - this.currentFloor * 0.0025)
    const pity = Math.max(0, 0.006 - this.currentFloor * 0.0004)
    return Math.min(flat + this.digsThisFloor * pity, 0.3)
  }

  // Digging never sends you back up. Only the ladder has a small chance to
  // fail: instead of descending, the old rungs give way and dump you at the
  // surface. The chance grows with depth but stays low.
  getExitChance(): number {
    return Math.min(0.04 + this.currentFloor * 0.008, 0.12)
  }

  dig(x: number, z: number, pickaxeTier: number): DigResult {
    const floor = this.floors[this.currentFloor]
    if (!floor?.[x]?.[z]) return { success: false, foundHole: false, exitMine: false, itemId: null, blocked: false, outOfEnergy: false }
    const tile = floor[x][z]
    if (tile.dug) return { success: false, foundHole: false, exitMine: false, itemId: null, blocked: false, outOfEnergy: false }
    if (tile.isRock && pickaxeTier < 2) { sound.error(); return { success: false, foundHole: false, exitMine: false, itemId: null, blocked: true, outOfEnergy: false } }
    if (this.digsLeft <= 0) { sound.error(); return { success: false, foundHole: false, exitMine: false, itemId: null, blocked: true, outOfEnergy: true } }

    this.digsLeft--
    this.digsThisFloor++
    tile.dug = true
    sound.toolSwing()

    if (tile.mesh instanceof THREE.Mesh) {
      const mat = tile.mesh.material as THREE.MeshLambertMaterial
      mat.color.setHex(0x1a0e08)
    }

    if (tile.itemId) {
      this.spawnBouncingItem(x, z, tile.itemId)
    }

    // Roll the single ladder — only once per level
    if (!this.holeRevealed && Math.random() < this.getHoleChance()) {
      this.holeRevealed = true
      tile.hasHole = true
      const model = createHoleModel()
      model.position.set(x, 0.02, z)
      this.group.add(model)
      tile.holeModel = model
      this.holeModels.push(model)
      return { success: true, foundHole: true, exitMine: false, itemId: null, blocked: false, outOfEnergy: false }
    }

    return { success: true, foundHole: false, exitMine: false, itemId: null, blocked: false, outOfEnergy: false }
  }

  getNearbyHole(px: number, pz: number, radius: number): { x: number; z: number } | null {
    const floor = this.floors[this.currentFloor]
    if (!floor) return null
    const r2 = radius * radius
    for (const hole of this.holeModels) {
      const dx = hole.position.x - px
      const dz = hole.position.z - pz
      if (dx * dx + dz * dz < r2) {
        return { x: Math.round(hole.position.x), z: Math.round(hole.position.z) }
      }
    }
    return null
  }

  private spawnBouncingItem(x: number, z: number, itemId: string) {
    const texPath = `/assets/items/${itemId}.png`
    const sprite = createSprite(loadTexture(texPath), 0.8)
    const angle = Math.random() * Math.PI * 2
    const force = 1.5 + Math.random() * 2.5
    sprite.position.set(x, 0.1, z)
    sprite.center.set(0.5, 0.3)
    this.group.add(sprite)

    this.bouncingItems.push({
      sprite,
      itemId,
      velocity: new THREE.Vector3(
        Math.cos(angle) * force,
        4 + Math.random() * 3,
        Math.sin(angle) * force
      ),
      baseY: 0.3,
      time: 0,
      collected: false,
      settled: false,
    })
  }

  collectNearby(px: number, pz: number, radius: number): string[] {
    const collected: string[] = []
    for (const bi of this.bouncingItems) {
      if (bi.collected || !bi.settled) continue
      const dx = bi.sprite.position.x - px
      const dz = bi.sprite.position.z - pz
      if (dx * dx + dz * dz < radius * radius) {
        bi.collected = true
        collected.push(bi.itemId)
        this.group.remove(bi.sprite)
        const itemDef = MINE_ITEMS.find(m => m.id === bi.itemId)
        if (itemDef && (itemDef.tier === 'epic' || itemDef.tier === 'legendary')) {
          sound.collectRare()
        } else {
          sound.collect()
        }
      }
    }
    this.bouncingItems = this.bouncingItems.filter(bi => !bi.collected)
    return collected
  }

  descend(): boolean {
    if (this.currentFloor >= GAME_CONFIG.mineFloors - 1) return false
    this.currentFloor++
    this.digsLeft = GAME_CONFIG.mineDigsPerFloor
    this.buildFloorVisuals(this.currentFloor)
    return true
  }

  isLastFloor(): boolean {
    return this.currentFloor >= GAME_CONFIG.mineFloors - 1
  }

  update(dt: number) {
    const gravity = -12
    // Floor bounds for item wall-bounce (tile band [0, size): item centers may
    // sit between 0.5 and size-0.5).
    const floorSize = this.floors[this.currentFloor]?.length ?? 0
    const minB = 0.5
    const maxB = floorSize > 0 ? floorSize - 0.5 : 0.5
    for (const bi of this.bouncingItems) {
      if (bi.collected) continue
      bi.time += dt
      bi.velocity.y += gravity * dt
      bi.sprite.position.x += bi.velocity.x * dt
      bi.sprite.position.y += bi.velocity.y * dt
      bi.sprite.position.z += bi.velocity.z * dt

      // Bounce off the floor edges: a launch aimed at the west/south border
      // used to carry the item OFF the playable area, where no player position
      // could ever reach it — dug ore lost forever. Reflect horizontally
      // instead (friction mirrors the ground-bounce decay).
      if (floorSize > 0) {
        if (bi.sprite.position.x < minB) { bi.sprite.position.x = minB; bi.velocity.x = Math.abs(bi.velocity.x) * 0.6 }
        else if (bi.sprite.position.x > maxB) { bi.sprite.position.x = maxB; bi.velocity.x = -Math.abs(bi.velocity.x) * 0.6 }
        if (bi.sprite.position.z < minB) { bi.sprite.position.z = minB; bi.velocity.z = Math.abs(bi.velocity.z) * 0.6 }
        else if (bi.sprite.position.z > maxB) { bi.sprite.position.z = maxB; bi.velocity.z = -Math.abs(bi.velocity.z) * 0.6 }
      }

      // Bounce off ground
      if (bi.sprite.position.y < bi.baseY) {
        bi.sprite.position.y = bi.baseY
        bi.velocity.y *= -0.5
        bi.velocity.x *= 0.7
        bi.velocity.z *= 0.7
        // Stop bouncing when nearly still
        if (Math.abs(bi.velocity.y) < 0.3) {
          bi.velocity.set(0, 0, 0)
          bi.settled = true
          bi.sprite.position.y = bi.baseY + Math.sin(bi.time * 3) * 0.05
        }
      }

      // Gentle float once settled
      if (bi.velocity.lengthSq() < 0.01) {
        bi.sprite.position.y = bi.baseY + Math.sin(bi.time * 3) * 0.08
      }
    }

    // Animate revealed holes: pulse rim + bob indicator
    for (const model of this.holeModels) {
      const t = performance.now() / 1000
      const rim = model.getObjectByName('rim') as THREE.Mesh | null
      if (rim) {
        const mat = rim.material as THREE.MeshBasicMaterial
        mat.opacity = 0.55 + Math.sin(t * 4) * 0.3
      }
      const indicator = model.getObjectByName('indicator') as THREE.Sprite | null
      if (indicator) {
        indicator.position.y = 1.3 + Math.sin(t * 3) * 0.12
      }
    }
  }
}
