// QA — Slice C adversarial FINAL GATE battery (beyond the acceptance batteries).
// These are probes the fix-round batteries do NOT cover: void-walk / far-coord
// teleports, extreme harness inputs (seed 0 / negative / 2^31 int32 wrap, fov 1
// and fov 30, midnight fast-forward wraps, timeOfDay 0/1439 boundaries), rapid
// WASD ↔ click-to-move interleaving, dispose/re-init leak cycles, hover across
// chunk borders + through the debug overlay (the known minor), key-stick after
// window blur (fixed in the completion round — G1 now asserts the reset), and
// the night→dawn tween while the player is moving (R5 at speed).
//
// Findings this battery has already confirmed (kept as regression probes):
//   W1  InputManager had NO window blur / visibilitychange key-reset: a WASD
//       key held across a tab-out kept walking when focus returned (the keyup
//       is swallowed by the OS). COMPLETION ROUND FIX: the manager now clears
//       all key state on blur/visibilitychange — G1 asserts the cube STOPS.
//   W2  pointermove is NOT DOM-guarded (only click is): hovering over the
//       debug overlay panel still raycasts + sets lastHover underneath.
//       Known minor, asserted behaviorally when a solid tile projects under
//       the panel rect. (Deliberately NOT in the completion-round scope —
//       keyboard guards only.)
//
// FINAL-GATE FIXES (2026-08-08, qa-tester round): several probes were
// corrected after the first CI run exposed test-design flaws, not game bugs:
//   F1  B4b used window.__debug.resetFovOverride, which the harness does NOT
//       expose (harness gap — WorldManager.resetFovOverride exists, the api
//       literal omits it). Replaced with a fixture re-entry that restores the
//       natural tween; the gap is reported separately.
//   F2  B5/B6/B9/B10 asserted EXACT timeOfDay after the async settle — in
//       fast mode the natural clock drifts ~12.5 min/s, so exact reads can
//       never hold. Now read the live world handle synchronously right after
//       invoking the setter (exact), plus tolerance assertions after settle.
//   F3  D1/D2 compared loadedChunkCount (SOLID chunks) across different
//       seeds — solid count legitimately varies per seed (20/19/25/21/17 for
//       seeds 1337-1341). The leak invariant is the tracked-STUB count (25
//       for ring 2) and registry stability, now asserted instead.
//   F4  E4 searched tiles up to ±20, but ring 2 only loads tiles within
//       [-16, 23]: the first "under-panel" tile found was in an UNLOADED
//       chunk, so hover was correctly null. Now restricted to tracked chunks;
//       the minor still reproduces (hover fires through the panel).
//   F5  G1's 0.5-tile threshold can't hold under headless timer throttling
//       (hidden pages slow the fast loop); the gap is "ANY continued
//       movement across blur", asserted at > 0.01.
//   F6  H1/H2 clicked tile (9,1) blind — it is VOID for seed 1337, so the
//       second click legitimately set no target. The target is now picked
//       dynamically (first solid projected tile in a loaded chunk).
//
// CI-friendly: CHROME_PATH/BASE_URL from the GitHub Actions workflow
// (scripts/run-ci-puppeteer.sh --tests=...); local runs fall back to defaults.

const useBundled = process.env.PUPPETEER_BUNDLED === '1'
let puppeteer
if (useBundled) {
  try {
    puppeteer = (await import('puppeteer')).default
  } catch {
    throw new Error('PUPPETEER_BUNDLED=1 but the `puppeteer` package is not installed (npm i -D puppeteer)')
  }
} else {
  puppeteer = (await import('puppeteer-core')).default
}
const CHROME = useBundled ? undefined : (process.env.CHROME_PATH || '/usr/bin/google-chrome')
const BASE = process.env.BASE_URL || 'http://localhost:5173'
const URL_DEBUG = BASE + '/?debug=1&fast=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']
const VIEWPORT = { width: 960, height: 540 }

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: VIEWPORT })

async function newPage() {
  const page = await browser.newPage()
  page.__pageErrors = []
  page.__consoleErrors = []
  page.on('pageerror', e => { page.__pageErrors.push(String(e)) })
  page.on('console', m => { if (m.type() === 'error') page.__consoleErrors.push(m.text()) })
  return page
}
async function loadDebug(page) {
  await page.goto(URL_DEBUG, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })
}
async function evl(page, fn, ...args) {
  try { return { ok: true, value: await page.evaluate(fn, ...args) } }
  catch (e) { return { ok: false, error: String(e.message || e) } }
}
async function waitChunksDrained(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await evl(page, () => window.__debug.world.pendingChunkLoads())
    if (r.ok && r.value === 0) return true
    await new Promise(res => setTimeout(res, 100))
  }
  return false
}
async function waitFor(page, fn, timeoutMs, interval = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await evl(page, fn)
    if (r.ok && r.value) return r.value
    await new Promise(res => setTimeout(res, interval))
  }
  return null
}
/** Args-aware arrival poll (page.evaluate serializes extra args into the
 *  browser-side function — closures over node-side variables do NOT cross). */
