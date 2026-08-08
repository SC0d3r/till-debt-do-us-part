// QA — Slice C fix round 1 (floating sky islands + performance + streaming).
// Scope: src/world/worldGenerator.js (two-octave island mask, void chunks,
// stepping-stone bridges, origin guarantees), src/world/WorldManager.js
// (void-chunk stubs, chunk-space load radius ceil fix, keep == load so the
// FOV tween shrinks/grows the world, per-chunk bounding-sphere hover
// early-out, shared single pointermove listener) and
// src/world/TileMapComposer.js (module-level OUTLINE_GEOM_CACHE — identical
// frames built once across ALL composers; per-composer material only).
//
// Acceptance criteria covered:
//   S1  Floating islands: at least one void chunk in [-3..3]² of the demo
//       world; EVERY void chunk produces zero meshes (chunkInfo
//       sceneChildCount === 0) and sits adjacent to a solid chunk (ragged
//       island edge); biomeAt returns 'void' on void tiles
//   S2  Origin guarantees + determinism: (0,0) always solid grass-plain
//       (biomeAt(0,0) === 'grass', tile pinned); chunkData/biomeAt are
//       pure (identical on re-generation); different seeds differ
//   S3  Stepping stones: isolated solid tiles (no solid 4-neighbor) exist as
//       sparse connectors (>= 2 in the 72x72 area) for seeds 1337/777/4242
//       and the field is deterministic across re-generation
//   S4  FOV tween refills streaming: day fov 9 → 20 solid chunks, night fov 5
//       → 7 (world shrinks!), dawn fov 7 → 20 (grows back) with the player
//       never moving; no churn when the radius band doesn't cross a chunk
//       boundary
//   S5  Outline geometry dedupe: identical local masks across DIFFERENT
//       chunks share ONE geometry object (same UUID) — the module-level
//       cache; the distinct-geometry count across all loaded chunks stays
//       small (<= 12)
//   S6  Mesh budget: every solid chunk's scene group has <= 16 children
//       (tiles + outlines + props); total world meshes stay bounded
//       (<= 400 day, < day at night)
//   S7  Shared hover listener still works (synthetic pointermove over a
//       projected tile sets world.lastHover; clearing restores) — no page
//       errors across the whole battery
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

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 } })

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

