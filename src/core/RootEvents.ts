/**
 * Root DOM/input event wiring (start screen, pause menu, keyboard, wheel,
 * resize, volume). Extracted from the Game composition root so main.ts stays
 * a thin orchestrator; every handler routes through this narrow context —
 * openShop/openSlot orchestration itself remains in the root.
 */
export interface RootEventsContext {
  started: () => boolean
  paused: () => boolean
  slotOpen: () => boolean
  inventoryOpen: () => boolean
  shopOpen: () => boolean
  dialogueActive: () => boolean
  buyerActive: () => boolean
  selectedSlot: { get: () => number; set: (n: number) => void }
  togglePause: () => void
  openSlot: () => void
  closeSlot: () => void
  closeInventory: () => void
  closeShop: () => void
  closeDialogue: () => void
  openInventory: () => void
  pressSpin: () => void
  changeBet: (delta: number) => void
  shipItems: () => void
  updateHeldVisual: () => void
  menuSelect: () => void
  startGame: (seed?: number) => void
  setLang: (lang: 'en' | 'fa') => void
  setVolume: (v: number) => void
  useUnstuck: () => void
  camera: { aspect: number; updateProjectionMatrix: () => void }
  renderer: { setSize: (w: number, h: number) => void }
}

export function initRootEvents(ctx: RootEventsContext): void {
  // Language buttons on start screen
  document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => ctx.setLang(btn.getAttribute('data-lang') as 'en' | 'fa'))
  })
  // Language buttons in pause menu
  document.querySelectorAll('.lang-btn[data-pause-lang]').forEach(btn => {
    btn.addEventListener('click', () => ctx.setLang(btn.getAttribute('data-pause-lang') as 'en' | 'fa'))
  })

  // Pause menu wiring
  document.getElementById('resume-btn')!.addEventListener('click', () => ctx.togglePause())
  document.getElementById('unstuck-btn')!.addEventListener('click', () => ctx.useUnstuck())
  document.getElementById('slot-open-btn')!.addEventListener('click', () => {
    if (!ctx.started() || ctx.paused() || ctx.slotOpen()) return
    if (ctx.inventoryOpen()) ctx.closeInventory()
    if (ctx.shopOpen()) ctx.closeShop()
    if (ctx.dialogueActive()) ctx.closeDialogue()
    ctx.openSlot()
  })
  const volSlider = document.getElementById('vol-slider') as HTMLInputElement
  volSlider.addEventListener('input', () => { ctx.setVolume(parseInt(volSlider.value) / 100) })

  window.addEventListener('resize', () => {
    ctx.camera.aspect = window.innerWidth / window.innerHeight
    ctx.camera.updateProjectionMatrix()
    ctx.renderer.setSize(window.innerWidth, window.innerHeight)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      if (!ctx.started() || ctx.paused() || ctx.slotOpen() || e.repeat) return
      if (ctx.inventoryOpen()) ctx.closeInventory()
      if (ctx.shopOpen()) ctx.closeShop()
      if (ctx.dialogueActive()) ctx.closeDialogue()
      ctx.openSlot()
      return
    }
    if (e.key === 'Escape') {
      if (ctx.slotOpen()) { ctx.closeSlot(); return }
      if (ctx.inventoryOpen()) { ctx.closeInventory(); return }
      if (ctx.shopOpen()) { ctx.closeShop(); return }
      if (ctx.started() && !ctx.dialogueActive() && !ctx.buyerActive()) ctx.togglePause()
      return
    }
    if (ctx.slotOpen()) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        ctx.pressSpin()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        ctx.changeBet(-5)
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        ctx.changeBet(5)
      }
      return
    }
    if (!ctx.started() || ctx.paused() || ctx.dialogueActive()) return
    if (e.key === 'i' || e.key === 'I') {
      if (ctx.inventoryOpen()) ctx.closeInventory()
      else if (!ctx.shopOpen()) ctx.openInventory()
      return
    }
    if (ctx.shopOpen() || ctx.inventoryOpen()) return
    if (e.key >= '1' && e.key <= '8') {
      ctx.selectedSlot.set(parseInt(e.key) - 1)
      ctx.menuSelect()
      ctx.updateHeldVisual()
    }
    if (e.key === 'b' || e.key === 'B') ctx.shipItems()
  })

  // Mouse wheel to cycle inventory slots
  window.addEventListener('wheel', (e) => {
    if (!ctx.started() || ctx.paused() || ctx.dialogueActive() || ctx.shopOpen() || ctx.inventoryOpen()) return
    const dir = e.deltaY > 0 ? 1 : -1
    let next = ctx.selectedSlot.get() + dir
    if (next < 0) next = 7
    if (next > 7) next = 0
    ctx.selectedSlot.set(next)
    ctx.menuSelect()
    ctx.updateHeldVisual()
  })

  // Start button with seed input
  const startBtn = document.getElementById('start-btn')!
  startBtn.addEventListener('click', () => {
    const seedInput = document.getElementById('world-seed') as HTMLInputElement
    const seedVal = seedInput?.value.trim()
    const parsedSeed = seedVal ? parseInt(seedVal, 10) || hashString(seedVal) : undefined
    ctx.startGame(parsedSeed)
  })
}

// djb2-style hash for seed strings (start-screen world seed input).
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0 }
  return Math.abs(h)
}