async function waitForPlayerAt(page, x, y, timeoutMs, interval = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await evl(page, (tx, ty) => {
      const p = window.__debug.world.player
      return Math.abs(p.x - tx) < 0.3 && Math.abs(p.y - ty) < 0.3
    }, x, y)
    if (r.ok && r.value) return true
    await new Promise(res => setTimeout(res, interval))
  }
  return null
}

// ─────────────────────────────────────────────────────────────
section('A. Void walk + far teleports (falling off the world)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Find a void tile a short walk from spawn, then WALK onto it with real keys.
  const voidTile = await evl(page, () => {
    const w = window.__debug.world
    for (let dy = -16; dy <= 16; dy++) {
      for (let dx = -16; dx <= 16; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 4 && w.biomeAt(dx, dy) === 'void') return { x: dx, y: dy }
      }
    }
    return null
  })
  test('A1a found a void tile within 16 of spawn (walkable-void precondition)',
    voidTile.ok && voidTile.value !== null, voidTile.ok ? JSON.stringify(voidTile.value) : voidTile.error)

  if (voidTile.ok && voidTile.value) {
    const vt = voidTile.value
    // Walk onto it: hold W/D toward the void tile for a bit (fast mode ~12.5x).
    const from = await evl(page, () => window.__debug.world.player)
    await page.keyboard.down('KeyW')
    await page.keyboard.down('KeyD')
    await new Promise(res => setTimeout(res, 400))
    await page.keyboard.up('KeyW')
    await page.keyboard.up('KeyD')
    await new Promise(res => setTimeout(res, 150))
    const to = await evl(page, () => window.__debug.world.player)
    const moved = to.ok && from.ok && (Math.abs(to.value.x - from.value.x) > 1 || Math.abs(to.value.y - from.value.y) > 1)
    test('A1b WASD walk over void tiles keeps the player finite and moving (no crash/NaN)',
      moved && to.ok && to.value.x === to.value.x && to.value.y === to.value.y,
      `from=(${from.ok ? from.value.x.toFixed(2) + ',' + from.value.y.toFixed(2) : from.error}) to=(${to.ok ? to.value.x.toFixed(2) + ',' + to.value.y.toFixed(2) : to.error})`)
    test('A1c no page errors while walking through the void', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  }

  // Far-coord teleports (well beyond any loaded ring): (500,-300) and (-100,200).
  for (const [x, y] of [[500, -300], [-100, 200]]) {
    const t = await evl(page, (a, b) => window.__debug.teleport(a, b), x, y)
    const drained = await waitChunksDrained(page, 20000)
    const s = await evl(page, () => {
      const st = window.__debug.getState()
      return { p: st.player, fov: st.fovRadius, chunks: st.loadedChunkCount, biome: st.biomeAtPlayer, seed: st.seed }
    })
    const v = s.ok ? s.value : null
    test(`A2 teleport (${x}, ${y}): settles, finite coords, no exceptions`,
      t.ok && drained && v && v.p.x === x && v.p.y === y && Number.isFinite(v.fov) && v.chunks >= 0,
      s.ok ? `player=(${v.p.x},${v.p.y}) chunks=${v.chunks} biome=${v.biome} drained=${drained}` : s.error)
  }
  // Back to a real island afterwards (post-condition sanity).
  const back = await evl(page, () => window.__debug.teleport(0, 0))
  await waitChunksDrained(page)
  const p2 = await evl(page, () => window.__debug.world.player)
  test('A3 return to spawn after far teleports works', back.ok && p2.ok && p2.value.x === 0 && p2.value.y === 0, p2.ok ? JSON.stringify(p2.value) : p2.error)
  test('A4 no page errors across the whole void/far-travel section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('B. Extreme inputs: seeds, fov, clock boundaries')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Seeds: 0, 1, huge (2^31 — passes harness validation, wraps to int32 in setSeed).
  for (const seed of [0, 1, 2 ** 31, 2147483647]) {
    const r = await evl(page, s => window.__debug.regenerate(s), seed)
    const drained = await waitChunksDrained(page, 20000)
    const st = await evl(page, () => window.__debug.getState())
    const v = st.ok ? st.value : null
    const det = await evl(page, () => {
      const w = window.__debug.world
      const a = JSON.stringify(w.chunkData(2, 1))
      const b = JSON.stringify(w.chunkData(2, 1))
      return a === b
    })
    test(`B1 regenerate(${seed}): settles, world loads, deterministic after wrap`,
      r.ok && drained && v && v.loadedChunkCount >= 9 && det.ok && det.value === true,
      st.ok ? `seed=${v.seed} chunks=${v.loadedChunkCount} det=${det.ok ? det.value : det.error}` : st.error)
  }
  // Negative seed through the overlay path (regenerate) must be REJECTED by the harness.
  const neg = await evl(page, () => window.__debug.regenerate(-5))
  test('B2 regenerate(-5) is rejected by the harness (throws, no half-built world)',
    neg.ok === false && String(neg.error).includes('non-negative'), neg.ok ? 'no throw!' : neg.error)
  const stAfterNeg = await evl(page, () => window.__debug.getState())
  test('B2b world still healthy after the rejected negative seed',
    stAfterNeg.ok && stAfterNeg.value.seed >= 0, stAfterNeg.ok ? `seed=${stAfterNeg.value.seed}` : stAfterNeg.error)

  // FOV extremes: 1 (minimal) and 30 (large).
  const f1 = await evl(page, () => window.__debug.setFovRadius(1))
  const d1 = await waitChunksDrained(page, 20000)
  const s1 = await evl(page, () => ({ chunks: window.__debug.world.loadedChunkCount, fov: window.__debug.world.fovRadius }))
  test('B3 setFovRadius(1): settles with a minimal ring (9-chunk radius) and no errors',
    f1.ok && d1 && s1.ok && s1.value.chunks >= 1 && s1.value.chunks <= 25 && s1.value.fov === 1,
    s1.ok ? `chunks=${s1.value.chunks} fov=${s1.value.fov}` : s1.error)
  const f30 = await evl(page, () => window.__debug.setFovRadius(30))
  const d30 = await waitChunksDrained(page, 40000)
  const s30 = await evl(page, () => ({ chunks: window.__debug.world.loadedChunkCount, fov: window.__debug.world.fovRadius }))
  test('B4 setFovRadius(30): settles with the wider ring, dims apply, no errors',
    f30.ok && d30 && s30.ok && s30.value.fov === 30 && s30.value.chunks > 9,
    s30.ok ? `chunks=${s30.value.chunks} fov=${s30.value.fov}` : s30.error)
  // Harness gap: window.__debug does NOT expose resetFovOverride (only
  // WorldManager does) — the fixture re-entry restores the natural tween.
  const fback = await evl(page, async () => { await window.__debug.gotoFixture('slice-c-demo'); return true })
  await waitChunksDrained(page, 20000)
  const sBack = await evl(page, () => ({ fov: window.__debug.world.fovRadius, phase: window.__debug.getState().dayNightPhase }))
  test('B4b FOV override cleared via fixture re-entry: natural tween back at day (fov 9)',
    fback.ok && sBack.ok && Math.abs(sBack.value.fov - 9) < 0.001 && sBack.value.phase === 'day',
    sBack.ok ? `fov=${sBack.value.fov} phase=${sBack.value.phase}` : sBack.error)

  // Clock boundaries + midnight wrap.
  // NOTE (F2): setState resolves after a 600ms settle during which the fast
  // clock drifts ~12.5 min/s — exact reads must happen SYNCHRONOUSLY with the
  // setter call; post-settle reads use tolerances.
  const b0 = await evl(page, async () => {
    const p = window.__debug.setState({ timeOfDay: 0 })
    const exact = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    await p // settle: clock drifts ~7 min in fast mode
    const settled = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    return { exact, settled }
  })
  test('B5 timeOfDay 0 (midnight boundary): live read exact 0, phase night, fov 5',
    b0.ok && b0.value.exact.tod === 0 && b0.value.exact.phase === 'night' && Math.abs(b0.value.exact.fov - 5) < 0.001,
    b0.ok ? `tod=${b0.value.exact.tod} fov=${b0.value.exact.fov} phase=${b0.value.exact.phase}` : b0.error)
  test('B5b after settle the clock only drifted a little (still night, fov still ~5)',
    b0.ok && b0.value.settled.tod >= 0 && b0.value.settled.tod < 60 && Math.abs(b0.value.settled.fov - 5) < 0.001,
    b0.ok ? `tod=${b0.value.settled.tod} fov=${b0.value.settled.fov} phase=${b0.value.settled.phase}` : b0.error)
  const b1439 = await evl(page, async () => {
    const p = window.__debug.setState({ timeOfDay: 1439 })
    const exact = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    await p
    const settled = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    return { exact, settled }
  })
  test('B6 timeOfDay 1439 (end-of-day boundary): live read exact 1439, phase night, fov 5',
    b1439.ok && b1439.value.exact.tod === 1439 && b1439.value.exact.phase === 'night' && Math.abs(b1439.value.exact.fov - 5) < 0.001,
    b1439.ok ? `tod=${b1439.value.exact.tod} fov=${b1439.value.exact.fov}` : b1439.error)
  test('B6b after settle the wrap landed back near 0 (1439 + drift wrapped, still night)',
    b1439.ok && b1439.value.settled.tod >= 0 && b1439.value.settled.tod < 60 && b1439.value.settled.phase === 'night',
    b1439.ok ? `tod=${b1439.value.settled.tod} fov=${b1439.value.settled.fov}` : b1439.error)
  const ff = await evl(page, () => window.__debug.fastForward(100000))
  const sf = await evl(page, () => window.__debug.getState())
  test('B7 fastForward(100000) across many midnights wraps into 0..1439, no NaN',
    ff.ok && sf.ok && sf.value.timeOfDay >= 0 && sf.value.timeOfDay < 1440 && sf.value.timeOfDay === sf.value.timeOfDay,
    sf.ok ? `tod=${sf.value.timeOfDay}` : sf.error)
  const ffn = await evl(page, () => window.__debug.fastForward(-5000))
  const sfn = await evl(page, () => window.__debug.getState())
  test('B8 fastForward(-5000) negative wrap stays in range (no modulo sign bug)',
    ffn.ok && sfn.ok && sfn.value.timeOfDay >= 0 && sfn.value.timeOfDay < 1440,
    sfn.ok ? `tod=${sfn.value.timeOfDay}` : sfn.error)
  // Dawn/dusk edge: 359 (last dawn minute) and 1199 (last dusk minute).
  const e359 = await evl(page, async () => {
    const p = window.__debug.setState({ timeOfDay: 359 })
    const exact = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    await p
    const settled = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    return { exact, settled }
  })
  test('B9 timeOfDay 359 (last dawn minute): live read exact, phase dawn, fov in the dawn band',
    e359.ok && e359.value.exact.tod === 359 && e359.value.exact.phase === 'dawn' && e359.value.exact.fov > 8.5 && e359.value.exact.fov < 9,
    e359.ok ? `fov=${e359.value.exact.fov.toFixed(3)} phase=${e359.value.exact.phase}` : e359.error)
  // Drift-agnostic: the settle drift varies with machine speed (fast loop
  // slows under software-render stalls), so the settled state may be either
  // the last dawn minute (fov ~8.93) or full day (fov 9) — never mid-band.
  test('B9b after settle the dawn band resolved to the day terminal (fov ~8.93..9, phase dawn|day)',
    e359.ok && ((e359.value.settled.phase === 'dawn' && e359.value.settled.fov >= 8.8 && e359.value.settled.fov < 9)
      || (e359.value.settled.phase === 'day' && Math.abs(e359.value.settled.fov - 9) < 0.001)),
    e359.ok ? `fov=${e359.value.settled.fov.toFixed(3)} phase=${e359.value.settled.phase}` : e359.error)
  const e1199 = await evl(page, async () => {
    const p = window.__debug.setState({ timeOfDay: 1199 })
    const exact = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    await p
    const settled = { tod: window.__debug.world.timeOfDay, phase: window.__debug.getState().dayNightPhase, fov: window.__debug.world.fovRadius }
    return { exact, settled }
  })
  test('B10 timeOfDay 1199 (last dusk minute): live read exact, phase dusk, fov > 5 (not yet night)',
    e1199.ok && e1199.value.exact.tod === 1199 && e1199.value.exact.phase === 'dusk' && e1199.value.exact.fov > 5,
    e1199.ok ? `fov=${e1199.value.exact.fov.toFixed(3)} phase=${e1199.value.exact.phase}` : e1199.error)
  // Drift-agnostic: settled may be the last dusk minute (fov ~5.03) or night
  // (fov 5) — never mid-band.
  test('B10b after settle the dusk resolved to the night terminal (fov 5..5.05, phase dusk|night)',
    e1199.ok && ((e1199.value.settled.phase === 'dusk' && e1199.value.settled.fov > 5 && e1199.value.settled.fov <= 5.05)
      || (e1199.value.settled.phase === 'night' && Math.abs(e1199.value.settled.fov - 5) < 0.001)),
    e1199.ok ? `fov=${e1199.value.settled.fov.toFixed(3)} phase=${e1199.value.settled.phase}` : e1199.error)

  // Restore noon + day fov for the next sections.
  await evl(page, () => window.__debug.setState({ timeOfDay: 720 }))
  await evl(page, () => window.__debug.resetFovOverride())
  await waitChunksDrained(page)
  test('B11 no page errors across the extreme-inputs section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C. Rapid WASD ↔ click-to-move interleaving')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  const project = await evl(page, () => window.__debug.world.projectTile(3, 3))
  test('C0a tile (3,3) projects on-screen', project.ok && project.value !== null, project.ok ? JSON.stringify(project.value) : project.error)

  // Click to (3,3), then interrupt with WASD: the click target must be CANCELLED
  // (WASD wins) — player ends near the WASD direction, NOT at (3,3).
  if (project.ok && project.value) {
    const p = project.value
    await evl(page, (cx, cy) => document.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true })), p.x, p.y)
    await new Promise(res => setTimeout(res, 120)) // a few ticks toward (3,3)
    await page.keyboard.down('KeyA')
    await page.keyboard.down('KeyS')
    await new Promise(res => setTimeout(res, 200))
    await page.keyboard.up('KeyA')
    await page.keyboard.up('KeyS')
    await new Promise(res => setTimeout(res, 200))
    const pos = await evl(page, () => window.__debug.world.player)
    const v = pos.ok ? pos.value : null
    // WASD (A+S = -x,-y) should have dragged the player away from (3,3):
    // either coordinate below the click target after the interrupt.
    test('C1 WASD interrupts click-to-move: player NOT at the clicked tile center (target cancelled)',
      pos.ok && v && !(v.x >= 3.2 && v.y >= 3.2),
      pos.ok ? `player=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}) clickTarget=(3,3)` : pos.error)
    test('C1b player kept moving in the WASD direction after the click was cancelled',
      pos.ok && v && (v.x < 3 || v.y < 3), pos.ok ? `player=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})` : pos.error)
  }

  // Spam: 15 rapid clicks on alternating tiles while tapping W/S — no crash,
  // final moveTarget is the LAST click (or cancelled by the last key).
  const spam = await evl(page, async () => {
    const w = window.__debug.world
    const fire = (x, y) => document.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
    const tiles = []
    for (let i = 0; i < 15; i++) {
      const t = { x: 3 + (i % 4), y: 3 + ((i * 2) % 4) }
      const pr = w.projectTile(t.x, t.y)
      if (pr) { tiles.push(t); fire(pr.x, pr.y) }
    }
    return tiles.length
  })
  await new Promise(res => setTimeout(res, 150))
  await page.keyboard.down('KeyW')
  await new Promise(res => setTimeout(res, 100))
  await page.keyboard.up('KeyW')
  await new Promise(res => setTimeout(res, 300))
  test('C2 15 rapid clicks + key taps: no exception, player finite',
    spam.ok && spam.value >= 10, spam.ok ? `clicksFired=${spam.value}` : spam.error)
  const c2s = await evl(page, () => window.__debug.world.player)
  test('C2b player finite after click spam', c2s.ok && c2s.value.x === c2s.value.x && c2s.value.y === c2s.value.y,
    c2s.ok ? JSON.stringify(c2s.value) : c2s.error)

  // Teleport must cancel an in-flight click target.
  await evl(page, () => window.__debug.teleport(0, 0))
  await waitChunksDrained(page)
  const p2 = await evl(page, () => window.__debug.world.projectTile(6, 6))
  if (p2.ok && p2.value) {
    await evl(page, (cx, cy) => document.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true })), p2.value.x, p2.value.y)
    await new Promise(res => setTimeout(res, 100))
    const t = await evl(page, () => window.__debug.teleport(3, -2))
    await new Promise(res => setTimeout(res, 500))
    const pos = await evl(page, () => window.__debug.world.player)
    const v = pos.ok ? pos.value : null
    test('C3 teleport cancels the click target (player stays at the teleport point)',
      t.ok && pos.ok && v && Math.abs(v.x - 3) < 0.01 && Math.abs(v.y + 2) < 0.01,
      pos.ok ? `player=(${v.x}, ${v.y})` : pos.error)
  } else {
    test('C3 teleport cancels the click target — SKIPPED (tile not projectable)', false, 'precondition failed')
  }
  test('C4 no page errors across the WASD/click section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('D. Dispose/re-init cycles (setSeed loop) — leak/orphan check')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Leak invariant (F3): loadedChunkCount is the SOLID count and legitimately
  // varies per seed — the invariant is the TRACKED-STUB count (25 = full ring
  // 2) and registry stability across regenerates.
  const registryStats = () => evl(page, () => {
    const wm = window.__debug.world
    let stubs = 0
    let solid = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const c = wm.chunkInfo(dx, dy)
      if (c.tracked) stubs++
      if (c.tracked && c.tileCount > 0) solid++
    }
    return { stubs, solid, loaded: wm.loadedChunkCount }
  })

  const before = await registryStats()
  const errorsBefore = page.__pageErrors.length

  // 10 full regenerate cycles, drained each time (steady state).
  for (let i = 0; i < 10; i++) {
    const r = await evl(page, () => window.__debug.regenerate())
    await waitChunksDrained(page, 20000)
    if (!r.ok) break
  }
  const after = await registryStats()
  test('D1 10 regenerate cycles: registry stays at the full 25-stub ring (no orphaned/leaked chunk stubs)',
    before.ok && after.ok && before.value.stubs === 25 && after.value.stubs === 25,
    before.ok && after.ok ? `stubs ${before.value.stubs} → ${after.value.stubs} (loaded ${before.value.loaded} → ${after.value.loaded})` : (before.error || after.error))
  test('D1b loadedChunkCount always equals the solid chunk count (stub bookkeeping consistent)',
    before.ok && after.ok && before.value.loaded === before.value.solid && after.value.loaded === after.value.solid,
    before.ok && after.ok ? `before ${before.value.loaded}/${before.value.solid} after ${after.value.loaded}/${after.value.solid}` : (before.error || after.error))

  // Rapid regenerate WITHOUT waiting for drain (spam 12 in a row) — queue
  // rebuilds must not double-build or leak.
  const spam = await evl(page, async () => {
    for (let i = 0; i < 12; i++) await window.__debug.regenerate(i + 200)
    return true
  })
  await waitChunksDrained(page, 20000)
  const afterSpam = await registryStats()
  const st = await evl(page, () => window.__debug.getState())
  test('D2 12 rapid regenerates (no drain between): settles, registry stable at 25 stubs, no exception',
    spam.ok && afterSpam.ok && st.ok && afterSpam.value.stubs === 25 && st.value.loadedChunkCount === afterSpam.value.loaded,
    afterSpam.ok && st.ok ? `stubs=${afterSpam.value.stubs} solid=${afterSpam.value.solid} state=${st.value.loadedChunkCount}` : (afterSpam.error || st.error))
  test('D3 no page errors across the dispose/re-init cycles',
    page.__pageErrors.length === errorsBefore, JSON.stringify(page.__pageErrors.slice(errorsBefore)))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('E. Hover across chunk borders + debug overlay interaction')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Hover tiles in FOUR different chunks, incl. the negative ones:
  // (7,7) chunk(0,0), (8,0) chunk(1,0), (0,8) chunk(0,1), (-1,-1) chunk(-1,-1).
  const probes = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const out = []
    for (const [tx, ty] of [[7, 7], [8, 0], [0, 8], [-1, -1]]) {
      const p = w.projectTile(tx, ty)
      if (!p) { out.push({ tx, ty, projected: false }); continue }
      fire('pointermove', p.x, p.y)
      const h = w.lastHover
      out.push({ tx, ty, projected: true, hover: h ? { x: h.x, y: h.y } : null, biome: w.biomeAt(tx, ty) })
    }
    fire('pointermove', 5, 5)
    return out
  })
  const v = probes.ok ? probes.value : []
  const solid = v.filter(r => r.projected && r.biome !== 'void')
  test('E1 at least 2 of the 4 border tiles are solid (precondition for E2)',
    probes.ok && solid.length >= 2, probes.ok ? JSON.stringify(v.map(r => [r.tx, r.ty, r.biome])) : probes.error)
  test('E2 hovering across chunk borders sets lastHover on every SOLID probe tile',
    probes.ok && solid.every(r => r.hover && r.hover.x === r.tx && r.hover.y === r.ty),
    probes.ok ? JSON.stringify(v.map(r => ({ t: [r.tx, r.ty], h: r.hover }))) : probes.error)

  // Debug overlay: clicks inside the panel must NOT move the player.
  const guard = await evl(page, () => {
    const w = window.__debug.world
    const input = document.getElementById('debug-overlay-input')
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const p = w.projectTile(2, 2)
    if (!p || !input) return { projected: false, hasInput: !!input }
    fire('pointermove', p.x, p.y) // hover a tile so lastHover is set
    const hoverBefore = w.lastHover ? { x: w.lastHover.x, y: w.lastHover.y } : null
    // Click ON the overlay input element (the click must be swallowed).
    const rect = input.getBoundingClientRect()
    input.dispatchEvent(new MouseEvent('click', { clientX: rect.x + 5, clientY: rect.y + 5, bubbles: true, cancelable: true }))
    // Click through document on the same tile — but the tile is (2,2); a real
    // click would target whatever DOM element is at that point (the canvas).
    // Assert: clicking the overlay did not set a move target by checking the
    // player does NOT drift toward (2,2) over the next 400ms.
    return { projected: true, hasInput: true, hoverBefore }
  })
  const drift = await evl(page, () => window.__debug.world.player)
  await new Promise(res => setTimeout(res, 400))
  const drift2 = await evl(page, () => window.__debug.world.player)
  test('E3 click on the debug overlay does not start click-to-move (player static)',
    guard.ok && guard.value?.projected === true && drift.ok && drift2.ok &&
    Math.abs(drift2.value.x - drift.value.x) < 0.01 && Math.abs(drift2.value.y - drift.value.y) < 0.01,
    guard.ok ? `dX=${(drift2.ok && drift.ok) ? (drift2.value.x - drift.value.x).toFixed(3) : '?'}` : guard.error)

  // The KNOWN MINOR: pointermove is NOT overlay-guarded. Probe behaviorally:
  // find a solid tile that projects inside the panel rect (8,8)-(280,140) and
  // verify hover fires through the panel.
  const overlayHover = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const panel = document.getElementById('debug-overlay')
    const rect = panel ? panel.getBoundingClientRect() : null
    if (!rect) return { shown: false }
    // F4: only TRACKED (loaded) chunks can be hit — ring 2 covers tiles in
    // [-16, 23]; the old ±20 scan hit unloaded chunk (-3,0) first.
    for (let tx = -16; tx <= 23; tx++) {
      for (let ty = -16; ty <= 23; ty++) {
        const cx = Math.floor(tx / 8)
        const cy = Math.floor(ty / 8)
        if (!w.chunkInfo(cx, cy).tracked) continue
        if (w.biomeAt(tx, ty) === 'void') continue
        const p = w.projectTile(tx, ty)
        if (p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
          fire('pointermove', p.x, p.y)
          const h = w.lastHover
          return { shown: true, tile: [tx, ty], hover: h ? { x: h.x, y: h.y } : null, at: [Math.round(p.x), Math.round(p.y)] }
        }
      }
    }
    return { shown: true, found: false }
  })
  test('E4 KNOWN MINOR: pointermove through the debug overlay still raycasts + sets hover (no DOM guard)',
    overlayHover.ok && overlayHover.value?.shown === true && overlayHover.value?.hover !== null,
    overlayHover.ok ? JSON.stringify(overlayHover.value) : overlayHover.error)
  test('E5 no page errors across the hover/overlay section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('F. Night→dawn tween while MOVING (R5 at speed)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Park the clock deep in dusk (the FOV 2→1 chunk-radius crossing is 50
  // in-game minutes away — ~8-16s real depending on the runner's software-
  // render speed), then hold W THROUGH the natural boundary crossing (fov 5,
  // chunk radius 2→1) — chunk churn + dims refresh while the player streams
  // through new chunks.
  await evl(page, () => window.__debug.setState({ timeOfDay: 1150 }))
  await waitChunksDrained(page)
  await page.keyboard.down('KeyW')
  const crossed = await waitFor(page, () => window.__debug.world.fovRadius <= 5.0, 45000)
  await page.keyboard.up('KeyW')
  await waitChunksDrained(page, 20000)
  const r = await evl(page, () => {
    const w = window.__debug.world
    const p = w.player
    // Find a solid, loaded tile near the player and compare its live dim to
    // the fog factor (the _updateRadii refresh must hold while moving too).
    let probe = null
    for (let dy = -2; dy <= 2 && !probe; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = Math.floor(p.x) + dx
        const ty = Math.floor(p.y) + dy
        if (w.biomeAt(tx, ty) === 'void') continue
        const dim = w.tileDimAt(tx, ty)
        if (dim) { probe = { tx, ty, dim: dim.dim, fog: w.fogFactorAt(tx, ty) }; break }
      }
    }
    return { player: { ...p }, fov: w.fovRadius, tod: w.timeOfDay, probe }
  })
  const v = r.ok ? r.value : null
  test('F1 the natural clock crossed into night WHILE the player was moving',
    crossed !== null && r.ok && v.fov <= 5.0 && v.tod >= 1200,
    r.ok ? `fov=${v.fov.toFixed(3)} tod=${v.tod} moved=${v.player.y.toFixed(1)}` : r.error)
  test('F2 moving player stayed finite + moved during the crossing (streaming + tween coexist)',
    r.ok && v.player.y > 3 && v.player.x === v.player.x,
    r.ok ? `player=(${v.player.x.toFixed(1)}, ${v.player.y.toFixed(1)})` : r.error)
  test('F3 retained tile dims still match fogFactorAt after the moving crossing',
    r.ok && v.probe && Math.abs(v.probe.dim - v.probe.fog) < 0.06,
    r.ok && v.probe ? `tile(${v.probe.tx},${v.probe.ty}) dim=${v.probe.dim.toFixed(3)} fog=${v.probe.fog.toFixed(3)}` : (r.ok ? 'no solid probe tile' : r.error))

  // Dawn while stationary: the world must grow back (fov > 5) with no errors.
  await evl(page, () => window.__debug.setState({ timeOfDay: 330 }))
  await waitChunksDrained(page, 20000)
  const dawn = await evl(page, () => ({ fov: window.__debug.world.fovRadius, chunks: window.__debug.world.loadedChunkCount }))
  test('F4 dawn after the night crossing regrows the world (fov ~7, more chunks)',
    dawn.ok && dawn.value.fov >= 6.5 && dawn.value.chunks > 9,
    dawn.ok ? `fov=${dawn.value.fov.toFixed(2)} chunks=${dawn.value.chunks}` : dawn.error)
  test('F5 no page errors across the moving day/night tween',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('G. Window blur / visibilitychange: keys must reset (completion round)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  // Completion round: previously a held key survived blur — the OS swallows
  // the keyup when you tab out, so the cube kept walking when focus
  // returned (known gap). InputManager now clears ALL key state on window
  // blur and document visibilitychange, so a held key can never outlive
  // the tab.
  await page.keyboard.down('KeyW')
  await new Promise(res => setTimeout(res, 150))
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await new Promise(res => setTimeout(res, 300))
  const during = await evl(page, () => window.__debug.world.player)
  await page.keyboard.up('KeyW')
  await new Promise(res => setTimeout(res, 150))
  const after = await evl(page, () => window.__debug.world.player)
  // F5: hidden pages throttle the fast loop (4ms timer → ~1/s), so the walk
  // across the blur window is slow — ANY continued movement is the bug.
  const movedDuring = during.ok && after.ok && after.value.y > during.value.y + 0.01
  test('G1 held key is cleared by blur+visibilitychange — the cube does NOT keep walking',
    movedDuring === false,
    during.ok && after.ok ? `y ${during.value.y.toFixed(2)} → ${after.value.y.toFixed(2)} (no movement across blur)` : (during.error || after.error))
  // And the healthy path: a NORMAL keyup stops the cube.
  const y1 = after.ok ? after.value.y : NaN
  await new Promise(res => setTimeout(res, 200))
  const y2 = await evl(page, () => window.__debug.world.player)
  test('G2 after the keyup the cube stops (normal path unaffected)',
    y2.ok && Math.abs(y2.value.y - y1) < 0.05, y2.ok ? `y ${y1.toFixed(2)} → ${y2.value.y.toFixed(2)}` : y2.error)
  test('G3 no page errors across the blur section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('H. Click-to-move arrival + target switch mid-move')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  await evl(page, () => window.__debug.teleport(0, 0))
  await waitChunksDrained(page)

  // Click (4,4), then mid-flight click a SOLID far tile (F6: (9,1) is VOID
  // for seed 1337, so a blind click there correctly set no target — the
  // target is picked dynamically): the player must arrive at the SECOND
  // target (last click wins), and must STOP there.
  const p1 = await evl(page, () => window.__debug.world.projectTile(4, 4))
  const t2 = await evl(page, () => {
    const w = window.__debug.world
    for (let tx = -16; tx <= 23; tx++) {
      for (let ty = -16; ty <= 23; ty++) {
        const d = Math.hypot(tx - 4, ty - 4)
        if (d < 5 || d > 12) continue // mid-range from the first target
        const cx = Math.floor(tx / 8)
        const cy = Math.floor(ty / 8)
        if (!w.chunkInfo(cx, cy).tracked || w.biomeAt(tx, ty) === 'void') continue
        const pr = w.projectTile(tx, ty)
        if (pr) return { tx, ty }
      }
    }
    return null
  })
  if (p1.ok && p1.value && t2.ok && t2.value) {
    const c2 = t2.value
    await evl(page, (cx, cy) => document.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true })), p1.value.x, p1.value.y)
    await new Promise(res => setTimeout(res, 50)) // still in flight to (4,4)
    // Project at CLICK time (same tick — the camera lerps between the scan
    // and the click, so a stale projection would miss a mid-range tile).
    const clicked = await evl(page, (tx, ty) => {
      const pr = window.__debug.world.projectTile(tx, ty)
      if (!pr) return false
      document.dispatchEvent(new MouseEvent('click', { clientX: pr.x, clientY: pr.y, bubbles: true }))
      return true
    }, c2.tx, c2.ty)
    const arrived = clicked.ok && clicked.value
      ? await waitForPlayerAt(page, c2.tx + 0.5, c2.ty + 0.5, 8000, 100)
      : null
    await new Promise(res => setTimeout(res, 300)) // ensure it stops
    const pos = await evl(page, () => window.__debug.world.player)
    const v = pos.ok ? pos.value : null
    test(`H1 mid-flight click switches target: player arrives at the SECOND tile center (${c2.tx},${c2.ty})`,
      arrived !== null && pos.ok && v && Math.abs(v.x - (c2.tx + 0.5)) < 0.2 && Math.abs(v.y - (c2.ty + 0.5)) < 0.2,
      pos.ok ? `player=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}) target=(${c2.tx + 0.5},${c2.ty + 0.5})` : pos.error)
    test('H2 player STOPS at the arrival point (moveTarget cleared, no overshoot drift)',
      pos.ok && v && (Math.abs(v.x - (c2.tx + 0.5)) < 0.2 && Math.abs(v.y - (c2.ty + 0.5)) < 0.2),
      pos.ok ? `player=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})` : pos.error)
  } else {
    test('H1 mid-flight click switch — SKIPPED (no projectable solid pair)', false, p1.error || t2.error || '')
  }
  test('H3 no page errors across the arrival section',
    page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
let failed = 0
for (const s of results) for (const t of s.tests) if (!t.pass) failed++
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILURES'} — adversarial battery done`)
console.log(JSON.stringify(results, null, 1))
process.exit(failed === 0 ? 0 : 1)
