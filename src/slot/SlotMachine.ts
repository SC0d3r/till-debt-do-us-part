import { PlayerState } from '../player/PlayerState'
import { sound } from '../core/SoundManager'

// ─── Symbol definitions ───
export interface SlotSymbolDef {
  id: string
  emoji: string
  pay: number      // per-symbol win multiplier of the bet
  weight: number
  tier: number     // 0 low, 1 medium, 2 high, 3 wild
  scale: number    // visual size multiplier (bigger for high value)
}

const SYMBOLS: SlotSymbolDef[] = [
  { id: 'cherry',    emoji: '🍒', pay: 0.1,  weight: 22, tier: 0, scale: 1.0 },
  { id: 'lemon',     emoji: '🍋', pay: 0.12, weight: 20, tier: 0, scale: 1.0 },
  { id: 'grape',     emoji: '🍇', pay: 0.15, weight: 18, tier: 0, scale: 1.0 },
  { id: 'watermelon', emoji: '🍉', pay: 0.2, weight: 16, tier: 0, scale: 1.0 },
  { id: 'bell',      emoji: '🔔', pay: 0.4,  weight: 14, tier: 1, scale: 1.05 },
  { id: 'diamond',   emoji: '💎', pay: 0.7,  weight: 10, tier: 1, scale: 1.1 },
  { id: 'ring',      emoji: '💍', pay: 0.9,  weight: 8,  tier: 1, scale: 1.1 },
  { id: 'crown',     emoji: '👑', pay: 1.5,  weight: 6,  tier: 2, scale: 1.15 },
  { id: 'fire',      emoji: '🔥', pay: 2,    weight: 6,  tier: 2, scale: 1.15 },
  { id: 'kiss',      emoji: '💋', pay: 2.5,  weight: 5,  tier: 2, scale: 1.15 },
  { id: 'rose',      emoji: '🌹', pay: 3.5,  weight: 4,  tier: 2, scale: 1.2 },
  { id: 'heart',     emoji: '💖', pay: 4.5,  weight: 3,  tier: 2, scale: 1.2 },
  { id: 'sparkle',   emoji: '✨', pay: 6,    weight: 2,  tier: 2, scale: 1.25 },
  { id: 'love',      emoji: '😍', pay: 9,    weight: 1.5, tier: 2, scale: 1.3 },
  { id: 'boom',      emoji: '💥', pay: 5,    weight: 3,  tier: 3, scale: 1.2 },   // wild (joins any cluster)
  { id: 'target',    emoji: '🎯', pay: 0,    weight: 2,  tier: 0, scale: 1.0 },   // scatter (2+ pays, 3+ bonus)
]

const MIN_MATCH_TIER: Record<number, number> = { 0: 3, 1: 4, 2: 4, 3: 4 }
const MAX_CASCADES = 20
const COLS = 6
const ROWS = 7          // default board rows (mobile adds one more)
const MIN_BET = 1
const MAX_BET = 500
const GRAVITY = 140       // fall units (cells) / s²
const CELL_UNIT = 1.0     // one grid step in fall-units

const TIER_GLOW: Record<number, string> = { 0: 'rgba(255,255,255,0.55)', 1: 'rgba(255,106,181,0.75)', 2: 'rgba(255,215,0,0.85)', 3: 'rgba(178,107,255,0.85)' }

interface Cell {
  col: number
  row: number
  def: SlotSymbolDef
  el: HTMLDivElement
  state: 'falling' | 'landed'
  yOff: number
  vy: number
  delay: number
  phase: number
  tx: number   // px target left
  tz: number   // px target top
  matched: boolean
}

// ─── 2D Slot machine (pure DOM/CSS, no WebGL) ───
export class SlotMachine {
  private player: PlayerState
  private onHud: () => void
  private onClosed: () => void

  private grid: HTMLDivElement
  private cells: Cell[] = []
  private t = 0
  private shake = 0
  private slowmo = 0
  private closed = false
  private openTimer: number[] = []

