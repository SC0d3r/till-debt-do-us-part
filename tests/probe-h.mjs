import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
const errs = []; page.on('pageerror', e => errs.push(String(e)))
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__debug)
const evl = async fn => page.evaluate(fn)
const getS = async () => evl(() => {
  const s = window.__debug.getState()
  return { pos: s.position, gold: s.player.gold, day: s.player.day, hoe: s.player.toolDurability.hoe,
    water: s.player.waterLevel, seeds: s.player.inventory[5]?.count, ui: s.ui, dialogue: s.dialogue,
    changed: s.farm.tiles.flatMap((row, z) => row.map((t, x) => t.type !== 0 || t.cropId ? `${x},${z}:t${t.type}${t.cropId ? '/' + t.cropId + ':' + t.growthDay : ''}${t.watered ? 'W' : ''}` : null)).filter(Boolean) }
})
await evl(() => window.__debug.setState({ player: { introSeen: true, stamina: 100, waterLevel: 10, selectedSlot: 0 }, started: true, position: { x: 5, z: 5 }, farm: { tiles: { '5,4': { type: 'GRASS' }, '5,6': { type: 'GRASS' } } } }))
console.log('AFTER SETUP', JSON.stringify(await getS()))
await page.keyboard.down('w'); await new Promise(r => setTimeout(r, 300)); await page.keyboard.up('w')
await new Promise(r => setTimeout(r, 800))
console.log('AFTER W', JSON.stringify(await getS()))
await page.keyboard.press('1'); await new Promise(r => setTimeout(r, 300))
await page.keyboard.press(' '); await new Promise(r => setTimeout(r, 800))
console.log('AFTER HOE+SPACE', JSON.stringify(await getS()))
await page.keyboard.press('6'); await new Promise(r => setTimeout(r, 300))
await page.keyboard.press(' '); await new Promise(r => setTimeout(r, 800))
console.log('AFTER SEED+SPACE', JSON.stringify(await getS()))
await page.keyboard.press('2'); await new Promise(r => setTimeout(r, 300))
await page.keyboard.press(' '); await new Promise(r => setTimeout(r, 800))
console.log('AFTER WATER+SPACE', JSON.stringify(await getS()))
console.log('ERRORS', JSON.stringify(errs))
await browser.close()
