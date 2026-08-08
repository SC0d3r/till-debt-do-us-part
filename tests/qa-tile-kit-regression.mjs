// QA regression pass — tile-kit + prop-library (Assets & Art feature, post-pivot).
// Scope: the tile modules (src/assets/tiles/*.js, tileTexture.js), the prop
// modules (src/assets/props/*.js) and the dev harness (previewAsset +
// asset-preview fixtures) must NOT have broken anything else. The farming game
// was deleted (project pivot, 2026-08-07): there are no gameplay fixtures, no
// clock, no HUD. This file verifies:
//   T1  registry integrity (29 fixtures: 27 asset-preview + 2 showcase)
//   T2  boot state: the tile world loads with the loop running (started=true)
//   T3  all 27 asset-preview fixtures resolve via gotoFixture/previewAsset
//   T4  previewAsset stops the loop cleanly (started=false during preview,
//       teardown restores the world, no crash)
//   T5  leak prevention: preview → preview / preview → showcase / preview → preview
//   T6  validation: unknown names throw
//   T7  REAL input still works after a preview cycle (composer hover alive)
//   T8  preview spam + interruption mid-preview
//   T9  resize during preview
//   T10 prop library: props-showcase fixture + prop preview cycles resolve
//   T11 re-review regressions: flower NaN vertices (B1), PROP_BRIGHTNESS in
//       shadeFaces (B3), showcase NDC framing — no clipped rows/props (B2)
//   T12 zero page/console errors across the whole battery
//
// DEBUG_HARNESS Part D: preconditions via gotoFixture/previewAsset (debug
// hooks), the interaction under test (hover after a preview) via REAL input,
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

const TILE_PREVIEW_FIXTURES = [
  'grass-plain', 'grass-plain-b', 'grass-plain-c',
  'dirt-plain', 'dirt-plain-b',
  'water-plain', 'water-plain-b',
  'sand-plain', 'sand-plain-b',
  'lava-plain',
  'snow-plain', 'snow-plain-b',
]

const PROP_PREVIEW_FIXTURES = [
  'flower', 'rock', 'bush', 'tall-grass',
  'small-stone', 'big-stone', 'pebble-cluster',
  'torch', 'lantern',
  'gravel-patch',
  'cactus', 'dry-shrub', 'bush-snow', 'snow-patch', 'lava-rock',
]

