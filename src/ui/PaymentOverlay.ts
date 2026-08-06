import { sound } from '../core/SoundManager'
import { CoinFx } from '../core/CoinFx'
import type { PlayerState } from '../player/PlayerState'

export interface PaymentOverlayLine {
  name: string
  count: number
  price: number
  total: number
}

/**
 * Morning-buyer payment overlay: line-by-line reveal with coin bursts, then a
 * count-up total that credits the player's gold. Receives the buyer lines and
 * total as parameters (the `(this as any)._buyerLines/_buyerTotal` hacks on
 * Game are gone). Keeps the same DOM hooks/classes the harness getState
 * depends on (#payment-overlay, #pay-lines, #pay-total).
 */
export interface PaymentOverlayContext {
  player: PlayerState
  coinFx: CoinFx
}

export class PaymentOverlay {
  constructor(private ctx: PaymentOverlayContext) {}

  show(lines: PaymentOverlayLine[], total: number) {
    const overlay = document.getElementById('payment-overlay')!
    const linesEl = document.getElementById('pay-lines')!
    const totalEl = document.getElementById('pay-total')!

    linesEl.innerHTML = ''
    lines.forEach((line, i) => {
      const div = document.createElement('div')
      div.className = 'pay-line'
      div.innerHTML = `<span>${line.name} x${line.count}</span><span class="pay-amt">+${line.total}g</span>`
      div.style.opacity = '0'; div.style.transform = 'translateX(-20px)'; div.style.transition = 'all 0.4s ease-out'
      linesEl.appendChild(div)
      setTimeout(() => {
        div.style.opacity = '1'; div.style.transform = 'translateX(0)'
        sound.menuSelect()
        // Spawn coin particles for each line
        this.ctx.coinFx.spawn(3)
      }, i * 500)
    })

    totalEl.textContent = ''
    setTimeout(() => {
      let current = 0
      const step = Math.max(1, Math.floor(total / 25))
      const countInterval = setInterval(() => {
        current = Math.min(current + step, total)
        totalEl.textContent = `💰 ${current}g`
        totalEl.style.transform = `scale(${1 + Math.sin(current * 0.1) * 0.05})`
        if (current >= total) {
          clearInterval(countInterval)
          this.ctx.player.gold += total
          totalEl.style.transform = 'scale(1.2)'
          setTimeout(() => { totalEl.style.transform = 'scale(1)' }, 200)
          sound.harvest()
          this.ctx.coinFx.spawn(15)
        }
      }, 40)
    }, lines.length * 500 + 300)

    overlay.style.display = 'block'
  }

  hide() {
    const overlay = document.getElementById('payment-overlay')
    if (overlay) overlay.style.display = 'none'
  }
}