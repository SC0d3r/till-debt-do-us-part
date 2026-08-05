import { PlayerState } from '../player/PlayerState'
import { GAME_CONFIG, CROPS, TOOLS, MINE_ITEMS, MATERIAL_ITEMS, getItemInfo, getItemTexture, TOOL_MAX_DURABILITY } from '../data/gameData'
import { formatClock } from '../core/DayCycle'
import { sound } from '../core/SoundManager'

const ITEM_COLORS: Record<string, string> = {
  hoe: '#888888', water: '#4488cc', pickaxe: '#666666', axe: '#8b5a36', shovel: '#9b7040',
  seed_turnip: '#4a8e3a', seed_potato: '#3a7e2a', seed_tomato: '#3a8e2a',
  seed_corn: '#4a9e3a', seed_flower: '#3a7e3a', seed_rare: '#2a6e4a',
  turnip: '#d0b8e0', potato: '#c8a86e', tomato: '#ff3030', corn: '#ffe030',
  flower: '#e080f0', rare: '#90e0ff',
  wood: '#8b5a36', stone_item: '#999999',
  ore_copper: '#b87333', ore_iron: '#c0c0c0', ore_gold: '#ffd700',
  gem_ruby: '#e0115f', gem_sapphire: '#0f52ba', fossil: '#d2b48c', seed_star: '#90e0ff',
}

const TOOL_EMOJIS: Record<string, string> = {
  hoe: '🌾', water: '🚿', pickaxe: '⛏️', axe: '🪓', shovel: '🔨',
}

const TOOL_EMOJI_MAP: Record<string, string> = {
  hoe: '🌾', water: '🚿', pickaxe: '⛏️', axe: '🪓', shovel: '🔨',
}

const SEED_EMOJI_MAP: Record<string, string> = {
  seed_turnip: '🟣', seed_potato: '🥔', seed_tomato: '🍅',
  seed_corn: '🌽', seed_flower: '🌸', seed_rare: '💎', seed_star: '⭐',
}

const ITEM_EMOJI_MAP: Record<string, string> = {
  wood: '🪵', stone_item: '🪨',
  ore_copper: '🟤', ore_iron: '⬜', ore_gold: '🟡',
  gem_ruby: '🔴', gem_sapphire: '🔵', fossil: '🦴',
  turnip: '🟣', potato: '🥔', tomato: '🍅', corn: '🌽',
  flower: '🌸', rare: '✨',
}

const TOOL_BG: Record<string, string> = {
  hoe: '#8b6914', water: '#2266aa', pickaxe: '#666666', axe: '#8b4513', shovel: '#7a6030',
}

export class UIManager {
  shopOpen = false
  inventoryOpen = false
  private tooltipEl: HTMLElement
  private dialogBox: HTMLElement
  private shopPanel: HTMLElement
  private inventoryPanel: HTMLElement
  private onShopAction: ((action: string, id: string) => void) | null = null

  constructor() {
    this.tooltipEl = document.getElementById('item-tooltip')!
    this.dialogBox = document.getElementById('dialog-box')!
    this.shopPanel = document.getElementById('shop-panel')!
    this.inventoryPanel = document.getElementById('inventory-panel')!
    document.getElementById('shop-close')!.addEventListener('click', () => this.closeShop())
    document.getElementById('inv-close')!.addEventListener('click', () => this.closeInventory())
    document.addEventListener('mousemove', (e) => {
      if (!(e.target as HTMLElement).closest('.inv-slot')) this.hideTooltip()
    })
  }

