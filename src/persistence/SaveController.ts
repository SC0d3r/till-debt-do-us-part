import type { PlayerState } from '../player/PlayerState'
import type { FarmGrid } from '../farm/FarmGrid'

/**
 * Save/load persistence. saveGame() writes the player + farm state to
 * localStorage; loadGame() restores them (the farm-load half of startGame's
 * `if (!this.player.load())` block). The farm is reached through a call-time
 * facade because startGame() replaces it.
 */
export interface SaveContext {
  player: PlayerState
  getFarm: () => FarmGrid
}

export class SaveController {
  constructor(private ctx: SaveContext) {}

  saveGame() {
    this.ctx.player.save()
    localStorage.setItem('till_debt_farm', JSON.stringify(this.ctx.getFarm().saveState()))
  }

  loadGame(): void {
    if (!this.ctx.player.load()) { /* defaults */ }
    else {
      const sf = localStorage.getItem('till_debt_farm')
      if (sf) try { this.ctx.getFarm().loadState(JSON.parse(sf)) } catch {}
    }
  }
}