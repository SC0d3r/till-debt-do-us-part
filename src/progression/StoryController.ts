import { sound } from '../core/SoundManager'
import { t } from '../core/i18n'
import { GAME_CONFIG } from '../data/gameData'
import type { PlayerState } from '../player/PlayerState'
import type { FarmGrid } from '../farm/FarmGrid'

/**
 * Story progression: the intro/Grimes trigger checks, the game-over score
 * screen and the sleep routine that used to live on Game (checkStoryTriggers,
 * showGameOverWithScore, doSleep + the getPartialPaymentAmount helper and the
 * lastGrimesDay latch). Reads the buyer's active flag through the buyerPortal
 * (not the buyer object directly) so the root keeps the cross-subsystem wiring.
 */
export interface StoryContext {
  player: PlayerState
  getFarm: () => FarmGrid
  isStarted: () => boolean
  savePortal: { saveGame: () => void }
  buyerPortal: {
    active: () => boolean
    triggerMorningBuyer: () => void
  }
  dialoguePortal: {
    active: () => boolean
    show: (id: string, onChoice?: (action: string) => void, labelOverrides?: Record<string, string>) => void
    showRaw: (speaker: string, text: string, onChoice?: (action: string) => void) => void
  }
}

export class StoryController {
  private lastGrimesDay = 0

  constructor(private ctx: StoryContext) {}

  // ─── SLEEP ───
  doSleep() {
    sound.sleep()
    this.ctx.player.advanceDay()
    const spoiled = this.ctx.getFarm().advanceDay()
    this.ctx.savePortal.saveGame()

    // Debt collector warning: day before grimes visit (every 5 days)
    if (!this.ctx.player.debtPaid && this.ctx.player.day % 5 === 4 && this.ctx.player.debt > 0) {
      const warnMsg = t('debtWarning').replace('{amount}', String(this.ctx.player.debt))
      setTimeout(() => this.ctx.dialoguePortal.showRaw('⚠️', warnMsg), 600)
    }

    setTimeout(() => this.ctx.buyerPortal.triggerMorningBuyer(), 500)

    if (spoiled.length > 0) { this.ctx.dialoguePortal.show('spoil_notice'); return }
    // First time a crop is ripe and ready to pick: teach the player how
    if (!this.ctx.player.hasFarmed && this.ctx.getFarm().hasRipeCrop()) {
      this.ctx.dialoguePortal.show('crop_ripe')
      return
    }
    if (this.ctx.player.debt <= 0 && !this.ctx.player.debtPaid) {
      this.ctx.player.debtPaid = true
      this.ctx.dialoguePortal.show('win', a => { if (a === 'reset') this.ctx.player.reset() })
    } else if (this.ctx.player.day > GAME_CONFIG.debtDeadline + (this.ctx.player.debtDeadlineBonus || 0) && this.ctx.player.debt > 0) {
      this.showGameOverWithScore()
    }
  }

  private getPartialPaymentAmount(): number {
    // Escalating: visit 1=100g, visit 2=200g, visit 3=300g, etc.
    const visit = this.ctx.player.grimesVisitCount + 1
    return Math.min(visit * 100, this.ctx.player.debt)
  }

  checkStoryTriggers() {
    if (!this.ctx.isStarted()) return
    if (!this.ctx.player.introSeen) { this.ctx.player.introSeen = true; this.ctx.dialoguePortal.show('intro_1'); return }
    if (!this.ctx.player.grimesFirstSeen && this.ctx.player.day >= 2) { this.ctx.player.grimesFirstSeen = true; this.ctx.dialoguePortal.show('grimes_first'); return }
    if (this.ctx.player.grimesFirstSeen && !this.ctx.player.debtPaid && this.ctx.player.day % 5 === 0 && this.lastGrimesDay !== this.ctx.player.day && !this.ctx.dialoguePortal.active() && !this.ctx.buyerPortal.active()) {
      this.lastGrimesDay = this.ctx.player.day
      this.ctx.player.grimesVisitCount++
      const partialAmt = this.getPartialPaymentAmount()
      // Update partial button label dynamically
      const partialLabel = t('dlg_pay_partial').replace('{amount}', String(partialAmt))
      this.ctx.dialoguePortal.show('grimes_visit', action => {
        if (action === 'pay_full') {
          if (this.ctx.player.gold >= this.ctx.player.debt) {
            this.ctx.player.gold -= this.ctx.player.debt; this.ctx.player.debt = 0
            this.ctx.dialoguePortal.show('grimes_paid')
          } else {
            this.ctx.dialoguePortal.show('grimes_no_gold')
          }
        } else if (action === 'pay_partial') {
          if (this.ctx.player.gold >= partialAmt) {
            this.ctx.player.gold -= partialAmt; this.ctx.player.debt -= partialAmt
            this.ctx.dialoguePortal.show('grimes_partial')
          } else {
            this.ctx.dialoguePortal.show('grimes_no_gold')
          }
        } else if (action === 'more_time') {
          if (this.ctx.player.grimesVisitCount <= 1) {
            // First time asking: grant 1 extra day
            this.ctx.player.debtDeadlineBonus = (this.ctx.player.debtDeadlineBonus || 0) + 1
            this.ctx.dialoguePortal.show('grimes_more_time_granted')
          } else {
            // Second time: game over with score
            this.showGameOverWithScore()
          }
        }
      }, { dlg_pay_partial: partialLabel })
    }
  }

  private showGameOverWithScore() {
    const score = this.ctx.player.getScore()
    const detail = t('dlg_score_detail')
      .replace('{earned}', String(this.ctx.player.totalGoldEarned))
      .replace('{sold}', String(this.ctx.player.totalItemsSold))
      .replace('{mined}', String(this.ctx.player.totalItemsMined))
      .replace('{nopet}', String(this.ctx.player.daysWithoutPettingDog))
      .replace('{score}', String(score))
    this.ctx.dialoguePortal.showRaw(t('dlg_score_title'), detail, action => {
      if (action === 'reset') this.ctx.player.reset()
    })
  }
}