  private state: 'idle' | 'drop' | 'match' | 'burst' | 'cascade' | 'win' | 'nowin' = 'idle'
  private stateT = 0
  private cascadeIndex = 0
  private totalWin = 0
  private waveWin = 0
  private matchedCells: Cell[] = []
  private maxCluster = 0
  private displayMoney = 0
  private moneyFrom = 0
  private moneyRollT = 1
  private betFrom = 0
  private betRollT = 1
  private winCredited = false
  private spinLocked = false
  private clinkCd = 0
  private bet = 10

  // pixel metrics (recomputed on resize)
  private rows = ROWS
  private cs = 90      // cell size px
  private gap = 7      // gap px
  private pad = 12     // panel padding px
  private step = 97    // cs + gap (one fall step in px)

  private el = {
    screen: document.getElementById('slot-screen')!,
    fade: document.getElementById('slot-fade')!,
    money: document.getElementById('slot-money')!,
    bet: document.getElementById('slot-bet')!,
    betMinus: document.getElementById('slot-bet-minus')!,
    betPlus: document.getElementById('slot-bet-plus')!,
    spin: document.getElementById('slot-spin') as HTMLButtonElement,
    mult: document.getElementById('slot-mult')!,
    winPanel: document.getElementById('slot-win-panel')!,
    winAmount: document.getElementById('slot-win-amount')!,
    winLabel: document.getElementById('slot-win-label')!,
    nowin: document.getElementById('slot-nowin')!,
    toast: document.getElementById('slot-toast')!,
    confetti: document.getElementById('slot-confetti')!,
  }

  constructor(player: PlayerState, onHud: () => void, onClosed: () => void) {
    this.player = player
    this.onHud = onHud
    this.onClosed = onClosed
    this.displayMoney = player.gold

    // Build the 2D grid panel
    this.grid = document.createElement('div')
    this.grid.id = 'slot-grid'
    this.el.screen.appendChild(this.grid)
    this.measure()

    window.addEventListener('resize', () => this.measure())

    this.wireDOM()
  }