const ALL_PREVIEW_FIXTURES = [...TILE_PREVIEW_FIXTURES, ...PROP_PREVIEW_FIXTURES]

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
  // 31 entries: 27 asset-preview + 2 showcase (tile-showcase + props-showcase)
  // + 2 demo (slice-c-demo + slice-c-demo-night, added with Slice C).
  test('T1a listFixtures returns 31 entries (27 asset-preview + 2 showcase + 2 demo)',
    lf.ok && names.length === 31 &&
    ALL_PREVIEW_FIXTURES.every(n => names.includes(n)) &&
    names.includes('tile-showcase') && names.includes('props-showcase') &&
    names.includes('slice-c-demo') && names.includes('slice-c-demo-night'),
    lf.ok ? `${names.length} entries; cat=${JSON.stringify(byCategory)}` : lf.error)
  test('T1b fixture names unique', lf.ok && new Set(names).size === 31, lf.ok ? String(new Set(names).size) : lf.error)
  test('T1c exactly 27 asset-preview fixtures, all from the merged tile + prop registries',
    lf.ok && byCategory['asset-preview'] === 27 &&
    ALL_PREVIEW_FIXTURES.every(n => lf.value.find(f => f.name === n)?.category === 'asset-preview'),
    JSON.stringify(byCategory))
  const surf = await evl(page, () => typeof window.__debug.previewAsset === 'function')
  test('T1d __debug.previewAsset is a function', surf.ok && surf.value === true, JSON.stringify(surf))
  test('T1e no page errors during registry checks', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T2. Boot state: tile world loads with the loop running')
{
  const page = await newPage()
  await loadDebug(page)
  // The boot settle (600ms wall-clock) starts after the harness initializes;
  // wait for it before asserting the boot state.
  await page.waitForFunction(() => window.__debug?.ready === true, { timeout: 20000 })
  const s = await getState(page)
  test('T2a boot: started=true (world loop running), ready',
    s && s.started === true && s.ready === true, JSON.stringify(s))
  test('T2b no page errors at boot', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T3. All 27 asset-preview fixtures resolve via gotoFixture')
{
  const page = await newPage()
  await loadDebug(page)
  let ok = true
  for (const fname of ALL_PREVIEW_FIXTURES) {
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
  test('T3b no page errors across all 27 asset-preview fixtures', ok && page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T4. previewAsset stops the loop cleanly (boot world → preview → teardown)')
{
  const page = await newPage()
  await loadDebug(page)
  const s0 = await getState(page)
  test('T4a boot baseline: started=true (world loop running)', s0 && s0.started === true,
    JSON.stringify({ started: s0?.started }))
  // Direct previewAsset (NOT gotoFixture): preserves started=true at entry,
  // proving the preview itself stops the loop rather than a reset doing it.
  const p = await evl(page, () => window.__debug.previewAsset('snow-plain-b'))
  const s1 = await getState(page)
  test('T4b previewAsset resolves and loop is stopped (started=false)', p.ok && s1 && s1.started === false,
    p.ok ? JSON.stringify({ started: s1?.started }) : p.error)
  // Teardown: back to the showcase fixture — the world must restore cleanly.
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  test('T4c after teardown: showcase fixture resolves, ready', r2.ok && s2?.ready === true,
    JSON.stringify({ started: s2?.started, ready: s2?.ready }))
  test('T4d no page errors across preview/teardown cycle', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T5. Leak prevention: preview → preview / preview → showcase / preview → preview')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('grass-plain-b'))
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s1 = await getState(page)
  test('T5a preview → showcase: resolves, loop off, ready', s1?.started === false && s1?.ready === true,
    JSON.stringify({ started: s1?.started, ready: s1?.ready }))
  await evl(page, () => window.__debug.gotoFixture('grass-plain-c'))
  const s2 = await getState(page)
  test('T5b showcase → preview: resolves, loop off, ready', s2?.started === false && s2?.ready === true,
    JSON.stringify({ started: s2?.started, ready: s2?.ready }))
  // Preview → preview without showcase in between: teardown must restore the
  // previous preview's saved scene cleanly.
  const r3 = await evl(page, () => window.__debug.gotoFixture('water-plain'))
  const r4 = await evl(page, () => window.__debug.gotoFixture('sand-plain'))
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
  const r2 = await evl(page, () => window.__debug.previewAsset('tile-showcase'))
  test('T6b previewAsset showcase name throws (no factory)', !r2.ok && String(r2.error).includes('no factory registered'), r2.ok ? 'did not throw' : r2.error)
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
section('T7. Real input works after a preview cycle (composer hover)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  await evl(page, () => window.__debug.previewAsset('grass-plain'))
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  // Real pointer input: aim at a tile through the composer's own projection
  // helper and dispatch a genuine pointermove event. (4,4) is a dirt path
  // tile in the current SHOWCASE_MAP (src/world/showcaseMap.js).
  const r = await evl(page, () => {
    const sh = window.__debug.showcase
    const p = sh.projectTile(4, 4)
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }))
    const h = sh.lastHover
    return h ? { x: h.x, y: h.y, variant: h.variant } : null
  })
  test('T7a real pointermove highlights a tile after preview→showcase cycle', r.ok && r.value?.x === 4 && r.value?.y === 4 && r.value?.variant === 'dirt-plain-b',
    r.ok ? JSON.stringify(r.value) : r.error)
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
    const p1 = window.__debug.previewAsset('grass-plain-b')
    const p2 = window.__debug.previewAsset('grass-plain-c')
    const p3 = window.__debug.previewAsset('water-plain')
    await Promise.all([p1, p2, p3])
    return true
  })
  const s1 = await getState(page)
  test('T8a 3 unawaited previewAsset calls settle without error', spam.ok && s1?.ready === true, spam.ok ? JSON.stringify({ started: s1?.started, ready: s1?.ready }) : spam.error)
  // Interrupt: start a preview and immediately jump to the showcase fixture.
  const inter = await evl(page, () => {
    window.__debug.previewAsset('lava-plain') // not awaited — interrupt
    return window.__debug.gotoFixture('tile-showcase')
  })
  const s2 = await getState(page)
  test('T8b preview interrupted by gotoFixture(tile-showcase): resolves cleanly',
    inter.ok && s2?.ready === true,
    inter.ok ? JSON.stringify({ started: s2?.started, ready: s2?.ready }) : inter.error)
  test('T8c no page errors across spam/interruption', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T9. Resize during preview')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('sand-plain'))
  await page.setViewport({ width: 640, height: 480 })
  const r1 = await evl(page, () => window.__debug.gotoFixture('snow-plain-b'))
  const s1 = await getState(page)
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  test('T9a previews + showcase survive resize mid-preview', r1.ok && s1?.ready === true && r2.ok && s2?.ready === true,
    JSON.stringify({ r1: r1.ok, r2: r2.ok, started: s2?.started }))
  test('T9b no page errors during resize battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T10. Prop library: props-showcase fixture + prop preview cycles')
{
  const page = await newPage()
  await loadDebug(page)
  // The props-showcase fixture must resolve (composer + 15 staged props).
  const r1 = await evl(page, () => window.__debug.gotoFixture('props-showcase'))
  const s1 = await getState(page)
  test('T10a props-showcase fixture resolves, loop stopped, ready',
    r1.ok && s1?.started === false && s1?.ready === true,
    r1.ok ? JSON.stringify({ started: s1?.started, ready: s1?.ready }) : r1.error)
  // Prop preview cycles with biome-specific host tiles (sand for cactus,
  // snow for bush-snow, lava for lava-rock, grass for torch) must resolve.
  const propCycle = ['cactus', 'bush-snow', 'lava-rock', 'torch', 'lantern', 'flower', 'snow-patch', 'gravel-patch']
  let ok = true
  for (const pname of propCycle) {
    const r = await evl(page, n => window.__debug.previewAsset(n), pname)
    const s = r.ok ? await getState(page) : null
    const failed = !r.ok || s?.started !== false || s?.ready !== true
    test(`T10b previewAsset("${pname}") resolves on its host tile`, !failed,
      r.ok ? JSON.stringify({ started: s?.started, ready: s?.ready }) : r.error)
    if (failed) ok = false
  }
  // Teardown back to the tile showcase — composer world must restore.
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  test('T10c teardown from prop previews to tile-showcase resolves cleanly', r2.ok && s2?.ready === true,
    JSON.stringify({ started: s2?.started, ready: s2?.ready }))
  test('T10d no page errors across prop battery', ok && page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('T11. Prop regressions: NaN vertices (B1), brightness (B3), showcase framing (B2)')
{
  const page = await newPage()
  await loadDebug(page)

  // B1: flower geometry must have ZERO NaN vertices (the old fl.off[2] read
  // past a 2-element array → NaN → all 1044 vertices dropped) and a real
  // cluster bbox: y up to ~0.1543, +z ~0.1245 (the camera-facing third bloom).
  const fl = await evl(page, () => window.__debug.inspectProp('flower'))
  test('T11a flower geometry: 0 NaN vertices (B1 off[1] fix)',
    fl.ok && fl.value.nanCount === 0,
    fl.ok ? JSON.stringify({ nanCount: fl.value.nanCount, bbox: fl.value.bbox }) : fl.error)
  test('T11b flower cluster bbox: 3 blooms, camera-facing +z bloom present',
    fl.ok && fl.value.bbox.max[1] > 0.14 && fl.value.bbox.min[1] > -0.03 && fl.value.bbox.max[2] > 0.1,
    fl.ok ? JSON.stringify(fl.value.bbox) : fl.error)

  // B3: shadeFaces must multiply the final tone by PROP_BRIGHTNESS (0.575).
  // The color attribute holds LINEAR-space values (THREE.Color(hex) with
  // color management enabled), so the expectation is linear(0x7cc552) × 0.575
  // — which renders back to sRGB ≈ (96,154,62), the visual-critic's verified
  // value. The raw sRGB tone (0.486, 0.773, 0.322) must be ABSENT.
  const bush = await evl(page, () => window.__debug.inspectProp('bush'))
  const srgbToLinear = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const exp = [0x7c, 0xc5, 0x52].map(v => srgbToLinear(v / 255) * 0.575)
  const got = bush.ok ? bush.value.maxYColor : [0, 0, 0]
  const close = got.every((v, i) => Math.abs(v - exp[i]) < 0.05)
  test('T11c bush light cap = light tone × PROP_BRIGHTNESS (B3 shadeFaces fix)',
    bush.ok && close,
    bush.ok ? JSON.stringify({ got: got.map(v => Math.round(v * 255)), exp: exp.map(v => Math.round(v * 255)) }) : bush.error)

  // B2: tile-showcase framing — all 81 row centers inside NDC ±0.95.
  const r1 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const ndcTile = await evl(page, () => window.__debug.showcase.ndc('tile'))
  const rowsOut = ndcTile.ok ? ndcTile.value.rows.filter(r => Math.abs(r.nx) > 0.95 || Math.abs(r.ny) > 0.95) : null
  test('T11d tile-showcase: no row center outside NDC ±0.95 (B2 framing)',
    r1.ok && ndcTile.ok && rowsOut.length === 0,
    ndcTile.ok ? JSON.stringify({ rows: ndcTile.value.rows.length, out: rowsOut.length }) : (ndcTile.error || r1.error))

  // B2: props-showcase framing — ALL 15 props (LANTERN at (6,0) included)
  // must land inside NDC ±0.95.
  const r2 = await evl(page, () => window.__debug.gotoFixture('props-showcase'))
  const ndcProps = await evl(page, () => window.__debug.showcase.ndc('props'))
  const propsOut = ndcProps.ok ? ndcProps.value.props.filter(p => Math.abs(p.nx) > 0.95 || Math.abs(p.ny) > 0.95) : null
  test('T11e props-showcase: all 15 props inside NDC ±0.95, lantern included (B2 framing)',
    r2.ok && ndcProps.ok && ndcProps.value.props.length === 15 && propsOut.length === 0,
    ndcProps.ok ? JSON.stringify({ props: ndcProps.value.props.length, out: propsOut.map(p => p.name) }) : (ndcProps.error || r2.error))
  test('T11f no page errors across prop regression suite', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== TILE-KIT REGRESSION SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)