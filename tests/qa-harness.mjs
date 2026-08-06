// QA driver — DEBUG_HARNESS Part A (resume after interrupted attempts; current fix round).
// Drives window.__debug for preconditions+assertions; real input for interactions.
// Environment notes baked in:
//  - This box runs headless Chrome at ~1fps (software rendering + load): the morning-buyer
//    walk is frame-dt bound (~82 frames ≈ 82s wall) → D3 uses a 240s budget.
//  - Overlay ground truth is getComputedStyle() in-page; getState's *_OverlayVisible flags
//    read INLINE style (CSS-hidden overlays report "visible" — a documented harness gap).
//  - Crops spoil when unwatered: growth tests water each day before fastForward.
// CI-friendly: CHROME_PATH/BASE_URL come from the GitHub Actions workflow
// (scripts/run-ci-puppeteer.sh --tests=...); local runs fall back to the old
// defaults. PUPPETEER_BUNDLED=1 switches to the `puppeteer` package's bundled
// Chromium (one of the browser provisioning options in DEBUG_HARNESS.md Part E).
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
const URL_PLAIN = BASE + '/'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const results = []
let current = null
const QA_ONLY = (process.env.QA_ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
function section(name) {
  if (QA_ONLY.length && !QA_ONLY.some(letter => name.startsWith(letter + '.'))) return
  current = { section: name, tests: [] }; results.push(current)
}
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

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
async function setState(page, partial) { return evl(page, p => window.__debug.setState(p), partial) }
async function getState(page) { const r = await evl(page, () => window.__debug.getState()); return r.ok ? r.value : null }
async function expectThrows(page, fn, pattern, label) {
  const r = await evl(page, fn)
  test(label, !r.ok && String(r.error).includes(pattern), r.ok ? `did not throw (got ${JSON.stringify(r.value)?.slice(0, 80)})` : r.error)
}
async function pollUntil(page, fn, deadlineMs, label) {
  const deadline = Date.now() + deadlineMs
  let last = null
  while (Date.now() < deadline) {
    last = await evl(page, fn)
    if (last.ok && last.value) return { hit: true, last }
    // Fast mode: game state responds in well under 200ms, so a 200ms poll
    // cadence keeps suite runtime down without racing the state.
    await sleep(200)
  }
  return { hit: false, last }
}

// Pinned-clock rule (both suites share it): where the intent is "same
// time-of-day region" (e.g. a fixture pinned 22:00 and the live clock keeps
// advancing), compare with modular distance — strict non-modular compare is
// reserved for "exactly this elapsed interval" intents.
const modDist = (a, b) => Math.min((a - b + 1440) % 1440, (b - a + 1440) % 1440)
const pinNear = (tod, pin, margin) => Number.isFinite(tod) && modDist(tod, pin) <= margin

const FIXTURES = ['main-menu', 'farm-day', 'farm-crops-grown', 'shop-open', 'inventory-open', 'dialogue-open', 'mine-floor-1', 'slot-machine', 'farm-night']
const DEFAULT_INV = [['hoe', 1], ['water', 1], ['pickaxe', 1], ['axe', 1], ['shovel', 1], ['seed_turnip', 5], ['seed_potato', 3]]
function invMatches(s, expected) {
  const arr = s.player.inventory.slice(0, expected.length)
  return expected.every(([id, count], i) => { const e = arr[i]; return e && e.id === id && e.count === count })
    && s.player.inventory.slice(expected.length).every(x => x === null)
}

// ─────────────────────────────────────────────────────────────
section('A. API surface & validation (fresh ?debug=1 page)')
{
  const page = await newPage()
  await loadDebug(page)
  const surf = await evl(page, () => {
    const d = window.__debug
    return { ready: typeof d.ready, setState: typeof d.setState, getState: typeof d.getState,
      gotoFixture: typeof d.gotoFixture, fastForward: typeof d.fastForward,
      triggerEvent: typeof d.triggerEvent, listFixtures: typeof d.listFixtures }
  })
  test('A1 __debug exposes ready/setState/getState/gotoFixture/fastForward/triggerEvent/listFixtures',
    surf.ok && surf.value.ready === 'boolean' && ['setState', 'getState', 'gotoFixture', 'fastForward', 'triggerEvent', 'listFixtures'].every(k => surf.value[k] === 'function'),
    JSON.stringify(surf.value))
  const lf = await evl(page, () => window.__debug.listFixtures())
  // Tile-kit grass family (2026-08-06) added 13 asset-preview fixtures; the
  // TileMapComposer showcase (2026-08-06) added 1 showcase fixture. The
  // registry is now 23 names = the 9 gameplay fixtures + 13 previews + 1
  // showcase.
  const PREVIEW_FIXTURES = [
    'grass-plain', 'grass-flowers', 'grass-bushes',
    'grass-dirt-n', 'grass-dirt-e', 'grass-dirt-s', 'grass-dirt-w',
    'grass-tilled', 'grass-tilled-n', 'grass-tilled-e', 'grass-tilled-s', 'grass-tilled-w',
    'dirt-plain',
  ]
  test('A2 listFixtures returns the 9 gameplay + 13 asset-preview + 1 showcase registry names',
    lf.ok && lf.value.length === 23 &&
    FIXTURES.every(n => lf.value.some(f => f.name === n)) &&
    PREVIEW_FIXTURES.every(n => lf.value.some(f => f.name === n)) &&
    lf.value.some(f => f.name === 'tile-showcase' && f.category === 'showcase') &&
    lf.value.filter(f => f.category === 'asset-preview').length === 13 &&
    new Set(lf.value.map(f => f.name)).size === 23,
    lf.ok ? `${lf.value.length} names; asset-preview=${lf.value.filter(f => f.category === 'asset-preview').length}; showcase=${lf.value.filter(f => f.category === 'showcase').length}` : lf.error)

  await expectThrows(page, () => window.__debug.setState({ bogus: 1 }), 'unknown key', 'A3 setState unknown top-level key throws')
  await expectThrows(page, () => window.__debug.setState({ player: { bogus: 1 } }), 'unknown player key', 'A4 setState unknown player key throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: {} } }), 'farm is not created yet', 'A5 setState farm before start throws')
  await expectThrows(page, () => window.__debug.setState({ mine: { floor: 99 } }), 'out of range', 'A6 mine.floor 99 throws')
  await expectThrows(page, () => window.__debug.setState({ mine: { floor: -1 } }), 'out of range', 'A7 mine.floor -1 throws')
  await expectThrows(page, () => window.__debug.setState({ started: false }), 'started=false is not supported', 'A8 started=false throws')
  await expectThrows(page, () => window.__debug.setState({ player: { inventory: 'nope' } }), 'must be an array', 'A9 inventory non-array throws')
  await expectThrows(page, () => window.__debug.setState({ player: { inventory: [{ id: 5, count: 1 }] } }), 'must be null or {id: string, count: number}', 'A10 inventory bad entry throws')
  await expectThrows(page, () => window.__debug.setState({ player: { inventory: new Array(17).fill(null) } }), 'exceeds 16', 'A11 inventory length 17 throws')
  await expectThrows(page, () => window.__debug.triggerEvent('bogus'), 'unknown event', 'A12 triggerEvent unknown event throws')
  await expectThrows(page, () => window.__debug.gotoFixture('bogus'), 'unknown fixture', 'A13 gotoFixture unknown fixture throws')
  await expectThrows(page, () => window.__debug.fastForward(1), 'game not started', 'A14 fastForward before start throws')
  await expectThrows(page, () => window.__debug.fastForward(-1), 'non-negative', 'A15 fastForward negative throws')
  await expectThrows(page, () => window.__debug.fastForward('x'), 'non-negative', 'A16 fastForward string throws')
  await expectThrows(page, () => window.__debug.setState({ player: { gold: 'abc' } }), 'finite number', 'A17 player.gold string throws')
  await expectThrows(page, () => window.__debug.setState({ player: { stamina: NaN } }), 'finite number', 'A18 player.stamina NaN throws')

  await evl(page, () => window.__debug.setState({ started: true }))
  await expectThrows(page, () => window.__debug.setState({ farm: { bogus: 1 } }), 'unknown farm key', 'A19 setState unknown farm key throws')
  await expectThrows(page, () => window.__debug.setState({ ui: { bogus: 1 } }), 'unknown ui key', 'A20 setState unknown ui key throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: { '7,5': { bogus: 1 } } } }), 'unknown farm.tiles', 'A21 setState unknown farm.tiles key throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: { 'abc,5': { type: 1 } } } }), 'not "x,z"', 'A22 setState bad tile key throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: { '99,99': { type: 1 } } } }), 'out of bounds', 'A23 setState out-of-bounds tile throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: { '7,5': { type: 'BOGUS' } } } }), 'unknown tile type name', 'A24 setState bad tile enum name throws')
  await expectThrows(page, () => window.__debug.setState({ farm: { tiles: { '7,5': { type: 99 } } } }), 'unknown tile type number', 'A25 setState bad tile enum number throws')
  await expectThrows(page, () => window.__debug.setState({ ui: { dialogue: 'hi' } }), 'must be {speaker, text} or null', 'A26 setState ui.dialogue bad type throws')
  // Known validation gaps (probes — expected to FAIL, reported as findings)
  const gap1 = await evl(page, () => window.__debug.setState({ mine: { bogus: 5 } }))
  test('A27 setState unknown mine key throws (GAP probe)', !gap1.ok, gap1.ok ? 'silently accepted' : gap1.error)
  const gap2 = await evl(page, () => window.__debug.setState({ position: { bogus: 5 } }))
  test('A28 setState unknown position key throws (GAP probe)', !gap2.ok, gap2.ok ? 'silently accepted' : gap2.error)
  const gap3 = await evl(page, () => window.__debug.setState({ player: { selectedSlot: 99 } }))
  const g3s = gap3.ok ? await getState(page) : null
  test('A29 selectedSlot out of range rejected (GAP probe)', !gap3.ok || g3s?.player.selectedSlot !== 99,
    gap3.ok ? `accepted selectedSlot=99 (game reports ${g3s?.player.selectedSlot})` : gap3.error)
  await evl(page, () => window.__debug.setState({ player: { selectedSlot: 0 } }))
  test('A30 no page errors during validation battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('B. setState/getState round-trip')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.setState({ started: true, player: { introSeen: true } }))
  const b1 = await evl(page, () => window.__debug.setState({ player: { gold: 1234, debt: 250, day: 7, stamina: 42, waterLevel: 3, selectedSlot: 4 } }))
  const s1 = await getState(page)
  test('B1 player scalars round-trip', b1.ok && s1 && s1.player.gold === 1234 && s1.player.debt === 250 && s1.player.day === 7 && s1.player.stamina === 42 && s1.player.waterLevel === 3 && s1.player.selectedSlot === 4, JSON.stringify(s1?.player))

  const b2 = await evl(page, () => window.__debug.setState({ player: { inventory: [{ id: 'turnip', count: 3 }, { id: 'hoe', count: 2 }] } }))
  const s2 = await getState(page)
  test('B2 inventory round-trip (padded to 16)', b2.ok && s2 && s2.player.inventory.length === 16 && s2.player.inventory[0]?.id === 'turnip' && s2.player.inventory[0]?.count === 3 && s2.player.inventory[1]?.id === 'hoe' && s2.player.inventory[1]?.count === 2 && s2.player.inventory[2] === null, JSON.stringify(s2?.player.inventory?.slice(0, 3)))

  const b3 = await evl(page, () => window.__debug.setState({ farm: { tiles: { '5,5': { type: 2, cropId: 'turnip', growthDay: 1, watered: false }, '6,5': { type: 'WATERED', watered: true, treeAge: 1 } } } }))
  const s3 = await getState(page)
  test('B3 farm tiles round-trip (number + enum name)', b3.ok && s3?.farm?.tiles?.[5]?.[5]?.type === 2 && s3?.farm?.tiles?.[5]?.[5]?.cropId === 'turnip' && s3?.farm?.tiles?.[5]?.[5]?.growthDay === 1 && s3?.farm?.tiles?.[6]?.[5]?.type === 3 && s3?.farm?.tiles?.[6]?.[5]?.watered === true && s3?.farm?.tiles?.[6]?.[5]?.treeAge === 1, `t5,5=${JSON.stringify(s3?.farm?.tiles?.[5]?.[5])} t6,5=${JSON.stringify(s3?.farm?.tiles?.[6]?.[5])}`)

  const b4 = await evl(page, () => window.__debug.setState({ position: { x: 3.5, z: 7.25 } }))
  const s4 = await getState(page)
  test('B4 position round-trip', b4.ok && s4 && Math.abs(s4.position.x - 3.5) < 0.001 && Math.abs(s4.position.z - 7.25) < 0.001, JSON.stringify(s4?.position))

  const b5 = await evl(page, () => window.__debug.setState({ position: { x: -50, z: 999 } }))
  const s5 = await getState(page)
  test('B5 position clamped to farm bounds (0.2..15.2 / 0.2..11.2)', b5.ok && s5 && s5.position.x === 0.2 && s5.position.z === 11.2, JSON.stringify(s5?.position))

  const b6 = await evl(page, () => window.__debug.setState({ mine: { inMine: true, floor: 2, digsLeft: 9 } }))
  const s6 = await getState(page)
  test('B6 mine inMine/floor/digsLeft round-trip', b6.ok && s6 && s6.inMine === true && s6.mine.currentFloor === 2 && s6.mine.digsLeft === 9, JSON.stringify({ inMine: s6?.inMine, mine: s6?.mine }))
  const b6b = await evl(page, () => window.__debug.setState({ mine: { inMine: false } }))
  const s6b = await getState(page)
  test('B6b mine exit round-trip', b6b.ok && s6b && s6b.inMine === false, JSON.stringify({ inMine: s6b?.inMine }))
  const b6c = await evl(page, () => window.__debug.setState({ mine: { floor: 5 } }))
  const s6c = await getState(page)
  test('B6c mine.floor set while not in mine has no effect', b6c.ok && s6c?.mine.currentFloor !== 5, b6c.ok ? `floor now ${s6c?.mine.currentFloor}` : b6c.error)

  await evl(page, () => window.__debug.setState({ ui: { shopOpen: true } }))
  const s7a = await getState(page)
  test('B7a ui.shopOpen round-trip', s7a?.ui.shopOpen === true, JSON.stringify(s7a?.ui))
  await evl(page, () => window.__debug.setState({ ui: { shopOpen: false, inventoryOpen: true } }))
  const s7b = await getState(page)
  test('B7b ui.inventoryOpen round-trip', s7b?.ui.shopOpen === false && s7b?.ui.inventoryOpen === true, JSON.stringify(s7b?.ui))
  await evl(page, () => window.__debug.setState({ ui: { inventoryOpen: false, dialogue: { speaker: 'Marnie', text: 'Hello farmer' } } }))
  const s7c = await getState(page)
  test('B7c ui.dialogue round-trip', s7c?.ui.dialogueActive === true && s7c?.dialogue.speaker === 'Marnie' && s7c?.dialogue.text === 'Hello farmer', JSON.stringify(s7c?.dialogue))
  await evl(page, () => window.__debug.setState({ ui: { dialogue: null } }))
  const s7d = await getState(page)
  test('B7d ui.dialogue close round-trip', s7d?.ui.dialogueActive === false, JSON.stringify(s7d?.ui))
  await evl(page, () => window.__debug.setState({ ui: { slotOpen: true } }))
  const s7e = await getState(page)
  test('B7e ui.slotOpen round-trip (scene switches to slot)', s7e?.slotOpen === true && s7e?.scene === 'slot', JSON.stringify({ slotOpen: s7e?.slotOpen, scene: s7e?.scene }))
  await evl(page, () => window.__debug.setState({ ui: { slotOpen: false } }))
  const s7f = await getState(page)
  test('B7f ui.slotOpen close round-trip', s7f?.slotOpen === false, JSON.stringify(s7f?.slotOpen))

  const before = await getState(page)
  before.player.inventory[0] = { id: 'HACKED', count: 999 }
  before.player.toolDurability.hoe = 0
  before.farm.tiles[5][5].cropId = 'HACKEDCROP'
  before.farm.tiles[5][5].type = 9
  before.farm.binItems.push({ id: 'HACKED', count: 9 })
  before.player.gold = 1
  before.mine.digsLeft = 0
  const after = await getState(page)
  test('B8 getState returns deep copy (mutation does not leak into game state)',
    after.player.gold === 1234 && after.player.inventory[0]?.id === 'turnip' && after.player.inventory[0]?.count === 3 && after.player.toolDurability.hoe !== 0 &&
    after.farm.tiles[5][5].cropId === 'turnip' && after.farm.tiles[5][5].type === 2 && after.farm.binItems.length === 0 && after.mine.digsLeft === 9,
    JSON.stringify({ gold: after.player.gold, inv0: after.player.inventory[0], hoe: after.player.toolDurability.hoe, t55: after.farm?.tiles?.[5]?.[5], bin: after.farm?.binItems, digs: after.mine.digsLeft }))
  test('B9 no page errors during round-trip battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C. fastForward')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.setState({ started: true, player: { day: 1, stamina: 30, introSeen: true, grimesFirstSeen: true, debtPaid: true } }))
  const c1 = await evl(page, () => window.__debug.fastForward(3))
  const s1 = await getState(page)
  test('C1 fastForward(3) advances day to 4 and restores stamina to 100', c1.ok && s1.player.day === 4 && s1.player.stamina === 100, JSON.stringify({ day: s1?.player.day, stamina: s1?.player.stamina }))

  await evl(page, () => window.__debug.setState({ farm: { tiles: { '5,5': { type: 'TILLED', cropId: 'turnip', growthDay: 0, watered: false } } } }))
  await evl(page, () => window.__debug.fastForward(1))
  const s2 = await getState(page)
  test('C2 unwatered crop spoils overnight (cropId null, tile stays TILLED)', s2.farm.tiles[5][5].cropId === null && s2.farm.tiles[5][5].type === 2, JSON.stringify(s2.farm.tiles[5][5]))

  await evl(page, () => window.__debug.setState({ farm: { tiles: { '6,5': { type: 'WATERED', cropId: 'turnip', growthDay: 0, watered: true } } } }))
  await evl(page, () => window.__debug.fastForward(1))
  const s3 = await getState(page)
  test('C3 watered crop grows to growthDay 1 and unwaters overnight', s3.farm.tiles[6][5].growthDay === 1 && s3.farm.tiles[6][5].watered === false, JSON.stringify(s3.farm.tiles[6][5]))

  // C4: full turnip growth (3 days) — must re-water each day (unwatered spoils)
  await evl(page, () => window.__debug.setState({ farm: { tiles: { '7,5': { type: 'WATERED', cropId: 'turnip', growthDay: 0, watered: true } } } }))
  for (let i = 0; i < 3; i++) {
    await evl(page, () => window.__debug.fastForward(1))
    if (i < 2) await evl(page, () => window.__debug.setState({ farm: { tiles: { '7,5': { watered: true } } } }))
  }
  const s4 = await getState(page)
  test('C4 watered-each-day + fastForward(3) reaches growthDay == growthDays (3)', s4.farm.tiles[7][5].growthDay === 3 && s4.farm.tiles[7][5].cropId === 'turnip', JSON.stringify(s4.farm.tiles[7][5]))

  const c5 = await evl(page, () => window.__debug.fastForward(0))
  const s5 = await getState(page)
  test('C5 fastForward(0) resolves without changing day', c5.ok && s5.player.day === 9, JSON.stringify({ day: s5?.player.day }))

  await evl(page, () => window.__debug.setState({ ui: { shopOpen: true, inventoryOpen: true, dialogue: { speaker: 'X', text: 'Y' } }, mine: { inMine: true } }))
  const c6 = await evl(page, () => window.__debug.fastForward(1))
  const s6 = await getState(page)
  test('C6 fastForward exits mine and closes all overlays first', c6.ok && s6.inMine === false && s6.ui.shopOpen === false && s6.ui.inventoryOpen === false && s6.ui.dialogueActive === false && s6.player.day === 10, JSON.stringify({ inMine: s6?.inMine, ui: s6?.ui, day: s6?.player.day }))
  test('C7 no page errors during fastForward battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('D. triggerEvent')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.setState({ started: true, player: { introSeen: true } }))

  await evl(page, () => window.__debug.setState({ farm: { tiles: { '5,5': { type: 'WATERED', cropId: 'turnip', growthDay: 0, watered: true } } } }))
  const d1 = await evl(page, () => window.__debug.triggerEvent('cropMatured', { x: 5, z: 5 }))
  const s1 = await getState(page)
  test('D1 cropMatured jumps growthDay to growthDays (3)', d1.ok && s1.farm.tiles[5][5].growthDay === 3, JSON.stringify(s1?.farm?.tiles?.[5]?.[5]))
  const meshProbe = await evl(page, () => window.__debug.getState().farm.tiles[5][5])
  test('D1b cropMatured tile remains planted and ripe', meshProbe.ok && meshProbe.value.growthDay === 3 && meshProbe.value.cropId === 'turnip', JSON.stringify(meshProbe.value))
  await expectThrows(page, () => window.__debug.triggerEvent('cropMatured', { x: 5, z: 6 }), 'no crop planted', 'D1c cropMatured on empty tile throws')
  await expectThrows(page, () => window.__debug.triggerEvent('cropMatured', { x: 99, z: 99 }), 'no tile at', 'D1d cropMatured out of bounds throws')
  await expectThrows(page, () => window.__debug.triggerEvent('cropMatured', {}), 'finite number', 'D1e cropMatured missing payload throws')

  const d2 = await evl(page, () => window.__debug.triggerEvent('toolBroke', { toolId: 'hoe' }))
  const s2 = await getState(page)
  test('D2 toolBroke sets durability 0 and opens tool_broken dialogue', d2.ok && s2.player.toolDurability.hoe === 0 && s2.ui.dialogueActive === true && s2.dialogue.speaker.length > 0 && s2.dialogue.text.length > 0, JSON.stringify({ hoe: s2?.player.toolDurability?.hoe, dialogue: s2?.dialogue }))
  await expectThrows(page, () => window.__debug.triggerEvent('toolBroke', { toolId: 'sword' }), 'unknown tool', 'D2b toolBroke unknown tool throws')
  await expectThrows(page, () => window.__debug.triggerEvent('toolBroke', {}), 'toolBroke.toolId', 'D2c toolBroke missing toolId throws')
  await evl(page, () => window.__debug.setState({ ui: { dialogue: null } }))

  // D3: buyerArrives — bin cleared at trigger; NPC walks to bin (frame-dt bound → ~82s at 1fps),
  // overlay shows on arrival; gold credited by wall-clock count-up timer.
  const goldBefore = (await getState(page)).player.gold
  const d3 = await evl(page, () => window.__debug.triggerEvent('buyerArrives', { items: [{ id: 'turnip', count: 3 }] }))
  const s3a = await getState(page)
  test('D3 buyerArrives clears bin synchronously (clearBin on trigger)', d3.ok && s3a.farm.binItems.length === 0, JSON.stringify(s3a?.farm?.binItems))
  const saw = await pollUntil(page, () => {
    const s = window.__debug.getState()
    return s.ui.paymentOverlayVisible && s.player.gold >= 235
  }, 240000)
  const s3b = await getState(page)
  test('D3b payment overlay appears and gold credited (3 turnips × 45g = 135)',
    saw.hit && s3b.player.gold === goldBefore + 135,
    saw.hit ? `gold=${s3b?.player?.gold} expected=${goldBefore + 135} overlay=${s3b?.ui?.paymentOverlayVisible}` : `timed out 240s; last overlay=${saw.last?.value?.ui?.paymentOverlayVisible ?? 'n/a'} gold=${saw.last?.value?.player?.gold ?? 'n/a'}`)
  // counting phase lasts 3 game-seconds (~60s wall at 1fps) then overlay hides
  const hid = await pollUntil(page, () => window.__debug.getState().ui.paymentOverlayVisible === false, 240000)
  const s3c = await getState(page)
  test('D3c counting ends: overlay hides, gold persists at 235', hid.hit && s3c.player.gold === goldBefore + 135 && s3c.farm.binItems.length === 0,
    hid.hit ? JSON.stringify({ gold: s3c?.player?.gold, overlay: s3c?.ui?.paymentOverlayVisible, bin: s3c?.farm?.binItems?.length }) : 'timed out waiting for overlay hide')

  const d4 = await evl(page, () => window.__debug.triggerEvent('buyerArrives', { items: [] }))
  await sleep(1500)
  const s4 = await getState(page)
  test('D4 buyerArrives with empty items is a no-op (no overlay)', d4.ok && s4.ui.paymentOverlayVisible === false, JSON.stringify(s4?.ui))
  await expectThrows(page, () => window.__debug.triggerEvent('buyerArrives', { items: 'x' }), 'buyerArrives.items must be an array', 'D4b buyerArrives bad items throws')
  test('D5 no page errors during triggerEvent battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('E. Fixture determinism & leak prevention (one page, two shuffled passes)')
{
  const page = await newPage()
  await loadDebug(page)
  // deterministic shuffle (seeded) for reproducibility
  const order = []
  {
    let seed = 42
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const arr = [...FIXTURES]
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
    order.push(...arr)
    seed = 1337
    const arr2 = [...FIXTURES]
    for (let i = arr2.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr2[i], arr2[j]] = [arr2[j], arr2[i]] }
    order.push(...arr2)
  }
  const canvasCount = await evl(page, () => document.querySelectorAll('canvas').length)
  test('E0 exactly one canvas element on the debug page', canvasCount.ok && canvasCount.value === 1, String(canvasCount.value))

  let pass = 1
  for (const fname of order) {
    const r = await evl(page, n => window.__debug.gotoFixture(n), fname)
    if (!r.ok) { test(`E${pass} fixture "${fname}"`, false, 'gotoFixture error: ' + r.error); continue }
    const s = await getState(page)
    const dom = await evl(page, () => {
      const vis = id => { const el = document.getElementById(id); return el ? getComputedStyle(el).display !== 'none' : null }
      return { payment: vis('payment-overlay'), pause: vis('pause-overlay'), start: vis('start-overlay'), slot: vis('slot-screen') }
    })
    const checks = {}
    checks.gold = s.player.gold === 100
    checks.day = s.player.day === 1
    checks.stamina = s.player.stamina === 100
    checks.inventory = invMatches(s, DEFAULT_INV)
    checks.noPaymentDOM = dom.ok && dom.value.payment === false
    checks.noPauseDOM = dom.ok && dom.value.pause === false
    checks.noSlotDOM = dom.ok && dom.value.slot === false
    checks.lsWiped = false
    if (fname === 'main-menu') {
      checks.started = s.started === false
      checks.startOverlay = s.ui.startOverlayVisible === true && dom.ok && dom.value.start === true
    } else {
      checks.started = s.started === true
      checks.startOverlay = s.ui.startOverlayVisible === false && dom.ok && dom.value.start === false
    }
    if (fname === 'mine-floor-1') checks.inMine = s.inMine === true && s.mine.currentFloor === 0 && s.mine.digsLeft === 15
    else checks.inMine = s.inMine === false
    checks.shop = fname === 'shop-open' ? s.ui.shopOpen === true : s.ui.shopOpen === false
    checks.inv = fname === 'inventory-open' ? s.ui.inventoryOpen === true : s.ui.inventoryOpen === false
    checks.dialogue = fname === 'dialogue-open' ? (s.ui.dialogueActive === true && s.dialogue.text.length > 20) : s.ui.dialogueActive === false
    checks.slotOpen = fname === 'slot-machine' ? (s.slotOpen === true && s.scene === 'slot') : (s.slotOpen === false && s.ui.slotScreenVisible === false)
    // Day-cycle fixture pins: fast mode (dtScale 20) advances the live clock
    // ~40 min/s, so pins are asserted with the shared modular rule — intent is
    // "fixture set the clock to 22:00 / noon" (same time-of-day region, either
    // side of the 1440 wrap), never "clock frozen at the pin".
    checks.timeOfDay = fname === 'farm-night'
      ? pinNear(s.player.timeOfDay, 1320, 120)
      : (fname === 'farm-day' || fname === 'farm-crops-grown')
        ? pinNear(s.player.timeOfDay, 720, 240)
        : true
    const ls = await evl(page, () => ({ save: localStorage.getItem('till_debt_save'), farm: localStorage.getItem('till_debt_farm') }))
    checks.lsWiped = ls.ok && ls.value.save === null && ls.value.farm === null
    if (fname === 'shop-open') {
      const sc = await evl(page, () => { const p = document.getElementById('shop-panel'); return p ? p.scrollTop >= p.scrollHeight - p.clientHeight - 2 : false })
      checks.shopScroll = sc.ok && sc.value === true
    }
    if (fname === 'slot-machine') {
      // fixture spins once (10g) → gold 90; slot-screen DOM visibility is EXPECTED here
      checks.gold = s.player.gold === 90
      delete checks.noSlotDOM
      const st = await evl(page, () => ({ title: document.getElementById('slot-title')?.textContent, cells: document.querySelectorAll('.slot-cell').length }))
      checks.slotTitle = st.ok && st.value.title === 'Cascade Desire'
      checks.slotCells = st.ok && st.value.cells === 24
    }
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    if (failed.length === 0) test(`E${pass} fixture "${fname}" deterministic (pass ${pass})`, true)
    else test(`E${pass} fixture "${fname}" deterministic (pass ${pass})`, false, `failed: ${failed.join(', ')} | ` + JSON.stringify({ gold: s.player.gold, day: s.player.day, inv: s.player.inventory.slice(0, 7).map(x => x && x.id), inMine: s.inMine, ui: s.ui, started: s.started, dom: dom.value }))
    pass++
  }
  // Harness flag accuracy (KNOWN ISSUE: flags read inline style; CSS-hidden overlays report visible)
  const flagCheck = await evl(page, () => {
    const st = window.__debug.getState()
    const el = document.getElementById('pause-overlay')
    return { flag: st.ui.pauseOverlayVisible, domHidden: el ? getComputedStyle(el).display === 'none' : null }
  })
  test('E-H1 harness pauseOverlayVisible accurate after fresh farm-day fixture (KNOWN ISSUE probe)', flagCheck.ok && flagCheck.value.flag === false && flagCheck.value.domHidden === true,
    JSON.stringify(flagCheck.value) + ' — flag reads inline style; overlay hidden via CSS rule')
  // Mesh-leak proxy: JS heap growth across 3 farm-day visits (scene.children not exposed → Part B gap)
  const heapBefore = await evl(page, () => performance.memory?.usedJSHeapSize ?? -1)
  for (let i = 0; i < 3; i++) await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const heapAfter = await evl(page, () => performance.memory?.usedJSHeapSize ?? -1)
  const growth = (heapAfter.ok && heapBefore.ok) ? heapAfter.value - heapBefore.value : -1
  test('E-H2 JS heap growth across 3 farm-day visits < 100 MB (leak proxy; scene.children not exposed)', growth < 100 * 1024 * 1024,
    heapBefore.ok && heapAfter.ok ? `${(growth / 1024 / 1024).toFixed(1)} MB` : 'performance.memory unavailable')

  // E-final: stale localStorage cannot leak into fixtures
  await evl(page, () => {
    localStorage.setItem('till_debt_save', JSON.stringify({ gold: 9999, day: 50, stamina: 1, inventory: [{ id: 'gem_ruby', count: 99 }], toolTiers: {}, toolDurability: {}, waterLevel: 0, introSeen: true }))
    localStorage.setItem('till_debt_farm', JSON.stringify([[[{ type: 9, cropId: 'rare', growthDay: 99, watered: true, treeAge: 0 }]]]))
  })
  const stale = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const sStale = await getState(page)
  test('E-final stale localStorage save cannot leak into fixture (gold 100, day 1, default inventory)', stale.ok && sStale.player.gold === 100 && sStale.player.day === 1 && sStale.player.stamina === 100 && invMatches(sStale, DEFAULT_INV), JSON.stringify({ gold: sStale?.player?.gold, day: sStale?.player?.day, inv: sStale?.player?.inventory?.slice(0, 7)?.map(x => x && x.id) }))
  test('E-final no page errors during fixture battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('F. Resize & visibility robustness')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await page.setViewport({ width: 640, height: 480 })
  const r1 = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  test('F1 resize 960x540 → 640x480 then fixture still works', r1.ok, r1.ok ? '' : r1.error)
  const r2 = await evl(page, () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    return true
  })
  await sleep(800)
  const r3 = await evl(page, () => window.__debug.setState({ player: { gold: 555 } }))
  const s3 = await getState(page)
  test('F2 game still functional while hidden (setState works)', r2.ok && r3.ok && s3.player.gold === 555, JSON.stringify(s3?.player?.gold))
  await evl(page, () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    return true
  })
  const r4 = await evl(page, () => window.__debug.gotoFixture('shop-open'))
  test('F3 back to visible: fixtures still settle', r4.ok, r4.ok ? '' : r4.error)
  test('F4 no page errors during resize/visibility battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('G. Regression: normal play WITHOUT ?debug=1 (fps-tolerant DOM checks)')
{
  const page = await newPage()
  await page.goto(URL_PLAIN, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(() => { localStorage.removeItem('till_debt_save'); localStorage.removeItem('till_debt_farm') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1500)

  const noDebug = await evl(page, () => window.__debug === undefined)
  test('G1 window.__debug absent without ?debug=1', noDebug.ok && noDebug.value === true, JSON.stringify(noDebug.value))

  const overlay = await evl(page, () => { const o = document.getElementById('start-overlay'); return o ? getComputedStyle(o).display !== 'none' : false })
  test('G2 start overlay visible on fresh load', overlay.ok && overlay.value === true, JSON.stringify(overlay.value))

  await page.click('#start-btn')
  await sleep(1500)
  const started = await evl(page, () => ({
    overlayHidden: getComputedStyle(document.getElementById('start-overlay')).display === 'none',
    day: document.getElementById('day-display').textContent,
    gold: document.getElementById('gold-display').textContent,
    hudVisible: getComputedStyle(document.getElementById('hud')).display !== 'none',
  }))
  test('G3 start button (empty seed) starts game: overlay hidden, HUD visible, day 1, gold 100', started.value?.overlayHidden === true && started.value?.day === '1' && started.value?.gold === '100' && started.value?.hudVisible === true, JSON.stringify(started.value))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1000)
  await page.type('#world-seed', '12345')
  await page.click('#start-btn')
  await sleep(1500)
  const seeded = await evl(page, () => getComputedStyle(document.getElementById('start-overlay')).display === 'none')
  test('G4 start with numeric world-seed input works', seeded.ok && seeded.value === true, JSON.stringify(seeded.value))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1000)
  await page.type('#world-seed', 'myfarm')
  await page.click('#start-btn')
  await sleep(1500)
  const seededStr = await evl(page, () => getComputedStyle(document.getElementById('start-overlay')).display === 'none')
  test('G5 start with string world-seed input works', seededStr.ok && seededStr.value === true, JSON.stringify(seededStr.value))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1000)
  for (let i = 0; i < 6; i++) await page.click('#start-btn').catch(() => {})
  await sleep(2000)
  const spam = await evl(page, () => getComputedStyle(document.getElementById('start-overlay')).display === 'none')
  test('G6 spam-clicking start does not break the game', spam.ok && spam.value === true, JSON.stringify(spam.value))

  // G7: real-input slot open → spin → close → save written (+430ms onClose)
  await page.keyboard.press('r')
  await sleep(1500)
  const slotOpen = await evl(page, () => document.getElementById('slot-screen').classList.contains('show'))
  test('G7a R opens slot machine', slotOpen.ok && slotOpen.value === true, JSON.stringify(slotOpen.value))
  await page.click('#slot-spin')
  await sleep(2000)
  const spun = await evl(page, () => document.querySelectorAll('.slot-cell').length > 0 || document.getElementById('slot-nowin').style.display === 'block' || document.getElementById('slot-win-panel').classList.contains('show'))
  test('G7b SPIN click populates the reel grid', spun.ok && spun.value === true, JSON.stringify(spun.value))
  await page.keyboard.press('Escape')
  await sleep(2000)
  const slotClosed = await evl(page, () => !document.getElementById('slot-screen').classList.contains('show'))
  const saveWritten = await evl(page, () => localStorage.getItem('till_debt_save') !== null)
  test('G7c Escape closes slot and saveGame fires (+430ms onClosed)', slotClosed.ok && slotClosed.value === true && saveWritten.ok && saveWritten.value === true,
    JSON.stringify({ closed: slotClosed.value, save: saveWritten.value }))

  // G8: save/load round-trip — reload, start, save must be loaded
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1000)
  await page.click('#start-btn')
  await sleep(1500)
  const loaded = await evl(page, () => ({
    day: document.getElementById('day-display').textContent,
    gold: parseInt(document.getElementById('gold-display').textContent, 10),
  }))
  test('G8 reload + start loads saved state (day 1, gold in sane post-slot range 80..300)', loaded.ok && loaded.value.day === '1' && loaded.value.gold >= 80 && loaded.value.gold <= 300,
    JSON.stringify(loaded.value))

  await page.keyboard.press('i')
  await sleep(800)
  const inv = await evl(page, () => getComputedStyle(document.getElementById('inventory-panel')).display !== 'none')
  test('G9 I opens inventory panel', inv.ok && inv.value === true, JSON.stringify(inv.value))
  await page.keyboard.press('Escape')
  await sleep(500)
  const invClosed = await evl(page, () => getComputedStyle(document.getElementById('inventory-panel')).display === 'none')
  test('G9b Escape closes inventory panel', invClosed.ok && invClosed.value === true, JSON.stringify(invClosed.value))
  test('G10 no page errors during plain-page regression', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
// Press a key repeatedly (with settle gaps) until predicate(getState()) is true.
// Fast mode: the 0.25-0.5 game-s action cooldown drains in milliseconds of
// wall time (dt-clamped ticks at ~250/s), so a 300ms gap between presses is
// plenty — 12 tries still give ~3.6s of budget. (Pre-fast-mode this was 900ms
// to cover ~1fps frame-dt cooldowns.)
async function pressUntil(page, key, pred, maxTries = 12) {
  for (let i = 0; i < maxTries; i++) {
    await page.keyboard.press(key)
    await sleep(300)
    const s = await getState(page)
    if (s && pred(s)) return { ok: true, tries: i + 1 }
  }
  return { ok: false, tries: maxTries }
}

section('H. Real-input interactions on the debug page (position via setState, input real)')
{
  const page = await newPage()
  await loadDebug(page)
  // Clean start: gotoFixture wipes localStorage + starts fresh (avoids startGame loading a stale save)
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await evl(page, () => window.__debug.setState({
    player: { stamina: 100, waterLevel: 10, selectedSlot: 0 },
    position: { x: 5, z: 5 },
    farm: { tiles: { '5,4': { type: 'GRASS' }, '5,5': { type: 'GRASS' }, '5,6': { type: 'GRASS' } } },
  }))
  // getFacingTile prefers the nearest actionable tile and includes the player's own tile
  // (forgiveness design) — with all three tiles GRASS the action lands on the own tile (5,5).
  await page.keyboard.press('1'); await sleep(200)
  const tilled = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.type === 2)
  let s = await getState(page)
  test('H1 real input: Space with hoe tills own grass tile (5,5) → TILLED', tilled.ok, JSON.stringify(s?.farm?.tiles?.[5]?.[5]))

  await page.keyboard.press('6'); await sleep(200)
  const planted = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.cropId === 'turnip' && s.player.inventory[5]?.count === 4)
  s = await getState(page)
  test('H2 real input: Space with seed_turnip plants crop on tilled tile', planted.ok, JSON.stringify({ tile: s?.farm?.tiles?.[5]?.[5], seeds: s?.player?.inventory?.[5] }))

  await page.keyboard.press('2'); await sleep(200)
  const watered = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.watered === true && s.player.waterLevel === 9)
  s = await getState(page)
  test('H3 real input: Space with watering can waters crop', watered.ok, JSON.stringify({ tile: s?.farm?.tiles?.[5]?.[5], water: s?.player?.waterLevel }))

  // grow to ripe: water each day before fastForward (unwatered spoils)
  for (let i = 0; i < 3; i++) {
    await evl(page, () => window.__debug.fastForward(1))
    if (i < 2) await evl(page, () => window.__debug.setState({ farm: { tiles: { '5,5': { watered: true } } } }))
  }
  s = await getState(page)
  test('H3b crop ripe after 3 watered days (growthDay 3)', s.farm.tiles[5][5].growthDay === 3 && s.farm.tiles[5][5].cropId === 'turnip', JSON.stringify(s?.farm?.tiles?.[5]?.[5]))
  await page.keyboard.press('1'); await sleep(200)
  const harvested = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.cropId === null && s.player.inventory.some(x => x && x.id === 'turnip' && x.count >= 1))
  s = await getState(page)
  test('H4 real input: Space with hoe harvests ripe crop → cropId null, turnip in inventory', harvested.ok, JSON.stringify({ tile: s?.farm?.tiles?.[5]?.[5], inv: s?.player?.inventory?.filter(Boolean) }))

  // H4's harvest opens the first_harvest dialogue; its typewriter runs ~1 char/frame at
  // headless fps and E/Space are swallowed while a dialogue is active — dismiss it now.
  const dismissed = await evl(page, () => {
    const box = document.getElementById('dialog-box')
    if (!box || getComputedStyle(box).display === 'none') return 'no-dialogue'
    box.click() // skip typewriter (showChoices runs synchronously)
    const choice = document.querySelector('#dialog-choices .dialog-choice')
    if (choice) choice.click() // first choice: 'Keep Farming' → close
    return 'dismissed'
  })
  await sleep(800)
  const afterDismiss = await getState(page)
  test('H4b first_harvest dialogue dismissed after harvest (no stale dialogue blocks E)', (dismissed.ok && afterDismiss?.ui?.dialogueActive === false) || dismissed.value === 'no-dialogue', JSON.stringify({ dismissed: dismissed.value, dialogueActive: afterDismiss?.ui?.dialogueActive }))

  for (let i = 0; i < 8; i++) await page.keyboard.press(' ')
  await sleep(600)
  const sSpam = await getState(page)
  test('H5 rapid Space spam does not crash or corrupt state', !!sSpam && sSpam.player.gold === 100, JSON.stringify(sSpam?.player))
  test('H6 no page errors during real-input farming', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))

  // H7: mine via real keys — position precondition at mine entrance (0,11), buildingRange 3.5
  await evl(page, () => window.__debug.setState({ position: { x: 0.5, z: 10.5 } }))
  await page.keyboard.press('e'); await sleep(1200)
  s = await getState(page)
  test('H7 E at mine entrance enters mine (inMine true)', s.inMine === true && s.mine.currentFloor === 0, JSON.stringify({ inMine: s?.inMine, floor: s?.mine?.currentFloor }))
  await page.keyboard.press('5'); await sleep(200)
  const dug = await pressUntil(page, ' ', s => s.mine?.digsLeft === 14)
  s = await getState(page)
  test('H7b Space with shovel digs, digsLeft 15 → 14', dug.ok, JSON.stringify({ digs: s?.mine?.digsLeft }))
  // digging may have revealed a hole within 1.8 of the player (E would open descend dialogue);
  // move away via setState (precondition), then E is a clean exit
  await evl(page, () => window.__debug.setState({ position: { x: 4.5, z: 4.5 } }))
  await page.keyboard.press('e'); await sleep(1200)
  s = await getState(page)
  test('H7c E in mine (away from hole) exits back to farm', s.inMine === false, JSON.stringify({ inMine: s?.inMine }))

  // H8: shop via real keys — position precondition at shop (15,0)
  await evl(page, () => window.__debug.setState({ position: { x: 14.5, z: 0.5 } }))
  await page.keyboard.press('e'); await sleep(1200)
  s = await getState(page)
  test('H8 E near shop opens shop panel', s.ui.shopOpen === true, JSON.stringify(s?.ui))
  const bought = await evl(page, () => {
    const item = [...document.querySelectorAll('#shop-content .shop-item')].find(x => x.textContent.includes('Turnip'))
    const btn = item && item.querySelector('.shop-btn')
    if (btn) btn.click()
    return !!btn
  })
  await sleep(800)
  s = await getState(page)
  test('H8b real click Buy turnip seed deducts 20g (100 → 80)', bought.ok && bought.value === true && s.player.gold === 80, JSON.stringify({ found: bought.value, gold: s?.player?.gold }))
  await page.click('#shop-close'); await sleep(800)
  s = await getState(page)
  test('H8c shop close button closes shop', s.ui.shopOpen === false, JSON.stringify(s?.ui))

  // H9: sleep via real keys — position precondition at house (0,0)
  await evl(page, () => window.__debug.setState({ position: { x: 0.5, z: 0.5 } }))
  await page.keyboard.press('e')
  // Typewriter types 1 char/frame (25ms interval coalesced at ~1fps): poll until choices render
  let dlg = null
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    dlg = await evl(page, () => {
      const box = document.getElementById('dialog-box')
      const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('sleep'))
      return { visible: getComputedStyle(box).display !== 'none', hasSleep: !!btn }
    })
    if (dlg.ok && dlg.value.hasSleep) break
  }
  test('H9 E near house shows sleep dialogue', dlg && dlg.ok && dlg.value.visible === true && dlg.value.hasSleep === true, JSON.stringify(dlg?.value))
  const sleepClicked = await evl(page, () => {
    const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('sleep'))
    if (btn) btn.click()
    return !!btn
  })
  await sleep(2500)
  s = await getState(page)
  // day is 4 after H3b's 3 fastForwards; sleeping advances to day 5
  test('H9b real click Sleep advances day to 5', s.player.day === 5, JSON.stringify({ day: s?.player?.day }))
  test('H10 no page errors during real-input interaction battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
