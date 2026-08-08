export class InputManager {
  keys: Record<string, boolean> = {}
  justPressed: Record<string, boolean> = {}
  private prevKeys: Record<string, boolean> = {}
  // Fast QA mode (`?fast=1`): edge-triggering relies on ticks observing the
  // keydown. A keydown+keyup pair that lands entirely between two ticks (ticks
  // are delayed 300-500ms by throttled SwiftShader render frames) would be
  // invisible to the game, so we latch every non-repeat keydown and report it
  // as justPressed on the next tick, consuming it once. Strictly gated behind
  // fast mode — normal mode semantics are byte-identical (latch never set).
  private fastLatch = false
  private latched: Record<string, boolean> = {}

  setFastLatch(enabled: boolean) {
    this.fastLatch = enabled
    if (!enabled) {
      // A press latched under fast mode must not fire later in normal mode.
      for (const key in this.latched) delete this.latched[key]
    }
  }

  constructor() {
    // Completion round: keydown/keyup bubble to the window listener with
    // e.target = the focused element, so typing into the debug overlay (or
    // any input/textarea) would otherwise leak WASD into the game keys.
    // Guard both directions: a keyup whose target is a form field must not
    // clear a game key either.
    const isTypingTarget = (e: KeyboardEvent): boolean => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return false
      return t.closest('input, textarea, #debug-overlay') !== null
    }
    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e)) return
      this.keys[e.code] = true
      // Non-repeat only: OS key-repeat while holding must keep the once-per-
      // press edge semantics (a repeat would otherwise re-latch every tick).
      if (this.fastLatch && !e.repeat) this.latched[e.code] = true
    })
    window.addEventListener('keyup', (e) => {
      if (isTypingTarget(e)) return
      this.keys[e.code] = false
    })
    // Completion round: tabbing out (or the page being hidden) swallows the
    // OS keyup — without a reset the key stays held and the cube keeps
    // walking when focus returns. Clear ALL key state on blur/
    // visibilitychange (keys, latches, edges — nothing may survive a tab).
    const clearAll = () => {
      for (const key in this.keys) delete this.keys[key]
      for (const key in this.latched) delete this.latched[key]
      for (const key in this.prevKeys) delete this.prevKeys[key]
      for (const key in this.justPressed) delete this.justPressed[key]
    }
    window.addEventListener('blur', clearAll)
    document.addEventListener('visibilitychange', clearAll)
  }

  update() {
    const keys = this.keys
    const prev = this.prevKeys
    const jp = this.justPressed
    for (const key in keys) {
      jp[key] = keys[key] && !prev[key]
    }
    if (this.fastLatch) {
      // A latch whose key edge-triggered this tick was set by the SAME keydown
      // the game just observed — consume it so it cannot re-fire below.
      for (const key in keys) {
        if (jp[key]) delete this.latched[key]
      }
      // Every remaining latch is a press the game has never observed (down+up
      // between ticks, or a fresh press while the key state was already held
      // from before the last tick): report it exactly once.
      for (const key in this.latched) {
        jp[key] = true
        delete this.latched[key]
      }
    }
    // Rebuild the prevKeys snapshot in place (no per-frame allocation)
    for (const key in prev) delete prev[key]
    for (const key in keys) prev[key] = keys[key]
  }

  isDown(code: string): boolean {
    return !!this.keys[code]
  }

  isJustPressed(code: string): boolean {
    return !!this.justPressed[code]
  }
}
