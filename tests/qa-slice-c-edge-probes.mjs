// QA — Slice C FINAL GATE edge probes (beyond the fix/round2/adversarial
// batteries). Each section targets a gap those batteries do NOT cover:
//
//   P1  Exact midnight wrap 1439→0 via fastForward(1) (the batteries only
//       cross midnight via fastForward(100000)); fractional advance; 0→1.
//   P2  Harness rejection of out-of-range setState (-1 / 1440 / 1e9) leaves
//       the world healthy; fastForward(NaN) rejected.
//   P3  Fixture cycling world→showcase→night→qa-scene + CONCURRENT
//       gotoFixture spam (races the settle mechanism) — no page errors,
//       world re-enters functional.
//   P4  FOV extremes beyond the batteries: 100 (729 chunks) settles and
//       shrinks back to day; fov 1 + click-to-move through the dim band.
//   P5  Teleport extremes (1e9, 0), (-1e9, -1e9), non-integer coords —
//       finite, no exceptions, return-to-spawn.
//   P6  Void click (no moveTarget) + hover-void→null / solid→set round trip.
//   P7  Window resize mid-game (960x540 → 640x480 → 1280x800) — renderer/
//       camera survive, projection sane after.
//   P8  Debug overlay command path via REAL keyboard input (tp/time/fov/
//       regen/help/invalid) — the batteries never drive the overlay input.
//   P9  KNOWN-REGRESSION PROBE: mid-tween (between chunk-radius crossings)
//       FOV dims are stale — the natural dusk/dawn tween does not reapply
//       dims while fovRadius moves inside the band (only at the 5.0/9.0
//       crossings). Confirms the observed delta so a fix is detectable.
//
// CI-friendly: CHROME_PATH/BASE_URL from the GitHub Actions workflow; local
// runs fall back to defaults.

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

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540 } })