  private measure() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const stacked = vw < 700 || vw < vh || vh < 620
    this.gap = 8
    this.pad = 14
    if (stacked) {
      // mobile: fill the space between header and bottom nav with square cells;
      // row count adapts so both width and height are used with small margins
      const availW = vw - 12
      const availH = vh - 72 - 210 - 6
      const csW = Math.max(24, Math.floor((availW - this.pad * 2 - (COLS - 1) * this.gap) / COLS))
      let rows = Math.max(4, Math.min(12, Math.floor((availH - 20) / (csW + this.gap))))
      this.rows = rows
      this.cs = Math.max(24, Math.min(csW, Math.floor((availH - 20 - (rows - 1) * this.gap) / rows)))
    } else {
      this.rows = ROWS
      this.cs = Math.max(52, Math.min(108, Math.floor(Math.min(vw * 0.115, (vh - 170) / this.rows))))
    }
    this.step = this.cs + this.gap
    const w = this.pad * 2 + COLS * this.cs + (COLS - 1) * this.gap
    const h = this.pad * 2 + this.rows * this.cs + (this.rows - 1) * this.gap
    this.grid.style.width = `${w}px`
    this.grid.style.height = `${h}px`
    if (stacked) {
      // win box sized relative to the grid so it never touches the table border
      const bw = Math.min(310, Math.round(w * 0.66))
      const bh = Math.max(160, Math.min(250, Math.round(h * 0.44)))
      this.el.winPanel.style.width = `${bw}px`
      this.el.winPanel.style.height = `${bh}px`
      this.el.winPanel.style.padding = `${Math.round(bh * 0.14)}px ${Math.round(bw * 0.09)}px`
      this.el.winAmount.style.fontSize = `${Math.max(28, Math.round(bh * 0.16))}px`
      this.el.winLabel.style.fontSize = `${Math.max(13, Math.round(bh * 0.07))}px`
    }
  }

  // ─── DOM wiring ───
  private wireDOM() {
    this.el.betMinus.addEventListener('click', () => this.changeBet(-5))
    this.el.betPlus.addEventListener('click', () => this.changeBet(5))
    document.querySelectorAll('.slot-quick').forEach((b) => {
      b.addEventListener('click', () => {
        const amt = (b as HTMLElement).dataset.amt
        if (amt === 'max') this.setBet(Math.min(this.player.gold, MAX_BET))
        else this.changeBet(parseInt(amt || '1'))
      })
    })
    this.el.spin.addEventListener('click', () => this.pressSpin())
    document.getElementById('slot-close')!.addEventListener('click', () => this.close())
  }

  setBet(next: number) {
    next = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(next)))
    this.bet = next
    this.renderBet()
    sound.slotClick()
  }

  changeBet(delta: number) {
    if (this.spinLocked || this.closed) return
    const next = delta > 0
      ? Math.min(this.bet + delta, MAX_BET)
      : Math.max(MIN_BET, this.bet + delta)
    if (next === this.bet) return
    if (delta > 0 && next > this.player.gold) {
      this.deny(this.el.bet)
      return
    }
    this.setBet(next)
  }

  // after a round, if the bet exceeds what we can afford, drop it to our gold
  private clampBetToAfford() {
    if (this.bet > this.player.gold) {
      this.bet = Math.max(MIN_BET, this.player.gold)
      this.renderBet()
    }
  }

  // gray out the spin button and bet number while a round is running
  private setRoundActive(active: boolean) {
    this.el.spin.disabled = active
    this.el.bet.classList.toggle('slot-rounding', active)
  }

  pressSpin() {
    if (this.closed) return
    if (this.state !== 'idle' && this.state !== 'win') return
    if (this.player.gold < this.bet) {
      this.deny(this.el.spin)
      return
    }
    this.spin()
  }

  private deny(target: HTMLElement) {
    sound.slotDeny()
    target.classList.remove('slot-shake')
    void target.offsetWidth
    target.classList.add('slot-shake')
    const panel = document.getElementById('slot-bet-panel')
    if (panel) {
      panel.classList.remove('slot-flash-red')
      void panel.offsetWidth
      panel.classList.add('slot-flash-red')
    }
    this.showToast('Not enough funds')
  }

  private showToast(msg: string) {
    this.el.toast.textContent = msg
    this.el.toast.classList.add('show')
    clearTimeout(this._toastTimer)
    this._toastTimer = window.setTimeout(() => this.el.toast.classList.remove('show'), 1600)
  }
  private _toastTimer = 0
  private _pressTimer = 0

  private renderBet() {
    this.betFrom = parseFloat((this.el.bet.textContent ?? '').replace(/[^0-9]/g, '') || '0') || this.bet
    this.betRollT = 0
    const afford = this.player.gold >= this.bet
    this.el.spin.classList.toggle('slot-disabled', !afford)
    this.el.spin.classList.toggle('slot-heartbeat', this.player.gold >= 500)
  }

  // ─── Open / close / lifecycle ───
  open() {
    this.closed = false
    this.displayMoney = this.player.gold
    this.resetToIdle()
    this.renderBet()
    this.updateMoneyText()
    this.el.screen.classList.add('show')
    this.el.fade.style.transition = 'opacity 0.4s ease-in-out'
    this.el.fade.style.opacity = '0'
    this.el.fade.style.pointerEvents = 'auto'
    clearTimeout(this._fadeTimer)
    this._fadeTimer = window.setTimeout(() => { this.el.fade.style.pointerEvents = 'none' }, 450)
    sound.slotAmbientOn()
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.el.fade.style.transition = 'opacity 0.4s ease-in-out'
    this.el.fade.style.opacity = '1'
    this.el.fade.style.pointerEvents = 'auto'
    clearTimeout(this._closeTimer)
    this._closeTimer = window.setTimeout(() => {
      this.el.screen.classList.remove('show')
      sound.slotAmbientOff()
      this.onClosed()
    }, 430)
  }
  private _closeTimer = 0
  private _fadeTimer = 0

  private resetToIdle() {
    this.clearGrid()
    this.state = 'idle'
    this.stateT = 0
    this.cascadeIndex = 0
    this.totalWin = 0
    this.waveWin = 0
    this.matchedCells = []
    this.winCredited = false
    this.spinLocked = false
    this.setRoundActive(false)
    this.clampBetToAfford()
    this.shake = 0
    this.el.winPanel.classList.remove('show')
    this.el.nowin.classList.remove('show')
    this.grid.classList.remove('gold', 'dim')
    this.updateMult(1)
  }

  private clearGrid() {
    for (const cell of this.cells) cell.el.remove()
    this.cells = []
  }

  // ─── Spin & round flow ───
  private spin() {
    this.player.gold -= this.bet
    this.onHud()
    sound.slotClick()
    sound.slotSpinWhoosh()

    // Spin button press animation
    this.el.spin.classList.remove('slot-press')
    void this.el.spin.offsetWidth
    this.el.spin.classList.add('slot-press')
    clearTimeout(this._pressTimer)
    this._pressTimer = window.setTimeout(() => this.el.spin.classList.remove('slot-press'), 180)

    this.clearGrid()
    this.state = 'drop'
    this.stateT = 0
    this.cascadeIndex = 0
    this.totalWin = 0
    this.waveWin = 0
    this.matchedCells = []
    this.winCredited = false
    this.spinLocked = true
    this.setRoundActive(true)
    this.grid.classList.remove('gold', 'dim')
    this.el.winPanel.classList.remove('show')
    this.el.nowin.classList.remove('show')
    this.updateMult(1)

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < this.rows; row++) {
        const cell = this.createCell(col, row, this.pickSymbol(), row + 1.2 + Math.random() * 0.6, (col + row) * 0.02 + Math.random() * 0.06)
        cell.vy = -4 - Math.random() * 1
      }
    }
    this.renderBet()
  }

  private pickSymbol(): SlotSymbolDef {
    let total = 0
    for (const s of SYMBOLS) total += s.weight
    let r = Math.random() * total
    for (const s of SYMBOLS) {
      r -= s.weight
      if (r <= 0) return s
    }
    return SYMBOLS[0]
  }

  private createCell(col: number, row: number, def: SlotSymbolDef, yOff = 6, delay = 0): Cell {
    const el = document.createElement('div')
    el.className = `slot-cell tier-${def.tier}`
    el.style.width = `${this.cs}px`
    el.style.height = `${this.cs}px`
    el.style.fontSize = `${Math.round(this.cs * 0.52 * def.scale)}px`
    el.style.left = `${this.pad + col * this.step}px`
    el.style.top = `${this.pad + row * this.step}px`
    el.style.setProperty('--glow', TIER_GLOW[def.tier] || TIER_GLOW[0])
    el.style.animationDelay = `${-(col + row) * 0.3}s`
    el.textContent = def.emoji
    this.grid.appendChild(el)

    const cell: Cell = {
      col, row, def, el,
      state: 'falling', yOff, vy: 0,
      delay, phase: 0,
      tx: this.pad + col * this.step,
      tz: this.pad + row * this.step,
      matched: false,
    }
    this.cells.push(cell)
    return cell
  }

  private paintCell(cell: Cell) {
    const yPx = cell.yOff * this.step
    cell.el.style.transform = `translateY(${(-yPx).toFixed(1)}px)`
  }

  // ─── Update loop ───
  update(rawDt: number) {
    if (this.closed) return

    let dt = rawDt
    if (this.slowmo > 0) {
      this.slowmo -= rawDt
      dt = rawDt * 0.35
    }
    this.t += dt
    this.stateT += dt

    this.shake = Math.max(0, this.shake - dt * 2.2)

    // Falling cells (drop + cascade)
    if (this.state === 'drop' || this.state === 'cascade') {
      this.updateFalling(dt)
      if (this.allLanded()) this.onSettled()
    } else if (this.state === 'match') {
      if (this.stateT > 0.34) this.startBurst()
    } else if (this.state === 'burst') {
      if (this.stateT > 0.12) this.startCascade()
    } else if (this.state === 'win') {
      this.updateWin(dt)
    } else if (this.state === 'nowin') {
      if (this.stateT > 0.3) {
        this.state = 'idle'
        this.spinLocked = false
        this.el.nowin.classList.remove('show')
      }
    }

    // Money display reel
    if (this.moneyRollT < 1) {
      this.moneyRollT = Math.min(1, this.moneyRollT + dt * 3.2)
      const p = 1 - Math.pow(1 - this.moneyRollT, 3)
      this.displayMoney = Math.floor(this.moneyFrom + (this.player.gold - this.moneyFrom) * p)
      this.updateMoneyText()
    } else if (this.displayMoney !== this.player.gold) {
      this.moneyFrom = this.displayMoney
      this.moneyRollT = 0
    }

    // Bet display reel
    if (this.betRollT < 1) {
      this.betRollT = Math.min(1, this.betRollT + dt * 5)
      const p = 1 - Math.pow(1 - this.betRollT, 3)
      this.el.bet.textContent = String(Math.round(this.betFrom + (this.bet - this.betFrom) * p))
    }
  }

  private updateFalling(dt: number) {
    this.clinkCd -= dt
    for (const cell of this.cells) {
      if (cell.state !== 'falling') continue
      cell.phase += dt
      if (cell.delay > 0) {
        cell.delay -= dt
        this.paintCell(cell)
        continue
      }
      cell.vy -= GRAVITY * dt
      cell.yOff += cell.vy * dt
      if (cell.yOff <= 0) {
        cell.yOff = 0
        if (cell.vy < -3.2) {
          cell.vy = -cell.vy * 0.3
          if (this.clinkCd <= 0) {
            this.clinkCd = 0.05
            sound.slotClink()
          }
        } else {
          cell.vy = 0
          cell.state = 'landed'
        }
      }
      this.paintCell(cell)
    }
  }

  private allLanded(): boolean {
    return this.cells.every(c => c.state === 'landed')
  }

  // ─── Matching ───
  private neighbors(cell: Cell): Cell[] {
    const res: Cell[] = []
    for (const c of this.cells) {
      if (c === cell) continue
      if (Math.abs(c.col - cell.col) + Math.abs(c.row - cell.row) === 1) res.push(c)
    }
    return res
  }

  private findMatches(): Cell[] {
    const visited = new Set<Cell>()
    const matched = new Set<Cell>()
    const groups: Cell[][] = []
    for (const cell of this.cells) {
      if (visited.has(cell) || cell.def.id === 'boom' || cell.def.id === 'target') continue
      const group: Cell[] = []
      const queue: Cell[] = [cell]
      visited.add(cell)
      while (queue.length) {
        const c = queue.shift()!
        group.push(c)
        for (const nb of this.neighbors(c)) {
          if (visited.has(nb)) continue
          if (nb.def.id === c.def.id || nb.def.id === 'boom') {
            visited.add(nb)
            queue.push(nb)
          }
        }
      }
      groups.push(group)
    }
    let scatterCount = 0
    for (const cell of this.cells) if (cell.def.id === 'target') scatterCount++
    for (const g of groups) {
      if (g.length >= MIN_MATCH_TIER[g[0].def.tier]) for (const c of g) matched.add(c)
    }
    if (scatterCount >= 3) {
      for (const cell of this.cells) if (cell.def.id === 'target') matched.add(cell)
    }
    return [...matched]
  }

  private onSettled() {
    // all cells landed — snap any leftover bounce/spin back to rest
    for (const c of this.cells) {
      c.el.style.transform = 'translateY(0px)'
    }
    const matched = this.findMatches()
    const mult = this.waveMult
    const scatterCount = this.cells.filter(c => c.def.id === 'target').length

    if (matched.length === 0) {
      // End of chain
      if (this.totalWin > 0 || scatterCount >= 2) {
        if (scatterCount >= 2) this.totalWin += Math.round(this.bet * 1.5)
        this.startWin()
      } else {
        this.startNoWin()
      }
      return
    }

    // Compute wave win
    let waveWin = 0
    let maxCluster = 0
    const byId = new Map<string, number>()
    for (const c of matched) {
      if (c.def.id === 'target' || c.def.id === 'boom') continue
      byId.set(c.def.id, (byId.get(c.def.id) || 0) + 1)
    }
    // cluster win: count × pay (wilds substitute into a cluster, they add no pay of their own)
    for (const [id, count] of byId) {
      const def = SYMBOLS.find(s => s.id === id)
      if (!def) continue
      maxCluster = Math.max(maxCluster, count)
      waveWin += count * def.pay * this.bet
    }
    let scatterBonus = 0
    for (const c of matched) if (c.def.id === 'target') scatterBonus++
    if (scatterBonus >= 3) waveWin += this.bet * 8 * (scatterBonus - 2)

    this.waveWin = Math.round(waveWin * mult)
    this.totalWin += this.waveWin
    this.matchedCells = matched
    this.maxCluster = maxCluster

    this.state = 'match'
    this.stateT = 0
    for (const c of matched) {
      c.matched = true
      c.el.classList.add('matching')
      const sp = document.createElement('span')
      sp.className = 'cell-sparkle'
      sp.textContent = '✨'
      c.el.appendChild(sp)
    }
    sound.slotMatch(matched.length)
  }

  private startBurst() {
    this.state = 'burst'
    this.stateT = 0
    // sound intensity by cluster size
    if (this.maxCluster >= 9) sound.slotPop(this.maxCluster)
    else sound.slotPop(Math.min(5, Math.max(2, this.maxCluster)))
    if (this.totalWin >= this.bet * 10) this.shake = Math.max(this.shake, 0.7)
    else if (this.matchedCells.length >= 8) this.shake = Math.max(this.shake, 0.4)

    // screen shake on the grid
    if (this.shake > 0) {
      this.grid.classList.remove('slot-shake')
      void this.grid.offsetWidth
      this.grid.classList.add('slot-shake')
    }

    for (const c of this.matchedCells) {
      // burst particles
      const n = 8 + Math.min(this.maxCluster, 6)
      const col = c.def.tier === 2 ? '#ffd700' : c.def.tier === 1 ? '#ff6ab5' : '#ffffff'
      for (let i = 0; i < n; i++) this.spawnParticle(c.tx, c.tz, col)
      // burst animation then remove
      c.el.classList.remove('matching')
      c.el.classList.add('bursting')
      window.setTimeout(() => c.el.remove(), 170)
    }
    // remove matched cells from active grid
    const matchedSet = new Set(this.matchedCells)
    this.cells = this.cells.filter(c => !matchedSet.has(c))
  }

  private startCascade() {
    this.state = 'cascade'
    this.stateT = 0
    this.cascadeIndex++
    this.waveMult = this.rollMult(this.cascadeIndex)
    this.updateMult(this.waveMult)

    if (this.cascadeIndex >= MAX_CASCADES) {
      // force resolve
      this.startWin()
      return
    }
    sound.slotCascadeUp(this.cascadeIndex)

    // survivors fall down to fill gaps
    for (let col = 0; col < COLS; col++) {
      const colCells = this.cells.filter(c => c.col === col).sort((a, b) => b.row - a.row)
      let targetRow = this.rows - 1
      for (const c of colCells) {
        const newRow = targetRow--
        if (newRow !== c.row) {
          const dropDist = (c.row - newRow) * CELL_UNIT
          c.row = newRow
          c.tz = this.pad + newRow * this.step
          c.el.style.top = `${c.tz}px`
          c.state = 'falling'
          c.yOff = dropDist
          c.vy = -4 - Math.random() * 1
          c.delay = dropDist * 0.03 + Math.random() * 0.05
        }
      }
      // new symbols drop from the top
      while (targetRow >= 0) {
        this.createCell(col, targetRow, this.pickSymbol(), targetRow + 1.2 + Math.random() * 0.6, (this.rows - targetRow) * 0.03 + col * 0.01 + Math.random() * 0.04)
        targetRow--
      }
    }
  }

  private startWin() {
    this.state = 'win'
    this.stateT = 0
    this.spinLocked = false
    this.setRoundActive(false)
    this.clampBetToAfford()
    const win = this.totalWin
    this.player.gold += win
    this.winCredited = true
    this.onHud()

    const label = win >= this.bet * 20 ? 'BIG WIN!' : win >= this.bet * 5 ? 'NICE WIN!' : 'WIN!'
    this.el.winLabel.textContent = label
    this.el.winPanel.classList.add('show')
    this.grid.classList.add('dim')
    this.buildWinDigits(win)
    this.renderWinDigits(0)

    if (win >= this.bet * 20) {
      sound.slotBigWin()
      this.shake = 0.9
      this.slowmo = 0.6
      this.spawnConfetti()
      this.spawnStreak()
      this.grid.classList.add('gold')
      this.grid.classList.add('win-zoom')
    } else if (win >= this.bet * 5) {
      sound.slotWin(4)
      this.shake = 0.4
      this.spawnConfetti(18)
      this.spawnStreak()
      this.grid.classList.add('gold')
    } else {
      sound.slotWin(1)
      this.spawnStreak()
    }
  }

  private updateWin(dt: number) {
    const win = this.totalWin
    const duration = Math.min(1.9, Math.max(0.5, 0.5 + (win / (this.bet * 20)) * 1.4))
    const p = Math.min(1, this.stateT / duration)
    const finalStr = win.toLocaleString()
    const shown = Math.floor(win * p)
    // zero-pad the rolling count to the final digit count so the reel columns never shift
    let shownStr = String(shown).padStart(finalStr.replace(/[^0-9]/g, '').length, '0')
    for (let i = 0; i < finalStr.length; i++) {
      if (finalStr[i] === ',') shownStr = shownStr.slice(0, i) + ',' + shownStr.slice(i)
    }
    this.renderWinDigits(shownStr)
    if (p >= 1) {
      this.renderWinDigits(finalStr, true)
      // panel stays open until the player presses SPIN
    }
  }

  private startNoWin() {
    this.state = 'nowin'
    this.stateT = 0
    this.setRoundActive(false)
    this.clampBetToAfford()
    sound.slotNoWin()
    // desaturate grid briefly — no "no win" text, spin again right away
    this.grid.classList.add('dim')
  }

  // ─── Multiplier display ───
  private _multShown = 1
  private _multTimer = 0
  private waveMult = 1

  // random fractional multiplier per cascade: grows with depth, capped at x18
  private rollMult(k: number) {
    const v = 1 + k * 0.85 + Math.random() * 0.9
    return Math.min(18, Math.round(v * 10) / 10)
  }

  private updateMult(v: number) {
    const el = this.el.mult
    clearTimeout(this._multTimer)
    if (v <= 1) {
      el.style.opacity = '0'
      el.style.textShadow = ''
      this._multShown = 1
      return
    }
    const heat = Math.min(1, (v - 1) / 17)
    el.style.opacity = '1'
    el.style.textShadow = `0 0 ${10 + heat * 22}px rgba(255,215,0,${0.7 + heat * 0.3}), 0 0 ${24 + heat * 44}px rgba(255,160,40,${0.35 + heat * 0.55})`
    el.classList.remove('slot-pop')
    void el.offsetWidth
    el.classList.add('slot-pop')
    sound.slotMultDing(v)

    // slot-machine reel: cycle through intermediate fractional values up to v
    if (v === this._multShown) {
      el.textContent = `x${v}`
      return
    }
    const steps = Math.max(1, Math.min(5, Math.ceil((v - this._multShown) * 3)))
    const roll: number[] = []
    for (let i = 1; i <= steps; i++) {
      const mid = this._multShown + (v - this._multShown) * (i / steps)
      roll.push(i === steps ? v : Math.round(mid * 10) / 10)
    }
    this._multShown = v
    let k = 0
    const tick = () => {
      if (k >= roll.length) {
        el.textContent = `x${v}`
        return
      }
      el.textContent = `x${roll[k]}`
      sound.slotClink()
      k++
      this._multTimer = window.setTimeout(tick, 55)
    }
    tick()
  }

  // ─── Win amount slot-reel digits ───
  private _digitCells: { strip: HTMLElement }[] = []

  private buildWinDigits(finalValue: number) {
    this.el.winAmount.innerHTML = ''
    this._digitCells = []
    const str = finalValue.toLocaleString()
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      if (ch === ',') {
        const s = document.createElement('span')
        s.className = 'win-digit-comma'
        s.textContent = ','
        this.el.winAmount.appendChild(s)
        continue
      }
      const root = document.createElement('span')
      root.className = 'win-digit'
      const strip = document.createElement('span')
      strip.className = 'win-digit-strip'
      for (let d = 0; d < 10; d++) {
        const n = document.createElement('span')
        n.textContent = String(d)
        strip.appendChild(n)
      }
      root.appendChild(strip)
      this.el.winAmount.appendChild(root)
      this._digitCells.push({ strip })
    }
  }

  private renderWinDigits(value: number | string, settle = false) {
    const str = typeof value === 'number' ? value.toLocaleString() : value
    let d = 0
    for (let i = 0; i < str.length && d < this._digitCells.length; i++) {
      const ch = str[i]
      if (ch === ',') continue
      const strip = this._digitCells[d++].strip
      const target = -parseInt(ch) * 100
      const cur = strip.style.transform
      const curY = cur ? parseFloat(cur.replace(/[^0-9.-]/g, '') || '0') : 0
      if (Math.abs(curY - target) > 0.5) {
        strip.style.transitionDelay = settle ? '0ms' : `${(this._digitCells.length - d) * 12}ms`
        strip.style.transform = `translateY(${target}%)`
      }
    }
  }

  // ─── Money text ───
  private updateMoneyText() {
    const val = Math.floor(this.displayMoney)
    const text = val.toLocaleString()
    if (this.el.money.textContent !== text) this.el.money.textContent = text
  }

  // ─── Burst particles (DOM spans) ───
  private spawnParticle(x: number, y: number, color: string) {
    const p = document.createElement('div')
    p.className = 'slot-particle'
    p.style.left = `${x + this.cs / 2}px`
    p.style.top = `${y + this.cs / 2}px`
    p.style.setProperty('--pc', color)
    const ang = Math.random() * Math.PI * 2
    const sp = 34 + Math.random() * 60
    p.style.setProperty('--dx', `${Math.round(Math.cos(ang) * sp)}px`)
    p.style.setProperty('--dy', `${Math.round(Math.sin(ang) * sp - 26)}px`)
    const s = 5 + Math.random() * 5
    p.style.width = `${s}px`
    p.style.height = `${s}px`
    this.grid.appendChild(p)
    window.setTimeout(() => p.remove(), 700)
  }

  // ─── DOM effects ───
  private spawnConfetti(count = 42) {
    const emojis = ['💖', '✨', '👑', '🌹', '💰', '💎', '💋', '🎉']
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div')
      d.className = 'slot-confetti'
      d.textContent = emojis[Math.floor(Math.random() * emojis.length)]
      d.style.left = `${Math.random() * 96}vw`
      d.style.fontSize = `${14 + Math.random() * 22}px`
      d.style.animationDuration = `${1.8 + Math.random() * 1.6}s`
      d.style.setProperty('--drift', `${Math.random() * 240 - 120}px`)
      this.el.confetti.appendChild(d)
      setTimeout(() => d.remove(), 3600)
    }
  }

  private spawnStreak() {
    const s = document.createElement('div')
    s.className = 'slot-streak'
    this.el.confetti.appendChild(s)
    setTimeout(() => s.remove(), 1100)
  }
}
