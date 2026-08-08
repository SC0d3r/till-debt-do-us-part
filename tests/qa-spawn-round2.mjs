// QA — fix round 2 (spawn island + fog dim + hover ring + reveal circle).
// Scope: src/world/worldGenerator.js (5×5 spawn patch around the origin —
// max(|x|,|y|) <= SPAWN_PIN_RADIUS always solid; the round-2 seeds 777/4242/
// 1/2 used to boot to a 1-16 tile island in the void), src/world/
// TileMapComposer.js (opts.hoverRing — halo around the hovered tile;
// opts.revealRadius — tiles inside a circle around the hovered tile are
// forced to full brightness so the FOV fog band lights up around the cursor),
// src/world/WorldManager.js (wires both on every chunk composer) and
// src/debug/devHarness.ts (spawnPatchReport / tileDimAt / originMarkerAt /
// hoverRingInfo probes + the red origin marker at the MESH CENTER of tile
// (8,8) + the qa-spawn-island-scene fixture).
//
// Acceptance criteria covered:
//   R1  Spawn patch: for seeds [777, 4242, 1, 2, 1337] ALL 25 patch tiles
//       (max(|x|,|y|) <= 2) exist in generated chunk (0,0), and every one is
//       a grass variant (the origin chunk is pinned grass)
//   R2  QA spawn scene: the red origin marker sits at the mesh center of
//       tile (8,8) — world (0, 0.36, 8) — NOT at the data-origin corner
//       (0,0,0); it projects on-screen; tile (8,8) is solid grass
//   R3  Fog dim + reveal + ring: with a small FOV the origin-area tile at
//       distance 3 is dimmed (dim ≈ fogFactor < 1); hovering it via a
//       synthetic pointer event forces it AND its neighbors inside the
//       reveal circle to full brightness (dim 1.0), a tile outside the
//       circle stays dim, the hover ring shows at the hovered tile's mesh
//       center; moving off restores the fog dim and hides the ring
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
  // The marker targets tile (8,8) — find a seed where that tile is SOLID
  // grass (the marker must not float over void). Regenerating does not move
  // the marker (it is a fixed debug object).
  let chosen = null
  for (const seed of [1337, 4242, 1, 2, 3, 42, 99, 777, 2024]) {
    await evl(page, s => window.__debug.regenerate(s), seed)
    await waitChunksDrained(page)
    const probe = await evl(page, s => {
      const w = window.__debug
      const tile = w.world.chunkData(1, 1).tiles.find(t => t.x === 8 && t.y === 8)
      const report = w.world.spawnPatchReport()
      return { solid: !!tile, variant: tile ? tile.variant : null, patchOk: report.missing.length === 0 }
    }, seed)
    if (probe.ok && probe.value.solid && probe.value.variant.startsWith('grass') && probe.value.patchOk) {
      chosen = { seed, variant: probe.value.variant }
      break
    }
  }
  await waitChunksDrained(page)
  const r = await evl(page, () => {
    const m = window.__debug.world.originMarkerAt()
    if (!m) return { shown: false }
    return {
      shown: true,
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
  test('R2e tile (8,8) is solid grass in the QA scene (marker does not float over void)',
    r.ok && typeof v?.tileVariant === 'string' && v.tileVariant.startsWith('grass'),
    r.ok ? `variant=${v?.tileVariant} seed=${chosen?.seed}` : r.error)
  test('R2f no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('R3. Fog dim → cursor reveal circle → hover ring → restore')
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
    return { origin: w.tileDimAt(3, 0), fog: w.fogFactorAt(3, 0), ring: w.hoverRingInfo() }
  })
  test('R3a pre-hover: tile (3,0) is fog-dimmed, dim ≈ fogFactorAt(3,0) < 1',
    base.ok && base.value?.origin && Math.abs(base.value.origin.dim - base.value.fog) < 0.06 && base.value.origin.dim < 0.95 && !base.value.origin.hovered,
    base.ok ? `dim=${base.value.origin?.dim.toFixed(3)} fog=${base.value.fog?.toFixed(3)}` : base.error)
  test('R3b pre-hover: no ring shown', base.ok && base.value?.ring?.visible === false, base.ok ? '' : base.error)

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
      dimNeighbor: w.tileDimAt(3, 1),
      dimFar: w.tileDimAt(0, 0),
      ring: w.hoverRingInfo(),
    }
  })
  const hv = hover.ok ? hover.value : null
  test('R3c synthetic pointermove over the projected tile sets lastHover (3,0)',
    hover.ok && hv?.projected === true && hv?.lastHover?.x === 3 && hv?.lastHover?.y === 0,
    hover.ok ? JSON.stringify(hv?.lastHover) : hover.error)
  test('R3d hovered tile forced to FULL brightness (dim 1.0, hovered flag set)',
    hover.ok && hv?.dimHovered?.hovered === true && hv?.dimHovered?.dim > 0.98,
    hover.ok ? `dim=${hv?.dimHovered?.dim?.toFixed(3)}` : hover.error)
  test('R3e neighbor (3,1) inside the reveal circle (2.5 tiles) also full-bright (dim 1.0)',
    hover.ok && hv?.dimNeighbor && hv.dimNeighbor.dim > 0.98,
    hover.ok ? `dim=${hv?.dimNeighbor?.dim?.toFixed(3)}` : hover.error)
  test('R3f tile (0,0) outside the reveal circle (distance 3 > 2.5) stays fog-dim (< 0.95)',
    hover.ok && hv?.dimFar && hv.dimFar.dim < 0.95 && hv.dimFar.dim > 0.3,
    hover.ok ? `dim=${hv?.dimFar?.dim?.toFixed(3)}` : hover.error)
  test('R3g hover ring visible at the hovered tile mesh center (1.5, ·, 1.5)',
    hover.ok && hv?.ring?.visible === true &&
    Math.abs(hv.ring.world[0] - 1.5) < 0.01 && Math.abs(hv.ring.world[2] - 1.5) < 0.01,
    hover.ok ? `world=[${hv?.ring?.world?.map(n => n.toFixed(3)).join(', ')}]` : hover.error)
  test('R3h ring projects inside the viewport',
    hover.ok && hv?.ring?.screen && hv.ring.screen.x >= 0 && hv.ring.screen.x <= VIEWPORT.width && hv.ring.screen.y >= 0 && hv.ring.screen.y <= VIEWPORT.height,
    hover.ok ? `screen=(${hv?.ring?.screen?.x?.toFixed(0)}, ${hv?.ring?.screen?.y?.toFixed(0)})` : hover.error)

  const off = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, x, y) => document.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    fire('pointermove', 5, 5) // move off to open sky
    return { lastHover: w.lastHover, dimNeighbor: w.tileDimAt(3, 1), ring: w.hoverRingInfo() }
  })
  const ov = off.ok ? off.value : null
  test('R3i hover clears on move-off', off.ok && ov?.lastHover === null, off.ok ? JSON.stringify(ov?.lastHover) : off.error)
  test('R3j revealed neighbor restored to its fog dim (< 0.95) — dim → reveal → dim round trip',
    off.ok && ov?.dimNeighbor && ov.dimNeighbor.dim < 0.95 && ov.dimNeighbor.dim > 0.3,
    off.ok ? `dim=${ov?.dimNeighbor?.dim?.toFixed(3)}` : off.error)
  test('R3k ring hidden on move-off', off.ok && ov?.ring?.visible === false, off.ok ? '' : off.error)
  test('R3l no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
let failed = 0
for (const s of results) for (const t of s.tests) if (!t.pass) failed++
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILURES'} — '${current?.section || ''}' battery done`)
console.log(JSON.stringify(results, null, 1))
process.exit(failed === 0 ? 0 : 1)
