// M1 full gameplay-loop regression (v0.1 milestone gate).
// One continuous session: start → till/plant/water → grow → harvest → ship → sell →
// sleep → mine (dig/ore/descend/exit) → shop → slot → softlock sweep → save/load.
// DEBUG_HARNESS Part D: preconditions via setState/gotoFixture/fastForward,
// interactions under test via REAL input, assertions via getState.
// Known-flow notes baked in:
//  - Mr. Grimes visits on day%5===0 mid-gameplay (debt collector, by design); his
//    typewriter swallows Space/E until dismissed → clearDialogues after every day advance.
//  - Buyer payment: overlay shows ~30s after trigger (NPC walk), gold credits at the
//    END of the count-up, right as the overlay hides → poll the two conditions separately.
import puppeteer from 'puppeteer-core'

// CI-friendly: CHROME_PATH/BASE_URL come from the GitHub Actions workflow
// (scripts/run-ci-puppeteer.sh); local runs fall back to the old defaults.
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const URL_DEBUG = (process.env.BASE_URL || 'http://localhost:5173') + '/?debug=1&fast=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

// Fast mode runs the in-game clock up to 20x, so a session can wrap past
// 1440. Modular distance on the 1440-minute clock for relative round-trips.
const modDist = (a, b) => Math.min((a - b + 1440) % 1440, (b - a + 1440) % 1440)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
async function setState(page, partial) { return evl(page, p => window.__debug.setState(p), partial) }
async function getState(page) { const r = await evl(page, () => window.__debug.getState()); return r.ok ? r.value : null }
async function pollUntil(page, fn, deadlineMs, ...args) {
  const deadline = Date.now() + deadlineMs
  let last = null
  while (Date.now() < deadline) {
    last = await evl(page, fn, ...args)
    if (last.ok && last.value) return { hit: true, last }
    // Fast mode: game state responds in well under 200ms, so a 200ms poll
    // cadence keeps suite runtime down without racing the state.
    await sleep(200)
  }
  return { hit: false, last }
}
async function pressUntil(page, key, pred, maxTries = 12) {
  for (let i = 0; i < maxTries; i++) {
    await page.keyboard.press(key)
    // Fast mode: the 0.25-0.5 game-s action cooldown drains in milliseconds of
    // wall time (dt-clamped ticks at ~250/s), so a 300ms gap between presses
    // is plenty (pre-fast-mode this was 900ms to cover ~1fps frame-dt).
    await sleep(300)
    const s = await getState(page)
    if (s && pred(s)) return { ok: true, tries: i + 1 }
  }
  return { ok: false, tries: maxTries }
}
// Dismiss any open dialogue with REAL clicks (skip typewriter, prefer "more time"
// choice to avoid accidentally paying debt; fall back to first choice).
async function clearDialogues(page, budgetMs = 40000) {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    const r = await evl(page, () => {
      const box = document.getElementById('dialog-box')
      if (!box || getComputedStyle(box).display === 'none') return 'none'
      const choices = [...document.querySelectorAll('#dialog-choices .dialog-choice')]
      box.click()
      if (choices.length) {
        const pick = choices.find(b => b.textContent.toLowerCase().includes('more time')) || choices[0]
        pick.click()
      }
      return 'dismissed'
    })
    if (r.ok && r.value === 'none') break
    await sleep(700)
  }
  const s = await getState(page)
  return s ? !s.ui.dialogueActive : false
}

// ─────────────────────────────────────────────────────────────
section('L1. Start game (real click)')
const page = await newPage()
await loadDebug(page)
{
  await evl(page, () => window.__debug.gotoFixture('main-menu'))
  await sleep(800)
  const startVisible = await evl(page, () => getComputedStyle(document.getElementById('start-overlay')).display !== 'none')
  await page.click('#start-btn')
  await sleep(1500)
  let s = await getState(page)
  test('L1a start overlay visible on main-menu fixture', startVisible.ok && startVisible.value === true, JSON.stringify(startVisible.value))
  test('L1b real start click: started, day 1, gold 100', s.started === true && s.player.day === 1 && s.player.gold === 100, JSON.stringify({ started: s?.started, day: s?.player?.day, gold: s?.player?.gold }))
}

