// QA — fix round 2 (spawn island + fog dim + origin marker) + corrective
// round 3 (far-corner hover sphere fix + natural-tween dims refresh).
// Scope: src/world/worldGenerator.js (5×5 spawn patch around the origin —
// max(|x|,|y|) <= SPAWN_PIN_RADIUS always solid; the round-2 seeds 777/4242/
// 1/2 used to boot to a 1-16 tile island in the void), src/world/
// WorldManager.js (chunk bounding-sphere center at the TRUE diamond center
// so far-corner tiles raycast; _updateRadii reapplies FOV dims when the
// chunk-space load radius changes so the natural dawn/dusk tween refreshes
// retained chunks) and src/debug/devHarness.ts (spawnPatchReport / tileDimAt
// / originMarkerAt probes + the red origin marker at the MESH CENTER of tile
// (8,8) + the qa-spawn-island-scene fixture).
//
// Acceptance criteria covered:
//   R1  Spawn patch: for seeds [777, 4242, 1, 2, 1337] ALL 25 patch tiles
//       (max(|x|,|y|) <= 2) exist in the generated chunks, and every one is
//       a grass variant (the origin chunk is pinned grass)
//   R2  QA spawn scene: the red origin marker sits at the mesh center of
//       tile (8,8) — world (0, 0.36, 8) — NOT at the data-origin corner
//       (0,0,0); it projects on-screen; tile (8,8) is solid grass
//   R3  Fog dim + hover: with a small FOV the tile at distance 3 is dimmed
//       (dim ≈ fogFactor < 1); hovering it via a synthetic pointer event
//       sets lastHover and forces it to full brightness (hover contract);
//       moving off restores the fog dim
//   R4  Far-corner hover (corrective round 3): the bounding sphere must sit
//       at the chunk diamond's TRUE center — hovering tile (7,7) of chunk
//       (0,0) (world z = 7, ~7 from the OLD center (0,0.3,0) — outside the
//       old 5.2-radius sphere) must raycast and set lastHover
//   R5  Natural-tween dims (corrective round 3): without moving the player,
//       the world LOOP advancing the clock through dusk (fov 9 → 5) crosses
//       the chunk-space load radius boundary; a retained tile's dim must
//       match fogFactorAt afterwards (dims refreshed by _updateRadii, not
//       just the harness set* paths)
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
async function waitChunksDrained(page) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const r = await evl(page, () => window.__debug.world.pendingChunkLoads())
    if (r.ok && r.value === 0) return true
    await new Promise(res => setTimeout(res, 100))
  }
  return false
}

