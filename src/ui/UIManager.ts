import { PlayerState } from '../player/PlayerState'
import { CROPS, TOOLS, MINE_ITEMS, MATERIAL_ITEMS, getItemInfo, TOOL_MAX_DURABILITY } from '../data/gameData'
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
  hoe: '⛏️', water: '💧', pickaxe: '🪨', axe: '🪓', shovel: '🥄',
}

export class UIManager {
  shopOpen = false
  private tooltipEl: HTMLElement
  private dialogBox: HTMLElement
  private shopPanel: HTMLElement
  private onShopAction: ((action: string, id: string) => void) | null = null

  constructor() {
    this.tooltipEl = document.getElementById('item-tooltip')!
    this.dialogBox = document.getElementById('dialog-box')!
    this.shopPanel = document.getElementById('shop-panel')!
    document.getElementById('shop-close')!.addEventListener('click', () => this.closeShop())
    document.addEventListener('mousemove', (e) => {
      if (!(e.target as HTMLElement).closest('.inv-slot')) this.hideTooltip()
    })
  }

  updateHUD(player: PlayerState) {
    document.getElementById('day-display')!.textContent = String(player.day)
    document.getElementById('gold-display')!.textContent = String(player.gold)
    document.getElementById('debt-display')!.textContent = String(player.debt)
    const pct = Math.max(0, (player.stamina / player.maxStamina) * 100)
    const fill = document.getElementById('stamina-fill')!
    fill.style.width = `${pct}%`
    fill.style.background = pct < 20 ? '#e74c3c' : pct < 50 ? '#f39c12' : 'linear-gradient(90deg, #4caf50, #6abf5a)'

    const durEl = document.getElementById('durability-indicator')!
    const sel = player.getSelectedItem()
    if (sel && TOOLS[sel.id]) {
      const dur = player.getToolDurability(sel.id)
      const durPct = Math.round((dur / TOOL_MAX_DURABILITY) * 100)
      const color = durPct > 50 ? '#4caf50' : durPct > 20 ? '#f39c12' : '#e74c3c'
      durEl.innerHTML = `<span style="color:${color}">🔧${durPct}%</span>`
    } else {
      durEl.textContent = ''
    }

    this.renderInventory(player)
  }

  private renderInventory(player: PlayerState) {
    const bar = document.getElementById('inventory-bar')!
    bar.innerHTML = ''
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div')
      slot.className = `inv-slot${i === player.selectedSlot ? ' active' : ''}`

      const keyHint = document.createElement('span')
      keyHint.className = 'inv-key'
      keyHint.textContent = String(i + 1)
      slot.appendChild(keyHint)

      const item = player.inventory[i]
      if (item && item.count > 0) {
        const info = getItemInfo(item.id)
        const isTool = !!TOOLS[item.id]

        if (isTool) {
          // Tool: show emoji icon + durability bar
          const icon = document.createElement('div')
          icon.className = 'slot-icon'
          icon.style.display = 'flex'
          icon.style.alignItems = 'center'
          icon.style.justifyContent = 'center'
          icon.style.fontSize = '22px'
          icon.style.width = '36px'
          icon.style.height = '36px'
          icon.textContent = TOOL_EMOJIS[item.id] || '🔧'
          slot.appendChild(icon)

          // Durability bar at bottom of slot
          const dur = player.getToolDurability(item.id)
          const durPct = Math.round((dur / TOOL_MAX_DURABILITY) * 100)
          const durBar = document.createElement('div')
          durBar.className = 'inv-dur-bar'
          durBar.style.cssText = `position:absolute;bottom:2px;left:3px;right:3px;height:4px;background:#333;border-radius:2px;overflow:hidden`
          const durFill = document.createElement('div')
          durFill.style.cssText = `height:100%;width:${durPct}%;background:${durPct > 50 ? '#4caf50' : durPct > 20 ? '#f39c12' : '#e74c3c'};border-radius:2px;transition:width 0.2s`
          durBar.appendChild(durFill)
          slot.appendChild(durBar)

          // Tier indicator
          const tier = player.toolTiers[item.id] || 1
          if (tier > 1) {
            const tierEl = document.createElement('span')
            tierEl.className = 'inv-count'
            tierEl.textContent = `★${tier}`
            tierEl.style.color = '#ffd700'
            slot.appendChild(tierEl)
          }
        } else {
          // Non-tool: colored icon + count
          const color = ITEM_COLORS[item.id] || '#888'
          const icon = document.createElement('div')
          icon.className = 'slot-icon'
          icon.style.background = color
          icon.style.width = '34px'
          icon.style.height = '34px'
          icon.style.borderRadius = item.id.startsWith('gem_') ? '50%' : '4px'
          icon.style.boxShadow = 'inset 0 -2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(255,255,255,0.1)'
          slot.appendChild(icon)

          const countEl = document.createElement('span')
          countEl.className = 'inv-count'
          countEl.textContent = String(item.count)
          slot.appendChild(countEl)
        }

        if (info) slot.title = info.name

        slot.addEventListener('mouseenter', (e) => { if (item && item.count > 0) this.showTooltip(e, item.id, player) })
        slot.addEventListener('click', (e) => { if (item && item.count > 0) this.showTooltip(e, item.id, player); sound.menuSelect() })
      }
      slot.addEventListener('click', () => { player.selectedSlot = i; this.updateHUD(player); sound.menuSelect() })
      bar.appendChild(slot)
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
}
