import { GAME_CONFIG, TOOL_MAX_DURABILITY } from '../data/gameData'

export interface InventoryItem {
  id: string
  count: number
}

export class PlayerState {
  gold = GAME_CONFIG.startingGold
  debt = GAME_CONFIG.startingDebt
  day = 1
  stamina = GAME_CONFIG.maxStamina
  maxStamina = GAME_CONFIG.maxStamina
  inventory: (InventoryItem | null)[] = new Array(16).fill(null)
  toolTiers: Record<string, number> = { hoe: 1, water: 1, pickaxe: 1, axe: 1, shovel: 1 }
  toolDurability: Record<string, number> = {}
  waterLevel = 10
  maxWater = 10
  selectedSlot = 0
  introSeen = false
  grimesFirstSeen = false
  debtPaid = false

  constructor() {
    // Start with essential tools and some seeds
    this.inventory[0] = { id: 'hoe', count: 1 }
    this.inventory[1] = { id: 'water', count: 1 }
    this.inventory[2] = { id: 'pickaxe', count: 1 }
    this.inventory[3] = { id: 'axe', count: 1 }
    this.inventory[4] = { id: 'shovel', count: 1 }
    this.inventory[5] = { id: 'seed_turnip', count: 5 }
    this.inventory[6] = { id: 'seed_potato', count: 3 }
    // Init durability
    for (const tid of Object.keys(this.toolTiers)) {
      this.toolDurability[tid] = TOOL_MAX_DURABILITY
    }
  }

  getToolDurability(toolId: string): number {
    return this.toolDurability[toolId] ?? TOOL_MAX_DURABILITY
  }

  useToolDurability(toolId: string, amount = 1): boolean {
    if (!this.toolDurability[toolId]) return false
    this.toolDurability[toolId] = Math.max(0, this.toolDurability[toolId] - amount)
    return this.toolDurability[toolId] > 0
  }

  repairTool(toolId: string): number {
    const current = this.toolDurability[toolId] ?? TOOL_MAX_DURABILITY
    const cost = Math.ceil((TOOL_MAX_DURABILITY - current) * 2)
    if (cost <= 0) return 0
    this.toolDurability[toolId] = TOOL_MAX_DURABILITY
    return cost
  }

  isFull(): boolean {
    return !this.inventory.some(s => s === null)
  }

  addItem(id: string, count = 1): boolean {
    const existing = this.inventory.find(s => s && s.id === id)
    if (existing) { existing.count += count; return true }
    const emptyIdx = this.inventory.findIndex(s => s === null)
    if (emptyIdx === -1) return false
    this.inventory[emptyIdx] = { id, count }
    return true
  }

  removeItem(id: string, count = 1): boolean {
    const slot = this.inventory.find(s => s && s.id === id)
    if (!slot || slot.count < count) return false
    slot.count -= count
    if (slot.count <= 0) {
      const idx = this.inventory.indexOf(slot)
      this.inventory[idx] = null
    }
    return true
  }

  swapSlots(a: number, b: number) {
    const tmp = this.inventory[a]
    this.inventory[a] = this.inventory[b]
    this.inventory[b] = tmp
  }

  hasItem(id: string, count = 1): boolean {
    const slot = this.inventory.find(s => s && s.id === id)
    return !!slot && slot.count >= count
  }

  getItemCount(id: string): number {
    const slot = this.inventory.find(s => s && s.id === id)
    return slot ? slot.count : 0
  }

  getSelectedItem(): InventoryItem | null {
    return this.inventory[this.selectedSlot]
  }

  useStamina(amount: number): boolean {
    const cost = Math.max(1, amount)
    if (this.stamina < cost) return false
    this.stamina -= cost
    return true
  }

  restoreStamina() { this.stamina = this.maxStamina }
  advanceDay() { this.day++; this.restoreStamina() }

  refillWater() { this.waterLevel = this.maxWater }
  useWater(): boolean {
    if (this.waterLevel <= 0) return false
    this.waterLevel--
    return true
  }

  save() {
    localStorage.setItem('till_debt_save', JSON.stringify({
      gold: this.gold, debt: this.debt, day: this.day, stamina: this.stamina,
      inventory: this.inventory, toolTiers: this.toolTiers,
      toolDurability: this.toolDurability, waterLevel: this.waterLevel,
      introSeen: this.introSeen, grimesFirstSeen: this.grimesFirstSeen, debtPaid: this.debtPaid,
    }))
  }

  load(): boolean {
    const raw = localStorage.getItem('till_debt_save')
    if (!raw) return false
    try {
      const data = JSON.parse(raw)
      Object.assign(this, data)
      // Ensure durability exists for all tools
      for (const tid of Object.keys(this.toolTiers)) {
        if (this.toolDurability[tid] === undefined) this.toolDurability[tid] = TOOL_MAX_DURABILITY
      }
      return true
    } catch { return false }
  }

  reset() {
    localStorage.removeItem('till_debt_save')
    localStorage.removeItem('till_debt_farm')
    location.reload()
  }
}
