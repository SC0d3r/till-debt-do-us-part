import * as THREE from 'three'

// ─── Seeded RNG ───
export class SeededRNG {
  private s: number
  constructor(seed: number) { this.s = seed | 0 }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) | 0
    return (this.s >>> 0) / 4294967296
  }
  range(min: number, max: number): number { return min + this.next() * (max - min) }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)) }
  chance(p: number): boolean { return this.next() < p }
}

// ─── Color Palette (Harvest Moon wholesome) ───
export const COLORS = {
  grass: 0x5a9e4a, grassDark: 0x4a8a3a, grassLight: 0x6abf5a,
  dirt: 0x9b7930, dirtDark: 0x8a6820,
  tilled: 0x7b5e20, tilledDark: 0x6a4e18,
  watered: 0x5a4418, wateredDark: 0x4a3410,
  path: 0xc8b888, pathLight: 0xd8c898,
  water: 0x4499dd, waterDeep: 0x3377bb,
  wood: 0x8b5a36, woodLight: 0xa07050, woodDark: 0x6b4226,
  stone: 0x888888, stoneLight: 0xaaaaaa, stoneDark: 0x666666,
  leaf: 0x3a8e3a, leafDark: 0x2d7a2d, leafLight: 0x5ab85a,
  trunk: 0x6b4226,
  houseWall: 0xd4a574, houseRoof: 0xb85c38,
  shopWall: 0xc8956a, shopRoof: 0x8b5e3c,
  mineWall: 0x4a4a4a,
  wellStone: 0x999999,
  binWood: 0x7a4a2a,
  skin: 0xffcc99, hair: 0x663300,
  shirt: 0x3366cc, pants: 0x4444aa, boots: 0x553311,
  npcShirt: 0xcc6633, npcHat: 0x8b6914,
  dogFur: 0xc8a060, dogDark: 0xa08040,
  gold: 0xffd700, white: 0xffffff, sky: 0x87ceeb,
  fence: 0x9b7040,
}

// ─── Procedural Texture Generator (much better quality) ───
function makeTexture(size: number, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  fn(ctx, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function noise(ctx: CanvasRenderingContext2D, amt: number) {
  const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n))
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n))
  }
  ctx.putImageData(id, 0, 0)
}

const texCache: Record<string, THREE.Texture> = {}

export function getGrassTexture(): THREE.Texture {
  if (texCache.grass) return texCache.grass
  texCache.grass = makeTexture(128, (ctx, w, h) => {
    // Base green
    ctx.fillStyle = '#5a9e4a'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 18)
    // Grass blades
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * w, y = Math.random() * h
      const len = 2 + Math.random() * 4
      ctx.strokeStyle = Math.random() > 0.5 ? '#6abf5a' : '#4a8a3a'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random()-0.5)*2, y - len); ctx.stroke()
    }
    // Small flowers
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * w, y = Math.random() * h
      ctx.fillStyle = ['#fff', '#ffe', '#ffd'][Math.floor(Math.random()*3)]
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill()
    }
  })
  return texCache.grass
}

export function getDirtTexture(): THREE.Texture {
  if (texCache.dirt) return texCache.dirt
  texCache.dirt = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#9b7930'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 22)
    // Pebbles
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#8a6820' : '#ab8940'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 1+Math.random()*2, 0, Math.PI*2); ctx.fill()
    }
  })
  return texCache.dirt
}

export function getTilledTexture(): THREE.Texture {
  if (texCache.tilled) return texCache.tilled
  texCache.tilled = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#d4b896'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 12)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#c8a880' : '#dcc8a8'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 1+Math.random()*2, 0, Math.PI*2); ctx.fill()
    }
    ctx.strokeStyle = '#bfa070'; ctx.lineWidth = 2
    for (let y = 8; y < h; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random()-0.5)*2); ctx.stroke()
    }
    ctx.strokeStyle = '#e0cca8'; ctx.lineWidth = 1
    for (let y = 15; y < h; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random()-0.5)*2); ctx.stroke()
    }
  })
  return texCache.tilled
}

