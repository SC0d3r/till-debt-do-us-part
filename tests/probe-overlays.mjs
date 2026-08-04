import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => window.__debug, { timeout: 60000 })
await page.evaluate(() => window.__debug.gotoFixture('farm-day'))
await new Promise(r => setTimeout(r, 1500))
const r = await page.evaluate(() => {
  const s = window.__debug.getState().ui
  const read = id => { const el = document.getElementById(id); return { inline: el?.style?.display, computed: el ? getComputedStyle(el).display : 'NO-EL' } }
  return { flags: s, pause: read('pause-overlay'), start: read('start-overlay'), payment: read('payment-overlay') }
})
console.log('OVERLAYS:', JSON.stringify(r))
await browser.close()