// ─────────────────────────────────────────────────────────────
section('R1. Spawn patch: 5×5 solid grass island around the origin (all seeds)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const rows = []
  for (const seed of [777, 4242, 1, 2, 1337]) {
    await evl(page, s => window.__debug.regenerate(s), seed)
    await waitChunksDrained(page)
    const r = await evl(page, s => {
      const w = window.__debug
      const report = w.world.spawnPatchReport()
      // Scan the LIVE chunk registry (the patch crosses chunk borders —
      // negative tiles live in chunks (-1,0)/(0,-1)/(-1,-1)).
      let nonGrass = 0
      const loadedChunkKeys = []
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const info = w.world.chunkInfo(dx, dy)
          if (info.tracked) loadedChunkKeys.push(`${dx},${dy}`)
        }
      }
      const seen = new Set()
      for (const key of loadedChunkKeys) {
        for (const t of w.world.chunkData(...key.split(',').map(Number)).tiles) {
          seen.add(`${t.x},${t.y}`)
          if (Math.max(Math.abs(t.x), Math.abs(t.y)) <= 2 && !t.variant.startsWith('grass')) nonGrass++
        }
      }
      const patchOk = report.missing.length === 0
      return {
        seed: s,
        pinRadius: report.pinRadius,
        expected: report.expected,
        missingCount: report.missing.length,
        missing: report.missing.slice(0, 8),
        nonGrass,
        seenCount: seen.size,
        patchOk,
      }
    }, seed)
    rows.push(r.ok ? r.value : { seed, error: r.error })
  }
  const okRows = rows.filter(r => !r.error)
  test('R1a every seed reports the 25-tile patch (pinRadius 2, expected 25)',
    okRows.length === 5 && okRows.every(r => r.pinRadius === 2 && r.expected === 25),
    JSON.stringify(rows.map(r => ({ seed: r.seed, pinRadius: r.pinRadius, expected: r.expected, missing: r.missingCount }))))
  test('R1b ZERO missing patch tiles for seeds 777/4242/1/2/1337 (spawn island floor)',
    okRows.length === 5 && okRows.every(r => r.missingCount === 0),
    JSON.stringify(rows.map(r => ({ seed: r.seed, missing: r.missingCount, sample: r.missing }))))
  test('R1c all 25 patch tiles are grass variants (origin chunk pinned grass)',
    okRows.length === 5 && okRows.every(r => r.nonGrass === 0),
    JSON.stringify(rows.map(r => ({ seed: r.seed, nonGrass: r.nonGrass }))))
  test('R1d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('R2. QA spawn scene: origin marker at the MESH CENTER of tile (8,8)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('qa-spawn-island-scene'))
  await waitChunksDrained(page)
  // The fixture is pinned to seed 11 — the first candidate (swept during
  // development) where tile (8,8) is SOLID grass, so the marker does not
  // float over void. The R1 battery proves the spawn patch is solid grass
  // for every seed; here we assert the fixture itself.
  const r = await evl(page, () => {
    const w = window.__debug
    const m = w.world.originMarkerAt()
    if (!m) return { shown: false, seed: w.world.seed }
    return {
      shown: true,
      seed: w.world.seed,
      data: m.data,
      world: m.world,
      screen: m.screen,
      tileVariant: m.tileVariant,
      // Mesh center of tile (8,8): ((8−8)·0.5, topY+lift, (8+8)·0.5).
      expectedWorld: [0, 0.34 + 0.02, 8],
    }
  })
  const v = r.ok ? r.value : null
  test('R2a the origin marker is shown in the QA scene', r.ok && v?.shown === true, r.ok ? '' : r.error)
  test('R2b marker targets the origin tile (8,8)', r.ok && v?.data?.x === 8 && v?.data?.y === 8, r.ok ? JSON.stringify(v?.data) : r.error)
  test('R2c marker world == mesh center of tile (8,8) — (0, 0.36, 8), NOT the data-origin corner (0, 0, 0)',
    r.ok && v?.world && Math.abs(v.world[0] - 0) < 0.01 && Math.abs(v.world[1] - 0.36) < 0.02 && Math.abs(v.world[2] - 8) < 0.01,
    r.ok ? `world=[${v.world.map(n => n.toFixed(3)).join(', ')}] expected=[0, 0.36, 8]` : r.error)
  test('R2d the marker projects inside the viewport (960×540)',
    r.ok && v?.screen && v.screen.x >= 0 && v.screen.x <= VIEWPORT.width && v.screen.y >= 0 && v.screen.y <= VIEWPORT.height,
    r.ok ? `screen=(${v?.screen?.x?.toFixed(0)}, ${v?.screen?.y?.toFixed(0)})` : r.error)
  test('R2e tile (8,8) is solid grass in the fixture scene (marker does not float over void)',
    r.ok && typeof v?.tileVariant === 'string' && v.tileVariant.startsWith('grass'),
    r.ok ? `variant=${v?.tileVariant} fixtureSeed=${v?.seed}` : r.error)
  test('R2f no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('R3. Fog dim → hover → restore (no reveal/ring)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  // Small FOV puts the tiles around (0,0) inside the fade band while the
  // player stays at spawn: everything stays on-screen and deterministic.
  await evl(page, () => window.__debug.setFovRadius(2))
  await waitChunksDrained(page)

  const base = await evl(page, () => {
    const w = window.__debug.world
    return { origin: w.tileDimAt(3, 0), fog: w.fogFactorAt(3, 0) }
  })
  test('R3a pre-hover: tile (3,0) is fog-dimmed, dim ≈ fogFactorAt(3,0) < 1',
    base.ok && base.value?.origin && Math.abs(base.value.origin.dim - base.value.fog) < 0.06 && base.value.origin.dim < 0.95 && !base.value.origin.hovered,
    base.ok ? `dim=${base.value.origin?.dim.toFixed(3)} fog=${base.value.fog?.toFixed(3)}` : base.error)

  const hover = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const p = w.projectTile(3, 0)
    if (!p) return { projected: false }
    fire('pointermove', p.x, p.y)
    return {
      projected: true,
      lastHover: w.lastHover,
      dimHovered: w.tileDimAt(3, 0),
      fog: w.fogFactorAt(3, 0),
    }
  })
  const hv = hover.ok ? hover.value : null
  test('R3b synthetic pointermove over the projected tile sets lastHover (3,0)',
    hover.ok && hv?.projected === true && hv?.lastHover?.x === 3 && hv?.lastHover?.y === 0,
    hover.ok ? JSON.stringify(hv?.lastHover) : hover.error)
  test('R3c hovered tile flagged hovered AND keeps its fog dim (hover composes with dim, no reveal force)',
    hover.ok && hv?.dimHovered?.hovered === true && hv?.dimHovered?.dim < 0.95 && Math.abs(hv?.dimHovered?.dim - hv?.fog) < 0.06,
    hover.ok ? `dim=${hv?.dimHovered?.dim?.toFixed(3)} fog=${hv?.fog?.toFixed(3)}` : hover.error)

  const off = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    fire('pointermove', 5, 5) // move off to open sky
    return { lastHover: w.lastHover, dimNeighbor: w.tileDimAt(3, 0) }
  })
  const ov = off.ok ? off.value : null
  test('R3d hover clears on move-off', off.ok && ov?.lastHover === null, off.ok ? JSON.stringify(ov?.lastHover) : off.error)
  test('R3e hovered tile restored to its fog dim (< 0.95) — hover → restore round trip',
    off.ok && ov?.dimNeighbor && ov.dimNeighbor.dim < 0.95 && ov.dimNeighbor.dim > 0.3,
    off.ok ? `dim=${ov?.dimNeighbor?.dim?.toFixed(3)}` : off.error)
  test('R3f no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('R4. Far-corner hover: tile (7,7) of chunk (0,0) raycasts (bounding-sphere fix)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const r = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const p = w.projectTile(7, 7)
    if (!p) return { projected: false }
    fire('pointermove', p.x, p.y)
    const hovered = w.lastHover
    const dim = w.tileDimAt(7, 7)
    const fog = w.fogFactorAt(7, 7)
    fire('pointermove', 5, 5) // move off to open sky
    return { projected: true, hovered, dim: dim ? { ...dim } : null, fog }
  })
  const v = r.ok ? r.value : null
  test('R4a far-corner tile (7,7) projects on-screen',
    r.ok && v?.projected === true, r.ok ? '' : r.error)
  test('R4b hovering the far corner (7,7) sets lastHover — the bounding sphere must NOT early-out the corner',
    r.ok && v?.hovered?.x === 7 && v?.hovered?.y === 7,
    r.ok ? JSON.stringify(v?.hovered) : r.error)
  test('R4c the far-corner tile is flagged hovered and keeps its fog dim (hover composes with dim)',
    r.ok && v?.dim?.hovered === true && Math.abs(v?.dim?.dim - v?.fog) < 0.06,
    r.ok ? `dim=${v?.dim?.dim?.toFixed(3)} fog=${v?.fog?.toFixed(3)}` : r.error)
  test('R4d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('R5. Natural dusk tween refreshes retained chunks\' dims (FOV band fix)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  // Position the clock deep in dusk (t=1100 → fov 8.33, loadR 11.33, chunk
  // load radius 2). The SETTER reapplies dims for that fov (harness path —
  // this positions the world; it is NOT the path under test). Then the world
  // LOOP naturally advances the clock: through dusk the fov falls, and at
  // t=1200 (fov 5, loadR 8) the chunk-space load radius crosses 2 → 1 —
  // _updateRadii must then reapply the FOV dims to the retained chunks
  // (corrective round 3). Pre-fix the retained chunk (0,0) keeps the fov
  // 8.33 dims (tile (7,0) at fov 8.33 is full-bright, dim 1.0) even though
  // its fog factor at fov 5 is ~0.26 — the assertion fails pre-fix.
  await evl(page, () => window.__debug.setState({ timeOfDay: 1100 }))
  await waitChunksDrained(page)
  // Poll until the natural tween has crossed the dusk boundary. The chunk
  // radius 2 → 1 crossing happens ONLY when loadR <= 8.0 exactly (fov <= 5.0,
  // t >= 1200) — the 5.05 threshold would fire ~1.5 in-game minutes EARLY
  // (pre-crossing), so poll for fov <= 5.001. Fast mode advances ~12.5
  // in-game min/s, so dusk's last ~100 min take ~8s; timeout is generous.
  const crossed = await (async () => {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      const r = await evl(page, () => window.__debug.world.fovRadius)
      if (r.ok && r.value <= 5.001) return true
      await new Promise(res => setTimeout(res, 100))
    }
    return false
  })()
  await waitChunksDrained(page)
  const r = await evl(page, () => {
    const w = window.__debug.world
    const dim = w.tileDimAt(7, 0)
    return { dim: dim ? dim.dim : null, fog: w.fogFactorAt(7, 0), fov: w.fovRadius, timeOfDay: w.timeOfDay }
  })
  const v = r.ok ? r.value : null
  test('R5a the natural clock crossed the dusk boundary (fov 5, loadR 8 → chunk radius 2→1)',
    crossed === true && r.ok && v?.fov <= 5.001,
    r.ok ? `fov=${v?.fov?.toFixed(3)} timeOfDay=${v?.timeOfDay}` : 'tween did not cross within 30s')
  test('R5b retained tile (7,0) dim == fogFactorAt AFTER the natural crossing (dims refreshed by _updateRadii)',
    r.ok && v?.dim !== null && Math.abs(v.dim - v.fog) < 0.03 && v.dim < 0.95,
    r.ok ? `dim=${v?.dim?.toFixed(3)} fog=${v?.fog?.toFixed(3)}` : r.error)
  test('R5c no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
let failed = 0
for (const s of results) for (const t of s.tests) if (!t.pass) failed++
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILURES'} — '${current?.section || ''}' battery done`)
console.log(JSON.stringify(results, null, 1))
process.exit(failed === 0 ? 0 : 1)