  updateHUD(player: PlayerState) {
    const day = String(player.day)
    const gold = String(player.gold)
    const debt = `${player.debt}/${GAME_CONFIG.startingDebt}g`
    const dayEl = document.getElementById('day-display')!
    if (dayEl.textContent !== day) dayEl.textContent = day
    const goldEl = document.getElementById('gold-display')!
    if (goldEl.textContent !== gold) goldEl.textContent = gold
    const debtEl = document.getElementById('debt-display')!
    if (debtEl.textContent !== debt) debtEl.textContent = debt

    const pct = Math.max(0, (player.stamina / player.maxStamina) * 100)
    const width = `${pct}%`
    const fill = document.getElementById('stamina-fill')!
    if (fill.style.width !== width) fill.style.width = width
    const bg = pct < 20 ? '#e74c3c' : pct < 50 ? '#f39c12' : 'linear-gradient(90deg, #4caf50, #6abf5a)'
    if (fill.style.background !== bg) fill.style.background = bg

    const durEl = document.getElementById('durability-indicator')!
    const sel = player.getSelectedItem()
    if (sel && TOOLS[sel.id]) {
      const dur = player.getToolDurability(sel.id)
      const durPct = Math.round((dur / TOOL_MAX_DURABILITY) * 100)
      const color = durPct > 50 ? '#4caf50' : durPct > 20 ? '#f39c12' : '#e74c3c'
      let html = `<span style="color:${color}">🔧${durPct}%</span>`
      if (sel.id === 'water') {
        const wPct = Math.round((player.waterLevel / player.maxWater) * 100)
        const wColor = wPct > 50 ? '#4488cc' : wPct > 20 ? '#f39c12' : '#e74c3c'
        html += ` <span style="color:${wColor}">💧${player.waterLevel}/${player.maxWater}</span>`
      }
      if (this.lastDurHtml !== html) { this.lastDurHtml = html; durEl.innerHTML = html }
    } else if (this.lastDurHtml !== '') {
      this.lastDurHtml = ''
      durEl.textContent = ''
    }

    this.renderInventory(player)
  }

  private lastDurHtml = ''

  // HUD clock: 24h "HH:MM", written with the same change-diff pattern as
  // updateHUD (only touches the DOM when the displayed string changes).
  updateClock(minutes: number) {
    const str = formatClock(minutes)
    const el = document.getElementById('time-display')!
    if (el.textContent !== str) el.textContent = str
  }

  private lastRenderedSlot = -1
  private onSelectSlot: ((slot: number) => void) | null = null
  private slotCache: string[] = new Array(8).fill('')

  setOnSelectSlot(cb: (slot: number) => void) { this.onSelectSlot = cb }

  invalidateHotbarCache() { this.slotCache.fill('') }

  autoFillHotbar(player: PlayerState) {
    for (let h = 0; h < 8; h++) {
      if (player.inventory[h] === null) {
        for (let o = 8; o < 16; o++) {
          if (player.inventory[o] !== null) {
            player.swapSlots(h, o)
            this.slotCache[h] = ''
            this.slotCache[o] = ''
            break
          }
        }
      }
    }
  }

  private getSlotCacheKey(player: PlayerState, i: number): string {
    const item = player.inventory[i]
    if (!item || item.count <= 0) return `empty_${i === player.selectedSlot ? 1 : 0}`
    const isTool = !!TOOLS[item.id]
    if (isTool) {
      const dur = player.getToolDurability(item.id)
      const tier = player.toolTiers[item.id] || 1
      const wLvl = item.id === 'water' ? player.waterLevel : -1
      return `${item.id}_${item.count}_${dur}_${tier}_${wLvl}_${i === player.selectedSlot ? 1 : 0}`
    }
    return `${item.id}_${item.count}_${i === player.selectedSlot ? 1 : 0}`
  }

  private renderInventory(player: PlayerState) {
    this.autoFillHotbar(player)
    const bar = document.getElementById('inventory-bar')!
    if (bar.childElementCount !== 8) {
      bar.innerHTML = ''
      this.slotCache.fill('')
      for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div')
        slot.className = 'inv-slot'
        slot.dataset.slot = String(i)
        slot.draggable = true
        slot.addEventListener('click', (e) => {
          e.stopPropagation()
          player.selectedSlot = i
          sound.menuSelect()
          this.slotCache.fill('')
          this.updateHUD(player)
          this.onSelectSlot?.(i)
        })
        slot.addEventListener('mouseenter', (e) => {
          const item = player.inventory[i]
          if (item && item.count > 0) this.showTooltip(e, item.id, player)
        })
        slot.addEventListener('dragstart', (e) => {
          e.dataTransfer!.setData('text/hotbar', String(i))
          e.dataTransfer!.effectAllowed = 'move'
        })
        slot.addEventListener('dragover', (e) => {
          e.preventDefault()
          e.dataTransfer!.dropEffect = 'move'
          slot.style.borderColor = '#ffd700'
        })
        slot.addEventListener('dragleave', () => { slot.style.borderColor = '' })
        slot.addEventListener('drop', (e) => {
          e.preventDefault()
          slot.style.borderColor = ''
          const fromStr = e.dataTransfer!.getData('text/hotbar')
          if (fromStr === '') return
          const fromIdx = parseInt(fromStr)
          if (fromIdx !== i && fromIdx >= 0 && fromIdx < 8) {
            player.swapSlots(fromIdx, i)
            if (player.selectedSlot === fromIdx) player.selectedSlot = i
            else if (player.selectedSlot === i) player.selectedSlot = fromIdx
            sound.menuSelect()
            this.slotCache[fromIdx] = ''
            this.slotCache[i] = ''
            this.updateHUD(player)
            this.onSelectSlot?.(player.selectedSlot)
          }
        })
        bar.appendChild(slot)
      }
    }