async function newPage() {
  const page = await browser.newPage()
  page.__pageErrors = []
  page.on('pageerror', e => { page.__pageErrors.push(String(e)) })
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

// ─────────────────────────────────────────────────────────────
section('P1. Exact midnight wrap (1439 → 0) + fractional advance')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  await evl(page, () => window.__debug.setState({ timeOfDay: 1439 }))
  const w1 = await evl(page, () => window.__debug.fastForward(1))
  const s1 = await evl(page, () => window.__debug.getState())
  test('P1a fastForward(1) from 1439 wraps to exactly 0 (not 1440/NaN)',
    w1.ok && s1.ok && s1.value.timeOfDay === 0,
    s1.ok ? `tod=${s1.value.timeOfDay}` : s1.error)
  test('P1b after the wrap the world is still at night fov 5 (no fov glitch)',
    s1.ok && Math.abs(s1.value.fovRadius - 5) < 0.001 && s1.value.dayNightPhase === 'night',
    s1.ok ? `fov=${s1.value.fovRadius} phase=${s1.value.dayNightPhase}` : s1.error)
  const w2 = await evl(page, () => window.__debug.fastForward(1))
  const s2 = await evl(page, () => window.__debug.getState())
  test('P1c fastForward(1) from 0 → 1 (the day after midnight is healthy)',
    w2.ok && s2.ok && s2.value.timeOfDay === 1 && s2.value.dayNightPhase === 'night',
    s2.ok ? `tod=${s2.value.timeOfDay}` : s2.error)
  const w3 = await evl(page, () => window.__debug.fastForward(0.5))
  const s3 = await evl(page, () => window.__debug.getState())
  test('P1d fractional fastForward(0.5) rounds cleanly and stays in range',
    w3.ok && s3.ok && s3.value.timeOfDay >= 1 && s3.value.timeOfDay <= 2 && s3.value.timeOfDay === Math.round(s3.value.timeOfDay),
    s3.ok ? `tod=${s3.value.timeOfDay}` : s3.error)
  test('P1e no page errors across the wrap section', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P2. Out-of-range harness inputs are rejected without corruption')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const before = await evl(page, () => window.__debug.getState())
  const rNeg = await evl(page, () => window.__debug.setState({ timeOfDay: -1 }))
  const rOver = await evl(page, () => window.__debug.setState({ timeOfDay: 1440 }))
  const rHuge = await evl(page, () => window.__debug.setState({ timeOfDay: 1e9 }))
  const rNaN = await evl(page, () => window.__debug.fastForward(NaN))
  const rBadKey = await evl(page, () => window.__debug.setState({ fov: 5 }))
  const after = await evl(page, () => window.__debug.getState())
  test('P2a setState(-1 / 1440 / 1e9) all throw (rejected by the harness)',
    !rNeg.ok && !rOver.ok && !rHuge.ok, `-1:${rNeg.ok}, 1440:${rOver.ok}, 1e9:${rHuge.ok}`)
  test('P2b fastForward(NaN) throws', !rNaN.ok, rNaN.ok ? 'no throw' : '')
  test('P2c setState with an unknown key throws', !rBadKey.ok, rBadKey.ok ? 'no throw' : '')
  test('P2d world state is untouched by the rejected calls (seed + clock + player intact)',
    before.ok && after.ok && after.value.timeOfDay === before.value.timeOfDay &&
    after.value.seed === before.value.seed && after.value.player.x === before.value.player.x,
    before.ok && after.ok ? `tod=${after.value.timeOfDay} seed=${after.value.seed}` : (before.error || after.error))
  test('P2e no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P3. Fixture cycling + concurrent gotoFixture (settle race)')
{
  const page = await newPage()
  await loadDebug(page)
  const seq = await evl(page, async () => {
    await window.__debug.gotoFixture('slice-c-demo')
    await window.__debug.gotoFixture('slice-c-demo-night')
    await window.__debug.gotoFixture('tile-showcase')
    await window.__debug.gotoFixture('qa-spawn-island-scene')
    return window.__debug.getState()
  })
  test('P3a sequential cycle demo→night→showcase→qa-scene completes',
    seq.ok && seq.value?.started === true && seq.value?.seed === 11 && seq.value?.timeOfDay === 720,
    seq.ok ? `seed=${seq.value.seed} tod=${seq.value.timeOfDay} ready=${seq.value.ready}` : seq.error)
  // Back into the world and confirm it still plays (chunks reloaded).
  const back = await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const p = await evl(page, () => window.__debug.world.player)
  test('P3b world re-entered after showcase: player at spawn, chunks streaming again',
    back.ok && p.ok && p.value.x === 0 && p.value.y === 0, p.ok ? JSON.stringify(p.value) : p.error)
  // Concurrent gotoFixture spam — 6 parallel calls race the settle mechanism.
  const spam = await evl(page, async () => {
    const names = ['slice-c-demo', 'slice-c-demo-night', 'slice-c-demo', 'slice-c-demo-night', 'slice-c-demo', 'qa-spawn-island-scene']
    await Promise.all(names.map(n => window.__debug.gotoFixture(n)))
    return true
  })
  await waitChunksDrained(page, 30000)
  const st = await evl(page, () => window.__debug.getState())
  test('P3c 6 concurrent gotoFixture calls settle without exception (last writer wins, no double-teardown)',
    spam.ok && st.ok && st.value.loadedChunkCount > 0 && st.value.player.x === 0 && st.value.player.y === 0,
    st.ok ? `chunks=${st.value.loadedChunkCount} seed=${st.value.seed}` : (spam.error || st.error))
  test('P3d no page errors across fixture cycling', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P4. FOV extremes: 100 (729-chunk ring) and 1 (click through the band)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)

  const f100 = await evl(page, () => window.__debug.setFovRadius(100))
  const d100 = await waitChunksDrained(page, 60000)
  const s100 = await evl(page, () => ({
    fov: window.__debug.world.fovRadius,
    chunks: window.__debug.world.loadedChunkCount,
  }))
  test('P4a setFovRadius(100) drains (729-chunk ring builds, no hang)',
    f100.ok && d100 && s100.ok && s100.value.chunks > 100,
    s100.ok ? `fov=${s100.value.fov} chunks=${s100.value.chunks} drained=${d100}` : s100.error)
  await evl(page, () => window.__debug.resetFovOverride())
  await waitChunksDrained(page, 30000)
  const sBack = await evl(page, () => ({ fov: window.__debug.world.fovRadius, chunks: window.__debug.world.loadedChunkCount }))
  test('P4b FOV 100 shrinks back to the day radius (chunks disposed, no leak)',
    sBack.ok && Math.abs(sBack.value.fov - 9) < 0.001 && sBack.value.chunks === 20,
    sBack.ok ? `fov=${sBack.value.fov} chunks=${sBack.value.chunks}` : sBack.error)

  // fov 1 + click-to-move to a tile in the heavily dimmed band.
  await evl(page, () => window.__debug.setFovRadius(1))
  await waitChunksDrained(page, 30000)
  const proj = await evl(page, () => {
    const w = window.__debug.world
    // Find a solid tile ~3 tiles out (dim band at fov 1: band 1-4).
    for (let i = 0; i < 64; i++) {
      const tx = 3 + (i % 8), ty = (i % 4)
      if (w.biomeAt(tx, ty) === 'void') continue
      const pr = w.projectTile(tx, ty)
      if (pr) return { tx, ty, pr }
    }
    return null
  })
  test('P4c fov 1: found a projected solid tile in the dim band', proj.ok && proj.value !== null, proj.ok ? JSON.stringify(proj.value) : proj.error)
  if (proj.ok && proj.value) {
    const { tx, ty, pr } = proj.value
    await evl(page, (cx, cy) => document.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true })), pr.x, pr.y)
    const arrived = await waitFor(page, () => {
      const p = window.__debug.world.player
      return Math.abs(p.x - (tx + 0.5)) < 0.3 && Math.abs(p.y - (ty + 0.5)) < 0.3
    }, 8000, 100)
    const pos = await evl(page, () => window.__debug.world.player)
    test('P4d click-to-move still works at fov 1 through the dim band (player arrives)',
      arrived !== null && pos.ok && pos.value.x === pos.value.x,
      pos.ok ? `player=(${pos.value.x.toFixed(2)}, ${pos.value.y.toFixed(2)}) target=(${tx + 0.5},${ty + 0.5})` : pos.error)
  }
  test('P4e no page errors across the FOV extremes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P5. Teleport extremes: ±1e9 and non-integer coords')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  for (const [x, y] of [[1e9, 0], [-1e9, -1e9], [3.5, -2.25]]) {
    const t = await evl(page, (a, b) => window.__debug.teleport(a, b), x, y)
    const drained = await waitChunksDrained(page, 30000)
    const st = await evl(page, () => {
      const s = window.__debug.getState()
      return { p: s.player, chunks: s.loadedChunkCount }
    })
    const okPos = st.ok && st.value.p.x === x && st.value.p.y === y
    const finite = st.ok && Number.isFinite(st.value.p.x) && Number.isFinite(st.value.p.y)
    test(`P5a teleport(${x}, ${y}): settles, exact finite coords, no exception`,
      t.ok && drained && okPos && finite,
      st.ok ? `player=(${st.value.p.x},${st.value.p.y}) chunks=${st.value.chunks} drained=${drained}` : st.error)
  }
  await evl(page, () => window.__debug.teleport(0, 0))
  await waitChunksDrained(page)
  const back = await evl(page, () => window.__debug.getState())
  test('P5b return to spawn after ±1e9 teleports is healthy',
    back.ok && back.value.player.x === 0 && back.value.player.y === 0 && back.value.loadedChunkCount > 0,
    back.ok ? `chunks=${back.value.loadedChunkCount}` : back.error)
  test('P5c no page errors across the teleport extremes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P6. Void click (no moveTarget) + hover void/solid round trip')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const voidTile = await evl(page, () => {
    const w = window.__debug.world
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        if (w.biomeAt(dx, dy) === 'void') {
          const pr = w.projectTile(dx, dy)
          if (pr) return { x: dx, y: dy, pr }
        }
      }
    }
    return null
  })
  test('P6a found a projected void tile (precondition)', voidTile.ok && voidTile.value !== null,
    voidTile.ok ? JSON.stringify(voidTile.value) : voidTile.error)
  if (voidTile.ok && voidTile.value) {
    const p0 = await evl(page, () => window.__debug.world.player)
    await evl(page, (cx, cy) => document.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true })),
      voidTile.value.pr.x, voidTile.value.pr.y)
    await new Promise(res => setTimeout(res, 400))
    const p1 = await evl(page, () => window.__debug.world.player)
    test('P6b clicking a VOID tile sets no moveTarget (player stays put)',
      p0.ok && p1.ok && Math.abs(p1.value.x - p0.value.x) < 0.01 && Math.abs(p1.value.y - p0.value.y) < 0.01,
      p0.ok && p1.ok ? `dx=${(p1.value.x - p0.value.x).toFixed(3)} dy=${(p1.value.y - p0.value.y).toFixed(3)}` : (p0.error || p1.error))
  }
  const hover = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const vp = w.projectTile(voidTile.value.x, voidTile.value.y)
    fire('pointermove', vp.x, vp.y)
    const overVoid = w.lastHover
    const solid = null
    for (let i = 0; i < 64; i++) {
      const tx = -4 + (i % 8), ty = -4 + Math.floor(i / 8)
      if (w.biomeAt(tx, ty) === 'void') continue
      const pr = w.projectTile(tx, ty)
      if (pr) { fire('pointermove', pr.x, pr.y); return { overVoid, solid: w.lastHover ? { x: w.lastHover.x, y: w.lastHover.y } : null } }
    }
    return { overVoid, solid }
  })
  test('P6c hover over void clears lastHover (null), hover over a solid tile sets it again',
    hover.ok && hover.value.overVoid === null && hover.value.solid !== null,
    hover.ok ? `overVoid=${JSON.stringify(hover.value.overVoid)} solid=${JSON.stringify(hover.value.solid)}` : hover.error)
  test('P6d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P7. Window resize mid-game (camera + renderer survive)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  await page.setViewport({ width: 640, height: 480 })
  await new Promise(res => setTimeout(res, 300))
  await page.setViewport({ width: 1280, height: 800 })
  await new Promise(res => setTimeout(res, 300))
  await page.setViewport({ width: 960, height: 540 })
  await new Promise(res => setTimeout(res, 300))
  const proj = await evl(page, () => window.__debug.world.projectTile(3, 3))
  const st = await evl(page, () => window.__debug.getState())
  test('P7a resize 960x540→640x480→1280x800→back: world state intact, projection sane',
    st.ok && st.value.player.x === 0 && proj.ok && proj.value !== null &&
    proj.value.x >= 0 && proj.value.x <= 960 && proj.value.y >= 0 && proj.value.y <= 540,
    proj.ok ? `proj=(${proj.value.x.toFixed(0)}, ${proj.value.y.toFixed(0)})` : (proj.error || st.error))
  // Move after resize: WASD still drives the player (input listeners survive).
  await page.keyboard.down('KeyD')
  await new Promise(res => setTimeout(res, 200))
  await page.keyboard.up('KeyD')
  const p = await evl(page, () => window.__debug.world.player)
  test('P7b player still moves with WASD after resize', p.ok && p.value.x > 0.3,
    p.ok ? `x=${p.value.x.toFixed(2)}` : p.error)
  test('P7c no page errors across the resize section', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P8. Debug overlay commands (real keyboard input)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const input = await page.$('#debug-overlay-input')
  const overlayVisible = await evl(page, () => document.getElementById('debug-overlay').style.display === 'block')
  test('P8a overlay visible + input present in the demo fixture', input !== null && overlayVisible.ok && overlayVisible.value === true,
    `input=${!!input} display=${overlayVisible.ok ? overlayVisible.value : overlayVisible.error}`)

  async function runCmd(cmd) {
    await page.click('#debug-overlay-input')
    await page.keyboard.type(cmd)
    await page.keyboard.press('Enter')
    await new Promise(res => setTimeout(res, 700)) // settle + message render
  }
  await runCmd('tp 3 -2')
  const sTp = await evl(page, () => window.__debug.getState())
  test('P8b overlay "tp 3 -2" teleports the player to (3,-2)',
    sTp.ok && sTp.value.player.x === 3 && sTp.value.player.y === -2,
    sTp.ok ? `player=(${sTp.value.player.x}, ${sTp.value.player.y})` : sTp.error)
  await runCmd('time 400')
  const sTime = await evl(page, () => window.__debug.getState())
  test('P8c overlay "time 400" sets the clock to 400 (6:40, dawn)',
    sTime.ok && sTime.value.timeOfDay === 400 && sTime.value.dayNightPhase === 'dawn',
    sTime.ok ? `tod=${sTime.value.timeOfDay} phase=${sTime.value.dayNightPhase}` : sTime.error)
  await runCmd('fov 7')
  const sFov = await evl(page, () => window.__debug.getState())
  test('P8d overlay "fov 7" sets the FOV override to 7',
    sFov.ok && Math.abs(sFov.value.fovRadius - 7) < 0.001, sFov.ok ? `fov=${sFov.value.fovRadius}` : sFov.error)
  await runCmd('regen 42')
  const sSeed = await evl(page, () => window.__debug.getState())
  test('P8e overlay "regen 42" rebuilds the world with seed 42',
    sSeed.ok && sSeed.value.seed === 42 && sSeed.value.loadedChunkCount > 0,
    sSeed.ok ? `seed=${sSeed.value.seed} chunks=${sSeed.value.loadedChunkCount}` : sSeed.error)
  await runCmd('bogus-command')
  const msg = await evl(page, () => document.getElementById('debug-overlay-msg').textContent)
  test('P8f unknown overlay command shows an inline error, does not throw',
    msg.ok && typeof msg.value === 'string' && msg.value.length > 0,
    msg.ok ? JSON.stringify(msg.value) : msg.error)
  await runCmd('tp notanumber')
  const msg2 = await evl(page, () => document.getElementById('debug-overlay-msg').textContent)
  test('P8g overlay "tp notanumber" shows an error and does not move the player',
    msg2.ok && msg2.value.includes('must be numbers'),
    msg2.ok ? JSON.stringify(msg2.value) : msg2.error)
  const st = await evl(page, () => window.__debug.getState())
  test('P8h world still healthy after the overlay command battery',
    st.ok && st.value.player.x === 3 && st.value.player.y === -2,
    st.ok ? `player=(${st.value.player.x}, ${st.value.player.y})` : st.error)
  test('P8i no page errors across the overlay commands', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('P9. Mid-tween FOV dims are stale between chunk-radius crossings (known regression probe)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  // Park the clock mid-dusk: fov 7 (dayFactor 0.5), loadR 10, chunk radius
  // STILL 2 — no chunk-radius crossing fired, so _updateRadii never reapplied
  // the dims: every retained tile keeps its NOON (fov 9) dims.
  await evl(page, () => window.__debug.setState({ timeOfDay: 1140 }))
  await waitChunksDrained(page)
  const dusk = await evl(page, () => {
    const w = window.__debug.world
    const p = w.player
    // Probe tile at distance ~8.5 (inside the CURRENT band 7-10, outside the
    // noon band 9-12): stale noon dims => dim 1.0 while fog ≈ 0.5.
    const tx = 6, ty = 6
    const d = w.tileDimAt(tx, ty)
    return { fov: w.fovRadius, tod: w.timeOfDay, dim: d ? d.dim : null, fog: w.fogFactorAt(tx, ty), dist: Math.hypot(tx - p.x, ty - p.y) }
  })
  const v = dusk.ok ? dusk.value : null
  const stale = v && v.dim !== null && v.dim > v.fog + 0.2
  test('P9a KNOWN-REGRESSION PROBE: mid-dusk (fov 7) retained band tiles keep NOON dims (dim > fog + 0.2)',
    dusk.ok && stale,
    dusk.ok ? `fov=${v.fov.toFixed(2)} tod=${v.tod} dist=${v.dist.toFixed(2)} dim=${v.dim?.toFixed(3)} fog=${v.fog.toFixed(3)} Δ=${(v.dim - v.fog).toFixed(3)}` : dusk.error)
  // Same probe at mid-dawn.
  await evl(page, () => window.__debug.setState({ timeOfDay: 330 }))
  await waitChunksDrained(page)
  const dawn = await evl(page, () => {
    const w = window.__debug.world
    const p = w.player
    const tx = 6, ty = 6
    const d = w.tileDimAt(tx, ty)
    return { fov: w.fovRadius, dim: d ? d.dim : null, fog: w.fogFactorAt(tx, ty), dist: Math.hypot(tx - p.x, ty - p.y) }
  })
  const dv = dawn.ok ? dawn.value : null
  test('P9b KNOWN-REGRESSION PROBE: mid-dawn (fov 7) dims still stale (dim ≠ fog in the band)',
    dawn.ok && dv.dim !== null && Math.abs(dv.dim - dv.fog) > 0.2,
    dawn.ok ? `fov=${dv.fov.toFixed(2)} dist=${dv.dist.toFixed(2)} dim=${dv.dim?.toFixed(3)} fog=${dv.fog.toFixed(3)} Δ=${(dv.dim - dv.fog).toFixed(3)}` : dawn.error)
  // Control: at the NIGHT terminal the dims MUST be fresh (the round-3 fix).
  await evl(page, () => window.__debug.setState({ timeOfDay: 1300 }))
  await waitChunksDrained(page)
  const night = await evl(page, () => {
    const w = window.__debug.world
    const tx = 6, ty = 6
    const d = w.tileDimAt(tx, ty)
    return { fov: w.fovRadius, dim: d ? d.dim : null, fog: w.fogFactorAt(tx, ty) }
  })
  const nv = night.ok ? night.value : null
  test('P9c CONTROL: at the night terminal (fov 5 crossing) dims ARE refreshed (dim ≈ fog)',
    night.ok && nv.dim !== null && Math.abs(nv.dim - nv.fog) < 0.03,
    night.ok ? `fov=${nv.fov} dim=${nv.dim?.toFixed(3)} fog=${nv.fog.toFixed(3)}` : night.error)
  test('P9d no page errors across the tween probes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
let failed = 0
for (const s of results) for (const t of s.tests) if (!t.pass) failed++
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILURES'} — edge-probes battery done`)
console.log(JSON.stringify(results, null, 1))
process.exit(failed === 0 ? 0 : 1)
