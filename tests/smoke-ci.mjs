// Minimal pipeline smoke test — verifies the CI runner chain works:
// dev server serves the debug harness on BASE_URL, puppeteer launches on the
// runner, custom-tests job runs arbitrary scripts, artifacts come back.
// Used by agents to sanity-check the pipeline itself (./scripts/run-ci-puppeteer.sh --tests=tests/smoke-ci.mjs).
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e)))
await page.goto(BASE + '/?debug=1', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })
let ready = false
try {
  await page.waitForFunction(() => window.__debug.ready === true, { timeout: 30000 })
  ready = true
} catch { /* ready never became true */ }
const hasSetState = await page.evaluate(() => typeof window.__debug.setState === 'function')
console.log('SMOKE: __debug present, ready =', ready, 'setState =', hasSetState, 'pageErrors =', errs.length)
await browser.close()
if (!ready || !hasSetState || errs.length) {
  console.error('SMOKE FAIL')
  process.exit(1)
}
console.log('SMOKE PASS')