    for (let i = 0; i < 8; i++) {
      const key = this.getSlotCacheKey(player, i)
      if (key === this.slotCache[i]) continue
      this.slotCache[i] = key

      const slot = bar.children[i] as HTMLElement
      const isActive = i === player.selectedSlot
      slot.className = `inv-slot${isActive ? ' active' : ''}`
      slot.innerHTML = ''

      const keyHint = document.createElement('span')
      keyHint.className = 'inv-key'
      keyHint.textContent = String(i + 1)
      slot.appendChild(keyHint)

      const item = player.inventory[i]
      if (item && item.count > 0) {
        const info = getItemInfo(item.id)
        const isTool = !!TOOLS[item.id]

        if (isTool) {
          const emoji = TOOL_EMOJI_MAP[item.id] || '🔧'
          const bg = TOOL_BG[item.id] || '#444'
          const icon = document.createElement('div')
          icon.className = 'slot-icon'
          icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:28px;width:48px;height:48px;background:${bg};border:2px solid rgba(255,255,255,0.2);border-radius:6px;pointer-events:none`
          icon.textContent = emoji
          slot.appendChild(icon)

          const dur = player.getToolDurability(item.id)
          const durPct = Math.round((dur / TOOL_MAX_DURABILITY) * 100)
          const durBar = document.createElement('div')
          durBar.style.cssText = 'position:absolute;bottom:2px;left:3px;right:3px;height:4px;background:#333;border-radius:2px;overflow:hidden;pointer-events:none'
          const durFill = document.createElement('div')
          durFill.style.cssText = `height:100%;width:${durPct}%;background:${durPct > 50 ? '#4caf50' : durPct > 20 ? '#f39c12' : '#e74c3c'};border-radius:2px`
          durBar.appendChild(durFill)
          slot.appendChild(durBar)

          const durText = document.createElement('span')
          durText.className = 'inv-dur'
          durText.textContent = `${dur}`
          durText.style.cssText = 'position:absolute;top:1px;left:2px;font-size:6px;color:#ccc;text-shadow:1px 1px 0 #000;pointer-events:none'
          slot.appendChild(durText)

          if (item.id === 'water') {
            const wPct = Math.round((player.waterLevel / player.maxWater) * 100)
            const wBar = document.createElement('div')
            wBar.style.cssText = 'position:absolute;bottom:7px;left:3px;right:3px;height:3px;background:#224;border-radius:2px;overflow:hidden;pointer-events:none'
            const wFill = document.createElement('div')
            wFill.style.cssText = `height:100%;width:${wPct}%;background:${wPct > 50 ? '#4488cc' : wPct > 20 ? '#f39c12' : '#e74c3c'};border-radius:2px`
            wBar.appendChild(wFill)
            slot.appendChild(wBar)
          }

          const tier = player.toolTiers[item.id] || 1
          if (tier > 1) {
            const tierEl = document.createElement('span')
            tierEl.className = 'inv-count'
            tierEl.textContent = `★${tier}`
            tierEl.style.cssText = 'color:#ffd700;pointer-events:none'
            slot.appendChild(tierEl)
          }
        } else {
          const isSeed = item.id.startsWith('seed_')
          const seedEmoji = SEED_EMOJI_MAP[item.id]
          const itemEmoji = ITEM_EMOJI_MAP[item.id]
          if (isSeed && seedEmoji) {
            const icon = document.createElement('div')
            icon.className = 'slot-icon'
            const seedCol = ITEM_COLORS[item.id] || '#3a6e2a'
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:28px;width:48px;height:48px;background:${seedCol};border:2px solid rgba(255,255,255,0.2);border-radius:6px;position:relative;pointer-events:none`
            icon.innerHTML = `<span style="font-size:36px;opacity:0.4">🛍️</span><span style="position:absolute;font-size:22px">${seedEmoji}</span>`
            slot.appendChild(icon)
          } else if (itemEmoji) {
            const icon = document.createElement('div')
            icon.className = 'slot-icon'
            const col = ITEM_COLORS[item.id] || '#555'
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:28px;width:48px;height:48px;background:${col};border:2px solid rgba(255,255,255,0.2);border-radius:6px;pointer-events:none`
            icon.textContent = itemEmoji
            slot.appendChild(icon)
          } else {
            const col = ITEM_COLORS[item.id] || '#555'
            const label = (info?.name || item.id).slice(0, 4).toUpperCase()
            const icon = document.createElement('div')
            icon.className = 'slot-icon'
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;width:48px;height:48px;background:${col};border:2px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;text-shadow:1px 1px 0 #000;pointer-events:none`
            icon.textContent = label
            slot.appendChild(icon)
          }

          const countEl = document.createElement('span')
          countEl.className = 'inv-count'
          countEl.textContent = String(item.count)
          countEl.style.pointerEvents = 'none'
          slot.appendChild(countEl)
        }

        if (info) slot.title = info.name
      }
    }
  }

  showTooltip(e: MouseEvent, itemId: string, player?: PlayerState) {
    const info = getItemInfo(itemId)
    if (!info) return
    const tt = this.tooltipEl
    tt.querySelector('.tt-name')!.textContent = `${info.emoji} ${info.name}`
    tt.querySelector('.tt-type')!.textContent = info.type
    tt.querySelector('.tt-desc')!.textContent = info.description
    tt.querySelector('.tt-value')!.textContent = info.sellPrice > 0 ? `Sell: ${info.sellPrice}g` : ''

    const durEl = tt.querySelector('.tt-dur') as HTMLElement
    if (TOOLS[itemId] && player) {
      const dur = player.getToolDurability(itemId)
      const tier = player.toolTiers[itemId] || 1
      durEl.textContent = `Durability: ${dur}/${TOOL_MAX_DURABILITY} | Tier: ${tier}`
      durEl.style.display = 'block'
    } else {
      durEl.style.display = 'none'
    }

    tt.style.display = 'block'
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    let left = rect.right + 10, top = rect.top
    if (left + 260 > window.innerWidth) left = rect.left - 270
    if (top + 150 > window.innerHeight) top = window.innerHeight - 160
    tt.style.left = `${Math.max(5, left)}px`
    tt.style.top = `${Math.max(5, top)}px`
  }

  hideTooltip() { this.tooltipEl.style.display = 'none' }

  openShop(player: PlayerState, onAction: (action: string, id: string) => void) {
    this.shopOpen = true; this.onShopAction = onAction; sound.menuOpen()
    this.renderShopContent(player); this.shopPanel.style.display = 'block'
  }

  closeShop() { this.shopOpen = false; this.onShopAction = null; sound.menuClose(); this.shopPanel.style.display = 'none' }

  private renderShopContent(player: PlayerState) {
    const content = document.getElementById('shop-content')!
    content.innerHTML = ''

    // Seeds
    const seedSec = document.createElement('div'); seedSec.className = 'shop-section'
    seedSec.innerHTML = '<h3>🌱 Seeds</h3>'
    for (const [id, crop] of Object.entries(CROPS)) {
      const div = document.createElement('div'); div.className = 'shop-item'
      div.innerHTML = `<span>${crop.emoji} ${crop.name} (${crop.growthDays}d)</span><span>${crop.seedPrice}g</span>`
      const btn = document.createElement('button'); btn.className = 'shop-btn'; btn.textContent = 'Buy'
      btn.onclick = () => { this.onShopAction?.('buy_seed', id); this.renderShopContent(player) }
      div.appendChild(btn); seedSec.appendChild(div)
    }
    content.appendChild(seedSec)

    // Repair Tools
    const repairSec = document.createElement('div'); repairSec.className = 'shop-section'
    repairSec.innerHTML = '<h3>🔧 Repair Tools</h3>'
    let hasRepairs = false
    for (const [id, tool] of Object.entries(TOOLS)) {
      const dur = player.getToolDurability(id)
      if (dur >= TOOL_MAX_DURABILITY) continue
      hasRepairs = true
      const cost = Math.ceil((TOOL_MAX_DURABILITY - dur) * 2)
      const div = document.createElement('div'); div.className = 'shop-item'
      div.innerHTML = `<span>${tool.emoji} ${tool.name} (${Math.round(dur/TOOL_MAX_DURABILITY*100)}%)</span><span>${cost}g</span>`
      const btn = document.createElement('button'); btn.className = 'shop-btn repair'; btn.textContent = 'Repair'
      btn.onclick = () => { this.onShopAction?.('repair_tool', id); this.renderShopContent(player) }
      div.appendChild(btn); repairSec.appendChild(div)
    }
    if (!hasRepairs) repairSec.innerHTML += '<div class="shop-item" style="color:#666">All tools in good condition</div>'
    content.appendChild(repairSec)

    // Upgrades
    const upgSec = document.createElement('div'); upgSec.className = 'shop-section'
    upgSec.innerHTML = '<h3>⬆️ Tool Upgrades</h3>'
    for (const [id, tool] of Object.entries(TOOLS)) {
      const tier = player.toolTiers[id] || 1; const cost = tool.upgradeCost * tier
      const div = document.createElement('div'); div.className = 'shop-item'
      div.innerHTML = `<span>${tool.emoji} ${tool.name} Lv${tier}${tier >= 3 ? ' (MAX)' : ''}</span><span>${tier < 3 ? cost + 'g' : '-'}</span>`
      if (tier < 3) {
        const btn = document.createElement('button'); btn.className = 'shop-btn'; btn.textContent = 'Upgrade'
        btn.onclick = () => { this.onShopAction?.('upgrade_tool', id); this.renderShopContent(player) }
        div.appendChild(btn)
      }
      upgSec.appendChild(div)
    }
    content.appendChild(upgSec)
  }

  openInventory(player: PlayerState) {
    this.inventoryOpen = true
    sound.menuOpen()
    this.renderInventoryPanel(player)
    this.inventoryPanel.style.display = 'block'
  }

  closeInventory() {
    this.inventoryOpen = false
    sound.menuClose()
    this.inventoryPanel.style.display = 'none'
  }

  private showDeleteConfirm(player: PlayerState, itemId: string, count: number, slotIdx: number) {
    this.closeInventory()
    const info = getItemInfo(itemId)
    const emoji = info?.emoji || '❓'
    const name = info?.name || itemId
    const overlay = document.getElementById('delete-confirm-overlay')!
    document.getElementById('del-item-icon')!.textContent = emoji
    document.getElementById('del-item-name')!.textContent = `${name} x${count}`
    overlay.style.display = 'flex'
    sound.menuOpen()

    const yesBtn = document.getElementById('del-yes')!
    const noBtn = document.getElementById('del-no')!
    const cleanup = () => {
      overlay.style.display = 'none'
      yesBtn.replaceWith(yesBtn.cloneNode(true))
      noBtn.replaceWith(noBtn.cloneNode(true))
    }
    yesBtn.addEventListener('click', () => {
      player.removeItem(itemId, count)
      sound.error()
      cleanup()
      this.openInventory(player)
    })
    noBtn.addEventListener('click', () => {
      sound.menuClose()
      cleanup()
      this.openInventory(player)
    })
  }

  private renderInventoryPanel(player: PlayerState) {
    const content = document.getElementById('inv-content')!
    content.innerHTML = ''
    for (let i = 0; i < 16; i++) {
      const slot = document.createElement('div')
      slot.className = `inv-panel-slot${i === player.selectedSlot ? ' active' : ''}`
      slot.dataset.idx = String(i)

      const keyHint = document.createElement('span')
      keyHint.className = 'inv-key'
      keyHint.textContent = String(i + 1)
      slot.appendChild(keyHint)

      const item = player.inventory[i]
      if (item && item.count > 0) {
        const info = getItemInfo(item.id)
        const isTool = !!TOOLS[item.id]

        if (isTool) {
          const emoji = TOOL_EMOJI_MAP[item.id] || '🔧'
          const bg = TOOL_BG[item.id] || '#444'
          const icon = document.createElement('div')
          icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:32px;width:56px;height:56px;background:${bg};border-radius:8px`
          icon.textContent = emoji
          slot.appendChild(icon)

          const dur = player.getToolDurability(item.id)
          const durPct = Math.round((dur / TOOL_MAX_DURABILITY) * 100)
          const durBar = document.createElement('div')
          durBar.style.cssText = 'position:absolute;bottom:4px;left:4px;right:4px;height:5px;background:#333;border-radius:3px;overflow:hidden'
          const durFill = document.createElement('div')
          durFill.style.cssText = `height:100%;width:${durPct}%;background:${durPct > 50 ? '#4caf50' : durPct > 20 ? '#f39c12' : '#e74c3c'};border-radius:3px`
          durBar.appendChild(durFill)
          slot.appendChild(durBar)
        } else {
          const isSeed = item.id.startsWith('seed_')
          const seedEmoji = SEED_EMOJI_MAP[item.id]
          const itemEmoji = ITEM_EMOJI_MAP[item.id]
          if (isSeed && seedEmoji) {
            // Seed bag in panel: 🛍️ + seed emoji
            const seedCol = ITEM_COLORS[item.id] || '#3a6e2a'
            const icon = document.createElement('div')
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:36px;width:64px;height:64px;background:${seedCol};border-radius:8px;position:relative`
            icon.innerHTML = `<span style="font-size:48px;opacity:0.4">🛍️</span><span style="position:absolute;font-size:30px">${seedEmoji}</span>`
            slot.appendChild(icon)
          } else if (itemEmoji) {
            const col = ITEM_COLORS[item.id] || '#555'
            const icon = document.createElement('div')
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:32px;width:64px;height:64px;background:${col};border-radius:8px`
            icon.textContent = itemEmoji
            slot.appendChild(icon)
          } else {
            const col = ITEM_COLORS[item.id] || '#555'
            const label = (info?.name || item.id).slice(0, 4).toUpperCase()
            const icon = document.createElement('div')
            icon.style.cssText = `display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;width:64px;height:64px;background:${col};border-radius:8px;color:#fff`
            icon.textContent = label
            slot.appendChild(icon)
          }

          const countEl = document.createElement('span')
          countEl.className = 'inv-count'
          countEl.textContent = String(item.count)
          slot.appendChild(countEl)
        }

        if (info) {
          const nameEl = document.createElement('div')
          nameEl.style.cssText = 'position:absolute;bottom:-18px;left:0;right:0;text-align:center;font-size:6px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
          nameEl.textContent = info.name
          slot.appendChild(nameEl)
        }

        // Delete button
        const delBtn = document.createElement('button')
        delBtn.className = 'inv-del-btn'
        delBtn.textContent = '✕'
        delBtn.onclick = (e) => {
          e.stopPropagation()
          this.showDeleteConfirm(player, item.id, item.count, i)
        }
        slot.appendChild(delBtn)

        // Click to select
        slot.addEventListener('click', () => {
          player.selectedSlot = i
          sound.menuSelect()
          this.renderInventoryPanel(player)
        })

        // Drag support
        slot.draggable = true
        slot.addEventListener('dragstart', (e) => {
          e.dataTransfer!.setData('text/plain', String(i))
        })
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.style.borderColor = '#ffd700' })
        slot.addEventListener('dragleave', () => { slot.style.borderColor = '' })
        slot.addEventListener('drop', (e) => {
          e.preventDefault()
          slot.style.borderColor = ''
          const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'))
          const toIdx = i
          if (fromIdx !== toIdx) {
            player.swapSlots(fromIdx, toIdx)
            sound.menuSelect()
            this.renderInventoryPanel(player)
          }
        })
      }
      content.appendChild(slot)
    }
  }
}
