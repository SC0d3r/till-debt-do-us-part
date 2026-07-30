import * as THREE from 'three'
import { GAME_CONFIG, MINE_ITEMS } from '../data/gameData'
import { loadTexture, createSprite } from '../core/AssetLoader'
import { sound } from '../core/SoundManager'

export interface MineTile {
  dug: boolean
  hasLadder: boolean
  itemId: string | null
  isRock: boolean
  mesh: THREE.Object3D | null
}

interface BouncingItem {
  sprite: THREE.Sprite
  itemId: string
  velocity: THREE.Vector3
  baseY: number
  time: number
  collected: boolean
}

export class MineSystem {
  group: THREE.Group
  currentFloor = 0
  digsLeft = GAME_CONFIG.mineDigsPerFloor
  floors: MineTile[][][] = []
  active = false
  private bouncingItems: BouncingItem[] = []

  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false
  }

  generateFloor(floorNum: number) {
    if (this.floors[floorNum]) return this.floors[floorNum]
    const size = 8 + Math.min(floorNum, 4)
    const floor: MineTile[][] = []
    let ladderPlaced = false
    for (let x = 0; x < size; x++) {
      floor[x] = []
      for (let z = 0; z < size; z++) {
        const isRock = Math.random() < 0.15 + floorNum * 0.05
        const hasLadder = !ladderPlaced && Math.random() < 0.03 && x > 0 && z > 0
        if (hasLadder) ladderPlaced = true
        let itemId: string | null = null
        if (!isRock && !hasLadder && Math.random() < 0.2 + floorNum * 0.05) {
          const roll = Math.random()
          let cumulative = 0
          for (const item of MINE_ITEMS) {
            cumulative += item.rarity
            if (roll <= cumulative) { itemId = item.id; break }
          }
        }
        floor[x][z] = { dug: false, hasLadder, itemId, isRock, mesh: null }
      }
    }
    if (!ladderPlaced && size > 1) {
      floor[Math.floor(Math.random() * (size - 1)) + 1][Math.floor(Math.random() * (size - 1)) + 1].hasLadder = true
    }
    this.floors[floorNum] = floor
    return floor
  }

  buildFloorVisuals(floorNum: number) {
    while (this.group.children.length > 0) this.group.remove(this.group.children[0])
    this.bouncingItems = []
    const floor = this.generateFloor(floorNum)
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)

    for (let x = 0; x < floor.length; x++) {
      for (let z = 0; z < floor[x].length; z++) {
        const tile = floor[x][z]
        const color = tile.isRock ? 0x888888 : 0x7a5c43
        const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
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

  dig(x: number, z: number, pickaxeTier: number): { success: boolean; foundLadder: boolean; itemId: string | null; blocked: boolean } {
    const floor = this.floors[this.currentFloor]
    if (!floor?.[x]?.[z]) return { success: false, foundLadder: false, itemId: null, blocked: false }
    const tile = floor[x][z]
    if (tile.dug) return { success: false, foundLadder: false, itemId: null, blocked: false }
    if (tile.isRock && pickaxeTier < 2) { sound.error(); return { success: false, foundLadder: false, itemId: null, blocked: true } }
    if (this.digsLeft <= 0) return { success: false, foundLadder: false, itemId: null, blocked: false }

    this.digsLeft--
    tile.dug = true
    sound.toolSwing()

    if (tile.mesh instanceof THREE.Mesh) {
      const mat = tile.mesh.material as THREE.MeshLambertMaterial
      mat.color.setHex(tile.hasLadder ? 0xd4a017 : 0x3a2a1a)
    }

    if (tile.itemId) {
      this.spawnBouncingItem(x, z, tile.itemId)
    }

    return { success: true, foundLadder: tile.hasLadder, itemId: null, blocked: false }
  }

  private spawnBouncingItem(x: number, z: number, itemId: string) {
    const texPath = `/assets/items/${itemId}.png`
    const sprite = createSprite(loadTexture(texPath), 0.6)
    // Pop up from ground with random horizontal scatter
    const scatterX = (Math.random() - 0.5) * 0.6
    const scatterZ = (Math.random() - 0.5) * 0.6
    sprite.position.set(x + scatterX, 0.1, z + scatterZ)
    sprite.center.set(0.5, 0.3)
    this.group.add(sprite)

    this.bouncingItems.push({
      sprite,
      itemId,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        3 + Math.random() * 2,
        (Math.random() - 0.5) * 2
      ),
      baseY: 0.3,
      time: 0,
      collected: false,
    })
  }

  collectNearby(px: number, pz: number, radius: number): string[] {
    const collected: string[] = []
    for (const bi of this.bouncingItems) {
      if (bi.collected) continue
      const dx = bi.sprite.position.x - px
      const dz = bi.sprite.position.z - pz
      if (dx * dx + dz * dz < radius * radius) {
        bi.collected = true
        collected.push(bi.itemId)
        this.group.remove(bi.sprite)
        // Play rare or normal sound based on item tier
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

  update(dt: number) {
    const gravity = -12
    for (const bi of this.bouncingItems) {
      if (bi.collected) continue
      bi.time += dt
      bi.velocity.y += gravity * dt
      bi.sprite.position.x += bi.velocity.x * dt
      bi.sprite.position.y += bi.velocity.y * dt
      bi.sprite.position.z += bi.velocity.z * dt

      // Bounce off ground
      if (bi.sprite.position.y < bi.baseY) {
        bi.sprite.position.y = bi.baseY
        bi.velocity.y *= -0.5
        bi.velocity.x *= 0.7
        bi.velocity.z *= 0.7
        // Stop bouncing when nearly still
        if (Math.abs(bi.velocity.y) < 0.3) {
          bi.velocity.set(0, 0, 0)
          bi.sprite.position.y = bi.baseY + Math.sin(bi.time * 3) * 0.05
        }
      }

      // Gentle float once settled
      if (bi.velocity.lengthSq() < 0.01) {
        bi.sprite.position.y = bi.baseY + Math.sin(bi.time * 3) * 0.08
      }
    }
  }
}