export function getWateredTexture(): THREE.Texture {
  if (texCache.watered) return texCache.watered
  texCache.watered = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#6b4c28'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 10)
    ctx.strokeStyle = '#5a3c18'; ctx.lineWidth = 3
    for (let y = 8; y < h; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random()-0.5)*2); ctx.stroke()
    }
    ctx.fillStyle = 'rgba(60,120,180,0.18)'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(150,200,255,0.12)'; ctx.lineWidth = 1
      const x = Math.random()*w, y = Math.random()*h
      ctx.beginPath(); ctx.ellipse(x, y, 6+Math.random()*8, 3+Math.random()*4, Math.random(), 0, Math.PI*2); ctx.stroke()
    }
  })
  return texCache.watered
}

export function getPathTexture(): THREE.Texture {
  if (texCache.path) return texCache.path
  texCache.path = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#c8b888'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 15)
    // Cobblestones
    for (let i = 0; i < 20; i++) {
      const x = Math.random()*w, y = Math.random()*h, r = 3+Math.random()*5
      ctx.fillStyle = Math.random() > 0.5 ? '#b8a878' : '#d8c898'
      ctx.beginPath(); ctx.ellipse(x, y, r, r*0.7, Math.random()*Math.PI, 0, Math.PI*2); ctx.fill()
      ctx.strokeStyle = '#a89868'; ctx.lineWidth = 0.5; ctx.stroke()
    }
  })
  return texCache.path
}

export function getWaterTexture(): THREE.Texture {
  if (texCache.water) return texCache.water
  texCache.water = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#4499dd'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 12)
    // Ripples
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const x = Math.random()*w, y = Math.random()*h
      ctx.beginPath(); ctx.ellipse(x, y, 8+Math.random()*10, 4+Math.random()*5, Math.random(), 0, Math.PI*2); ctx.stroke()
    }
  })
  return texCache.water
}

export function getMineFloorTexture(): THREE.Texture {
  if (texCache.mineFloor) return texCache.mineFloor
  texCache.mineFloor = makeTexture(256, (ctx, w, h) => {
    ctx.fillStyle = '#1a1510'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 30)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#2a2218' : '#120e08'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 2+Math.random()*5, 0, Math.PI*2); ctx.fill()
    }
    ctx.strokeStyle = '#0e0a06'; ctx.lineWidth = 1.5
    for (let i = 0; i < 15; i++) {
      const sx = Math.random()*w, sy = Math.random()*h
      ctx.beginPath(); ctx.moveTo(sx, sy)
      let cx = sx, cy = sy
      for (let j = 0; j < 4; j++) {
        cx += (Math.random()-0.5)*30; cy += (Math.random()-0.5)*30
        ctx.lineTo(cx, cy)
      }
      ctx.stroke()
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = ['#8b6030', '#707070', '#aa8830'][Math.floor(Math.random()*3)]
      ctx.globalAlpha = 0.15
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 1+Math.random()*2, 0, Math.PI*2); ctx.fill()
    }
    ctx.globalAlpha = 1
  })
  return texCache.mineFloor
}

export function getMineWallTexture(): THREE.Texture {
  if (texCache.mineWall) return texCache.mineWall
  texCache.mineWall = makeTexture(128, (ctx, w, h) => {
    ctx.fillStyle = '#443830'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 20)
    // Stone bricks
    ctx.strokeStyle = '#332820'; ctx.lineWidth = 2
    for (let y = 0; y < h; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      const offset = (y / 16) % 2 === 0 ? 0 : 16
      for (let x = offset; x < w; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke()
      }
    }
    // Ore specks
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = ['#b87333', '#c0c0c0', '#ffd700'][Math.floor(Math.random()*3)]
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 1+Math.random()*2, 0, Math.PI*2); ctx.fill()
    }
  })
  return texCache.mineWall
}

export function getTileTexture(type: string): THREE.Texture {
  switch (type) {
    case 'grass': return getGrassTexture()
    case 'dirt': return getDirtTexture()
    case 'tilled': return getTilledTexture()
    case 'watered': return getWateredTexture()
    case 'path': return getPathTexture()
    case 'water': return getWaterTexture()
    case 'mineFloor': return getMineFloorTexture()
    case 'mineWall': return getMineWallTexture()
    default: return getDirtTexture()
  }
}

// ─── Mesh Builders ───
export function createBox(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
}

export function createTexturedPlane(tex: THREE.Texture, color = 0xffffff): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshLambertMaterial({ map: tex, color })
  return new THREE.Mesh(geo, mat)
}

