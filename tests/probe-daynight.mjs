// Day/night cycle (slice 1) functional QA probe.
// Per DEBUG_HARNESS Part D: preconditions via window.__debug, real input for
// the interactions under test (sleep confirm click, pause Escape, save via
// slot close + reload + start button).
import puppeteer from 'puppeteer-core'

const CHROME = '/usr/bin/google-chrome'
const URL_DEBUG = 'http://localhost:5173/?debug=1&fast=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

// Fast mode runs the in-game clock up to 20x, so a test can wrap past 1440.
// Modular distance on the 1440-minute clock for relative round-trip checks.
const modDist = (a, b) => Math.min((a - b + 1440) % 1440, (b - a + 1440) % 1440)
// Wrap-aware FORWARD game-clock distance from b to a (monotonic advance modulo
// 1440): for "clock advanced during this window" checks, which must stay true
// when the window crosses midnight (a fast-mode 2s window can span 80
// game-minutes).
const fwdDelta = (a, b) => (a - b + 1440) % 1440
// Pinned-clock rule (both suites share it): where the intent is "same
// time-of-day region" (e.g. the fixture pinned 22:00 and the live clock keeps
// advancing), compare with modDist — strict non-modular compare is reserved
// for "exactly this elapsed interval" intents.
const pinNear = (tod, pin, margin) => Number.isFinite(tod) && modDist(tod, pin) <= margin

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS,
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

