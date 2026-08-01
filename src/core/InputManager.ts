export class InputManager {
  keys: Record<string, boolean> = {}
  justPressed: Record<string, boolean> = {}
  private prevKeys: Record<string, boolean> = {}

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
    })
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
    })
  }

  update() {
    const keys = this.keys
    const prev = this.prevKeys
    const jp = this.justPressed
    for (const key in keys) {
      jp[key] = keys[key] && !prev[key]
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