export function createTree(scale = 1): THREE.Group {
  const g = new THREE.Group()
  const trunk = createBox(0.25*scale, 0.9*scale, 0.25*scale, COLORS.trunk)
  trunk.position.y = 0.45*scale; trunk.castShadow = true
  g.add(trunk)
  const sizes = [1.1, 0.9, 0.65]
  const ys = [1.1, 1.55, 1.9]
  const colors = [COLORS.leafDark, COLORS.leaf, COLORS.leafLight]
  for (let i = 0; i < 3; i++) {
    const c = createBox(sizes[i]*scale, 0.45*scale, sizes[i]*scale, colors[i])
    c.position.y = ys[i]*scale; c.castShadow = true
    g.add(c)
  }
  return g
}

export function createSapling(): THREE.Group {
  const g = new THREE.Group()
  const stem = createBox(0.04, 0.3, 0.04, COLORS.trunk)
  stem.position.y = 0.15; g.add(stem)
  const leaf = createBox(0.15, 0.1, 0.15, COLORS.leafLight)
  leaf.position.y = 0.32; g.add(leaf)
  return g
}

export function createSmallTree(): THREE.Group {
  const g = new THREE.Group()
  const trunk = createBox(0.15, 0.5, 0.15, COLORS.trunk)
  trunk.position.y = 0.25; trunk.castShadow = true; g.add(trunk)
  const canopy = createBox(0.6, 0.35, 0.6, COLORS.leaf)
  canopy.position.y = 0.6; canopy.castShadow = true; g.add(canopy)
  const top = createBox(0.4, 0.25, 0.4, COLORS.leafLight)
  top.position.y = 0.85; g.add(top)
  return g
}

export function createStone(variant = 0): THREE.Group {
  const g = new THREE.Group()
  const main = createBox(0.5+variant*0.1, 0.35, 0.4+variant*0.08, COLORS.stone)
  main.position.y = 0.18; main.rotation.y = variant * 0.8; main.castShadow = true; g.add(main)
  const sm = createBox(0.25, 0.2, 0.25, COLORS.stoneLight)
  sm.position.set(0.18, 0.12, 0.12); g.add(sm)
  return g
}

export function createHouse(): THREE.Group {
  const g = new THREE.Group()
  const wall = createBox(1.6, 1.4, 1.6, COLORS.houseWall); wall.position.y = 0.7; wall.castShadow = true; g.add(wall)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), new THREE.MeshLambertMaterial({ color: COLORS.houseRoof }))
  roof.position.y = 1.8; roof.rotation.y = Math.PI/4; roof.castShadow = true; g.add(roof)
  const door = createBox(0.4, 0.7, 0.05, 0x4a2a10); door.position.set(0, 0.4, 0.81); g.add(door)
  for (const sx of [-0.4, 0.4]) {
    const win = createBox(0.25, 0.25, 0.05, 0x87ceeb); win.position.set(sx, 0.9, 0.81); g.add(win)
  }
  // Chimney
  const chim = createBox(0.2, 0.5, 0.2, COLORS.stoneDark); chim.position.set(0.5, 2.0, -0.3); g.add(chim)
  return g
}

export function createShop(): THREE.Group {
  const g = new THREE.Group()
  const wallTex = makeTexture(64, (ctx, w, h) => {
    ctx.fillStyle = '#c8956a'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 15)
    for (let y = 0; y < h; y += 8) {
      ctx.strokeStyle = 'rgba(100,60,30,0.2)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
  })
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), new THREE.MeshLambertMaterial({ map: wallTex }))
  wall.position.y = 0.8; wall.castShadow = true; g.add(wall)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), new THREE.MeshLambertMaterial({ color: COLORS.shopRoof }))
  roof.position.y = 2.05; roof.rotation.y = Math.PI/4; roof.castShadow = true; g.add(roof)
  const sign = createBox(0.8, 0.35, 0.06, COLORS.gold); sign.position.set(0, 1.3, 0.91); g.add(sign)
  const awning = createBox(1.6, 0.06, 0.7, 0xcc4444); awning.position.set(0, 1.1, 1.1); g.add(awning)
  const door = createBox(0.45, 0.8, 0.05, 0x5a3218); door.position.set(0, 0.45, 0.91); g.add(door)
  for (const sx of [-0.5, 0.5]) {
    const win = createBox(0.3, 0.3, 0.05, 0xffeebb); win.position.set(sx, 1.0, 0.91); g.add(win)
  }
  return g
}

