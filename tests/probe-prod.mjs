// Verify the production build (dist/ served on :4173) has NO debug harness at runtime.
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise(r => setTimeout(r, 2000))
const res = await page.evaluate(() => ({
  hasDebug: typeof window.__debug !== 'undefined',
  overlay: getComputedStyle(document.getElementById('start-overlay')).display !== 'none',
}))
console.log('PROD-DIST:', JSON.stringify(res), 'errors:', JSON.stringify(errors))
await browser.close()
process.exit(res.hasDebug ? 1 : 0)
