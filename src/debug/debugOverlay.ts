/**
 * debugOverlay — dev-only debug panel for the tile world (Slice C).
 *
 * DOM panel (id `debug-overlay`, top-left, semi-transparent dark background,
 * monospace) toggled with the backtick key. Shows live stats (FPS rolling,
 * loaded chunk count, last chunk-gen ms, seed, player position, time of day
 * HH:MM, FOV radius, biome under the cursor) polled from getState() every
 * ~250ms, plus a command input:
 *
 *   tp <x> <y>     teleport the player
 *   time HH:MM     set the clock
 *   time <minutes> set the clock
 *   time +N        advance the clock
 *   seed <n>       regenerate with a seed
 *   regen [n]      regenerate (current seed + 1 if omitted)
 *   fov <n>        set the FOV radius live
 *   help           list commands
 *
 * Invalid input shows an inline error in the panel and NEVER throws. The
 * overlay calls ONLY window.__debug primitives (setState / fastForward /
 * teleport / regenerate / setFovRadius / getState + the world handle) — no
 * parallel debug system.
 *
 * IMPORTANT: dev-only — this module is imported ONLY from devHarness.ts
 * (which is itself tree-shaken out of the production bundle), never from
 * main.ts. Keep it free of top-level side effects.
 */

/** Minimal view of window.__debug the overlay is allowed to touch. */
export interface OverlayApi {
  getState(): Record<string, unknown>
  setState(patch: { timeOfDay?: number }): void
  fastForward(minutes: number): void
  teleport(x: number, y: number): void
  regenerate(seed?: number): void
  setFovRadius(r: number): void
  world: {
    lastHover: { x: number; y: number; variant: string } | null
    biomeAt(x: number, y: number): string
  }
}

export interface DebugOverlayHandle {
  show(): void
  hide(): void
}

const OVERLAY_ID = 'debug-overlay'
const STATS_ID = 'debug-overlay-stats'
const INPUT_ID = 'debug-overlay-input'
const MSG_ID = 'debug-overlay-msg'

const HELP_TEXT = [
  'commands:',
  '  tp <x> <y>      teleport player',
  '  time HH:MM      set clock (24h)',
  '  time <minutes>  set clock (0..1439)',
  '  time +N         advance N minutes',
  '  seed <n>        regenerate with seed',
  '  regen [n]       regenerate (seed+1 if omitted)',
  '  fov <n>         set FOV radius',
  '  help            this list',
  'toggle panel: ` (backtick)',
].join('\n')