export function createMineEntrance(): THREE.Group {
  const g = new THREE.Group()
  const frame = createBox(1.4, 1.2, 0.3, COLORS.trunk); frame.position.y = 0.6; frame.castShadow = true; g.add(frame)
  const hole = createBox(0.8, 0.8, 0.35, 0x111111); hole.position.y = 0.45; g.add(hole)
  const beam = createBox(1.6, 0.15, 0.35, COLORS.wood); beam.position.y = 1.25; g.add(beam)
  // Lanterns
  for (const sx of [-0.6, 0.6]) {
    const lantern = createBox(0.08, 0.12, 0.08, COLORS.gold); lantern.position.set(sx, 1.0, 0.2); g.add(lantern)
  }
  return g
}

export function createWell(): THREE.Group {
  const g = new THREE.Group()
  const stoneTex = makeTexture(64, (ctx, w, h) => {
    ctx.fillStyle = '#999999'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 20)
    ctx.strokeStyle = '#777777'; ctx.lineWidth = 2
    for (let y = 0; y < h; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      const off = (y / 12) % 2 === 0 ? 0 : 10
      for (let x = off; x < w; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 12); ctx.stroke()
      }
    }
  })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.8, 10), new THREE.MeshLambertMaterial({ map: stoneTex }))
  base.position.y = 0.4; base.castShadow = true; g.add(base)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 12), new THREE.MeshLambertMaterial({ color: 0x777777 }))
  rim.position.y = 0.8; rim.rotation.x = Math.PI / 2; g.add(rim)
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10), new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.8 }))
  water.position.y = 0.7; g.add(water)
  for (const sx of [-0.5, 0.5]) {
    const post = createBox(0.1, 1.2, 0.1, COLORS.trunk); post.position.set(sx, 1.2, 0); post.castShadow = true; g.add(post)
  }
  const beam = createBox(1.1, 0.08, 0.1, COLORS.wood); beam.position.y = 1.8; g.add(beam)
  const rope = createBox(0.02, 0.5, 0.02, 0x8b7355); rope.position.set(0, 1.55, 0); g.add(rope)
  const bucket = createBox(0.14, 0.12, 0.14, COLORS.woodDark); bucket.position.set(0, 1.3, 0); g.add(bucket)
  const bucketBand = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 4, 8), new THREE.MeshLambertMaterial({ color: 0x666666 }))
  bucketBand.position.set(0, 1.32, 0); g.add(bucketBand)
  const wellLight = new THREE.PointLight(0x88ccff, 0.4, 3)
  wellLight.position.set(0, 1.0, 0)
  g.add(wellLight)
  return g
}

