import * as THREE from 'three'
import { GAME_CONFIG, CROPS } from '../data/gameData'
import { SeededRNG, COLORS, getTileTexture, createTexturedPlane, createTree, createSapling, createSmallTree, createStone, createHouse, createShop, createMineEntrance, createWell, createShippingBin, createCropMesh, createFencePost, createFenceRail, createMountain, createFlowerPatch, createRiverSegment } from '../core/MeshFactory'
import { sound } from '../core/SoundManager'

export enum TileType {
  GRASS=0, DIRT=1, TILLED=2, WATERED=3, PATH=4, WATER=5,
  TREE=6, STONE=7, ROCK=8, WEED=9, STUMP=10,
  HOUSE=11, SHOP=12, MINE=13, WELL=14, BIN=15,
  SAPLING=16, SMALL_TREE=17, FENCE=18,
}

const SOLID = new Set([TileType.TREE, TileType.STONE, TileType.ROCK, TileType.WATER, TileType.HOUSE, TileType.SHOP, TileType.MINE, TileType.WELL, TileType.BIN, TileType.SMALL_TREE, TileType.FENCE])

const TILE_TEX_KEY: Record<number, string> = {
  [TileType.GRASS]: 'grass', [TileType.DIRT]: 'dirt',
  [TileType.TILLED]: 'tilled', [TileType.WATERED]: 'watered',
  [TileType.PATH]: 'path', [TileType.WATER]: 'water',
  [TileType.WEED]: 'grass', [TileType.STUMP]: 'dirt',
  [TileType.SAPLING]: 'grass', [TileType.SMALL_TREE]: 'grass',
  [TileType.FENCE]: 'grass',
}

export interface FarmTile {
  type: TileType
  cropId: string | null
  growthDay: number
  watered: boolean
  treeAge: number // 0=sapling, 1=small, 2+=full
  groundMesh: THREE.Mesh | null
  objGroup: THREE.Object3D | null
  cropGroup: THREE.Group | null
}

export class FarmGrid {
  width = GAME_CONFIG.farmWidth
  height = GAME_CONFIG.farmHeight
  tiles: FarmTile[][] = []
  group: THREE.Group
  binItems: Array<{id:string; count:number}> = []
  binGroup: THREE.Group | null = null
  private rng: SeededRNG

  constructor(seed?: number) {
    this.group = new THREE.Group()
    this.rng = new SeededRNG(seed ?? Date.now())
    this.generateMap()
    this.buildVisuals()
    this.buildBoundary()
  }

  isSolid(x: number, z: number): boolean {
    if (x < 0 || x >= this.width || z < 0 || z >= this.height) return true
    return SOLID.has(this.tiles[x][z].type)
  }

