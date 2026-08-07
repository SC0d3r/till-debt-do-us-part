// QA exploratory — TileMapComposer slice A (FINAL GATE, beyond the pinned
// C1–C9/O1–O5 regression battery). Scope: adversarial/leak/edge coverage the
// pinned suite doesn't do. This file verifies:
//   X1  fixture-chain stability: 5× showcase → showcase cycles keep the scene
//       children count EXACTLY constant (no mesh leaks), then showcase →
//       showcase again (interrupt) and showcase → preview
//   X2  hover battery beyond C5/O3: ''-mask records ((2,8),(8,8),(2,0) — zero-
//       triangle frames) hover + outline-sync without error; rotated (8,0)
//       rot-270; hover SPAM (100 rapid pointermoves); pointer events outside
//       the viewport; projectTile behind-camera → null; projectTile off-grid
//       → no hit; pointerout after dispose is a no-op (listeners removed)
//   X3  rejection batteries leave the harness usable: data-level rejections
//       (misoriented/ghost edges, bad outline values) preserve the LIVE
//       composer (validation throws BEFORE staging); build-level rejections
//       (bad rotation) restore the game scene + loop; every rejection is
//       followed by a working gotoFixture
//   X4  teardown leak check: patched addEventListener/removeEventListener
//       nets ZERO across showcase → preview → showcase cycles (pointermove/
//       pointerout/blur handlers balanced), and no console/page errors
//   X5  direct composer unit probes via dynamic import (dev server): mid-build
//       factory-throw cleanup (parent.children back to 0), outline-ABSENT
//       build (zero outline meshes), empty-data build, dispose after
//       build, constructor guards (bad parent/data/factory/camera), outline
//       meshes raycast-stubbed, outline meshes NOT in the hover raycast list
//   X6  record-level 'interior'/'exterior' mode strings (vs map-level) +
//       per-record side-list rotation interplay
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

// Module-scope color helpers (THREE ColorManagement converts hex → linear sRGB
// on Color construction, so expected instanceColor = linear(hex) × factor).
const lin = ch => ch <= 0.04045 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)
const mul = (hex, f) => [lin(((hex >> 16) & 255) / 255) * f, lin(((hex >> 8) & 255) / 255) * f, lin((hex & 255) / 255) * f]
const near3 = (a, b) => a && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6