export function createShippingBin(): THREE.Group {
  const g = new THREE.Group()
  const woodTex = makeTexture(64, (ctx, w, h) => {
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(0, 0, w, h)
    noise(ctx, 18)
    for (let y = 0; y < h; y += 6) {
      ctx.strokeStyle = 'rgba(50,25,10,0.25)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y + (Math.random()-0.5)*2); ctx.lineTo(w, y + (Math.random()-0.5)*2); ctx.stroke()
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(100,60,30,0.15)'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 3+Math.random()*5, 0, Math.PI*2); ctx.fill()
    }
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), new THREE.MeshLambertMaterial({ map: woodTex }))
  body.position.y = 0.6; body.castShadow = true; g.add(body)
  const inner = createBox(1.6, 0.15, 1.0, 0x2a1a0a); inner.position.set(0, 1.18, 0); g.add(inner)
  const lid = createBox(1.84, 0.08, 1.22, COLORS.woodLight); lid.position.set(0, 1.25, -0.3); lid.rotation.x = -0.6; g.add(lid)
  const label = createBox(0.7, 0.35, 0.03, COLORS.gold); label.position.set(0, 0.7, 0.61); g.add(label)
  const signPost = createBox(0.08, 0.8, 0.08, COLORS.woodDark); signPost.position.set(0, 1.6, 0.5); g.add(signPost)
  const signBoard = createBox(0.9, 0.35, 0.06, 0xd4a020); signBoard.position.set(0, 2.05, 0.5); g.add(signBoard)
  const signText = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xfff0aa })
  )
  signText.position.set(0, 2.05, 0.54)
  g.add(signText)
  const signGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.35 })
  )
  signGlow.position.set(0, 2.05, 0.48)
  signGlow.name = 'binSign'
  g.add(signGlow)
  const binLight = new THREE.PointLight(0xffd700, 1.0, 6)
  binLight.position.set(0, 2.2, 0.5)
  g.add(binLight)
  const binLight2 = new THREE.PointLight(0xff8800, 0.5, 4)
  binLight2.position.set(0, 0.8, 0.8)
  g.add(binLight2)
  for (const y of [0.3, 0.9]) {
    const band = createBox(1.84, 0.05, 1.24, 0x777777); band.position.y = y; g.add(band)
  }
  for (const [lx, lz] of [[-0.7,-0.45],[0.7,-0.45],[-0.7,0.45],[0.7,0.45]]) {
    const leg = createBox(0.14, 0.15, 0.14, COLORS.woodDark); leg.position.set(lx, 0.02, lz); g.add(leg)
  }
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.3, 4),
    new THREE.MeshBasicMaterial({ color: 0xffdd44 })
  )
  arrow.position.set(0, 2.5, 0.5)
  arrow.rotation.z = Math.PI
  arrow.name = 'binArrow'
  g.add(arrow)
  return g
}

export function createFencePost(): THREE.Group {
  const g = new THREE.Group()
  const post = createBox(0.1, 0.6, 0.1, COLORS.fence); post.position.y = 0.3; post.castShadow = true; g.add(post)
  const cap = createBox(0.14, 0.04, 0.14, COLORS.woodDark); cap.position.y = 0.62; g.add(cap)
  return g
}

export function createFenceRail(): THREE.Mesh {
  const rail = createBox(1.0, 0.06, 0.04, COLORS.fence)
  rail.position.y = 0.4
  return rail
}

export function createPlayerModel(): THREE.Group {
  const g = new THREE.Group()
  const body = createBox(0.35, 0.4, 0.2, COLORS.shirt); body.position.y = 0.55; body.castShadow = true; g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: COLORS.skin }))
  head.position.y = 0.92; head.castShadow = true; g.add(head)
  const hair = createBox(0.3, 0.12, 0.3, COLORS.hair); hair.position.y = 1.04; g.add(hair)
  for (const sx of [-0.06, 0.06]) {
    const eye = createBox(0.04, 0.04, 0.02, 0x222222); eye.position.set(sx, 0.92, 0.14); g.add(eye)
  }
  // Arms (separate groups for animation)
  const leftArm = new THREE.Group(); leftArm.name = 'leftArm'
  const la = createBox(0.1, 0.35, 0.1, COLORS.skin); la.position.y = -0.15; leftArm.add(la)
  leftArm.position.set(-0.24, 0.7, 0); g.add(leftArm)
  const rightArm = new THREE.Group(); rightArm.name = 'rightArm'
  const ra = createBox(0.1, 0.35, 0.1, COLORS.skin); ra.position.y = -0.15; rightArm.add(ra)
  rightArm.position.set(0.24, 0.7, 0); g.add(rightArm)
  for (const sx of [-0.08, 0.08]) {
    const leg = createBox(0.12, 0.3, 0.12, COLORS.pants); leg.position.set(sx, 0.2, 0); g.add(leg)
  }
  for (const sx of [-0.08, 0.08]) {
    const boot = createBox(0.13, 0.08, 0.15, COLORS.boots); boot.position.set(sx, 0.04, 0.01); g.add(boot)
  }
  return g
}