/** Formats timeOfDay minutes as HH:MM. */
function fmtHHMM(minutes: number): string {
  const t = ((Math.floor(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function initDebugOverlay(api: OverlayApi): DebugOverlayHandle {
  const container = document.createElement('div')
  container.id = OVERLAY_ID
  container.style.cssText = [
    'position:fixed',
    'top:8px',
    'left:8px',
    'z-index:9999',
    'background:rgba(10,12,22,0.78)',
    'color:#cfe8d8',
    'font:12px/1.55 ui-monospace,Menlo,Consolas,monospace',
    'padding:8px 10px',
    'border-radius:5px',
    'border:1px solid rgba(160,220,180,0.25)',
    'min-width:270px',
    'max-width:340px',
    'display:none',
    'white-space:pre',
    'user-select:none',
  ].join(';')

  const stats = document.createElement('div')
  stats.id = STATS_ID
  stats.style.cssText = 'margin-bottom:6px;white-space:pre'
  stats.textContent = '…'

  const input = document.createElement('input')
  input.id = INPUT_ID
  input.type = 'text'
  input.placeholder = 'command (help)'
  input.spellcheck = false
  input.autocomplete = 'off'
  input.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    'background:rgba(0,0,0,0.45)',
    'border:1px solid rgba(160,220,180,0.35)',
    'border-radius:3px',
    'color:#eaffea',
    'font:12px ui-monospace,Menlo,Consolas,monospace',
    'padding:3px 5px',
    'outline:none',
  ].join(';')

  const msg = document.createElement('div')
  msg.id = MSG_ID
  msg.style.cssText = 'margin-top:4px;color:#ffb4a0;white-space:pre-wrap;min-height:0'

  container.appendChild(stats)
  container.appendChild(input)
  container.appendChild(msg)
  document.body.appendChild(container)

  // ─── Toggle (backtick) ───
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return
    if (e.target === input) return // typing a backtick in the input must not toggle
    e.preventDefault()
    setVisible(container.style.display !== 'block')
  })

  function setVisible(v: boolean): void {
    container.style.display = v ? 'block' : 'none'
    if (v) input.focus()
  }

  // ─── Live stats (poll every ~250ms) ───
  let frames = 0
  let lastPoll = performance.now()
  let lastFps = 0
  const countFrame = () => {
    frames++
    requestAnimationFrame(countFrame)
  }
  requestAnimationFrame(countFrame)

  function renderStats(): void {
    const now = performance.now()
    const elapsed = (now - lastPoll) / 1000
    if (elapsed >= 0.25) {
      lastFps = frames / elapsed
      frames = 0
      lastPoll = now
    }
    const s = api.getState() as Record<string, unknown>
    const player = (s?.player ?? { x: NaN, y: NaN }) as { x: number; y: number }
    const hover = api.world?.lastHover ?? null
    let biome = '—'
    if (hover) {
      try {
        biome = api.world.biomeAt(hover.x, hover.y)
      } catch {
        biome = '—'
      }
    }
    stats.textContent = [
      `FPS: ${lastFps.toFixed(0).padStart(3)}   chunks: ${String(s?.loadedChunkCount ?? '—')}`,
      `gen: ${Number(s?.lastChunkGenMs ?? 0).toFixed(1)}ms   seed: ${String(s?.seed ?? '—')}`,
      `pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`,
      `time: ${fmtHHMM(Number(s?.timeOfDay ?? 0))}   fov: ${Number(s?.fovRadius ?? 0).toFixed(1)}`,
      `biome: ${biome}`,
    ].join('\n')
  }
  window.setInterval(renderStats, 250)

  // ─── Commands ───
  function setMsg(text: string, isError: boolean): void {
    msg.textContent = text
    msg.style.color = isError ? '#ffb4a0' : '#a8e8b8'
  }

  async function runCommand(line: string): Promise<void> {
    const parts = line.trim().split(/\s+/)
    const cmd = parts[0]?.toLowerCase()
    if (!cmd) return
    switch (cmd) {
      case 'help':
        setMsg(HELP_TEXT, false)
        return
      case 'tp': {
        if (parts.length !== 3) return setMsg('usage: tp <x> <y>', true)
        const x = Number(parts[1])
        const y = Number(parts[2])
        if (!Number.isFinite(x) || !Number.isFinite(y)) return setMsg('tp: x/y must be numbers', true)
        await api.teleport(x, y)
        setMsg(`teleported to (${x}, ${y})`, false)
        return
      }
      case 'time': {
        if (parts.length !== 2) return setMsg('usage: time HH:MM | time <minutes> | time +N', true)
        const arg = parts[1]
        if (arg.startsWith('+')) {
          const n = Number(arg.slice(1))
          if (!Number.isFinite(n) || n < 0) return setMsg('time: expected a positive minute count after "+"', true)
          await api.fastForward(n)
          setMsg(`advanced ${n} min`, false)
          return
        }
        if (arg.includes(':')) {
          const [hStr, mStr] = arg.split(':')
          const h = Number(hStr)
          const m = Number(mStr)
          if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
            return setMsg('time: expected HH:MM (24h)', true)
          }
          await api.setState({ timeOfDay: h * 60 + m })
          setMsg(`time set to ${fmtHHMM(h * 60 + m)}`, false)
          return
        }
        const minutes = Number(arg)
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439) {
          return setMsg('time: expected minutes 0..1439 or HH:MM or +N', true)
        }
        await api.setState({ timeOfDay: minutes })
        setMsg(`time set to ${fmtHHMM(minutes)}`, false)
        return
      }
      case 'seed':
      case 'regen': {
        if (parts.length === 1) {
          await api.regenerate()
          setMsg(`regenerated (seed ${String(api.getState()?.seed)})`, false)
          return
        }
        if (parts.length === 2) {
          const n = Number(parts[1])
          if (!Number.isInteger(n)) return setMsg(`${cmd}: expected an integer seed`, true)
          await api.regenerate(n)
          setMsg(`regenerated with seed ${n}`, false)
          return
        }
        setMsg(`usage: ${cmd} [n]`, true)
        return
      }
      case 'fov': {
        if (parts.length !== 2) return setMsg('usage: fov <n>', true)
        const r = Number(parts[1])
        if (!Number.isFinite(r) || r < 1) return setMsg('fov: expected a radius >= 1', true)
        await api.setFovRadius(r)
        setMsg(`fov radius set to ${r}`, false)
        return
      }
      default:
        setMsg(`unknown command "${cmd}" — type "help"`, true)
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const line = input.value
    input.value = ''
    if (!line.trim()) return
    runCommand(line).catch((err) => {
      setMsg(`error: ${err instanceof Error ? err.message : String(err)}`, true)
    })
  })

  return {
    show: () => setVisible(true),
    hide: () => setVisible(false),
  }
}