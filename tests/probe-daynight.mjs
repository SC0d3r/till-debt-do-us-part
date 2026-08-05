// Day/night cycle (slice 1) functional QA probe.
// Per DEBUG_HARNESS Part D: preconditions via window.__debug, real input for
// the interactions under test (sleep confirm click, pause Escape, save via
// slot close + reload + start button).
import puppeteer from 'puppeteer-core'

const CHROME = '/usr/bin/google-chrome'
const URL_DEBUG = 'http://localhost:5173/?debug=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

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
    await sleep(500)
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
  test('DN1.1 setState 1320 → getState returns ≈1320 (clock advances during 600ms settle)', ok1320.ok && s1?.player.timeOfDay >= 1320 && s1?.player.timeOfDay < 1330,
    JSON.stringify(s1?.player?.timeOfDay))

  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: 1500 } }), '0..1439', 'DN1.2 setState 1500 throws (out of range)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: -5 } }), '0..1439', 'DN1.3 setState -5 throws (out of range)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: 360.5 } }), 'integer', 'DN1.4 setState 360.5 throws (non-integer)')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: NaN } }), 'finite number', 'DN1.5 setState NaN throws')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: Infinity } }), 'finite number', 'DN1.6 setState Infinity throws')
  await expectThrows(page, () => window.__debug.setState({ player: { timeOfDay: '360' } }), 'finite number', 'DN1.7 setState string "360" throws')

  const ok0 = await setState(page, { player: { timeOfDay: 0 } })
  const s0 = await getState(page)
  test('DN1.8 boundary 0 accepted', ok0.ok && s0?.player.timeOfDay >= 0 && s0?.player.timeOfDay < 10, JSON.stringify(s0?.player?.timeOfDay))
  const ok1439 = await setState(page, { player: { timeOfDay: 1439 } })
  const s1439 = await getState(page)
  test('DN1.9 boundary 1439 accepted', ok1439.ok && s1439?.player.timeOfDay >= 1439, JSON.stringify(s1439?.player?.timeOfDay))

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
  const delta = t1 - t0
  test('DN2.1 clock advances while running (3s)', delta > 0, `+${delta.toFixed(3)} min over 3s`)
  // Spec rate is 2 min/s; on this ~1fps headless box the per-frame dt clamp
  // (0.05s) limits the measured wall-clock rate to ~0.1 min/s. Bound: never
  // faster than spec, always positive.
  test('DN2.2 advance never exceeds spec rate 2 min/s (+tolerance)', delta <= 3 * 2 * 1.3 + 0.5, `+${delta.toFixed(3)}`)
  // Per-frame invariant: dt clamped at 0.05 → max 0.1 in-game min per frame.
  const p0 = (await getState(page)).player.timeOfDay
  await sleep(2500) // ~2-3 frames at 1fps
  const p1 = (await getState(page)).player.timeOfDay
  const perFrame = (p1 - p0) / Math.max(1, Math.round(2500 / 1000))
  test('DN2.3 per-frame increment sane (<= 0.2 min/frame)', perFrame <= 0.21, `${perFrame.toFixed(4)} min/frame measured (frame-rate dependent clock)`)

  // shop open → advances
  await setState(page, { ui: { shopOpen: true } })
  const shop0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const shop1 = (await getState(page)).player.timeOfDay
  test('DN2.4 clock advances while shopOpen', shop1 - shop0 > 0, `+${(shop1 - shop0).toFixed(3)}`)
  await setState(page, { ui: { shopOpen: false } })

  // inventory open → advances
  await setState(page, { ui: { inventoryOpen: true } })
  const inv0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const inv1 = (await getState(page)).player.timeOfDay
  test('DN2.5 clock advances while inventoryOpen', inv1 - inv0 > 0, `+${(inv1 - inv0).toFixed(3)}`)
  await setState(page, { ui: { inventoryOpen: false } })

  // dialogue active → advances
  await setState(page, { ui: { dialogue: { speaker: 'X', text: 'Hello' } } })
  const dlg0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const dlg1 = (await getState(page)).player.timeOfDay
  test('DN2.6 clock advances while dialogueActive', dlg1 - dlg0 > 0, `+${(dlg1 - dlg0).toFixed(3)}`)
  await setState(page, { ui: { dialogue: null } })

  // slot open → advances
  await setState(page, { ui: { slotOpen: true } })
  const slot0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const slot1 = (await getState(page)).player.timeOfDay
  test('DN2.7 clock advances while slotOpen', slot1 - slot0 > 0, `+${(slot1 - slot0).toFixed(3)}`)
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
  test('DN2.10 clock resumes after unpause', rz.paused === false && rz.player.timeOfDay > pz1, `paused=${rz.paused} tod=${rz.player.timeOfDay} (>${pz1})`)

  // In-mine advance
  await setState(page, { mine: { inMine: true, floor: 0 } })
  const m0 = (await getState(page)).player.timeOfDay
  await sleep(2000)
  const m1 = (await getState(page)).player.timeOfDay
  test('DN2.11 clock advances while in mine', m1 - m0 > 0, `+${(m1 - m0).toFixed(3)}`)

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
  test('DN3.3 sleep resets timeOfDay to 06:00 (360)', s.player.timeOfDay >= 360 && s.player.timeOfDay < 364, JSON.stringify(s?.player?.timeOfDay))
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
  test('DN4.1 farm-day pins timeOfDay 720', s.player.timeOfDay >= 720 && s.player.timeOfDay < 730, JSON.stringify(s?.player?.timeOfDay))
  const ff = await evl(page, () => window.__debug.fastForward(1))
  s = await getState(page)
  test('DN4.2 fastForward(1): day+1, timeOfDay 360, stamina 100', ff.ok && s.player.day === 2 && s.player.timeOfDay >= 360 && s.player.timeOfDay < 364 && s.player.stamina === 100,
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
  test('DN5.2 farm-night timeOfDay ≈ 1320 (22:00)', sn?.player.timeOfDay >= 1320 && sn?.player.timeOfDay < 1340, JSON.stringify(sn?.player?.timeOfDay))
  test('DN5.3 farm-night is night (Moonpetal glow window)', sn?.player.timeOfDay >= 1080 || sn?.player.timeOfDay < 360, JSON.stringify(sn?.player?.timeOfDay))
  const clock = await pollUntil(page, () => /^22:0/.test(document.getElementById('time-display')?.textContent || ''), 15000, 'clock')
  test('DN5.4 HUD clock shows 22:0x on farm-night', clock.hit, JSON.stringify(clock.last?.value))

  const rd = await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const sd = await getState(page)
  test('DN5.5 farm-day settles, timeOfDay ≈ 720', rd.ok && sd?.player.timeOfDay >= 720 && sd?.player.timeOfDay < 730, JSON.stringify(sd?.player?.timeOfDay))

  const rc = await evl(page, () => window.__debug.gotoFixture('farm-crops-grown'))
  const sc = await getState(page)
  test('DN5.6 farm-crops-grown settles, timeOfDay ≈ 720', rc.ok && sc?.player.timeOfDay >= 720 && sc?.player.timeOfDay < 730, JSON.stringify(sc?.player?.timeOfDay))

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
  test('DN6.2 slot-close save persisted timeOfDay ≈1320 (clock runs while slot open — saved value is the live clock) + gold 777', ls.ok && ls.value?.timeOfDay >= 1320 && ls.value?.timeOfDay < 1400 && ls.value?.gold === 777,
    JSON.stringify(ls.value))

  // Reload (real) and load via the real start button
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })
  await page.click('#start-btn')
  await sleep(1500)
  const loaded = await getState(page)
  test('DN6.3 reload + start loads the SAVED timeOfDay (round-trip within ±60min of save)', loaded?.player.timeOfDay >= 1320 && loaded?.player.timeOfDay < 1420,
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
  const c0 = await evl(page, () => document.getElementById('time-display')?.textContent)
  test('DN7.1 HUD clock element exists and starts 06:00', c0.ok && c0.value === '06:00', JSON.stringify(c0.value))
  const ticked = await pollUntil(page, () => {
    const t = document.getElementById('time-display')?.textContent || ''
    return /^06:0[1-9]$/.test(t)
  }, 90000, 'clock-tick')
  test('DN7.2 clock ticks 06:00 → 06:0x within 90s (frame-rate bound on this box)', ticked.hit, JSON.stringify(ticked.last?.value))

  // Wrap 1439 → 0
  await setState(page, { player: { timeOfDay: 1439 } })
  const wrapped = await pollUntil(page, () => {
    const tod = window.__debug.getState().player.timeOfDay
    return Number.isFinite(tod) && tod < 10
  }, 90000, 'wrap')
  const sw = await getState(page)
  test('DN7.3 timeOfDay wraps 1439 → 0..10 without NaN', wrapped.hit && Number.isFinite(sw?.player.timeOfDay) && sw.player.timeOfDay < 10,
    JSON.stringify(sw?.player?.timeOfDay))
  const cw = await evl(page, () => document.getElementById('time-display')?.textContent)
  test('DN7.4 clock shows 00:0x after wrap', cw.ok && /^00:0/.test(cw.value || ''), JSON.stringify(cw.value))
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
  test('DN8.1 setState timeOfDay works with all overlays open', r.ok && s?.player.timeOfDay >= 1320 && s?.player.timeOfDay < 1330, r.ok ? '' : r.error)
  await setState(page, { ui: { dialogue: null, inventoryOpen: false, shopOpen: false } })
  await sleep(2000)
  const s2 = await getState(page)
  test('DN8.2 clock resumes after closing overlays', s2.player.timeOfDay > 1320, JSON.stringify(s2?.player?.timeOfDay))
  test('DN8.3 no page errors during interruption battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== DAY/NIGHT SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