export function createDogModel(): THREE.Group {
  const s = 1.5 // Scale factor - bigger dog
  const g = new THREE.Group()
  const body = createBox(0.4*s, 0.2*s, 0.2*s, COLORS.dogFur); body.position.y = 0.25*s; body.castShadow = true; g.add(body)
  const head = createBox(0.2*s, 0.18*s, 0.2*s, COLORS.dogFur); head.position.set(0.26*s, 0.36*s, 0); g.add(head)
  const snout = createBox(0.1*s, 0.07*s, 0.12*s, COLORS.dogDark); snout.position.set(0.38*s, 0.33*s, 0); g.add(snout)
  const nose = createBox(0.04*s, 0.04*s, 0.04*s, 0x222222); nose.position.set(0.43*s, 0.35*s, 0); g.add(nose)
  for (const sz of [-0.05*s, 0.05*s]) {
    const eye = createBox(0.035*s, 0.035*s, 0.02*s, 0x222222); eye.position.set(0.36*s, 0.4*s, sz); g.add(eye)
  }
  for (const sz of [-0.09*s, 0.09*s]) {
    const ear = createBox(0.07*s, 0.1*s, 0.05*s, COLORS.dogDark); ear.position.set(0.23*s, 0.46*s, sz); g.add(ear)
  }
  const tail = new THREE.Group(); tail.name = 'tail'
  const tailMesh = createBox(0.05*s, 0.05*s, 0.22*s, COLORS.dogFur); tailMesh.position.set(0, 0, -0.11*s); tail.add(tailMesh)
  tail.position.set(-0.24*s, 0.33*s, 0); g.add(tail)
  for (const [lx, lz] of [[-0.13*s,-0.07*s],[0.13*s,-0.07*s],[-0.13*s,0.07*s],[0.13*s,0.07*s]]) {
    const leg = createBox(0.07*s, 0.17*s, 0.07*s, COLORS.dogDark); leg.position.set(lx, 0.09*s, lz); g.add(leg)
  }
  // Collar
  const collar = createBox(0.22*s, 0.03*s, 0.22*s, 0xcc3333); collar.position.set(0.15*s, 0.3*s, 0); g.add(collar)
  return g
}

export function createNPCModel(): THREE.Group {
  const g = new THREE.Group()
  const body = createBox(0.38, 0.45, 0.22, COLORS.npcShirt); body.position.y = 0.58; body.castShadow = true; g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: COLORS.skin }))
  head.position.y = 0.98; g.add(head)
  const hat = createBox(0.36, 0.1, 0.36, COLORS.npcHat); hat.position.y = 1.12; g.add(hat)
  const brim = createBox(0.44, 0.03, 0.44, COLORS.npcHat); brim.position.y = 1.08; g.add(brim)
  for (const sx of [-0.26, 0.26]) {
    const arm = createBox(0.1, 0.38, 0.1, COLORS.skin); arm.position.set(sx, 0.58, 0); g.add(arm)
  }
  for (const sx of [-0.09, 0.09]) {
    const leg = createBox(0.13, 0.32, 0.13, 0x444444); leg.position.set(sx, 0.2, 0); g.add(leg)
  }
  return g
}

export function createCropMesh(cropId: string, stage: number): THREE.Group {
  const g = new THREE.Group()
  const colors: Record<string, number[]> = {
    turnip: [0x4a8e3a, 0x5a9e4a, 0xd0b8e0, 0xe8d8f0],
    potato: [0x3a7e2a, 0x4a8e3a, 0xb89858, 0xc8a86e],
    tomato: [0x3a8e2a, 0x4a9e3a, 0xe84040, 0xff3030],
    corn:   [0x4a9e3a, 0x5aae4a, 0xf0d040, 0xffe030],
    flower: [0x3a7e3a, 0x4a8e4a, 0xd070e0, 0xe080f0],
    rare:   [0x2a6e4a, 0x3a7e5a, 0x70d0ff, 0x90e0ff],
  }
  const cols = colors[cropId] || colors.turnip
  const col = cols[Math.min(stage, cols.length - 1)]

  if (stage === 0) {
    const sprout = createBox(0.06, 0.15, 0.06, col); sprout.position.y = 0.08; g.add(sprout)
  } else if (stage === 1) {
    const stem = createBox(0.05, 0.25, 0.05, col); stem.position.y = 0.13; g.add(stem)
    for (const sx of [-0.08, 0.08]) {
      const leaf = createBox(0.12, 0.04, 0.04, col); leaf.position.set(sx, 0.2, 0)
      leaf.rotation.z = sx > 0 ? -0.3 : 0.3; g.add(leaf)
    }
  } else if (stage === 2) {
    const stem = createBox(0.06, 0.35, 0.06, cols[1]); stem.position.y = 0.18; g.add(stem)
    for (let i = 0; i < 3; i++) {
      const leaf = createBox(0.15, 0.04, 0.04, cols[1]); leaf.position.set((i-1)*0.1, 0.25+i*0.05, 0)
      leaf.rotation.z = (i-1)*0.3; g.add(leaf)
    }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshLambertMaterial({ color: col }))
    bud.position.y = 0.38; g.add(bud)
  } else {
    const stem = createBox(0.07, 0.4, 0.07, cols[1]); stem.position.y = 0.2; g.add(stem)
    for (let i = 0; i < 4; i++) {
      const leaf = createBox(0.18, 0.04, 0.04, cols[1])
      leaf.position.set((i%2===0?1:-1)*0.12, 0.2+i*0.06, (i%2===0?1:-1)*0.05)
      leaf.rotation.z = (i%2===0?-1:1)*0.4; g.add(leaf)
    }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshLambertMaterial({ color: col }))
    fruit.position.y = 0.45; g.add(fruit)
  }
  return g
}