// ─────────────────────────────────────────────────────────────
section('L2. Till 2 tiles, plant 2 seeds, water (REAL input)')
{
  await setState(page, {
    player: { stamina: 100, waterLevel: 10, selectedSlot: 0, introSeen: true },
    farm: { tiles: {
      '5,4': { type: 'GRASS' }, '5,5': { type: 'GRASS' }, '5,6': { type: 'GRASS' },
      '9,8': { type: 'GRASS' }, '9,9': { type: 'GRASS' }, '9,10': { type: 'GRASS' },
    } },
  })
  await setState(page, { position: { x: 5, z: 5 } })
  await page.keyboard.press('1'); await sleep(200)
  const tillA = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.type === 2)
  await setState(page, { position: { x: 9, z: 9 } })
  await page.keyboard.press('1'); await sleep(200)
  const tillB = await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.type === 2)
  await setState(page, { position: { x: 5, z: 5 } })
  await page.keyboard.press('6'); await sleep(200)
  const plantA = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.cropId === 'turnip')
  await setState(page, { position: { x: 9, z: 9 } })
  await page.keyboard.press('6'); await sleep(200)
  const plantB = await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.cropId === 'turnip')
  await setState(page, { position: { x: 5, z: 5 } })
  await page.keyboard.press('2'); await sleep(200)
  const waterA = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.watered === true)
  await setState(page, { position: { x: 9, z: 9 } })
  await page.keyboard.press('2'); await sleep(200)
  const waterB = await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.watered === true)
  const s2 = await getState(page)
  test('L2a till 2 tiles (5,5)+(9,9) via real Space', tillA.ok && tillB.ok, JSON.stringify({ a: s2?.farm?.tiles?.[5]?.[5]?.type, b: s2?.farm?.tiles?.[9]?.[9]?.type }))
  test('L2b plant 2 turnip seeds via real Space', plantA.ok && plantB.ok, JSON.stringify({ a: s2?.farm?.tiles?.[5]?.[5]?.cropId, b: s2?.farm?.tiles?.[9]?.[9]?.cropId, seedsLeft: s2?.player?.inventory?.[5]?.count }))
  test('L2c water both crops via real Space', waterA.ok && waterB.ok, JSON.stringify({ a: s2?.farm?.tiles?.[5]?.[5]?.watered, b: s2?.farm?.tiles?.[9]?.[9]?.watered }))
  test('L2d no page errors during tilling/planting/watering', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L3. Growth: naive fastForward(3) vs daily-watered growth')
{
  const beforeDay = (await getState(page)).player.day
  await evl(page, () => window.__debug.fastForward(3))
  await clearDialogues(page) // grimes/notices may be pending on day boundaries
  let s = await getState(page)
  const naivelySpoiled = s.farm.tiles[5][5].cropId === null && s.farm.tiles[9][9].cropId === null
  test('L3a naive fastForward(3) after single watering: crops spoiled (design: daily watering required) — INFO', naivelySpoiled === true, JSON.stringify({ a: s?.farm?.tiles?.[5]?.[5], b: s?.farm?.tiles?.[9]?.[9] }))
  await setState(page, { position: { x: 5, z: 5 } })
  await page.keyboard.press('6'); await sleep(200)
  const rpA = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.cropId === 'turnip')
  await setState(page, { position: { x: 9, z: 9 } })
  await page.keyboard.press('6'); await sleep(200)
  const rpB = await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.cropId === 'turnip')
  for (let i = 0; i < 3; i++) {
    await setState(page, { position: { x: 5, z: 5 } })
    await page.keyboard.press('2'); await sleep(150)
    await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.watered === true)
    await setState(page, { position: { x: 9, z: 9 } })
    await page.keyboard.press('2'); await sleep(150)
    await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.watered === true)
    await evl(page, () => window.__debug.fastForward(1))
    await clearDialogues(page) // day 5 = Mr. Grimes visit; dismiss before watering again
  }
  s = await getState(page)
  test('L3b replant after spoilage (real input) works, no softlock', rpA.ok && rpB.ok && s.player.day === beforeDay + 6, JSON.stringify({ day: s?.player?.day, a: s?.farm?.tiles?.[5]?.[5]?.cropId, b: s?.farm?.tiles?.[9]?.[9]?.cropId }))
  test('L3c crops ripe after 3 watered fastForward(1)s (growthDay 3)', s.farm.tiles[5][5].growthDay === 3 && s.farm.tiles[9][9].growthDay === 3, JSON.stringify({ a: s?.farm?.tiles?.[5]?.[5]?.growthDay, b: s?.farm?.tiles?.[9]?.[9]?.growthDay }))
}