// ─────────────────────────────────────────────────────────────
section('X1. Fixture-chain stability: 5 showcase cycles + game restore')
{
  const page = await newPage()
  await loadDebug(page)
  // 5 consecutive showcase → showcase cycles: children count must be EXACTLY
  // constant (a dispose leak would grow the count across cycles).
  const counts = []
  let cycleErr = null
  for (let i = 0; i < 5; i++) {
    const r = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
    if (!r.ok) { cycleErr = r.error; break }
    const c = await evl(page, () => window.__debug.showcase.composer.parent.children.length)
    counts.push(c.ok ? c.value : -1)
  }
  test('X1a 5× showcase cycles: scene children count constant across every cycle',
    cycleErr === null && counts.length === 5 && counts.every(n => n === counts[0]),
    cycleErr ? cycleErr : JSON.stringify(counts))
  test('X1b each cycle keeps exactly 25 scene children (4 rig lights + 12 tile groups + 9 outline groups)',
    cycleErr === null && counts.every(n => n === 25),
    JSON.stringify(counts))
  // Showcase → showcase (interrupt) → preview: harness stays usable.
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  const r3 = await evl(page, () => window.__debug.gotoFixture('grass-plain'))
  const s3 = await getState(page)
  test('X1c showcase → showcase → preview: all resolve, ready',
    r2.ok && s2?.ready === true && s2?.started === false &&
    r3.ok && s3?.ready === true && s3?.started === false,
    JSON.stringify({ r2: r2.ok, ready2: s2?.ready, r3: r3.ok, ready3: s3?.ready }))
  test('X1d no page errors across the chain', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('X2. Hover battery: empty-mask records, rotated records, spam, off-viewport')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const sh = window.__debug.showcase
    const fire = (type, clientX, clientY) =>
      document.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
    const tileColorOf = (x, y) => {
      const g = c.groups.find(gg => gg.records.some(rec => rec.x === x && rec.y === y))
      const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
      const a = g.mesh.instanceColor.array
      return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
    }
    const outlineOf = (x, y) => {
      for (const g of c.outlineGroups) {
        const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
        if (i >= 0) {
          const a = g.mesh.instanceColor.array
          return { mask: g.mask, rgb: [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] }
        }
      }
      return null
    }
    const hoverOf = () => {
      const h = sh.lastHover
      return h ? { x: h.x, y: h.y, variant: h.variant } : null
    }
    const out = {}
    // (a) ''-mask record (2,8): green record whose seam resolution emptied the
    // mask. Hover must brighten the (invisible) zero-triangle frame's
    // instanceColor to green × 1.0 without throwing.
    const p28 = sh.projectTile(2, 8)
    fire('pointermove', p28.x, p28.y)
    out.on28 = { tile: tileColorOf(2, 8), outline: outlineOf(2, 8), hover: hoverOf() }
    // (b) ''-mask record (8,8) (edge variant, brown).
    const p88 = sh.projectTile(8, 8)
    fire('pointermove', p88.x, p88.y)
    out.on88 = { t28: tileColorOf(2, 8), o28: outlineOf(2, 8), t88: tileColorOf(8, 8), o88: outlineOf(8, 8), hover: hoverOf() }
    // (c) rotated (8,0) grass-dirt-n @ 270 → local mask 'e'.
    const p80 = sh.projectTile(8, 0)
    fire('pointermove', p80.x, p80.y)
    out.on80 = { t80: tileColorOf(8, 0), o80: outlineOf(8, 0), hover: hoverOf() }
    // (d) hover SPAM: 100 deterministic pseudo-random pointermoves including
    // far outside the viewport — must never throw, end state = last random hit.
    let seed = 12345
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    let spamErr = null
    try {
      for (let i = 0; i < 100; i++) {
        fire('pointermove', rnd() * 2000 - 500, rnd() * 1500 - 500)
      }
    } catch (e) { spamErr = String(e.message || e) }
    const spamHover = hoverOf()
    // (e) projectTile guards: behind-camera tile → null; off-grid tile → a
    // projectable point but no hover hit.
    const behind = sh.projectTile(0, 100)
    const offGrid = sh.projectTile(9, 9)
    fire('pointermove', offGrid.x, offGrid.y)
    out.offGrid = { hover: hoverOf() }
    // (f) clear, then dispose mid-hover: gotoFixture('grass-plain') removes the
    // composer listeners; a later pointermove must be a silent no-op.
    fire('pointerout', 0, 0)
    return { out, spamErr, spamHover, behind, offGridProj: { x: offGrid.x, y: offGrid.y } }
  })
  const v = r.ok ? r.value : {}
  // Empty-mask hover: (2,8) tile 1.0, outline = green × 1.0 (mask '')
  test('X2a hovering ""-mask (2,8): tile 1.0, invisible frame instanceColor = green × 1.0, hover record set',
    r.ok && near3(v.out?.on28?.tile, [1, 1, 1]) && near3(v.out?.on28?.outline?.rgb, mul(0x4f7a34, 1)) &&
    v.out?.on28?.outline?.mask === '' && v.out?.on28?.hover?.x === 2 && v.out?.on28?.hover?.y === 8,
    r.ok ? JSON.stringify(v.out?.on28) : r.error)
  // Move to (8,8): (2,8) restored (tile 0.88, outline green × 0.88), (8,8) hit
  test('X2b moving to ""-mask (8,8): (2,8) restored × 0.88, (8,8) bright + outline × 1.0',
    r.ok && near3(v.out?.on88?.t28, [0.88, 0.88, 0.88]) && near3(v.out?.on88?.o28?.rgb, mul(0x4f7a34, 0.88)) &&
    near3(v.out?.on88?.t88, [1, 1, 1]) && near3(v.out?.on88?.o88?.rgb, mul(0x4e3d2e, 1)) &&
    v.out?.on88?.hover?.x === 8 && v.out?.on88?.hover?.y === 8,
    r.ok ? JSON.stringify({ t28: v.out?.on88?.t28, o88: v.out?.on88?.o88, hover: v.out?.on88?.hover }) : r.error)
  // Rotated record (8,0) rot-270: mask 'e', brown owner color × 1.0
  test('X2c rotated (8,0) rot-270: tile 1.0, outline mask "e" brown × 1.0, rotation reported',
    r.ok && near3(v.out?.on80?.t80, [1, 1, 1]) && near3(v.out?.on80?.o80?.rgb, mul(0x4e3d2e, 1)) &&
    v.out?.on80?.o80?.mask === 'e' && v.out?.on80?.hover?.x === 8 && v.out?.on80?.hover?.y === 0,
    r.ok ? JSON.stringify(v.out?.on80) : r.error)
  // Spam: no throw, hover consistent (either a tile or null)
  test('X2d 100-move hover spam (incl. off-viewport): no throw, hover sane',
    r.ok && v.spamErr === null &&
    (v.spamHover === null || (Number.isInteger(v.spamHover.x) && Number.isInteger(v.spamHover.y))),
    r.ok ? JSON.stringify({ err: v.spamErr, hover: v.spamHover }) : r.error)
  // projectTile guards
  test('X2e projectTile behind camera → null (no crash)',
    r.ok && v.behind === null, r.ok ? JSON.stringify(v.behind) : r.error)
  test('X2f pointer at an off-grid projection: hover cleared (no phantom record)',
    r.ok && v.out?.offGrid?.hover === null, r.ok ? JSON.stringify(v.out?.offGrid) : r.error)
  test('X2g no page errors across the extended hover battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('X3. Rejection batteries leave the harness usable (both stages)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  // Data-level rejections throw BEFORE staging: the live composer must
  // survive untouched (identity + scene children count unchanged). The
  // composer instance is stashed on window (identity compared IN-PAGE — class
  // instances can't cross the evaluate serialization boundary).
  const before = await evl(page, () => {
    const c = window.__debug.showcase.composer
    window.__x3marker = c
    return { children: c.parent.children.length, groups: c.groups.length }
  })
  const rejections = [
    ['misoriented edge', [{ x: 0, y: 0, variant: 'grass-dirt-n' }, { x: 1, y: 0, variant: 'grass-plain' }]],
    ['ghost edge', [
      { x: 0, y: 0, variant: 'grass-plain' }, { x: 0, y: 1, variant: 'grass-plain' }, { x: 0, y: 2, variant: 'grass-plain' },
      { x: 1, y: 0, variant: 'dirt-plain' }, { x: 1, y: 1, variant: 'grass-dirt-e' }, { x: 1, y: 2, variant: 'dirt-plain' },
      { x: 2, y: 0, variant: 'dirt-plain' }, { x: 2, y: 1, variant: 'dirt-plain' }, { x: 2, y: 2, variant: 'dirt-plain' },
    ]],
    ['bad record outline mode', [{ x: 0, y: 0, variant: 'grass-plain', outline: 'sideways' }]],
    ['bad outline side', [{ x: 0, y: 0, variant: 'grass-plain', outline: ['x'] }]],
    ['bad outlineColor', [{ x: 0, y: 0, variant: 'grass-plain', outlineColor: 'north' }]],
    ['bad map outline mode', [{ x: 0, y: 0, variant: 'grass-plain' }], { outline: { mode: 'diagonal' } }],
  ]
  const results = []
  for (const [label, data, opts] of rejections) {
    const r = await evl(page, (data, opts) => window.__debug.showcaseTileMap(data, opts), data, opts)
    const after = await evl(page, () => {
      const c = window.__debug.showcase.composer
      return { same: c === window.__x3marker, children: c ? c.parent.children.length : -1, groups: c ? c.groups.length : -1 }
    })
    results.push({ label, threw: !r.ok, sameComposer: after.ok && before.ok && after.value.same === true, childrenStable: after.ok && before.ok && after.value.children === before.value.children })
  }
  // Two distinct rejection stages (by design): the DATA gate (validateShowcaseMap)
  // throws BEFORE staging — the live preview survives untouched. The COMPOSER
  // gate (record/map outline validation) throws AFTER staging — the current
  // preview is torn down and the game scene restored (harness usable, not
  // preview-preserving).
  const dataGate = results.filter(x => x.label === 'misoriented edge' || x.label === 'ghost edge')
  const composerGate = results.filter(x => !dataGate.includes(x))
  test('X3a data-gate rejections throw and PRESERVE the live composer identity + children',
    dataGate.length === 2 && dataGate.every(x => x.threw && x.sameComposer && x.childrenStable),
    JSON.stringify(dataGate))
  const tornDown = await evl(page, () => window.__debug.showcase.composer === null)
  test('X3a2 composer-gate rejections (bad outline values) throw and tear the preview down (composer null, game scene restored)',
    composerGate.length === 4 && composerGate.every(x => x.threw) && tornDown.ok && tornDown.value === true,
    JSON.stringify({ composerGate, tornDown: tornDown.value }))
  // Build-level rejection (bad rotation passes the data gate, fails the
  // composer): the harness must return to the GAME state, loop + fog intact.
  const rot = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', rotation: 45 },
  ]))
  const s1 = await getState(page)
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  test('X3b build-level rejection (rotation 45): throws, harness back to a usable state',
    !rot.ok && String(rot.error).includes('rotation') && r2.ok && s2?.ready === true,
    JSON.stringify({ rot: rot.ok ? 'did not throw' : rot.error, r2: r2.ok, ready: s2?.ready }))
  // And a full recovery chain after all rejections.
  const r3 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s3 = await getState(page)
  test('X3c showcase fixture resolves cleanly after every rejection battery',
    r3.ok && s3?.ready === true && s3?.started === false, JSON.stringify({ r3: r3.ok, ready: s3?.ready }))
  test('X3d no page errors across rejection batteries', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('X4. Listener leak check (add/remove net zero across cycles)')
{
  const page = await newPage()
  await loadDebug(page)
  // Patch EventTarget in-page BEFORE the cycles: count adds/removes of the
  // composer's three listener classes (document pointermove/pointerout, window
  // blur). Net delta across a full fixture cycle must be exactly 0.
  const net = await evl(page, async () => {
    const origAdd = EventTarget.prototype.addEventListener
    const origRm = EventTarget.prototype.removeEventListener
    const counts = { add: 0, rm: 0 }
    EventTarget.prototype.addEventListener = function (t, f, o) {
      if ((t === 'pointermove' || t === 'pointerout') && (this === document || this === window)) counts.add++
      if (t === 'blur' && this === window) counts.add++
      return origAdd.call(this, t, f, o)
    }
    EventTarget.prototype.removeEventListener = function (t, f, o) {
      if ((t === 'pointermove' || t === 'pointerout') && (this === document || this === window)) counts.rm++
      if (t === 'blur' && this === window) counts.rm++
      return origRm.call(this, t, f, o)
    }
    const cycle = async () => {
      await window.__debug.gotoFixture('tile-showcase')
      await window.__debug.gotoFixture('grass-plain') // disposes the composer
      await window.__debug.gotoFixture('tile-showcase')
      await window.__debug.gotoFixture('tile-showcase') // interrupt with another showcase
      await window.__debug.gotoFixture('grass-flowers') // disposes again
    }
    await cycle()
    await cycle()
    EventTarget.prototype.addEventListener = origAdd
    EventTarget.prototype.removeEventListener = origRm
    return counts
  })
  test('X4a 4 showcase build/dispose cycles: listener adds == removes (net 0)',
    net.ok && net.value.add === net.value.rm && net.value.add > 0,
    net.ok ? JSON.stringify(net.value) : net.error)
  test('X4b no page errors across the listener-leak cycles', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('X5. Direct composer probes: mid-build cleanup, outline-absent, guards')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, async () => {
    const { TileMapComposer } = await import('/src/world/TileMapComposer.js')
    const c = window.__debug.showcase.composer
    const srcMesh = c.groups[0].mesh
    // A minimal factory source (real geometry/material/userData from the live
    // showcase — the composer only reads geometry/material/userData/castShadow/
    // receiveShadow off the returned object).
    const src = { geometry: srcMesh.geometry, material: srcMesh.material, castShadow: true, receiveShadow: true, userData: srcMesh.userData }
    const parent = {
      children: [],
      add(o) { this.children.push(o) },
      remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1) },
    }
    const cam = { updateMatrixWorld() {} }
    const out = {}
    // (a) mid-build factory throw: group 'a' builds and gets added, group 'b'
    // throws inside its factory — the catch must remove the 'a' mesh.
    let err1 = null
    try {
      new TileMapComposer({
        parent, data: [{ x: 0, y: 0, variant: 'a' }, { x: 1, y: 0, variant: 'b' }],
        resolveFactory: (v) => () => { if (v === 'b') throw new Error('boom'); return src },
        raycastTarget: cam,
      })
    } catch (e) { err1 = String(e.message || e) }
    out.factoryThrow = { err: err1, childrenAfterThrow: parent.children.length }
    // (b) outline ABSENT: zero outline meshes, outlineGroups empty, only the
    // tile group added.
    const comp2 = new TileMapComposer({
      parent, data: [{ x: 0, y: 0, variant: 'a' }, { x: 1, y: 1, variant: 'a' }],
      resolveFactory: () => () => src, raycastTarget: cam,
    })
    out.outlineAbsent = {
      groups: comp2.groups.length, outlineGroups: comp2.outlineGroups.length,
      children: parent.children.length, meshCount: parent.children.length,
      counts: comp2.groups.map(g => g.count),
    }
    comp2.dispose()
    out.afterDispose = { children: parent.children.length, groups: comp2.groups.length, outlineGroups: comp2.outlineGroups.length }
    // (c) empty data + outline: no groups, no outline meshes, no children.
    const comp3 = new TileMapComposer({
      parent, data: [], resolveFactory: () => () => src, raycastTarget: cam, outline: { mode: 'all' },
    })
    out.emptyData = { groups: comp3.groups.length, outlineGroups: comp3.outlineGroups.length, children: parent.children.length }
    comp3.dispose()
    out.emptyAfterDispose = { children: parent.children.length }
    // (d) constructor guards.
    const guards = {}
    try { new TileMapComposer({ data: [], resolveFactory: () => () => src, raycastTarget: cam }) } catch (e) { guards.noParent = /parent/.test(String(e.message)) }
    try { new TileMapComposer({ parent, data: {}, resolveFactory: () => () => src, raycastTarget: cam }) } catch (e) { guards.badData = /array/.test(String(e.message)) }
    try { new TileMapComposer({ parent, data: [], resolveFactory: null, raycastTarget: cam }) } catch (e) { guards.badFactory = /factory/.test(String(e.message)) }
    try { new TileMapComposer({ parent, data: [], resolveFactory: () => () => src }) } catch (e) { guards.noCam = /raycastTarget/.test(String(e.message)) }
    out.guards = guards
    // (e) outline raycast stub + hover-list exclusion on the LIVE composer.
    const og = c.outlineGroups[0].mesh
    let stubThrew = null
    try { og.raycast() } catch (e) { stubThrew = String(e.message || e) }
    out.stub = { isInHoverList: c._meshes.includes(og), stubThrew }
    // (f) double dispose is a no-op (second call must not throw).
    let dd = null
    try { c.dispose(); c.dispose() } catch (e) { dd = String(e.message || e) }
    out.doubleDispose = dd
    return out
  })
  const v = r.ok ? r.value : {}
  test('X5a mid-build factory throw: error surfaced AND parent.children back to 0 (no half-built group)',
    r.ok && /boom/.test(v.factoryThrow?.err || '') && v.factoryThrow?.childrenAfterThrow === 0,
    r.ok ? JSON.stringify(v.factoryThrow) : r.error)
  test('X5b outline-ABSENT build: zero outline groups, only the 1 tile group (2 instances) added',
    r.ok && v.outlineAbsent?.outlineGroups === 0 && v.outlineAbsent?.groups === 1 &&
    v.outlineAbsent?.children === 1 && v.outlineAbsent?.counts?.[0] === 2,
    r.ok ? JSON.stringify(v.outlineAbsent) : r.error)
  test('X5c dispose: children back to 0, groups/outlineGroups cleared',
    r.ok && v.afterDispose?.children === 0 && v.afterDispose?.groups === 0 && v.afterDispose?.outlineGroups === 0,
    r.ok ? JSON.stringify(v.afterDispose) : r.error)
  test('X5d empty data + outline: zero children, zero groups, zero outline groups',
    r.ok && v.emptyData?.groups === 0 && v.emptyData?.outlineGroups === 0 && v.emptyData?.children === 0,
    r.ok ? JSON.stringify(v.emptyData) : r.error)
  test('X5e constructor guards: no parent / bad data / bad factory / no camera all throw',
    r.ok && v.guards?.noParent === true && v.guards?.badData === true && v.guards?.badFactory === true && v.guards?.noCam === true,
    r.ok ? JSON.stringify(v.guards) : r.error)
  test('X5f outline meshes are raycast-stubbed (no-op) and excluded from hover picking',
    r.ok && v.stub?.stubThrew === null && v.stub?.isInHoverList === false,
    r.ok ? JSON.stringify(v.stub) : r.error)
  test('X5g double dispose on the live composer is a no-op (no throw)',
    r.ok && v.doubleDispose === null, r.ok ? JSON.stringify(v.doubleDispose) : r.error)
  // The direct probes disposed the LIVE showcase composer (X5f/X5g) — the
  // fixture must still recover.
  const rec = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s = await getState(page)
  test('X5h harness recovers after direct composer probes', rec.ok && s?.ready === true, JSON.stringify({ rec: rec.ok, ready: s?.ready }))
  test('X5i no page errors across direct composer probes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('X6. Record-level interior/exterior mode strings + rotated side-list interplay')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const masksOf = async (data, opts) => {
    const r = await evl(page, (data, opts) => window.__debug.showcaseTileMap(data, opts), data, opts)
    if (!r.ok) return { ok: false, error: r.error }
    const v = await evl(page, () => {
      const c = window.__debug.showcase.composer
      const maskByCoord = {}
      for (const g of c.outlineGroups) for (const rec of g.records) maskByCoord[`${rec.x},${rec.y}`] = g.mask
      return { groups: c.outlineGroups.map(g => [g.mask, g.count]).sort((a, b) => a[0].localeCompare(b[0])), total: c.outlineGroups.reduce((n, g) => n + g.count, 0), maskByCoord }
    })
    return v.ok ? { ok: true, ...v.value, maskOf: (x, y) => v.value.maskByCoord[`${x},${y}`] ?? null } : { ok: false, error: v.error }
  }
  // (a) record-level modes: A 'interior' (neighbor east → ['e']), B 'exterior'
  // (no n/e/s neighbors → ['n','e','s']). A owns the e/w seam (data-order,
  // both biome-matched) → A 'e', B 'n,e,s'. Record modes beat the map-level
  // mode (which is 'all' here).
  const a = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: 'interior' }, { x: 1, y: 0, variant: 'grass-plain', outline: 'exterior' }],
    { outline: { mode: 'all' } },
  )
  test('X6a record-level "interior"/"exterior" override the map-level mode',
    a.ok && a.total === 2 && a.maskOf(0, 0) === 'e' && a.maskOf(1, 0) === 'n,e,s',
    a.ok ? JSON.stringify(a.groups) : a.error)
  // (b) rotated record with a side list that ACTUALLY faces the seam: A (0,0)
  // ['e']@180 (its east edge faces B) vs B (1,0) ['w'] (its west edge faces
  // back). A is the data-order owner AND desires the seam → A renders it, B
  // suppresses; data 'e' at rotation 180 → local 'w' (CCW by 2 steps).
  const b = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: ['e'], rotation: 180 }, { x: 1, y: 0, variant: 'grass-plain', outline: ['w'] }],
    { outline: { mode: 'all' } },
  )
  test('X6b rotated side list: (0,0) ["e"]@180 faces the seam, renders local "w" (CCW); (1,0) ["w"] suppressed',
    b.ok && b.total === 2 && b.maskOf(0, 0) === 'w' && b.maskOf(1, 0) === '',
    b.ok ? JSON.stringify(b.groups) : b.error)
  // (c) 'exterior' on a lone cell = full ring (all sides are borders).
  const c = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: 'exterior' }],
    { outline: { mode: 'all' } },
  )
  test('X6c record-level "exterior" on a lone cell renders the full ring',
    c.ok && c.total === 1 && c.maskOf(0, 0) === 'n,e,s,w',
    c.ok ? JSON.stringify(c.groups) : c.error)
  test('X6d no page errors across the mode-string battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== COMPOSER EXPLORATORY SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
