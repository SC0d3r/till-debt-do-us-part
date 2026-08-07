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