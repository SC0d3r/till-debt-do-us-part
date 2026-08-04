import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
page.on('requestfailed', r => console.log('FAILED', r.url(), r.failure()?.errorText))
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))
await browser.close()
