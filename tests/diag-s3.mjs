// DIAGNOSTIC (temporary): S3 stepping-stone iso counts for seeds 1337/777/4242
// — is chunkData pure per seed, and does regenerate() leave the seed set?
const useBundled = process.env.PUPPETEER_BUNDLED === '1'
let puppeteer
if (useBundled) {
  try { puppeteer = (await import('puppeteer')).default } catch { throw new Error('bundled puppeteer missing') }
} else {
  puppeteer = (await import('puppeteer-core')).default
}
const CHROME = useBundled ? undefined : (process.env.CHROME_PATH || '/usr/bin/google-chrome')
const BASE = process.env.BASE_URL || 'http://localhost:5173'
const URL_DEBUG = BASE + '/?debug=1&fast=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540 } })
const page = await browser.newPage()
await page.goto(URL_DEBUG, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => !!window.__debug, { timeout: 20000 })

const scanFn = () => {
  const w = window.__debug.world
  const solid = new Set()
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
    for (const t of w.chunkData(cx, cy).tiles) solid.add(`${t.x},${t.y}`)
  }
  let n = 0
  const isoList = []
  for (const key of solid) {
    const [x, y] = key.split(',').map(Number)
    if (!solid.has(`${x + 1},${y}`) && !solid.has(`${x - 1},${y}`) && !solid.has(`${x},${y + 1}`) && !solid.has(`${x},${y - 1}`)) {
      n++
      isoList.push(`${x},${y}`)
    }
  }
  return { seed: w.seed, isoCount: n, isoList }
}

const out = { rows: [], pureScans: [] }
for (const seed of [1337, 777, 4242]) {
  await page.evaluate((s) => window.__debug.regenerate(s), seed)
  await new Promise(res => setTimeout(res, 300))
  const a = await page.evaluate(scanFn)
  const b = await page.evaluate(scanFn)
  const c = await page.evaluate(scanFn)
  out.rows.push({ seed, a, b, c })
}
out.pureScans.push(await page.evaluate(scanFn))
out.pureScans.push(await page.evaluate(scanFn))
console.log(JSON.stringify(out, null, 1))
await browser.close()
process.exit(0)
