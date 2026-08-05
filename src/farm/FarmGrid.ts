import * as THREE from 'three'
import { GAME_CONFIG, CROPS } from '../data/gameData'
import { SeededRNG, COLORS, getTileTexture, createTree, createSapling, createSmallTree, createStone, createHouse, createShop, createMineEntrance, createWell, createShippingBin, createCropMesh, createFencePost, createFenceRail, createMountain, createRiverSegment } from '../core/MeshFactory'
import { buildInstanced, type InstPlacement } from '../core/Instancing'
import { disposeObject } from '../core/disposeObject'
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
  objGroup: THREE.Object3D | null
  cropGroup: THREE.Group | null
}

// Soft blue-purple emissive for Moonpetal (flower) crops at night. Tuned down
// from the original neon 0x9955ff @ 1.0 to a gentler 0x8866cc @ 0.5; unripe
// plants glow at a fraction of that (shop text promises Moonpetal "glows at
// night" unconditionally). Shared consts so the glow pass never allocates.
const MOONPETAL_GLOW = new THREE.Color(0x8866cc)
const MOONPETAL_GLOW_INTENSITY = 0.5
const MOONPETAL_UNRIPE_GLOW_INTENSITY = 0.175

export class FarmGrid {
  width = GAME_CONFIG.farmWidth
  height = GAME_CONFIG.farmHeight
  tiles: FarmTile[][] = []
  group: THREE.Group
  binItems: Array<{id:string; count:number}> = []
  binGroup: THREE.Group | null = null
  private rng: SeededRNG
  private groundMeshes: Record<string, THREE.InstancedMesh> = {}
  private groundKey: string[] = []
  private hiddenGround = new THREE.Matrix4().makeTranslation(0, -100, 0)
  // Ripe crop jiggle state: tileKey -> remaining seconds of jiggle / delay
  private jiggleTime = new Map<number, number>()
  private jiggleDelay = new Map<number, number>()
  private jiggleClock = 0

  constructor(seed?: number) {
    this.group = new THREE.Group()
    this.rng = new SeededRNG(seed ?? Date.now())
    this.generateMap()
    this.buildGroundMeshes()
    this.buildVisuals()
    this.buildBoundary()
  }