  private generateMap() {
    const W = this.width, H = this.height
    const rng = this.rng

    // Initialize all as grass
    for (let x = 0; x < W; x++) {
      this.tiles[x] = []
      for (let z = 0; z < H; z++) {
        this.tiles[x][z] = { type: TileType.GRASS, cropId:null, growthDay:0, watered:false, treeAge:0, groundMesh:null, objGroup:null, cropGroup:null }
      }
    }

    // Place buildings at fixed positions
    const midX = Math.floor(W / 2)
    this.setTile(0, 0, TileType.HOUSE)
    this.setTile(W-1, 0, TileType.SHOP)
    this.setTile(0, H-1, TileType.MINE)
    this.setTile(midX, H-2, TileType.WELL)       // well: middle-x, bottom-y
    this.setTile(midX, 1, TileType.BIN)           // bin: middle-x, top area (opposite side of well)

    // Procedural paths: connect buildings with natural-feeling paths
    this.carvePath(0, 0, midX + 2, 0)   // house to bin (top row)
    this.carvePath(0, 0, midX, H-2)     // house to well
    this.carvePath(0, 0, 0, H-1)        // house to mine (left edge)
    this.carvePath(0, 0, W-1, 0)        // house to shop (top edge)
    this.carvePath(W-1, 0, W-1, Math.floor(H/2)) // shop down right side

    // Central farming area: organic blob shape using distance + noise
    const cx = W/2, cz = H/2
    for (let x = 2; x < W-2; x++) {
      for (let z = 2; z < H-2; z++) {
        if (this.tiles[x][z].type !== TileType.GRASS) continue
        const dist = Math.sqrt((x-cx)**2 + (z-cz)**2)
        const noise = rng.next() * 2
        if (dist + noise < Math.min(W, H) * 0.38) {
          this.tiles[x][z].type = TileType.DIRT
        }
      }
    }

    // Water pond: organic shape in corner
    const wx = W - 3, wz = H - 3
    for (let x = wx-2; x <= wx+1; x++) {
      for (let z = wz-2; z <= wz+1; z++) {
        if (x < 0 || x >= W || z < 0 || z >= H) continue
        const dist = Math.sqrt((x-wx)**2 + (z-wz)**2)
        if (dist < 2.0 + rng.next() * 0.5) {
          this.tiles[x][z].type = TileType.WATER
        }
      }
    }

    // Safe zones around buildings (no trees/stones within 3 tiles)
    const buildingPositions = [
      { x: 0, z: 0 },       // house
      { x: W-1, z: 0 },     // shop
      { x: 0, z: H-1 },     // mine
      { x: midX, z: H-2 },  // well
      { x: midX, z: 1 },    // bin
    ]
    const isNearBuilding = (tx: number, tz: number) => {
      for (const b of buildingPositions) {
        if (Math.abs(tx - b.x) <= 3 && Math.abs(tz - b.z) <= 3) return true
      }
      return false
    }

    // Scatter trees, stones, weeds on remaining grass
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < H; z++) {
        if (this.tiles[x][z].type !== TileType.GRASS) continue
        if (isNearBuilding(x, z)) continue
        const r = rng.next()
        if (r < 0.08) { this.tiles[x][z].type = TileType.TREE; this.tiles[x][z].treeAge = 2 }
        else if (r < 0.13) { this.tiles[x][z].type = TileType.STONE }
        else if (r < 0.16) { this.tiles[x][z].type = TileType.ROCK }
        else if (r < 0.24) { this.tiles[x][z].type = TileType.WEED }
        else if (r < 0.27) { this.tiles[x][z].type = TileType.STUMP }
        else if (r < 0.29) { this.tiles[x][z].type = TileType.SAPLING; this.tiles[x][z].treeAge = 0 }
        else if (r < 0.31) { this.tiles[x][z].type = TileType.SMALL_TREE; this.tiles[x][z].treeAge = 1 }
      }
    }
  }

  private setTile(x: number, z: number, type: TileType) {
    if (x >= 0 && x < this.width && z >= 0 && z < this.height) {
      this.tiles[x][z].type = type
    }
  }

  private carvePath(x0: number, z0: number, x1: number, z1: number) {
    // Simple L-shaped path with some wobble
    let x = x0, z = z0
    while (x !== x1 || z !== z1) {
      if (this.tiles[x]?.[z]?.type === TileType.GRASS || this.tiles[x]?.[z]?.type === TileType.DIRT) {
        this.tiles[x][z].type = TileType.PATH
      }
      if (x < x1) x++
      else if (x > x1) x--
      else if (z < z1) z++
      else if (z > z1) z--
    }
  }

  private buildVisuals() {
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        this.buildTileVisual(x, z)
      }
    }
  }

  private buildTileVisual(x: number, z: number) {
    const tile = this.tiles[x][z]

    // Ground plane with texture
    const texKey = TILE_TEX_KEY[tile.type] ?? 'dirt'
    const tex = getTileTexture(texKey)
    const ground = createTexturedPlane(tex)
    ground.position.set(x, 0.01, z)
    ground.receiveShadow = true
    this.group.add(ground)
    tile.groundMesh = ground

    // Remove old object
    if (tile.objGroup) { this.group.remove(tile.objGroup); tile.objGroup = null }

    switch (tile.type) {
      case TileType.TREE: { const t = createTree(); t.position.set(x, 0, z); this.group.add(t); tile.objGroup = t; break }
      case TileType.SAPLING: { const s = createSapling(); s.position.set(x, 0, z); this.group.add(s); tile.objGroup = s; break }
      case TileType.SMALL_TREE: { const s = createSmallTree(); s.position.set(x, 0, z); this.group.add(s); tile.objGroup = s; break }
      case TileType.STONE: { const s = createStone(0); s.position.set(x, 0, z); this.group.add(s); tile.objGroup = s; break }
      case TileType.ROCK: { const s = createStone(1); s.position.set(x, 0, z); this.group.add(s); tile.objGroup = s; break }
      case TileType.HOUSE: { const h = createHouse(); h.position.set(x, 0, z); this.group.add(h); tile.objGroup = h; break }
      case TileType.SHOP: { const s = createShop(); s.position.set(x, 0, z); this.group.add(s); tile.objGroup = s; break }
      case TileType.MINE: { const m = createMineEntrance(); m.position.set(x, 0, z); this.group.add(m); tile.objGroup = m; break }
      case TileType.WELL: { const w = createWell(); w.position.set(x, 0, z); this.group.add(w); tile.objGroup = w; break }
      case TileType.BIN: { const b = createShippingBin(); b.position.set(x, 0, z); this.group.add(b); tile.objGroup = b; this.binGroup = b; break }
      case TileType.WEED: {
        const weed = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshLambertMaterial({ color: COLORS.grassDark }))
        weed.position.set(x, 0.08, z); this.group.add(weed); tile.objGroup = weed; break
      }
      case TileType.STUMP: {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.15, 6), new THREE.MeshLambertMaterial({ color: COLORS.trunk }))
        stump.position.set(x, 0.08, z); this.group.add(stump); tile.objGroup = stump; break
      }
      case TileType.WATER: {
        const waterTop = new THREE.Mesh(
          new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI/2),
          new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.7 })
        )
        waterTop.position.set(x, 0.05, z); this.group.add(waterTop); tile.objGroup = waterTop; break
      }
    }
  }

  updateTileVisual(x: number, z: number) {
    const tile = this.tiles[x][z]
    if (!tile) return

    // Update ground texture
    if (tile.groundMesh) {
      const effectiveType = tile.watered ? TileType.WATERED : tile.type
      const texKey = TILE_TEX_KEY[effectiveType] ?? 'dirt'
      const mat = tile.groundMesh.material as THREE.MeshLambertMaterial
      mat.map = getTileTexture(texKey)
      mat.needsUpdate = true
    }

    // Rebuild object
    if (tile.objGroup) { this.group.remove(tile.objGroup); tile.objGroup = null }
    this.buildTileVisual(x, z)

    // Crop
    if (tile.cropGroup) { this.group.remove(tile.cropGroup); tile.cropGroup = null }
    if (tile.cropId) {
      const crop = CROPS[tile.cropId]
      if (!crop) return
      const stage = Math.min(Math.floor((tile.growthDay / crop.growthDays) * crop.stages), crop.stages - 1)
      const cg = createCropMesh(tile.cropId, stage)
      cg.position.set(x, 0.1, z)
      this.group.add(cg)
      tile.cropGroup = cg
    }
  }

  // ─── Actions ───
  chopTree(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t) return false
    if (t.type === TileType.TREE || t.type === TileType.SMALL_TREE) {
      t.type = TileType.STUMP; t.treeAge = 0; this.updateTileVisual(x, z); sound.toolSwing(); return true
    }
    if (t.type === TileType.SAPLING) {
      t.type = TileType.GRASS; t.treeAge = 0; this.updateTileVisual(x, z); sound.toolSwing(); return true
    }
    return false
  }
  breakStone(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t || (t.type !== TileType.STONE && t.type !== TileType.ROCK)) return false
    t.type = TileType.DIRT; this.updateTileVisual(x, z); sound.toolSwing(); return true
  }
  clearDebris(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t) return false
    if (t.type === TileType.WEED || t.type === TileType.STUMP) {
      t.type = TileType.DIRT; this.updateTileVisual(x, z); sound.toolSwing(); return true
    }
    return false
  }
  till(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t) return false
    if (t.type === TileType.DIRT || t.type === TileType.GRASS) {
      t.type = TileType.TILLED; this.updateTileVisual(x, z); sound.toolSwing(); return true
    }
    return false
  }
  plant(x: number, z: number, cropId: string): boolean {
    const t = this.tiles[x]?.[z]; if (!t) return false
    if ((t.type === TileType.TILLED || t.type === TileType.WATERED) && !t.cropId) {
      t.cropId = cropId; t.growthDay = 0; t.watered = false
      this.updateTileVisual(x, z); sound.plant(); return true
    }
    return false
  }
  water(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t) return false
    if ((t.type === TileType.TILLED || (t.cropId && !t.watered))) {
      t.watered = true; if (t.type === TileType.TILLED) t.type = TileType.WATERED
      this.updateTileVisual(x, z); sound.water(); return true
    }
    return false
  }
  harvest(x: number, z: number): string | null {
    const t = this.tiles[x]?.[z]; if (!t?.cropId) return null
    const crop = CROPS[t.cropId]; if (!crop || t.growthDay < crop.growthDays) return null
    const id = t.cropId; t.cropId = null; t.growthDay = 0; t.watered = false; t.type = TileType.TILLED
    this.updateTileVisual(x, z); sound.harvest(); return id
  }
  isRipe(x: number, z: number): boolean {
    const t = this.tiles[x]?.[z]; if (!t?.cropId) return false
    const c = CROPS[t.cropId]; return !!c && t.growthDay >= c.growthDays
  }

  addToBin(id: string, count: number) {
    const existing = this.binItems.find(b => b.id === id)
    if (existing) existing.count += count
    else this.binItems.push({ id, count })
    if (this.binGroup) {
      const origRot = this.binGroup.rotation.z
      let t = 0
      const wobble = () => {
        t += 0.15
        this.binGroup!.rotation.z = origRot + Math.sin(t * 8) * 0.08 * Math.max(0, 1 - t)
        if (t < 1) requestAnimationFrame(wobble)
        else this.binGroup!.rotation.z = origRot
      }
      wobble()
    }
    sound.collect()
  }

  clearBin(): Array<{id:string; count:number}> {
    const items = [...this.binItems]
    this.binItems = []
    return items
  }

  advanceDay(): string[] {
    const spoiled: string[] = []
    const rng = new SeededRNG(this.rng.next() * 999999 | 0)

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        const t = this.tiles[x][z]

        // Crop growth/spoilage
        if (t.cropId) {
          if (t.watered) t.growthDay++
          else { spoiled.push(t.cropId); t.cropId = null; t.growthDay = 0; t.type = TileType.TILLED; sound.spoil() }
        }
        t.watered = false
        if (t.type === TileType.WATERED) t.type = TileType.TILLED

        // Tree growth: sapling → small → full over days
        if (t.type === TileType.SAPLING) {
          t.treeAge++
          if (t.treeAge >= 2) { t.type = TileType.SMALL_TREE; this.updateTileVisual(x, z) }
        } else if (t.type === TileType.SMALL_TREE) {
          t.treeAge++
          if (t.treeAge >= 4) { t.type = TileType.TREE; this.updateTileVisual(x, z) }
        }

        // Grass regrowth on untilled dirt
        if (t.type === TileType.DIRT && !t.cropId && rng.chance(0.08)) {
          t.type = TileType.GRASS; this.updateTileVisual(x, z)
        }

        // Random stone appearance on grass
        if (t.type === TileType.GRASS && rng.chance(0.02)) {
          t.type = TileType.STONE; this.updateTileVisual(x, z)
        }

        // New tree sapling on grass
        if (t.type === TileType.GRASS && rng.chance(0.015)) {
          t.type = TileType.SAPLING; t.treeAge = 0; this.updateTileVisual(x, z)
        }

        this.updateTileVisual(x, z)
      }
    }
    return spoiled
  }

  getTile(x: number, z: number): FarmTile | null {
    if (x < 0 || x >= this.width || z < 0 || z >= this.height) return null
    return this.tiles[x][z]
  }

  private buildBoundary() {
    const W = this.width, H = this.height
    const margin = 2
    const bgRng = new SeededRNG(this.rng.next() * 999999 | 0)

    // Fence around perimeter
    for (let x = -margin; x < W + margin; x++) {
      for (const z of [-margin, H + margin - 1]) {
        const post = createFencePost(); post.position.set(x, 0, z); this.group.add(post)
        if (x < W + margin - 1) { const rail = createFenceRail(); rail.position.set(x + 0.5, 0.4, z); this.group.add(rail) }
      }
    }
    for (let z = -margin; z < H + margin; z++) {
      for (const x of [-margin, W + margin - 1]) {
        const post = createFencePost(); post.position.set(x, 0, z); this.group.add(post)
        if (z < H + margin - 1) { const rail = createFenceRail(); rail.position.set(x, 0.4, z + 0.5); rail.rotation.y = Math.PI / 2; this.group.add(rail) }
      }
    }

    // Mountains in the far background
    const mtPositions = [
      { x: -8, z: -10, s: 2.5 }, { x: 5, z: -12, s: 3.0 }, { x: 18, z: -10, s: 2.2 },
      { x: -10, z: 5, s: 2.0 }, { x: -10, z: 15, s: 2.8 },
      { x: W + 8, z: -5, s: 2.3 }, { x: W + 10, z: 10, s: 2.6 },
      { x: 5, z: H + 10, s: 2.4 }, { x: 14, z: H + 12, s: 3.2 },
    ]
    for (const mp of mtPositions) {
      const mt = createMountain(mp.s)
      mt.position.set(mp.x, 0, mp.z)
      this.group.add(mt)
    }

    // Dense forest beyond fence (more trees, varied sizes)
    for (let i = 0; i < 100; i++) {
      const side = bgRng.int(0, 3)
      let bx: number, bz: number
      switch (side) {
        case 0: bx = bgRng.range(-margin-6, W+margin+6); bz = -margin - bgRng.range(1, 8); break
        case 1: bx = bgRng.range(-margin-6, W+margin+6); bz = H + margin + bgRng.range(0, 7); break
        case 2: bx = -margin - bgRng.range(1, 8); bz = bgRng.range(-margin-6, H+margin+6); break
        default: bx = W + margin + bgRng.range(0, 7); bz = bgRng.range(-margin-6, H+margin+6); break
      }
      const tree = createTree(bgRng.range(0.6, 1.5))
      tree.position.set(bx, 0, bz)
      this.group.add(tree)
    }

    // Flower patches scattered around the farm edges and paths
    for (let i = 0; i < 25; i++) {
      const fx = bgRng.range(-1, W + 1)
      const fz = bgRng.range(-1, H + 1)
      // Only place on grass tiles or just outside fence
      const flowers = createFlowerPatch()
      flowers.position.set(fx, 0.05, fz)
      this.group.add(flowers)
    }

    // River running along one edge
    const river = createRiverSegment(H + 8)
    river.position.set(W + margin + 3, 0, H / 2 - 0.5)
    this.group.add(river)

    // Large green ground plane
    const bgGround = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 40, H + 40).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORS.grassDark })
    )
    bgGround.position.set(W / 2 - 0.5, -0.02, H / 2 - 0.5)
    bgGround.receiveShadow = true
    this.group.add(bgGround)
  }

  saveState(): unknown[] {
    const s: unknown[] = []
    for (let x = 0; x < this.width; x++) {
      const row: unknown[] = []
      for (let z = 0; z < this.height; z++) {
        const t = this.tiles[x][z]
        row.push({ type:t.type, cropId:t.cropId, growthDay:t.growthDay, watered:t.watered, treeAge:t.treeAge })
      }
      s.push(row)
    }
    return s
  }

  loadState(state: Array<Array<{type:TileType;cropId:string|null;growthDay:number;watered:boolean;treeAge?:number}>>) {
    for (let x = 0; x < this.width; x++)
      for (let z = 0; z < this.height; z++)
        if (state[x]?.[z]) {
          const s = state[x][z], t = this.tiles[x][z]
          t.type = s.type; t.cropId = s.cropId; t.growthDay = s.growthDay; t.watered = s.watered; t.treeAge = s.treeAge ?? 0
          this.updateTileVisual(x, z)
        }
  }
}