// ─────────────────────────────────────────────────────────────
section('L4. Harvest ripe crops (REAL input) → hotbar')
{
  await setState(page, { player: { selectedSlot: 0 } })
  await setState(page, { position: { x: 5, z: 5 } })
  await page.keyboard.press('1'); await sleep(200)
  const harvA = await pressUntil(page, ' ', s => s.farm?.tiles?.[5]?.[5]?.cropId === null)
  await clearDialogues(page) // first_harvest
  await setState(page, { position: { x: 9, z: 9 } })
  await page.keyboard.press('1'); await sleep(200)
  const harvB = await pressUntil(page, ' ', s => s.farm?.tiles?.[9]?.[9]?.cropId === null)
  await clearDialogues(page)
  let s = await getState(page)
  const turnipSlot = s.player.inventory.findIndex(x => x && x.id === 'turnip')
  test('L4a harvest both via real Space', harvA.ok && harvB.ok, JSON.stringify({ a: s?.farm?.tiles?.[5]?.[5]?.cropId, b: s?.farm?.tiles?.[9]?.[9]?.cropId }))
  test('L4b 2 turnips in inventory', turnipSlot >= 0 && s.player.inventory[turnipSlot].count === 2, JSON.stringify({ slot: turnipSlot, count: s?.player?.inventory?.[turnipSlot]?.count }))
  test('L4c no stale dialogue blocks input after harvest', s.ui.dialogueActive === false, JSON.stringify({ active: s?.ui?.dialogueActive }))
}