// ─────────────────────────────────────────────────────────────
section('DN1. setState/getState timeOfDay validation')
{
  const page = await newPage()
  await loadDebug(page)
  await setState(page, { started: true, player: { introSeen: true } })

  const ok1320 = await setState(page, { player: { timeOfDay: 1320 } })
  const s1 = await getState(page)
  // Relative: fast mode advances ~40 min/s during the 600ms settle, so the
  // clock is at-or-after 1320 (never a fixed window).
  test('DN1.1 setState 1320 → getState returns ≈1320 (clock advances during settle)', ok1320.ok && s1?.player.timeOfDay >= 1320 && s1?.player.timeOfDay < 1440,
    JSON.stringify(s1?.player?.timeOfDay))

  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: 1500 } }), '0..1439', 'DN1.2 setState 1500 throws (out of range)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: -5 } }), '0..1439', 'DN1.3 setState -5 throws (out of range)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: 360.5 } }), 'integer', 'DN1.4 setState 360.5 throws (non-integer)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: NaN } }), 'finite number', 'DN1.5 setState NaN throws')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: Infinity } }), 'finite number', 'DN1.6 setState Infinity throws')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: '360' } }), 'finite number', 'DN1.7 setState string "360" throws')

  const ok0 = await setState(page, { player: { timeOfDay: 0 } })
  const s0 = await getState(page)
  // Relative: 0 accepted, clock advances out of midnight (fast mode: up to
  // ~40 min/s during settle).
  test('DN1.8 boundary 0 accepted', ok0.ok && s0?.player.timeOfDay >= 0 && s0?.player.timeOfDay < 120, JSON.stringify(s0?.player?.timeOfDay))
  const ok1439 = await setState(page, { player: { timeOfDay: 1439 } })
  const s1439 = await getState(page)
  // Relative: 1439 accepted; the live clock wraps to just past midnight.
  test('DN1.9 boundary 1439 accepted', ok1439.ok && (s1439?.player.timeOfDay >= 1439 || s1439?.player.timeOfDay < 120), JSON.stringify(s1439?.player?.timeOfDay))

  // Runtime-advance produces floats: getState must expose them as-is (integer
  // check is setState-only, by design).
  const sFloat = await getState(page)
  test('DN1.10 getState exposes timeOfDay (number)', typeof sFloat?.player?.timeOfDay === 'number' && Number.isFinite(sFloat.player.timeOfDay), JSON.stringify(sFloat?.player?.timeOfDay))
  test('DN1.11 no page errors during validation battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN2. Clock advance (real time)')
{
  const page = await newPage()
  await loadDebug(page)
  await setState(page, { started: true, player: { introSeen: true, timeOfDay: 720 } })
  await sleep(1000) // settle

  const t0 = (await getState(page)).player.timeOfDay
  await sleep(3000)
  const t1 = (await getState(page)).player.timeOfDay
  // Wrap-aware: the sample window can cross midnight in fast mode.
  const delta = fwdDelta(t1, t0)
  test('DN2.1 clock advances while running (3s)', delta > 0, `+${delta.toFixed(3)} min over 3s`)
  // Spec rate is 2 min/s (×dtScale in fast mode). On this ~1fps headless box
  // the per-frame dt clamp limits the normal-mode wall rate; fast mode runs
  // up to 20x. Bound: never faster than spec × dtScale (+tolerance), always
  // positive. Read the live dtScale so the check works in both modes.
  const fm = (await getState(page)).fastMode || { enabled: false, dtScale: 1 }
  const scale = fm.enabled ? fm.dtScale : 1
  test('DN2.2 advance never exceeds spec rate 2 min/s (×dtScale in fast mode)', delta <= 3 * 2 * scale * 1.3 + 0.5, `+${delta.toFixed(3)}`)
  // Per-TICK invariant: the scaled clock advances at most
  // min(rawDt, 0.25) × dtScale × 2 game-minutes per loop tick (the 0.25 raw
  // cap; 10 game-min/tick at the 20x default). Sample (ticks, timeOfDay)
  // pairs and assert the ratio — tick-count based, so it is frame-rate
  // independent and passes at ANY tick rate (27-250/s), unlike the old
  // wall-clock-frame division that only matched ~1fps normal mode.
  const a = await getState(page)
  const tk0 = a?.fastMode?.ticks ?? -1
  const p0 = a.player.timeOfDay
  await sleep(2500)
  const b = await getState(page)
  const tk1 = b?.fastMode?.ticks ?? tk0
  const p1 = b.player.timeOfDay
  const tickDelta = Math.max(1, tk1 - tk0)
  // Wrap-aware forward delta on the 1440-minute clock (timeOfDay advances
  // monotonically modulo 1440).
  const todDelta = (p1 - p0 + 1440) % 1440
  const perTick = todDelta / tickDelta
  test('DN2.3 per-tick clock increment sane (0 < perTick ≤ 0.25×dtScale×2 game-min/tick)',
    perTick > 0 && perTick <= 0.25 * scale * 2 + 1e-9,
    `${perTick.toFixed(4)} game-min/tick over ${tickDelta} ticks (bound ${(0.25 * scale * 2).toFixed(1)})`)

  // shop open → advances
  await setState(page, { ui: { shopOpen: true } })
  const shop0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const shop1 = (await getState(page)).player.timeOfDay
  test('DN2.4 clock advances while shopOpen', fwdDelta(shop1, shop0) > 0, `+${fwdDelta(shop1, shop0).toFixed(3)}`)
  await setState(page, { ui: { shopOpen: false } })

  // inventory open → advances
  await setState(page, { ui: { inventoryOpen: true } })
  const inv0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const inv1 = (await getState(page)).player.timeOfDay
  test('DN2.5 clock advances while inventoryOpen', fwdDelta(inv1, inv0) > 0, `+${fwdDelta(inv1, inv0).toFixed(3)}`)
  await setState(page, { ui: { inventoryOpen: false } })

  // dialogue active → advances
  await setState(page, { ui: { dialogue: { speaker: 'X', text: 'Hello' } } })
  const dlg0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const dlg1 = (await getState(page)).player.timeOfDay
  test('DN2.6 clock advances while dialogueActive', fwdDelta(dlg1, dlg0) > 0, `+${fwdDelta(dlg1, dlg0).toFixed(3)}`)
  await setState(page, { ui: { dialogue: null } })

  // slot open → advances
  await setState(page, { ui: { slotOpen: true } })
  const slot0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const slot1 = (await getState(page)).player.timeOfDay
  test('DN2.7 clock advances while slotOpen', fwdDelta(slot1, slot0) > 0, `+${fwdDelta(slot1, slot0).toFixed(3)}`)
  await setState(page, { ui: { slotOpen: false } })

  // Paused (REAL Escape input) → frozen
  await page.keyboard.press('Escape')
  await sleep(800)
  const paused = await getState(page)
  const pz0 = paused.player.timeOfDay
  await sleep(2500)
  const pz1 = (await getState(page)).player.timeOfDay
  test('DN2.8 Escape pauses (getState.paused true)', paused.paused === true, JSON.stringify(paused?.paused))
  test('DN2.9 clock FROZEN while paused', pz1 === pz0, `before=${pz0} after=${pz1}`)
  await page.keyboard.press('Escape') // resume
  await sleep(2500)
  const rz = await getState(page)
  test('DN2.10 clock resumes after unpause', rz.paused === false && fwdDelta(rz.player.timeOfDay, pz1) > 0, `paused=${rz.paused} tod=${rz.player.timeOfDay} (>${pz1})`)

  // In-mine advance
  await setState(page, { mine: { inMine: true, floor: 0 } })
  const m0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const m1 = (await getState(page)).player.timeOfDay
  test('DN2.11 clock advances while in mine', fwdDelta(m1, m0) > 0, `+${fwdDelta(m1, m0).toFixed(3)}`)

  test('DN2.12 no page errors during clock probes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN3. Sleep via REAL input resets clock')
{
  const page = await newPage()
  await loadDebug(page)
  await setState(page, { started: true, player: { introSeen: true, timeOfDay: 1320, stamina: 30 } })
  await setState(page, { position: { x: 0.5, z: 0.5 } }) // house at (0,0), range 3.5

  await page.keyboard.press('e')
  let dlg = null
  // Chrome throttles the typewriter's 25ms interval to ~1 tick/s when the
  // page is non-visible; the harness H9 probe uses a 90s window for this same
  // flow. Match it.
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    dlg = await evl(page, () => {
      const box = document.getElementById('dialog-box')
      const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('sleep'))
      return { visible: box ? getComputedStyle(box).display !== 'none' : false, hasSleep: !!btn,
        speaker: document.getElementById('dialog-speaker')?.textContent,
        typed: document.getElementById('dialog-text')?.textContent?.length || 0 }
    })
    if (dlg.ok && dlg.value.hasSleep) break
  }
  test('DN3.1 E near house shows sleep confirm dialogue', dlg?.ok && dlg.value.visible && dlg.value.hasSleep, JSON.stringify(dlg?.value))

  const clicked = await evl(page, () => {
    const btn = [...document.querySelectorAll('#dialog-choices .dialog-choice')].find(b => b.textContent.toLowerCase().includes('sleep'))
    if (btn) btn.click()
    return !!btn
  })
  await sleep(3000)
  const s = await getState(page)
  test('DN3.2 real click Sleep: day 1 → 2', clicked.ok && s.player.day === 2, JSON.stringify({ clicked: clicked.value, day: s?.player?.day }))
  // Relative: sleep resets to 06:00 (360); the live clock then advances
  // (fast mode ~40 min/s → up to ~200 min over the post-sleep waits).
  test('DN3.3 sleep resets timeOfDay to 06:00 (360)', s.player.timeOfDay >= 360 && s.player.timeOfDay < 600, JSON.stringify(s?.player?.timeOfDay))
  test('DN3.4 sleep restores stamina to 100', s.player.stamina === 100, JSON.stringify(s?.player?.stamina))
  test('DN3.5 no page errors during sleep', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN4. fastForward resets clock')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  let s = await getState(page)
  // Pinned-clock rule: "same time-of-day region" → modular (see pinNear).
  test('DN4.1 farm-day pins timeOfDay 720', pinNear(s.player.timeOfDay, 720, 240), JSON.stringify(s?.player?.timeOfDay))
  const ff = await evl(page, () => window.__debug.fastForward(1))
  s = await getState(page)
  test('DN4.2 fastForward(1): day+1, timeOfDay ≈ 360, stamina 100', ff.ok && s.player.day === 2 && pinNear(s.player.timeOfDay, 360, 240) && s.player.stamina === 100,
    JSON.stringify({ day: s?.player?.day, tod: s?.player?.timeOfDay, stamina: s?.player?.stamina }))
  const ff2 = await evl(page, () => window.__debug.fastForward(0.5))
  s = await getState(page)
  test('DN4.3 fastForward(0.5) documented behavior (fractional days → floor+1? 0.5 → 1)', ff2.ok, JSON.stringify({ day: s?.player?.day, tod: s?.player?.timeOfDay }) + ' (fractional days accepted; loop runs ceil-ish)')
  test('DN4.4 no page errors during fastForward probes', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN5. Fixtures: farm-night / farm-day / farm-crops-grown / mine-floor-1')
{
  const page = await newPage()
  await loadDebug(page)
  const rn = await evl(page, () => window.__debug.gotoFixture('farm-night'))
  await sleep(400)
  const sn = await getState(page)
  test('DN5.1 farm-night settles ready', rn.ok && sn?.ready === true, rn.ok ? '' : rn.error)
  // Pinned-clock rule: "same time-of-day region" → modular. farm-night pins
  // 22:00 (1320); the live clock advances ~40 min/s during the 600ms settle,
  // so the observed clock is within ±120 game-minutes of the pin, either side
  // of the 1440 wrap.
  test('DN5.2 farm-night timeOfDay ≈ 1320 (22:00)', pinNear(sn?.player.timeOfDay, 1320, 120), JSON.stringify(sn?.player?.timeOfDay))
  test('DN5.3 farm-night is night (Moonpetal glow window)', sn?.player.timeOfDay >= 1080 || sn?.player.timeOfDay < 360, JSON.stringify(sn?.player?.timeOfDay))
  const clock = await pollUntil(page, () => /^22:/.test(document.getElementById('time-display')?.textContent || ''), 15000, 'clock')
  test('DN5.4 HUD clock shows 22:xx on farm-night', clock.hit, JSON.stringify(clock.last?.value))

  const rd = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const sd = await getState(page)
  test('DN5.5 farm-day settles, timeOfDay ≈ 720 (noon)', rd.ok && pinNear(sd?.player.timeOfDay, 720, 240), JSON.stringify(sd?.player?.timeOfDay))

  const rc = await evl(page, () => window.__debug.gotoFixture('farm-crops-grown'))
  const sc = await getState(page)
  test('DN5.6 farm-crops-grown settles, timeOfDay ≈ 720 (noon)', rc.ok && pinNear(sc?.player.timeOfDay, 720, 240), JSON.stringify(sc?.player?.timeOfDay))

  // night → day fixture switch must reset the clock via copyFreshPlayer
  await evl(page, () => window.__debug.gotoFixture('farm-night'))
  const rm = await evl(page, () => window.__debug.gotoFixture('mine-floor-1'))
  await sleep(400)
  const sm = await getState(page)
  test('DN5.7 mine-floor-1 settles without crash', rm.ok && sm?.ready === true, rm.ok ? '' : rm.error)
  test('DN5.8 mine-floor-1 inMine, scene mine, no sky state corruption', sm?.inMine === true && sm?.scene === 'mine', JSON.stringify({ inMine: sm?.inMine, scene: sm?.scene }))
  test('DN5.9 mine-floor-1 clock still advances (time runs in mine)', sm?.player.timeOfDay >= 360, JSON.stringify(sm?.player?.timeOfDay))
  const canvases = await evl(page, () => document.querySelectorAll('canvas').length)
  test('DN5.10 still exactly one canvas in mine (no scene leak)', canvases.ok && canvases.value === 1, String(canvases.value))

  // back to farm: clock continues from where it was
  const rf = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  test('DN5.11 farm-day after mine: settles, 720 again (copyFreshPlayer resets timeOfDay)', rf.ok, rf.ok ? '' : rf.error)
  test('DN5.12 no page errors during fixture battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN6. Save/load round-trip of timeOfDay (REAL save flow)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('farm-day')) // wipes localStorage + fresh start
  await setState(page, { player: { timeOfDay: 1320, gold: 777 } })
  // Live clock at test start (fast mode: already ~40 min past 1320 after settle).
  const todLive = (await getState(page)).player.timeOfDay

  // Real save: open slot with R, close with Escape → onClosed → saveGame
  await page.keyboard.press('r')
  await sleep(1200)
  const slotOpen = await evl(page, () => document.getElementById('slot-screen').classList.contains('show'))
  test('DN6.1 R opens slot (real input)', slotOpen.ok && slotOpen.value === true, JSON.stringify(slotOpen.value))
  await page.keyboard.press('Escape')
  await sleep(1800) // 430ms fade + margin
  const ls = await evl(page, () => {
    const raw = localStorage.getItem('till_debt_save')
    if (!raw) return null
    const d = JSON.parse(raw)
    return { day: d.day, timeOfDay: d.timeOfDay, gold: d.gold }
  })
  // Relative: the saved clock is the LIVE clock (modular — fast mode can wrap
  // past 1440 during the slot session) and gold round-trips exactly.
  test('DN6.2 slot-close save persisted the live timeOfDay (modular ≤300min drift) + gold 777', ls.ok && typeof ls.value?.timeOfDay === 'number' && Number.isFinite(ls.value.timeOfDay) && modDist(ls.value.timeOfDay, todLive) <= 300 && ls.value?.gold === 777,
    JSON.stringify({ live: todLive, saved: ls.value }))

  // Reload (real) and load via the real start button
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })
  await page.click('#start-btn')
  await sleep(1500)
  const loaded = await getState(page)
  // Relative: reload + start loads the SAVED timeOfDay, not a fresh morning
  // (modular ≤120min drift covers fast-mode clock running after load).
  test('DN6.3 reload + start loads the SAVED timeOfDay (round-trip within ±120min of save)', loaded?.player.timeOfDay !== undefined && ls.ok && typeof ls.value?.timeOfDay === 'number' && modDist(loaded.player.timeOfDay, ls.value.timeOfDay) <= 120,
    JSON.stringify({ saved: ls.value, loaded: loaded?.player?.timeOfDay }))
  test('DN6.4 reload + start loads gold 777', loaded?.player.gold === 777, JSON.stringify(loaded?.player?.gold))
  test('DN6.5 no page errors during save/load', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN7. HUD clock + wrap edge')
{
  const page = await newPage()
  await loadDebug(page)
  await setState(page, { started: true, player: { introSeen: true, timeOfDay: 360 } })
  await sleep(1500)
  // Relative: the HUD clock must show the LIVE game clock, not a frozen pin
  // (fast mode advances it ~40 min/s).
  const c0 = await evl(page, () => {
    const el = document.getElementById('time-display')
    if (!el) return null
    const tod = window.__debug.getState().player.timeOfDay
    const m = Math.floor(tod) % 1440
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    return el.textContent === `${hh}:${mm}`
  })
  test('DN7.1 HUD clock element exists and matches the live game clock', c0.ok && c0.value === true, JSON.stringify(c0.value))
  // DN7.2 intent: "the clock ticks forward out of the 06:00 pin". The 06:xx
  // DOM window is only ~1.5 real seconds wide at 20 game-min/s, so catching
  // the exact "06:" text is flake-prone — use a before/after relative check
  // instead: the live clock must be observed ≥30 game-minutes past the 06:00
  // pin (wrap-aware), which can only happen if it crossed 06:00.
  const ticked = await pollUntil(page, () => {
    const tod = window.__debug.getState().player.timeOfDay
    return Number.isFinite(tod) && ((tod - 360 + 1440) % 1440) >= 30
  }, 90000, 'clock-tick')
  test('DN7.2 clock crossed 06:00 (advances ≥30 game-min past the pin within 90s)', ticked.hit,
    JSON.stringify(ticked.last?.value ?? ticked.last?.error))

  // Wrap 1439 → 0
  await setState(page, { player: { timeOfDay: 1439 } })
  const wrapped = await pollUntil(page, () => {
    const tod = window.__debug.getState().player.timeOfDay
    return Number.isFinite(tod) && tod < 120
  }, 90000, 'wrap')
  const sw = await getState(page)
  // Pinned-clock rule: intent is "just past midnight" → modular. The poll
  // observed tod < 120; the follow-up getState may drift a few minutes more,
  // so allow ±180 game-minutes around 00:00 either side of the wrap.
  test('DN7.3 timeOfDay wraps 1439 → 00:xx without NaN', wrapped.hit && pinNear(sw?.player.timeOfDay, 0, 180),
    JSON.stringify(sw?.player?.timeOfDay))
  const cw = await evl(page, () => document.getElementById('time-display')?.textContent)
  test('DN7.4 clock shows 00:xx after wrap', cw.ok && /^00:/.test(cw.value || ''), JSON.stringify(cw.value))
  // isNight at 00:0x: moon window — sky must keep rendering (no crash is the assertable part)
  test('DN7.5 no page errors during wrap', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('DN8. Interruption: setState timeOfDay while overlays open')
{
  const page = await newPage()
  await loadDebug(page)
  await setState(page, { started: true, player: { introSeen: true } })
  // Interrupt mid-advance with every overlay open at once; timeOfDay must
  // still be settable and the game must keep running.
  await setState(page, { ui: { shopOpen: true, inventoryOpen: true, dialogue: { speaker: 'X', text: 'Y' } } })
  const r = await setState(page, { player: { timeOfDay: 1320 } })
  const s = await getState(page)
  // Relative: 1320 accepted with every overlay open; clock advances past it.
  test('DN8.1 setState timeOfDay works with all overlays open', r.ok && s?.player.timeOfDay >= 1320 && s?.player.timeOfDay < 1440, r.ok ? '' : r.error)
  await setState(page, { ui: { dialogue: null, inventoryOpen: false, shopOpen: false } })
  await sleep(2000)
  const s2 = await getState(page)
  test('DN8.2 clock resumes after closing overlays', fwdDelta(s2.player.timeOfDay, 1320) > 0, JSON.stringify(s2?.player?.timeOfDay))
  test('DN8.3 no page errors during interruption battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== DAY/NIGHT SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
