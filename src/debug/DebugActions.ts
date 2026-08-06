/**
 * Debug-action registry — replaces the monolithic debugDispatch switch that
 * used to live on Game. Each subsystem registers the action strings it handles
 * (through the registry passed in its context); the composition root registers
 * the actions it owns (start/openShop/openSlot/...). Game.debugDispatch is now
 * a one-line delegation to this registry.
 *
 * The unknown-action throw is part of the pinned dev-harness API surface
 * (tests/qa-harness.mjs A-tests depend on it), so it is preserved verbatim.
 *
 * Dev-only: the registry is only ever reached through Game.debugDispatch,
 * which is never called by game code — harmless dead code in production
 * builds (same gating style as initDevHarness).
 */
export type DebugActionHandler = (arg?: unknown) => void

export class DebugActionRegistry {
  private handlers = new Map<string, DebugActionHandler>()

  register(owner: string, actions: Record<string, DebugActionHandler>): void {
    for (const [action, fn] of Object.entries(actions)) {
      if (this.handlers.has(action)) {
        throw new Error(`debugDispatch: duplicate action "${action}" (${owner})`)
      }
      this.handlers.set(action, fn)
    }
  }

  dispatch(action: string, arg?: unknown): void {
    const fn = this.handlers.get(action)
    if (!fn) throw new Error(`debugDispatch: unknown action "${action}"`)
    fn(arg)
  }
}