export function createToolMesh(toolId: string): THREE.Group {
  const g = new THREE.Group()
  switch (toolId) {
    case 'hoe': {
      const handle = createBox(0.04, 0.5, 0.04, COLORS.wood); handle.position.y = 0.25; g.add(handle)
      const blade = createBox(0.2, 0.04, 0.12, 0x888888); blade.position.set(0, 0.02, 0.06); g.add(blade)
      break
    }
    case 'water': {
      const body = createBox(0.15, 0.12, 0.1, 0x4488cc); body.position.y = 0.06; g.add(body)
      const spout = createBox(0.03, 0.03, 0.12, 0x4488cc); spout.position.set(0, 0.1, 0.08); spout.rotation.x = -0.4; g.add(spout)
      const handle = createBox(0.03, 0.12, 0.03, 0x4488cc); handle.position.set(0, 0.14, -0.02); g.add(handle)
      break
    }
    case 'pickaxe': {
      const handle = createBox(0.04, 0.5, 0.04, COLORS.wood); handle.position.y = 0.25; g.add(handle)
      const head = createBox(0.22, 0.06, 0.06, 0x666666); head.position.y = 0.5; g.add(head)
      const tip = createBox(0.04, 0.12, 0.04, 0x666666); tip.position.set(0.1, 0.46, 0); tip.rotation.z = 0.5; g.add(tip)
      break
    }
    case 'axe': {
      const handle = createBox(0.04, 0.5, 0.04, COLORS.wood); handle.position.y = 0.25; g.add(handle)
      const blade = createBox(0.04, 0.18, 0.12, 0x888888); blade.position.set(0.06, 0.45, 0); g.add(blade)
      break
    }
    case 'shovel': {
      const handle = createBox(0.04, 0.5, 0.04, COLORS.wood); handle.position.y = 0.25; g.add(handle)
      const blade = createBox(0.12, 0.15, 0.03, 0x888888); blade.position.set(0, 0.02, 0); g.add(blade)
      break
    }
  }
  return g
}

export function createItemDropMesh(itemId: string, big = false): THREE.Mesh {
  const colors: Record<string, number> = {
    turnip: 0xe8d8f0, potato: 0xc8a86e, tomato: 0xff3030,
    corn: 0xffe030, flower: 0xe080f0, rare: 0x90e0ff,
    wood: 0x8b5a36, stone_item: 0x999999,
    ore_copper: 0xb87333, ore_iron: 0xc0c0c0, ore_gold: 0xffd700,
    gem_ruby: 0xe0115f, gem_sapphire: 0x0f52ba, fossil: 0xd2b48c, seed_star: 0x90e0ff,
  }
  const col = colors[itemId] || 0xffffff
  const isGem = itemId.startsWith('gem_')
  const scale = big ? 2.5 : 1
  const geo = isGem
    ? new THREE.OctahedronGeometry(0.12 * scale, 0)
    : new THREE.BoxGeometry(0.15 * scale, 0.15 * scale, 0.15 * scale)
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }))
}