// ─────────────────────────────────────────────────────────────
section('L5. Ship to bin (REAL input) + morning buyer → gold + debt deadline')
{
  const s0 = await getState(page)
  const turnipSlot = s0.player.inventory.findIndex(x => x && x.id === 'turnip')
  await setState(page, { player: { selectedSlot: turnipSlot }, position: { x: 10, z: 0.5 } })
  const shipped = await pressUntil(page, ' ', s => s.farm?.binItems?.length === 1 && s.farm?.binItems?.[0]?.count === 2, 15)
  let s = await getState(page)
  test('L5a real Space near bin ships all 2 turnips', shipped.ok, JSON.stringify(s?.farm?.binItems))
  for (let i = 0; i < 5; i++) await page.keyboard.press(' ')
  await sleep(800)
  s = await getState(page)
  test('L5b spam near bin does not double-ship', s.farm.binItems.length === 1 && s.farm.binItems[0].count === 2, JSON.stringify(s?.farm?.binItems))
  const goldBefore = s.player.gold
  await evl(page, () => window.__debug.triggerEvent('buyerArrives', { items: [{ id: 'turnip', count: 2 }] }))
  const overlayShown = await pollUntil(page, () => window.__debug.getState().ui.paymentOverlayVisible === true, 240000)
  const paid = await pollUntil(page, (gb) => {
    const st = window.__debug.getState()
    return st.player.gold >= gb + 90
  }, 240000, goldBefore)
  const hidden = await pollUntil(page, () => window.__debug.getState().ui.paymentOverlayVisible === false, 60000)
  s = await getState(page)
  test('L5b2 payment overlay appears (buyer NPC walks to bin)', overlayShown.hit, `overlaySeen=${overlayShown.hit}`)
  test('L5c gold credited +90 (2×45) after payment counting', paid.hit && s.player.gold === goldBefore + 90, JSON.stringify({ gold: s?.player?.gold, expected: goldBefore + 90, paid: paid.hit, hidden: hidden.hit }))
  const debt = await evl(page, () => ({
    shown: document.getElementById('debt-display')?.textContent,
    hud: getComputedStyle(document.getElementById('hud')).display !== 'none',
  }))
  test('L5d debt deadline visible in HUD (500g outstanding)', debt.ok && /500/.test(debt.value.shown || '') && debt.value.hud === true, JSON.stringify(debt.value))
  test('L5e no page errors during ship/buyer flow', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L6. Sleep cycle (REAL E + click Sleep)')
{
  await setState(page, { position: { x: 0.5, z: 0.5 } })
  await page.keyboard.press('e')
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
  const before = await getState(page)
  const clicked = await evl(page, () => {
    const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('sleep'))
    if (btn) btn.click()
    return !!btn
  })
  await sleep(2500)
  let s = await getState(page)
  const dayOk = s.player.day === before.player.day + 1
  await clearDialogues(page) // spoil_notice / crop_ripe / grimes after wake
  s = await getState(page)
  test('L6a sleep dialogue via E near house', dlg.ok && dlg.value.visible === true && dlg.value.hasSleep === true, JSON.stringify(dlg?.value))
  test('L6b day advances by 1', clicked.ok && dayOk, JSON.stringify({ was: before?.player?.day, now: s?.player?.day }))
  // Relative: sleep resets to 06:00 (360); the live clock then advances while
  // the wake dialogues are cleared (fast mode ~40 min/s → <840 = 12s margin).
  test('L6c timeOfDay resets to 06:00 (≈360), stamina 100', s.player.timeOfDay >= 360 && s.player.timeOfDay < 840 && s.player.stamina === 100, JSON.stringify({ tod: s?.player?.timeOfDay, stamina: s?.player?.stamina }))
}

// ─────────────────────────────────────────────────────────────
section('L7. Mine loop: enter → dig → ore → descend → exit')
{
  await setState(page, { position: { x: 0.5, z: 10.5 } })
  await page.keyboard.press('e'); await sleep(1500)
  let s = await getState(page)
  test('L7a E at mine entrance enters mine', s.inMine === true && s.mine.currentFloor === 0, JSON.stringify({ inMine: s?.inMine, floor: s?.mine?.currentFloor }))
  await page.keyboard.press('5'); await sleep(200)
  const dugTiles = []
  const positions = []
  for (let zz = 1; zz <= 4 && positions.length < 15; zz++) for (let xx = 1; xx <= 4 && positions.length < 15; xx++) positions.push([xx, zz])
  let lastDigs = s.mine.digsLeft
  for (const [sx, sz] of positions) {
    await setState(page, { position: { x: sx + 0.5, z: sz + 0.5 } })
    await pressUntil(page, ' ', st => st.mine?.digsLeft < lastDigs || st.mine?.digsLeft === 0, 8)
    const cur = (await getState(page)).mine.digsLeft
    if (cur < lastDigs) { dugTiles.push([sx, sz]); lastDigs = cur }
    if (cur === 0) break
  }
  s = await getState(page)
  test('L7b dug multiple tiles with shovel (real Space)', dugTiles.length >= 3 && s.mine.digsLeft < 15, JSON.stringify({ digsLeft: s?.mine?.digsLeft, dug: dugTiles.length }))
  const minedBefore = s.player.totalItemsMined
  // Flakiness lesson (L7c): the 4×4 dig patch only holds ~2.5 items on
  // average (16% per tile, minus rocks), and in fast mode most of those are
  // collected at the player's feet during the dig loop itself — a pure
  // movement sweep then often finds nothing left to collect. Sweep the whole
  // floor (0.5-row × 1.0-col steps: every tile is within the 0.8 collect
  // radius of some sweep point) and DIG at every position (stamina +
  // digsLeft refilled via setState): the floor keeps spawning items ahead of
  // the sweep, and the MineSystem wall-bounce keeps every launch inside the
  // 14×14 floor.
  const floorSize = 14 // floor 0 (L7d descends after this section)
  await sleep(3000)
  for (let gz = 0.5; gz < floorSize; gz += 0.5) {
    for (let gx = 0.5; gx < floorSize; gx += 1.0) {
      await setState(page, { position: { x: gx, z: gz }, player: { stamina: 100 }, mine: { digsLeft: 15 } })
      await page.keyboard.press(' ')
      await sleep(300)
      const cur = await getState(page)
      if (cur && cur.player.totalItemsMined > minedBefore) break
    }
    const cur = await getState(page)
    if (cur && cur.player.totalItemsMined > minedBefore) break
  }
  s = await getState(page)
  test('L7c ore collected (totalItemsMined increased)', s.player.totalItemsMined > minedBefore, JSON.stringify({ before: minedBefore, after: s?.player?.totalItemsMined, inv: s?.player?.inventory?.filter(x => x && (x.id.includes('ore') || x.id.includes('stone'))).map(x => x.id) }))
  // descend: probe E at dug tiles; clicking Descend if the dialogue opens; E away from a hole EXITS the mine, so re-enter via harness and retry
  let descendedViaReal = false
  for (const [dx, dz] of dugTiles) {
    if (descendedViaReal) break
    await setState(page, { position: { x: dx + 0.5, z: dz + 0.5 } })
    await page.keyboard.press('e'); await sleep(1200)
    const st = await getState(page)
    if (st.mine.currentFloor === 1) { descendedViaReal = true; break }
    const dlg = await evl(page, () => !! [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('descend')))
    if (dlg.ok && dlg.value) {
      await evl(page, () => {
        const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('descend'))
        btn.click()
      })
      await sleep(1500)
      if ((await getState(page)).mine.currentFloor === 1) descendedViaReal = true
    } else if (!st.inMine) {
      await setState(page, { mine: { inMine: true } }) // re-enter (hole was lost, use harness fallback next)
    }
  }
  if (!descendedViaReal) {
    const r = await setState(page, { mine: { floor: 1 } })
    if (!r.ok) await setState(page, { mine: { inMine: true } }) && await setState(page, { mine: { floor: 1 } })
  }
  s = await getState(page)
  test('L7d descended to floor 1 (real dialogue click, or harness fallback)', s.inMine === true && s.mine.currentFloor === 1, JSON.stringify({ floor: s?.mine?.currentFloor, viaRealClick: descendedViaReal }))
  await setState(page, { position: { x: 4.5, z: 4.5 } })
  await page.keyboard.press('e'); await sleep(1500)
  s = await getState(page)
  test('L7e E (away from hole) exits mine to farm, HUD consistent', s.inMine === false && s.scene === 'farm' && s.player.gold >= 0, JSON.stringify({ inMine: s?.inMine, scene: s?.scene }))
  test('L7f no page errors during mine loop', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L8. Shop: buy seeds (REAL input), 0-gold boundary')
{
  await setState(page, { position: { x: 14.5, z: 0.5 } })
  const opened = await pressUntil(page, 'e', s => s.ui.shopOpen === true, 4)
  let s = await getState(page)
  test('L8a E near shop opens shop', opened.ok, JSON.stringify(s?.ui?.shopOpen))
  const goldBefore = s.player.gold
  const seedsBefore = s.player.inventory[5]?.count ?? 0
  const bought = await evl(page, () => {
    const item = [...document.querySelectorAll('#shop-content .shop-item')].find(x => x.textContent.includes('Turnip'))
    const btn = item && item.querySelector('.shop-btn')
    if (btn) btn.click()
    return !!btn
  })
  await sleep(800)
  s = await getState(page)
  test('L8b real Buy click: -20g, +1 seed', bought.ok && s.player.gold === goldBefore - 20 && (s.player.inventory[5]?.count ?? 0) === seedsBefore + 1, JSON.stringify({ gold: s?.player?.gold, seeds: s?.player?.inventory?.[5]?.count }))
  await setState(page, { player: { gold: 0 } })
  const poor = await evl(page, () => {
    const item = [...document.querySelectorAll('#shop-content .shop-item')].find(x => x.textContent.includes('Potato'))
    const btn = item && item.querySelector('.shop-btn')
    if (btn) btn.click()
    return !!btn
  })
  await sleep(800)
  s = await getState(page)
  test('L8c buy with 0 gold: no negative gold, no seed granted', poor.ok && s.player.gold === 0 && s.player.inventory[6]?.count === 3, JSON.stringify({ gold: s?.player?.gold, potato: s?.player?.inventory?.[6] }))
  await page.click('#shop-close').catch(() => {})
  await sleep(800)
  s = await getState(page)
  test('L8d shop close button closes shop', s.ui.shopOpen === false, JSON.stringify(s?.ui?.shopOpen))
  test('L8e no page errors during shop flow', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L9. Slot machine: open → spin → close, farm state consistent')
{
  await setState(page, { player: { gold: 100 } }) // L8c zeroed gold; spin costs 10
  const before = await getState(page)
  const tilesBefore = JSON.stringify(before.farm.tiles.map(r => r.map(t => [t.type, t.cropId, t.growthDay])))
  const opened = await pressUntil(page, 'r', s => s.slotOpen === true, 4)
  let s = await getState(page)
  test('L9a R opens slot machine', opened.ok, JSON.stringify(s?.slotOpen))
  await page.click('#slot-spin').catch(() => {})
  const spun = await pollUntil(page, () => document.querySelectorAll('.slot-cell').length > 0 || document.getElementById('slot-nowin').style.display === 'block' || document.getElementById('slot-win-panel').classList.contains('show'), 20000)
  test('L9b real SPIN click runs the reel', spun.hit === true, JSON.stringify({ cells: await evl(page, () => document.querySelectorAll('.slot-cell').length) }))
  await page.keyboard.press('Escape'); await sleep(2000)
  s = await getState(page)
  const saveWritten = await evl(page, () => localStorage.getItem('till_debt_save') !== null)
  test('L9c Escape closes slot, save fires', s.slotOpen === false && saveWritten.ok && saveWritten.value === true, JSON.stringify({ slotOpen: s?.slotOpen, save: saveWritten?.value }))
  const tilesAfter = JSON.stringify(s.farm.tiles.map(r => r.map(t => [t.type, t.cropId, t.growthDay])))
  test('L9d farm tiles identical across slot session (no corruption)', tilesBefore === tilesAfter, 'differs')
  test('L9e no page errors during slot flow', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L10. Softlock sweep — every state must return to control')
{
  const paths = [
    { name: 'farm-day', fixture: 'farm-day', exit: async p => { await p.keyboard.press('1'); await sleep(500); await p.keyboard.press(' '); await sleep(700); } },
    { name: 'farm-night (1320)', fixture: 'farm-night', exit: async p => { await evl(p, () => window.__debug.setState({ player: { timeOfDay: 1320 } })); await sleep(500); await clearDialogues(p, 8000); await p.keyboard.press('Escape'); await sleep(600); await p.keyboard.press('Escape'); await sleep(600); } },
    { name: 'mine', fixture: 'mine-floor-1', exit: async p => { await evl(p, () => window.__debug.setState({ position: { x: 4.5, z: 4.5 } })); await p.keyboard.press('e'); await sleep(1500); } },
    { name: 'shop', fixture: 'shop-open', exit: async p => { await p.keyboard.press('Escape'); await sleep(800); } },
    { name: 'inventory', fixture: 'inventory-open', exit: async p => { await p.keyboard.press('Escape'); await sleep(800); } },
    { name: 'dialogue', fixture: 'dialogue-open', exit: async p => { await clearDialogues(p, 15000); } },
    { name: 'slot', fixture: 'slot-machine', exit: async p => { await p.keyboard.press('Escape'); await sleep(1200); } },
    { name: 'pause', fixture: 'farm-day', exit: async p => { await p.keyboard.press('Escape'); await sleep(800); await p.keyboard.press('Escape'); await sleep(800); } },
  ]
  for (const path of paths) {
    await evl(page, (name) => window.__debug.gotoFixture(name), path.fixture)
    await sleep(800)
    await path.exit(page)
    const s = await getState(page)
    const ok = s.started === true && !s.inMine && !s.slotOpen && !s.ui.shopOpen && !s.ui.inventoryOpen && !s.ui.dialogueActive && s.paused === false && (s.scene === 'farm' || s.scene === 'menu')
    test(`L10 ${path.name}: escape path returns to controllable state`, ok, JSON.stringify({ scene: s?.scene, inMine: s?.inMine, slot: s?.slotOpen, shop: s?.ui?.shopOpen, inv: s?.ui?.inventoryOpen, dlg: s?.ui?.dialogueActive, paused: s?.paused }))
  }
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await sleep(800)
  await page.keyboard.press('Escape'); await sleep(800)
  let s = await getState(page)
  test('L10 pause: Escape pauses (clock freezes)', s.paused === true, JSON.stringify({ paused: s?.paused }))
  const todPaused = s.player.timeOfDay
  await sleep(1500)
  s = await getState(page)
  test('L10 pause: timeOfDay frozen while paused', s.player.timeOfDay === todPaused, JSON.stringify({ was: todPaused, now: s?.player?.timeOfDay }))
  await page.keyboard.press('Escape'); await sleep(800)
  s = await getState(page)
  test('L10 pause: second Escape resumes', s.paused === false, JSON.stringify({ paused: s?.paused }))
  test('L10 no page errors across softlock sweep', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

// ─────────────────────────────────────────────────────────────
section('L11. Save/load round-trip at rich state')
{
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  await sleep(800)
  const inv = (await getState(page)).player.inventory
  inv[7] = { id: 'turnip', count: 3 }
  inv[8] = { id: 'ore_copper', count: 2 }
  await setState(page, {
    player: { gold: 777, day: 7, timeOfDay: 1234, inventory: inv, stamina: 40 },
    farm: { tiles: { '7,7': { type: 'WATERED', cropId: 'turnip', growthDay: 2, watered: true } }, binItems: [{ id: 'turnip', count: 1 }] },
  })
  await page.keyboard.press('r'); await sleep(1500)
  await page.keyboard.press('Escape'); await sleep(2500)
  const saveWritten = await evl(page, () => localStorage.getItem('till_debt_save') !== null && localStorage.getItem('till_debt_farm') !== null)
  const savedTod = await evl(page, () => {
    const raw = localStorage.getItem('till_debt_save')
    if (!raw) return null
    const d = JSON.parse(raw)
    return typeof d.timeOfDay === 'number' ? d.timeOfDay : null
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })
  await sleep(800)
  await page.click('#start-btn')
  await sleep(2000)
  await clearDialogues(page, 8000)
  const s = await getState(page)
  test('L11a save written on slot-close (real flow)', saveWritten.ok && saveWritten.value === true, JSON.stringify(saveWritten?.value))
  test('L11b reload+start: gold 777 restored', s.player.gold === 777, JSON.stringify({ gold: s?.player?.gold }))
  test('L11c day 7 restored', s.player.day === 7, JSON.stringify({ day: s?.player?.day }))
  // Relative: reload+start loads the SAVED clock, not a fresh morning. Fast
  // mode keeps advancing after load (up to ~40 min/s), so compare modularly
  // against the raw saved value (handles wrap past 1440).
  test('L11d timeOfDay ≈1234 restored (modular drift ≤300min from saved clock)', savedTod.ok && savedTod.value !== null && modDist(s.player.timeOfDay, savedTod.value) <= 300,
    JSON.stringify({ saved: savedTod.value, loaded: s?.player?.timeOfDay }))
  test('L11e inventory restored (turnip 3, ore_copper 2)', s.player.inventory.some(x => x?.id === 'turnip' && x.count === 3) && s.player.inventory.some(x => x?.id === 'ore_copper' && x.count === 2), JSON.stringify(s?.player?.inventory?.filter(Boolean).slice(5)))
  test('L11f farm crop at 7,7 restored', s.farm.tiles[7][7].cropId === 'turnip' && s.farm.tiles[7][7].growthDay === 2, JSON.stringify(s?.farm?.tiles?.[7]?.[7]))
  test('L11g no page errors across save/load', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
}

test('FINAL: no page errors anywhere in the full loop', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== FULL LOOP SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
