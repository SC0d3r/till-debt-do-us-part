export const GAME_CONFIG = {
  farmWidth: 16,
  farmHeight: 12,
  mineFloors: 5,
  mineDigsPerFloor: 15,
  debtDeadline: 21,
  startingDebt: 5000,
  startingGold: 100,
  maxStamina: 100,
}

export interface CropDef {
  id: string; name: string; emoji: string; growthDays: number; stages: number
  seedPrice: number; sellPrice: number; description: string
}

export const CROPS: Record<string, CropDef> = {
  turnip: { id:'turnip', name:'Turnip', emoji:'🥬', growthDays:3, stages:4, seedPrice:20, sellPrice:45, description:'Fast-growing root veggie. Reliable starter crop.' },
  potato: { id:'potato', name:'Potato', emoji:'🥔', growthDays:4, stages:4, seedPrice:30, sellPrice:65, description:'Hearty spud. Good profit margin.' },
  tomato: { id:'tomato', name:'Tomato', emoji:'🍅', growthDays:5, stages:4, seedPrice:50, sellPrice:90, description:'Juicy red fruit. Takes a while but worth it.' },
  corn:   { id:'corn',   name:'Corn',   emoji:'🌽', growthDays:6, stages:4, seedPrice:60, sellPrice:110, description:'Tall golden stalks. Slow grower, high reward.' },
  flower: { id:'flower', name:'Moonpetal', emoji:'🌸', growthDays:7, stages:4, seedPrice:100, sellPrice:180, description:'Rare bloom that glows at night. Very valuable.' },
  rare:   { id:'rare',   name:'Starbloom', emoji:'⭐', growthDays:10, stages:4, seedPrice:200, sellPrice:400, description:'Legendary flower. Extremely rare and valuable.' },
}

export interface ToolDef {
  id: string; name: string; emoji: string; staminaCost: number; upgradeCost: number; description: string
}

export const TOOL_MAX_DURABILITY = 50

export const TOOLS: Record<string, ToolDef> = {
  hoe:     { id:'hoe',     name:'Hoe',          emoji:'⛏️', staminaCost:5, upgradeCost:200, description:'Tills soil for planting. Also clears weeds and stumps.' },
  water:   { id:'water',   name:'Watering Can', emoji:'💧', staminaCost:3, upgradeCost:150, description:'Waters crops. Refill at the well. Unwatered crops spoil overnight!' },
  pickaxe: { id:'pickaxe', name:'Pickaxe',      emoji:'🪨', staminaCost:8, upgradeCost:300, description:'Breaks stones and rocks. Tier 2+ breaks hard rock. Used in mines.' },
  axe:     { id:'axe',     name:'Axe',          emoji:'🪓', staminaCost:6, upgradeCost:250, description:'Chops down trees to get wood. Clears land for farming.' },
  shovel:  { id:'shovel',  name:'Shovel',       emoji:'🥄', staminaCost:4, upgradeCost:180, description:'Digs in the mine. Required for mining. Also clears debris.' },
}

export interface MineItemDef {
  id: string; name: string; emoji: string; rarity: number; sellPrice: number; description: string; tier: string
}

export const MINE_ITEMS: MineItemDef[] = [
  { id:'ore_copper',  name:'Copper Ore',    emoji:'🟤', rarity:0.4,  sellPrice:30,  description:'Common copper ore.', tier:'common' },
  { id:'ore_iron',    name:'Iron Ore',      emoji:'⚪', rarity:0.3,  sellPrice:60,  description:'Sturdy iron ore. Deeper floors.', tier:'uncommon' },
  { id:'ore_gold',    name:'Gold Ore',      emoji:'🟡', rarity:0.15, sellPrice:150, description:'Precious gold ore!', tier:'rare' },
  { id:'gem_ruby',    name:'Ruby',          emoji:'🔴', rarity:0.07, sellPrice:300, description:'Brilliant red gemstone.', tier:'epic' },
  { id:'gem_sapphire',name:'Sapphire',      emoji:'🔵', rarity:0.05, sellPrice:350, description:'Deep blue gem of incredible clarity.', tier:'epic' },
  { id:'fossil',      name:'Ancient Fossil',emoji:'🦴', rarity:0.02, sellPrice:500, description:'Prehistoric remains. Collectors pay top gold.', tier:'legendary' },
  { id:'seed_star',   name:'Star Seed',     emoji:'✨', rarity:0.01, sellPrice:50,  description:'Mysterious seed from deep underground.', tier:'legendary' },
]

// Non-crop, non-mine items
export const MATERIAL_ITEMS: Record<string, {name:string; emoji:string; description:string; sellPrice:number}> = {
  wood:       { name:'Wood',        emoji:'🪵', description:'Lumber from chopped trees. Useful building material.', sellPrice:10 },
  stone_item: { name:'Stone',       emoji:'🪨', description:'Solid stone from breaking rocks.', sellPrice:15 },
}

export function getItemInfo(id: string): { name:string; emoji:string; description:string; sellPrice:number; type:string } | null {
  if (id.startsWith('seed_')) {
    const cropId = id.replace('seed_', '')
    const crop = CROPS[cropId]
    if (crop) return { name:`${crop.name} Seeds`, emoji:crop.emoji, description:`Plant to grow ${crop.name}. Grows in ${crop.growthDays} days.`, sellPrice:Math.floor(crop.seedPrice*0.5), type:'Seed' }
    return null
  }
  if (CROPS[id]) { const c=CROPS[id]; return { name:c.name, emoji:c.emoji, description:c.description, sellPrice:c.sellPrice, type:'Crop' } }
  if (TOOLS[id]) { const t=TOOLS[id]; return { name:t.name, emoji:t.emoji, description:t.description, sellPrice:0, type:'Tool' } }
  if (MATERIAL_ITEMS[id]) { const m=MATERIAL_ITEMS[id]; return { name:m.name, emoji:m.emoji, description:m.description, sellPrice:m.sellPrice, type:'Material' } }
  const mi = MINE_ITEMS.find(m => m.id === id)
  if (mi) return { name:mi.name, emoji:mi.emoji, description:mi.description, sellPrice:mi.sellPrice, type:`Mineral (${mi.tier})` }
  return null
}

export function getItemTexture(id: string): string | null {
  if (id.startsWith('seed_')) { const cid=id.replace('seed_',''); return `/assets/crops/${cid}_0.png` }
  if (CROPS[id]) return `/assets/crops/${id}_3.png`
  if (MINE_ITEMS.find(m=>m.id===id)) return `/assets/items/${id}.png`
  if (MATERIAL_ITEMS[id]) return `/assets/items/${id}.png`
  return null
}
