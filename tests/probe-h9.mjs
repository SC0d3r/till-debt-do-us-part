import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--disable-dev-shm-usage'] })
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => window.__debug && window.__debug.ready, { timeout: 60000 })
console.log('fixture:', await page.evaluate(() => window.__debug.gotoFixture('farm-day')))
await new Promise(r => setTimeout(r, 1500))
const before = await page.evaluate(() => window.__debug.getState())
console.log('pos-before:', JSON.stringify({ p: before.position, started: before.started }))
console.log('setState:', await page.evaluate(() => window.__debug.setState({ position: { x: 0.5, z: 0.5 } })))
await new Promise(r => setTimeout(r, 1500))
const after = await page.evaluate(() => window.__debug.getState())
console.log('pos-after:', JSON.stringify(after.position))
await page.keyboard.press('e')
await new Promise(r => setTimeout(r, 1500))
const dlg = await page.evaluate(() => {
  const box = document.getElementById('dialog-box')
  const text = document.getElementById('dialog-text')?.textContent
  const choices = [...document.querySelectorAll('#dialog-choices .dialog-choice')].map(b => b.textContent)
  return { visible: box ? getComputedStyle(box).display !== 'none' : 'NO-BOX', text, choices }
})
console.log('H9-ISO:', JSON.stringify(dlg))
await browser.close()