// ─── World Scenery ───
export function createMountain(scale: number): THREE.Group {
  const g = new THREE.Group()
  const baseGeo = new THREE.ConeGeometry(3 * scale, 5 * scale, 12)
  const rockTex = makeTexture(128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#7a8a7a')
    grad.addColorStop(0.3, '#5a6a5a')
    grad.addColorStop(0.7, '#4a5a48')
    grad.addColorStop(1, '#3a4a38')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)
    noise(ctx, 25)
    ctx.globalAlpha = 0.4
    for (let i = 0; i < 20; i++) {
      const y = Math.random() * h
      ctx.strokeStyle = i % 2 === 0 ? '#3a4a38' : '#6a7a68'
      ctx.lineWidth = 1 + Math.random() * 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x < w; x += 8) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 6)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(100,115,95,0.3)' : 'rgba(70,85,65,0.25)'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 4+Math.random()*10, 0, Math.PI*2); ctx.fill()
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(${50+Math.random()*40},${55+Math.random()*40},${45+Math.random()*30},0.2)`
      const cx = Math.random() * w, cy = Math.random() * h
      ctx.fillRect(cx, cy, 2 + Math.random() * 4, 1 + Math.random() * 3)
    }
  })
  const baseMat = new THREE.MeshLambertMaterial({ map: rockTex })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.y = 2.5 * scale
  base.castShadow = true
  g.add(base)
  const snowGeo = new THREE.ConeGeometry(1.3 * scale, 1.8 * scale, 12)
  const snowTex = makeTexture(64, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.5, '#eef0ff')
    grad.addColorStop(1, '#d0d8ee')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)
    noise(ctx, 8)
    ctx.globalAlpha = 0.2
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = '#c0c8dd'
      ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 3+Math.random()*6, 0, Math.PI*2); ctx.fill()
    }
    ctx.globalAlpha = 0.15
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = '#b0b8cc'; ctx.lineWidth = 1
      ctx.beginPath()
      const y = Math.random() * h
      ctx.moveTo(0, y)
      for (let x = 0; x < w; x += 6) ctx.lineTo(x, y + (Math.random()-0.5)*4)
      ctx.stroke()
    }
  })
  const snowMat = new THREE.MeshLambertMaterial({ map: snowTex })
  const snow = new THREE.Mesh(snowGeo, snowMat)
  snow.position.y = 4.0 * scale
  g.add(snow)
  const peak2 = new THREE.Mesh(
    new THREE.ConeGeometry(1.5 * scale, 3 * scale, 8),
    new THREE.MeshLambertMaterial({ map: rockTex })
  )
  peak2.position.set(1.5 * scale, 1.5 * scale, 0.5 * scale)
  peak2.castShadow = true
  g.add(peak2)
  const peak3 = new THREE.Mesh(
    new THREE.ConeGeometry(0.8 * scale, 2 * scale, 6),
    new THREE.MeshLambertMaterial({ map: rockTex })
  )
  peak3.position.set(-1.0 * scale, 1.0 * scale, 0.8 * scale)
  peak3.castShadow = true
  g.add(peak3)
  return g
}

export function createFlowerPatch(): THREE.Group {
  const g = new THREE.Group()
  const flowerColors = [0xff6688, 0xffaa44, 0xff44aa, 0xffff66, 0xaa66ff, 0xff8888]
  for (let i = 0; i < 5; i++) {
    const stem = createBox(0.02, 0.15 + Math.random() * 0.1, 0.02, 0x3a8e3a)
    stem.position.set((Math.random() - 0.5) * 0.4, 0.08, (Math.random() - 0.5) * 0.4)
    g.add(stem)
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 6, 6),
      new THREE.MeshLambertMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] })
    )
    petal.position.set(stem.position.x, stem.position.y + 0.1, stem.position.z)
    g.add(petal)
  }
  return g
}

export function createRiverSegment(length: number): THREE.Group {
  const g = new THREE.Group()
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, length).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.75 })
  )
  water.position.y = 0.02
  g.add(water)
  // Banks
  for (const sx of [-0.9, 0.9]) {
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, length),
      new THREE.MeshLambertMaterial({ color: COLORS.dirt })
    )
    bank.position.set(sx, 0.04, 0)
    g.add(bank)
  }
  return g
}

export function createCoinParticle(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8)
  const mat = new THREE.MeshLambertMaterial({ color: COLORS.gold })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = Math.PI / 2
  return mesh
}
