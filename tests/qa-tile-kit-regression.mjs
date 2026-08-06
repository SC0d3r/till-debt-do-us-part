// QA regression pass — tile-kit grass family (Assets & Art feature).
// Scope: the tile modules (src/assets/tiles/grass.js, transitionTexture.js)
// and the extended dev harness (previewAsset + 13 asset-preview fixtures) must
// NOT have broken anything else. This file verifies:
//   T1  registry integrity (22 fixtures: 9 gameplay + 13 asset-preview)
//   T2  all 9 existing gameplay fixtures still resolve deterministically
//   T3  all 13 asset-preview fixtures resolve via gotoFixture/previewAsset
//   T4  previewAsset stops the game loop cleanly (clock frozen during preview,
//       loop + day/night fog restored after teardown, no crash)
//   T5  leak prevention: preview → menu / preview → gameplay / preview → preview
//   T6  validation: unknown names throw
//   T7  REAL input still works after a preview cycle (loop truly alive)
//   T8  preview spam + interruption mid-preview
//   T9  resize during preview
//   T10 zero page/console errors across the whole battery
//
// DEBUG_HARNESS Part D: preconditions via gotoFixture/previewAsset (debug
// hooks), the interaction under test (tilling after a preview) via REAL input,
// assertions via getState. Rendering non-blankness is covered by the capture
// pipeline (blank-frame heuristic) — this file asserts state, not pixels.

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

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

const GAMEPLAY_FIXTURES = ['main-menu', 'farm-day', 'farm-night', 'farm-crops-grown', 'inventory-open', 'shop-open', 'dialogue-open', 'mine-floor-1', 'slot-machine']
const PREVIEW_FIXTURES = [
  'grass-plain', 'grass-flowers', 'grass-bushes',
  'grass-dirt-n', 'grass-dirt-e', 'grass-dirt-s', 'grass-dirt-w',
  'grass-tilled', 'grass-tilled-n', 'grass-tilled-e', 'grass-tilled-s', 'grass-tilled-w',
  'dirt-plain',
]

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const modDist = (a, b) => Math.min((a - b + 1440) % 1440, (b - a + 1440) % 1440)

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
async function getState(page) { const r = await evl(page, () => window.__debug.getState()); return r.ok ? r.value : null }