  // Releases GPU resources (geometries/materials) for every mesh in this farm.
  // Call before dropping the farm group (e.g. startGame() replacing an old
  // farm) so repeated rebuilds from the debug harness don't leak buffers.
  // Textures are shared/cached (MeshFactory.getTileTexture) and NOT disposed.
  dispose() {
    disposeObject(this.group)
    this.group.clear()
    this.groundMeshes = {}
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
        this.tiles[x][z] = { type: TileType.GRASS, cropId:null, growthDay:0, watered:false, treeAge:0, objGroup:null, cropGroup:null }
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

  private buildGroundMeshes() {
    const capacity = this.width * this.height
    const plane = new THREE.PlaneGeometry(1, 1)
    plane.rotateX(-Math.PI / 2)
    const keys = ['grass', 'dirt', 'tilled', 'watered', 'path', 'water']
    for (const k of keys) {
      const im = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ map: getTileTexture(k) }), capacity)
      im.frustumCulled = false
      this.group.add(im)
      this.groundMeshes[k] = im
      for (let i = 0; i < capacity; i++) im.setMatrixAt(i, this.hiddenGround)
      im.instanceMatrix.needsUpdate = true
    }
    this.groundKey = new Array(capacity).fill('')
  }

  private setGround(x: number, z: number, texKey: string) {
    const idx = z * this.width + x
    const prev = this.groundKey[idx]
    if (prev === texKey) return
    this.groundKey[idx] = texKey
    const mesh = this.groundMeshes[texKey]
    if (!mesh) return
    const m = new THREE.Matrix4().makeTranslation(x, 0.01, z)
    mesh.setMatrixAt(idx, m)
    mesh.instanceMatrix.needsUpdate = true
    if (prev) {
      const pmesh = this.groundMeshes[prev]
      if (pmesh) {
        pmesh.setMatrixAt(idx, this.hiddenGround)
        pmesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  private buildTileVisual(x: number, z: number) {
    const tile = this.tiles[x][z]

    // Ground plane with texture (instanced)
    this.setGround(x, z, TILE_TEX_KEY[tile.type] ?? 'dirt')

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

    // Rebuild object (ground texture handled by setGround inside buildTileVisual)
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

  hasRipeCrop(): boolean {
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        const t = this.tiles[x][z]
        if (!t.cropId) continue
        const c = CROPS[t.cropId]
        if (c && t.growthDay >= c.growthDays) return true
      }
    }
    return false
  }

  // Fully-grown crops jiggle from time to time, each on its own random rhythm
  updateRipeAnim(dt: number) {
    this.jiggleClock += dt
    const clock = this.jiggleClock
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        const t = this.tiles[x][z]
        const key = x * 1000 + z
        if (!t.cropId || !t.cropGroup) {
          if (this.jiggleTime.has(key)) this.jiggleTime.delete(key)
          if (this.jiggleDelay.has(key)) this.jiggleDelay.delete(key)
          continue
        }
        const crop = CROPS[t.cropId]
        if (!crop || t.growthDay < crop.growthDays) continue
        let jt = this.jiggleTime.get(key) ?? 0
        let jd = this.jiggleDelay.get(key)
        if (jd === undefined) jd = 1 + Math.random() * 4
        if (jt > 0) {
          jt -= dt
          const env = Math.sin(Math.max(0, (1.2 - jt) / 1.2) * Math.PI)
          t.cropGroup.rotation.z = Math.sin(clock * 13) * 0.07 * env
          t.cropGroup.rotation.x = Math.cos(clock * 9) * 0.04 * env
          if (jt <= 0) {
            t.cropGroup.rotation.z = 0
            t.cropGroup.rotation.x = 0
            jd = 2.5 + Math.random() * 5
          }
        } else {
          jd -= dt
          if (jd <= 0) jt = 1.2
        }
        this.jiggleTime.set(key, jt)
        this.jiggleDelay.set(key, jd)
      }
    }
  }

  // Night-glow for Moonpetal crops ('flower'): the ripe flower head emits a
  // soft blue-purple light; unripe plants (growthDay < growthDays) emit a
  // faint version of the same hue. Only touches materials when the night flag
  // actually changes (one pass per transition, not per frame). Called from the
  // main loop while on the farm; on re-entry after a mine visit the first
  // frame applies whichever state is current.
  private nightGlowOn = false

  setNightGlow(night: boolean) {
    if (night === this.nightGlowOn) return
    this.nightGlowOn = night
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        const t = this.tiles[x][z]
        if (!t.cropId || !t.cropGroup || t.cropId !== 'flower') continue
        const crop = CROPS[t.cropId]
        if (!crop) continue
        const ripe = t.growthDay >= crop.growthDays
        // Ripe flowers emit from the flower head ('fruit'); young plants have
        // no head mesh yet (stages 0-1 are a single sprout/stem), so fall back
        // to their first mesh so the faint young-plant glow has a target.
        const fruit = t.cropGroup.getObjectByName('fruit') as THREE.Mesh | undefined
        const mesh = fruit ?? (t.cropGroup.children[0] as THREE.Mesh | undefined)
        if (!mesh) continue
        const mat = mesh.material as THREE.MeshLambertMaterial
        if (night) {
          mat.emissive.copy(MOONPETAL_GLOW)
          mat.emissiveIntensity = ripe ? MOONPETAL_GLOW_INTENSITY : MOONPETAL_UNRIPE_GLOW_INTENSITY
        } else {
          mat.emissive.set(0x000000)
          mat.emissiveIntensity = 1.0
        }
      }
    }
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
        } else if (t.cropId || t.watered) {
          // Only update visuals for tiles with crops or that were watered (now unwatered)
          this.updateTileVisual(x, z)
        }
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

    // Fence around perimeter (instanced)
    const postPlacements: InstPlacement[] = []
    const railPlacements: InstPlacement[] = []
    for (let x = -margin; x < W + margin; x++) {
      for (const z of [-margin, H + margin - 1]) {
        postPlacements.push({ x, z })
        if (x < W + margin - 1) railPlacements.push({ x: x + 0.5, z, y: 0.4 })
      }
    }
    for (let z = -margin; z < H + margin; z++) {
      for (const x of [-margin, W + margin - 1]) {
        postPlacements.push({ x, z })
        if (z < H + margin - 1) railPlacements.push({ x, z: z + 0.5, y: 0.4, rotY: Math.PI / 2 })
      }
    }
    const refPost = createFencePost()
    const refPost0 = refPost.children[0] as THREE.Mesh
    const refPost1 = refPost.children[1] as THREE.Mesh
    this.group.add(buildInstanced(refPost0.geometry, refPost0.material as THREE.Material, postPlacements.length, postPlacements, new THREE.Vector3(0, 0.3, 0), { castShadow: true }))
    this.group.add(buildInstanced(refPost1.geometry, refPost1.material as THREE.Material, postPlacements.length, postPlacements, new THREE.Vector3(0, 0.62, 0)))
    const refRail = createFenceRail() as THREE.Mesh
    this.group.add(buildInstanced(refRail.geometry, refRail.material as THREE.Material, railPlacements.length, railPlacements, new THREE.Vector3(0, 0, 0)))

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

    // Dense forest beyond fence (instanced, more trees, varied sizes)
    const treePlacements: InstPlacement[] = []
    for (let i = 0; i < 100; i++) {
      const side = bgRng.int(0, 3)
      let bx: number, bz: number
      switch (side) {
        case 0: bx = bgRng.range(-margin-6, W+margin+6); bz = -margin - bgRng.range(1, 8); break
        case 1: bx = bgRng.range(-margin-6, W+margin+6); bz = H + margin + bgRng.range(0, 7); break
        case 2: bx = -margin - bgRng.range(1, 8); bz = bgRng.range(-margin-6, H+margin+6); break
        default: bx = W + margin + bgRng.range(0, 7); bz = bgRng.range(-margin-6, H+margin+6); break
      }
      const s = bgRng.range(0.6, 1.5)
      treePlacements.push({ x: bx, z: bz, s: new THREE.Vector3(s, s, s) })
    }
    const refTree = createTree(1)
    for (const child of refTree.children) {
      const part = child as THREE.Mesh
      // Forest sits beyond the fence: keep it out of the shadow pass (shadows land
      // outside the playable farm) to save ~400 shadow-map instances per frame.
      this.group.add(buildInstanced(part.geometry, part.material as THREE.Material, treePlacements.length, treePlacements, part.position.clone(), { preScale: true }))
    }

    // Flower patches scattered around the farm edges and paths (instanced)
    const flowerColors = [0xff6688, 0xffaa44, 0xff44aa, 0xffff66, 0xaa66ff, 0xff8888]
    const stemPlacements: InstPlacement[] = []
    const petalPlacements: InstPlacement[] = []
    for (let i = 0; i < 25; i++) {
      const fx = bgRng.range(-1, W + 1)
      const fz = bgRng.range(-1, H + 1)
      for (let j = 0; j < 5; j++) {
        const ox = (Math.random() - 0.5) * 0.4
        const oz = (Math.random() - 0.5) * 0.4
        const h = 0.15 + Math.random() * 0.1
        const r = 0.04 + Math.random() * 0.03
        const col = flowerColors[Math.floor(Math.random() * flowerColors.length)]
        stemPlacements.push({ x: fx + ox, z: fz + oz, y: 0.05, s: new THREE.Vector3(1, h / 0.15, 1) })
        petalPlacements.push({ x: fx + ox, z: fz + oz, y: 0.05, s: new THREE.Vector3(r / 0.04, r / 0.04, r / 0.04), color: col })
      }
    }
    const stemGeo = new THREE.BoxGeometry(0.02, 0.15, 0.02)
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a8e3a })
    const petalGeo = new THREE.SphereGeometry(0.04, 6, 6)
    const petalMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    this.group.add(buildInstanced(stemGeo, stemMat, stemPlacements.length, stemPlacements, new THREE.Vector3(0, 0.08, 0)))
    this.group.add(buildInstanced(petalGeo, petalMat, petalPlacements.length, petalPlacements, new THREE.Vector3(0, 0.18, 0)))

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
