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

// ─── Color Palette (tile system) ───
export const COLORS = {
  grass: 0x5a9e4a,
  dirt: 0x9b7930,
  tilled: 0x7b5e20,
  leaf: 0x3a8e3a, leafDark: 0x2d7a2d, leafLight: 0x5ab85a,
}