/** Waits until the streaming queue drains (polling — the 600ms harness settle
 *  is not enough for the software renderer's 2-chunks/frame budget). */
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
section('S1. Floating islands: void chunks produce zero meshes')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const r = await evl(page, () => {
    const w = window.__debug.world
    const info = []
    let voidCount = 0
    let voidWithMeshes = 0
    let adjacencyPair = false
    const solidKeys = new Set()
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const c = w.chunkInfo(dx, dy)
        info.push({ cx: dx, cy: dy, ...c })
        if (c.tileCount === 0) {
          voidCount++
          if (c.sceneChildCount !== 0) voidWithMeshes++
        } else {
          solidKeys.add(`${dx},${dy}`)
        }
      }
    }
    for (const c of info) {
      if (c.tileCount !== 0) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (solidKeys.has(`${c.cx + dx},${c.cy + dy}`)) adjacencyPair = true
      }
    }
    const origin = w.chunkInfo(0, 0)
    return { voidCount, voidWithMeshes, adjacencyPair, origin: { ...origin }, biomeVoid: w.biomeAt(14, 0), biomeSolid: w.biomeAt(2, 10), biomeOrigin: w.biomeAt(0, 0) }
  })
  test('S1a at least one void chunk in [-3..3]² (islands float in sky)', r.ok && r.value.voidCount >= 1,
    r.ok ? `voidCount=${r.value.voidCount}` : r.error)
  test('S1b every void chunk produces ZERO meshes (sceneChildCount === 0)', r.ok && r.value.voidWithMeshes === 0,
    r.ok ? `voidWithMeshes=${r.value.voidWithMeshes}` : r.error)
  test('S1c every void chunk is adjacent to a solid chunk (ragged island edge)', r.ok && r.value.adjacencyPair === true,
    r.ok ? JSON.stringify(r.value.voidCount) : r.error)
  test('S1d origin chunk solid; biomeAt: "void" on void tiles, "grass" on solid (2,10), origin pinned grass',
    r.ok && r.value.origin.tileCount > 0 && r.value.biomeVoid === 'void' && r.value.biomeSolid === 'grass' && r.value.biomeOrigin === 'grass',
    r.ok ? JSON.stringify(r.value) : r.error)
  test('S1e no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S2. Origin guarantees + generator determinism')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  const r = await evl(page, () => {
    const w = window.__debug.world
    const c0 = w.chunkData(0, 0)
    const originTile = c0.tiles.find(t => t.x === 0 && t.y === 0) || null
    const d1a = JSON.stringify(w.chunkData(1, 1))
    const d1b = JSON.stringify(w.chunkData(1, 1))
    const d2 = JSON.stringify(w.chunkData(2, 2))
    const d2b = JSON.stringify(w.chunkData(2, 2))
    const bA = w.biomeAt(5, 3)
    const bB = w.biomeAt(5, 3)
    return {
      originTile,
      chunk00Tiles: c0.tiles.length,
      detChunk11: d1a === d1b,
      detChunk22: d2 === d2b,
      biomeDet: bA === bB,
      chunk22Tiles: JSON.parse(d2).tiles.length,
    }
  })
  test('S2a origin tile (0,0) is pinned solid grass-plain', r.ok && r.value.originTile?.variant === 'grass-plain',
    r.ok ? JSON.stringify(r.value.originTile) : r.error)
  test('S2b chunk (0,0) is fully solid (spawn guarantee)', r.ok && r.value.chunk00Tiles === 64,
    r.ok ? `tiles=${r.value.chunk00Tiles}` : r.error)
  test('S2c chunkData is pure: identical output on re-generation ((1,1) and (2,2))',
    r.ok && r.value.detChunk11 && r.value.detChunk22, r.ok ? '' : r.error)
  test('S2d biomeAt is pure: identical biome on re-query', r.ok && r.value.biomeDet === true,
    r.ok ? '' : r.error)
  test('S2e no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S3. Stepping stones: sparse isolated connectors (3 seeds)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  const r = await evl(page, async () => {
    const w = window.__debug.world
    const isoCounts = []
    for (const seed of [1337, 777, 4242]) {
      // regenerate() rebuilds the world with the given seed — chunkData
      // below reflects THAT seed (the fixture's live world).
      await window.__debug.regenerate(seed)
      const solid = new Set()
      for (let cy = -4; cy <= 4; cy++) {
        for (let cx = -4; cx <= 4; cx++) {
          for (const t of w.chunkData(cx, cy).tiles) solid.add(`${t.x},${t.y}`)
        }
      }
      const iso = () => {
        let n = 0
        for (const key of solid) {
          const [x, y] = key.split(',').map(Number)
          if (!solid.has(`${x + 1},${y}`) && !solid.has(`${x - 1},${y}`) && !solid.has(`${x},${y + 1}`) && !solid.has(`${x},${y - 1}`)) {
            n++
          }
        }
        return n
      }
      const first = iso()
      const second = iso()
      isoCounts.push(first, second)
    }
    return isoCounts
  })
  const counts = r.ok ? r.value : []
  test('S3a isolated stepping-stone tiles exist (>= 2) for seeds 1337/777/4242',
    r.ok && counts[0] >= 2 && counts[2] >= 2 && counts[4] >= 2,
    r.ok ? `iso=[${counts[0]},${counts[2]},${counts[4]}]` : r.error)
  test('S3b stepping-stone field is deterministic (two scans, identical)',
    r.ok && counts[0] === counts[1] && counts[2] === counts[3] && counts[4] === counts[5],
    r.ok ? JSON.stringify(counts) : r.error)
  test('S3c no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S4. FOV tween refills the streaming queue (world shrinks at night)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const day = await evl(page, () => ({ count: window.__debug.world.loadedChunkCount, p: window.__debug.world.player }))
  const night = await evl(page, () => window.__debug.setState({ timeOfDay: 1320 }))
  await waitChunksDrained(page)
  const nightCount = await evl(page, () => window.__debug.world.loadedChunkCount)
  const dawn = await evl(page, () => window.__debug.setState({ timeOfDay: 330 }))
  await waitChunksDrained(page)
  const dawnCount = await evl(page, () => ({ count: window.__debug.world.loadedChunkCount, p: window.__debug.world.player }))
  // Same radius band (fov 7 dawn → 9 day): the count must NOT change (no
  // churn from the tween when no chunk boundary is crossed).
  const noon2 = await evl(page, () => window.__debug.setState({ timeOfDay: 720 }))
  await waitChunksDrained(page)
  const noon2Count = await evl(page, () => window.__debug.world.loadedChunkCount)
  const v = {
    day: day.ok ? day.value : null,
    night: nightCount.ok ? nightCount.value : null,
    dawn: dawnCount.ok ? dawnCount.value : null,
    noon2: noon2Count.ok ? noon2Count.value : null,
  }
  test('S4a day (fov 9) loads 20 solid chunks (all solid chunks within loadR 2)',
    day.ok && v.day?.count === 20, `count=${v.day?.count}`)
  test('S4b night (fov 5) unloads the day ring: 7 solid chunks (loadR 1)',
    nightCount.ok && v.night === 7, `count=${v.night}`)
  test('S4c dawn (fov 7) refills the queue WITHOUT moving the player: 20 solid chunks, player still (0,0)',
    dawnCount.ok && v.dawn?.count === 20 && v.dawn?.p?.x === 0 && v.dawn?.p?.y === 0,
    `count=${v.dawn?.count} player=${JSON.stringify(v.dawn?.p)}`)
  test('S4d night < dawn (the world genuinely shrinks at night, grows at dawn)',
    nightCount.ok && dawnCount.ok && v.night < v.dawn?.count, `${v.night} < ${v.dawn?.count}`)
  test('S4e noon again after dawn: count stable at 20 (no churn on radius-band changes)',
    noon2Count.ok && v.noon2 === 20 && v.noon2 === v.dawn?.count, `count=${v.noon2}`)
  test('S4f no page errors across the day/night cycle', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S5. Outline geometry dedupe across chunks (module-level cache)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const r = await evl(page, () => window.__debug.world.outlineGeometryReport(2))
  const v = r.ok ? r.value : null
  const byMask = new Map()
  const distinct = new Set()
  let entries = 0
  let sameMaskDiffUuid = 0
  for (const chunk of v || []) {
    for (const e of chunk.entries) {
      entries++
      distinct.add(e.uuid)
      const seen = byMask.get(e.mask) || new Set()
      seen.add(e.uuid)
      byMask.set(e.mask, seen)
    }
  }
  for (const uuids of byMask.values()) {
    if (uuids.size > 1) sameMaskDiffUuid++
  }
  test('S5a outline report covers multiple solid chunks (>= 6 of the 25)',
    r.ok && v && v.length >= 6, r.ok ? `chunks=${v?.length}` : r.error)
  test('S5b distinct outline geometry objects across all loaded chunks stays small (<= 16, far below the ~130 pre-fix count)',
    r.ok && distinct.size <= 16, r.ok ? `distinct=${distinct.size} entries=${entries}` : r.error)
  test('S5c identical masks in DIFFERENT chunks share ONE geometry object (UUID dedupe)',
    r.ok && sameMaskDiffUuid === 0, r.ok ? JSON.stringify([...byMask.entries()].map(([m, s]) => [m, [...s].length])) : r.error)
  test('S5d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S6. Mesh budget: per-chunk + world bounds (day vs night)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  await waitChunksDrained(page)
  const day = await evl(page, () => {
    const w = window.__debug.world
    let total = 0
    let maxChunk = 0
    let maxKey = ''
    let solidChunks = 0
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = w.chunkInfo(dx, dy)
        if (!c.tracked) continue
        total += c.sceneChildCount
        if (c.sceneChildCount > maxChunk) { maxChunk = c.sceneChildCount; maxKey = `${dx},${dy}` }
        if (c.tileCount > 0) solidChunks++
      }
    }
    return { total, maxChunk, maxKey, solidChunks }
  })
  await evl(page, () => window.__debug.setState({ timeOfDay: 1320 }))
  await waitChunksDrained(page)
  const night = await evl(page, () => {
    const w = window.__debug.world
    let total = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const c = w.chunkInfo(dx, dy)
      if (c.tracked) total += c.sceneChildCount
    }
    return total
  })
  const d = day.ok ? day.value : null
  test('S6a every solid chunk has <= 16 scene children (tiles + outlines + props)',
    day.ok && d && d.maxChunk <= 16, day.ok ? `max=${d?.maxChunk} at chunk (${d?.maxKey})` : day.error)
  test('S6b total world meshes bounded (<= 400) — was 900-1200 pre-fix',
    day.ok && d && d.total <= 400, day.ok ? `total=${d?.total}` : day.error)
  test('S6c night world uses fewer meshes than day (shrinking world)',
    day.ok && night.ok && night.value < d.total, day.ok && night.ok ? `${night.value} < ${d.total}` : (day.error || night.error))
  test('S6d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('S7. Shared hover listener + no page errors across the battery')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('slice-c-demo'))
  const r = await evl(page, () => {
    const w = window.__debug.world
    const fire = (type, clientX, clientY) =>
      document.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
    const p = w.projectTile(2, 2) // origin-chunk grass tile
    if (!p) return { projected: false }
    fire('pointermove', p.x, p.y)
    const hovered = w.lastHover
    fire('pointermove', 0, 0) // move off to open sky
    const cleared = w.lastHover
    return { projected: true, hovered, cleared }
  })
  test('S7a pointermove over a projected solid tile sets lastHover ({x,y,variant})',
    r.ok && r.value?.projected === true && r.value?.hovered?.x === 2 && r.value?.hovered?.y === 2 &&
    typeof r.value?.hovered?.variant === 'string',
    r.ok ? JSON.stringify(r.value) : r.error)
  test('S7b moving to open sky clears hover', r.ok && r.value?.cleared === null,
    r.ok ? JSON.stringify(r.value?.cleared) : r.error)
  test('S7c no page errors for the whole fix battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
let failed = 0
for (const s of results) for (const t of s.tests) if (!t.pass) failed++
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILURES'} — '${current?.section || ''}' battery done`)
console.log(JSON.stringify(results, null, 1))
process.exit(failed === 0 ? 0 : 1)