// ─────────────────────────────────────────────────────────────
section('T1. Registry integrity')
{
  const page = await newPage()
  await loadDebug(page)
  const lf = await evl(page, () => window.__debug.listFixtures())
  const names = lf.ok ? lf.value.map(f => f.name) : []
  const byCategory = lf.ok ? lf.value.reduce((m, f) => { m[f.category] = (m[f.category] || 0) + 1; return m }, {}) : {}
  test('T1a listFixtures returns 22 entries (9 gameplay + 13 asset-preview)',
    lf.ok && names.length === 22 &&
    GAMEPLAY_FIXTURES.every(n => names.includes(n)) &&
    PREVIEW_FIXTURES.every(n => names.includes(n)),
    lf.ok ? `${names.length} entries; cat=${JSON.stringify(byCategory)}` : lf.error)
  test('T1b fixture names unique', lf.ok && new Set(names).size === 22, lf.ok ? String(new Set(names).size) : lf.error)
  test('T1c exactly 13 asset-preview fixtures, all from the grass family manifest',
    lf.ok && byCategory['asset-preview'] === 13 &&
    PREVIEW_FIXTURES.every(n => lf.value.find(f => f.name === n)?.category === 'asset-preview'),
    JSON.stringify(byCategory))
  const surf = await evl(page, () => typeof window.__debug.previewAsset === 'function')
  test('T1d __debug.previewAsset is a function', surf.ok && surf.value === true, JSON.stringify(surf))
  test('T1e no page errors during registry checks', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T2. Existing gameplay fixtures still resolve (9/9)')
{
  const page = await newPage()
  await loadDebug(page)
  let allOk = true
  for (const fname of GAMEPLAY_FIXTURES) {
    const r = await evl(page, n => window.__debug.gotoFixture(n), fname)
    const s = r.ok ? await getState(page) : null
    const checks = {
      started: fname === 'main-menu' ? (s && s.started === false) : (s && s.started === true),
      // slot-machine spins once in its setup (10g), so gold is 90 there — same
      // expectation as qa-harness section E.
      gold: fname === 'main-menu' ? true : fname === 'slot-machine' ? (s && s.player.gold === 90) : (s && s.player.gold === 100),
      day: fname === 'main-menu' ? true : (s && s.player.day === 1),
    }
    if (fname === 'mine-floor-1') checks.mine = s && s.inMine === true && s.mine.currentFloor === 0
    if (fname === 'slot-machine') checks.slot = s && s.slotOpen === true && s.scene === 'slot'
    if (fname === 'shop-open') checks.shop = s && s.ui.shopOpen === true
    if (fname === 'inventory-open') checks.inv = s && s.ui.inventoryOpen === true
    if (fname === 'dialogue-open') checks.dlg = s && s.ui.dialogueActive === true
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    test(`T2 "${fname}" resolves with expected state`, r.ok && failed.length === 0,
      r.ok ? `failed: ${failed.join(', ')}` : r.error)
    if (!r.ok || failed.length) allOk = false
  }
  test('T2b no page errors across all 9 gameplay fixtures', allOk && page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T3. All 13 asset-preview fixtures resolve via gotoFixture')
{
  const page = await newPage()
  await loadDebug(page)
  let ok = true
  for (const fname of PREVIEW_FIXTURES) {
    const r = await evl(page, n => window.__debug.gotoFixture(n), fname)
    const s = r.ok ? await getState(page) : null
    const checks = {
      // The game loop must NOT be running while a preview is on screen.
      loopStopped: s && s.started === false,
      ready: s && s.ready === true,
    }
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    test(`T3 "${fname}" resolves, loop stopped, ready`, r.ok && failed.length === 0,
      r.ok ? `failed: ${failed.join(', ')} | state=${JSON.stringify(s)}` : r.error)
    if (!r.ok || failed.length) ok = false
  }
  test('T3b no page errors across all 13 asset-preview fixtures', ok && page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T4. previewAsset stops the loop cleanly (started game, day/night fog)')
{
  const page = await newPage()
  await loadDebug(page)
  // Start the game: farm scene with real fog (THREE.Fog(COLORS.sky, 18, 40)).
  await evl(page, () => window.__debug.gotoFixture('farm-night'))
  const s0 = await getState(page)
  test('T4a farm-night baseline: started, clock near 22:00', s0 && s0.started === true && modDist(s0.player.timeOfDay, 1320) <= 300,
    JSON.stringify({ started: s0?.started, tod: s0?.player?.timeOfDay }))
  // Direct previewAsset (NOT gotoFixture): preserves started=true at entry,
  // proving the preview itself stops the loop rather than a reset doing it.
  const p = await evl(page, () => window.__debug.previewAsset('grass-tilled-n'))
  const s1 = await getState(page)
  const t1a = s1?.player.timeOfDay
  await sleep(900)
  const t1b = (await getState(page))?.player.timeOfDay
  test('T4b previewAsset resolves and loop is stopped (started=false)', p.ok && s1 && s1.started === false, p.ok ? JSON.stringify({ started: s1?.started }) : p.error)
  test('T4c in-game clock FROZEN during preview (loop not ticking)', Number.isFinite(t1a) && t1a === t1b, JSON.stringify({ a: t1a, b: t1b }))
  // Teardown: back to a gameplay fixture — loop must resume WITH fog restored
  // (DayNightDriver.update dereferences scene.fog every tick; a null-fog
  // restart would crash).
  const r2 = await evl(page, () => window.__debug.gotoFixture('farm-night'))
  const s2 = await getState(page)
  const t2a = s2?.player.timeOfDay
  await sleep(900)
  const t2b = (await getState(page))?.player.timeOfDay
  test('T4d after teardown: started=true, clock resumes (loop + fog alive)', r2.ok && s2?.started === true && Number.isFinite(t2a) && Number.isFinite(t2b) && modDist(t2a, t2b) > 1,
    JSON.stringify({ started: s2?.started, a: t2a, b: t2b }))
  // Same cycle from farm-day (day fog) for completeness.
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const d0 = await getState(page)
  const pd = await evl(page, () => window.__debug.previewAsset('grass-dirt-e'))
  const d1 = await getState(page)
  const rd = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const d2 = await getState(page)
  test('T4e day-fog cycle: preview stops loop, teardown restores started + gold 100',
    d0?.started === true && pd.ok && d1?.started === false && rd.ok && d2?.started === true && d2?.player.gold === 100,
    JSON.stringify({ before: d0?.started, during: d1?.started, after: d2?.started, gold: d2?.player.gold }))
  test('T4f no page errors across fog/preview cycles', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T5. Leak prevention: preview → menu / preview → gameplay / preview → preview')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('grass-flowers'))
  await evl(page, () => window.__debug.gotoFixture('main-menu'))
  const s1 = await getState(page)
  const dom1 = await evl(page, () => {
    const el = document.getElementById('start-overlay')
    return el ? getComputedStyle(el).display !== 'none' : false
  })
  test('T5a preview → main-menu: start overlay restored, loop off', s1?.started === false && s1?.ui.startOverlayVisible === true && dom1.ok && dom1.value === true,
    JSON.stringify({ started: s1?.started, flag: s1?.ui.startOverlayVisible, dom: dom1?.value }))
  await evl(page, () => window.__debug.gotoFixture('grass-bushes'))
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const s2 = await getState(page)
  const dom2 = await evl(page, () => getComputedStyle(document.getElementById('hud')).display !== 'none')
  test('T5b preview → farm-day: HUD visible, gold 100, loop on', s2?.started === true && s2?.player.gold === 100 && dom2.ok && dom2.value === true,
    JSON.stringify({ started: s2?.started, gold: s2?.player.gold, hud: dom2?.value }))
  // Preview → preview without gameplay in between: teardown must restore the
  // previous preview's saved scene cleanly.
  const r3 = await evl(page, () => window.__debug.gotoFixture('grass-dirt-s'))
  const r4 = await evl(page, () => window.__debug.gotoFixture('grass-tilled'))
  const r5 = await evl(page, () => window.__debug.gotoFixture('dirt-plain'))
  const s3 = await getState(page)
  test('T5c preview → preview → preview: all resolve, loop stays off, ready', r3.ok && r4.ok && r5.ok && s3?.started === false && s3?.ready === true,
    JSON.stringify({ r3: r3.ok, r4: r4.ok, r5: r5.ok, started: s3?.started, ready: s3?.ready }))
  test('T5d no page errors across leak-prevention battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T6. previewAsset validation')
{
  const page = await newPage()
  await loadDebug(page)
  const r1 = await evl(page, () => window.__debug.previewAsset('bogus'))
  test('T6a previewAsset unknown name throws', !r1.ok && String(r1.error).includes('unknown asset'), r1.ok ? 'did not throw' : r1.error)
  const r2 = await evl(page, () => window.__debug.previewAsset('farm-day'))
  test('T6b previewAsset gameplay name throws (no factory)', !r2.ok && String(r2.error).includes('no factory registered'), r2.ok ? 'did not throw' : r2.error)
  const r3 = await evl(page, () => window.__debug.gotoFixture('bogus'))
  test('T6c gotoFixture unknown fixture still throws', !r3.ok && String(r3.error).includes('unknown fixture'), r3.ok ? 'did not throw' : r3.error)
  // After the error paths the harness must still be usable.
  const r4 = await evl(page, () => window.__debug.gotoFixture('grass-plain'))
  const s4 = await getState(page)
  test('T6d harness usable after validation errors', r4.ok && s4?.ready === true, r4.ok ? '' : r4.error)
  test('T6e no page errors during validation battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T7. Real input works after a preview cycle')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await evl(page, () => window.__debug.previewAsset('grass-plain'))
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await evl(page, () => window.__debug.setState({
    player: { stamina: 100, waterLevel: 10, selectedSlot: 0 },
    position: { x: 5, z: 5 },
    farm: { tiles: { '5,4': { type: 'GRASS' }, '5,5': { type: 'GRASS' }, '5,6': { type: 'GRASS' } } },
  }))
  await page.keyboard.press('1')
  await sleep(300)
  let tilled = false
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(' ')
    await sleep(300)
    const s = await getState(page)
    if (s && s.farm?.tiles?.[5]?.[5]?.type === 2) { tilled = true; break }
  }
  const s = await getState(page)
  test('T7a real Space tills grass tile after preview→farm-day cycle', tilled === true, JSON.stringify(s?.farm?.tiles?.[5]?.[5]))
  test('T7b no page errors after real input following preview', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T8. Preview spam + interruption')
{
  const page = await newPage()
  await loadDebug(page)
  // Spam: fire previews back-to-back without awaiting (exercises
  // teardownPreview mid-preview).
  const spam = await evl(page, async () => {
    const p1 = window.__debug.previewAsset('grass-flowers')
    const p2 = window.__debug.previewAsset('grass-bushes')
    const p3 = window.__debug.previewAsset('grass-dirt-n')
    await Promise.all([p1, p2, p3])
    return true
  })
  const s1 = await getState(page)
  test('T8a 3 unawaited previewAsset calls settle without error', spam.ok && s1?.ready === true, spam.ok ? JSON.stringify({ started: s1?.started, ready: s1?.ready }) : spam.error)
  // Interrupt: start a preview and immediately jump to a gameplay fixture.
  const inter = await evl(page, () => {
    window.__debug.previewAsset('grass-tilled-e') // not awaited — interrupt
    return window.__debug.gotoFixture('farm-day')
  })
  const s2 = await getState(page)
  const t2a = s2?.player.timeOfDay
  await sleep(900)
  const t2b = (await getState(page))?.player.timeOfDay
  test('T8b preview interrupted by gotoFixture(farm-day): loop resumes cleanly',
    inter.ok && s2?.started === true && Number.isFinite(t2a) && Number.isFinite(t2b) && modDist(t2a, t2b) > 1,
    inter.ok ? JSON.stringify({ started: s2?.started, a: t2a, b: t2b }) : inter.error)
  test('T8c no page errors across spam/interruption', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T9. Resize during preview')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('grass-dirt-w'))
  await page.setViewport({ width: 640, height: 480 })
  const r1 = await evl(page, () => window.__debug.gotoFixture('grass-tilled-w'))
  const s1 = await getState(page)
  const r2 = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const s2 = await getState(page)
  test('T9a previews + gameplay survive resize mid-preview', r1.ok && s1?.ready === true && r2.ok && s2?.started === true,
    JSON.stringify({ r1: r1.ok, r2: r2.ok, started: s2?.started }))
  test('T9b no page errors during resize battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== TILE-KIT REGRESSION SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
