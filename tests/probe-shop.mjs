import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => window.__debug, { timeout: 60000 })
await page.evaluate(() => window.__debug.gotoFixture('shop-open'))
await new Promise(r => setTimeout(r, 1500))
for (let i = 0; i < 3; i++) {
  const r = await page.evaluate(() => {
    const p = document.getElementById('shop-panel')
    const c = document.getElementById('shop-content')
    return { panel: { st: p.scrollTop, sh: p.scrollHeight, ch: p.clientHeight }, content: c ? { st: c.scrollTop, sh: c.scrollHeight, ch: c.clientHeight } : null, display: getComputedStyle(p).display }
  })
  console.log('SHOP-' + i + ':', JSON.stringify(r))
  await new Promise(r => setTimeout(r, 3000))
}
await browser.close()
