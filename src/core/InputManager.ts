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
    for (const key in this.keys) {
      this.justPressed[key] = this.keys[key] && !this.prevKeys[key]
    }
    this.prevKeys = { ...this.keys }
  }

  isDown(code: string): boolean {
    return !!this.keys[code]
  }

  isJustPressed(code: string): boolean {
    return !!this.justPressed[code]
  }
}
