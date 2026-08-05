#!/usr/bin/env node
/**
 * Captures screenshots of every registered debug fixture via window.__debug.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs --all
 *   node scripts/capture-screenshots.mjs --fixtures=farm-day,shop-open
 *   node scripts/capture-screenshots.mjs --all --concurrency=2
 *
 * Requires puppeteer-core + a system Chrome (CHROME_PATH env or common paths).
 * If the game isn't already served at $VITE_URL / http://localhost:5173, this
 * script spawns `npm run dev -- --port 5173 --strictPort` and kills it on exit.
 *
 * GPU note: capture first tries headless Chrome WITH GPU flags
 * (--use-gl=desktop --ignore-gpu-blocklist --enable-gpu-rasterization). If a
 * fixture times out or its PNG is suspiciously small (< ~8 kB — a blank-frame
 * heuristic), it is retried ONCE in a second browser instance launched WITHOUT
 * the GPU flags (plain SwiftShader software rendering).
 *
 * This machine (headless Linux, no discrete GPU) needs the SOFTWARE-RENDERING
 * fallback: `--use-gl=desktop` stalls the WebGL farm scenes to ~1-2 fps here
 * (GPU stalls / SwiftShader deprecation warnings in the console), while plain
 * software rendering keeps ~9-14 fps. The harness settle is wall-clock based
 * (see src/debug/devHarness.ts), so even the slow GPU path settles, but most
 * farm-scene fixtures land on the software path on this machine. The GPU path
 * is kept as the primary attempt per the spec.
 *
 * Viewport is 960x720 (NOT the 960x540 suggested in DEBUG_HARNESS.md): at
 * 540px height the slot machine's measure() hits its mobile breakpoint
 * (vh < 620 → stacked layout) and the controls hint is hidden by CSS. 720px
 * gives a proper desktop reference: desktop slot layout + visible hint.
 * Additionally, headless Chrome reports `(hover: none)` (no input devices),
 * which would trip the slot's mobile media query anyway — loadPage() strips
 * the `(hover: none)` clause from those rules via CSSOM so captures show the
 * real desktop layout (see the comment in loadPage).
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS_DIR = join(ROOT, 'tests', 'screenshots')
const INDEX_PATH = join(SHOTS_DIR, 'index.json')
const REGISTRY_PATH = join(ROOT, 'tests', 'scene-fixtures.json')

const CHROME_PATH =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(p => existsSync(p))

if (!CHROME_PATH) {
  throw new Error('No Chrome/Chromium binary found. Set CHROME_PATH explicitly.')
}

// GPU flags FIRST per the spec; the fallback drops them entirely.
const GPU_ARGS = ['--use-gl=desktop', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio']
// Software rendering: --enable-unsafe-swiftshader is REQUIRED on modern Chrome
// — without it headless Chrome refuses the automatic software-WebGL fallback
// ("Automatic fallback to software WebGL has been deprecated") and WebGL
// scenes can crawl at ~2 fps.
const SOFT_ARGS = ['--mute-audio', '--enable-unsafe-swiftshader']

const FIXTURE_TIMEOUT_MS = 20000 // 15s waitForFunction + margins
const BLANK_PNG_BYTES = 8192 // < ~8 kB PNG = blank-frame heuristic

// ─── CLI parsing ───
function parseArgs() {
  const args = process.argv.slice(2)
  let fixtures = null // null means --all
  let concurrency = 1
  for (const a of args) {
    if (a === '--all') fixtures = null
    else if (a.startsWith('--fixtures=')) {
      fixtures = a.slice('--fixtures='.length).split(',').map(s => s.trim()).filter(Boolean)
    } else if (a.startsWith('--concurrency=')) {
      concurrency = parseInt(a.slice('--concurrency='.length), 10)
      if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error(`Invalid --concurrency: ${a}`)
    } else {
      throw new Error(`Unknown argument: ${a}`)
    }
  }
  if (fixtures === null) fixtures = loadRegistry().map(f => f.name)
  const known = new Set(loadRegistry().map(f => f.name))
  for (const name of fixtures) {
    if (!known.has(name)) throw new Error(`Unknown fixture "${name}" (see tests/scene-fixtures.json)`)
  }
  return { fixtures, concurrency }
}

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

function getUrl() {
  return (process.env.VITE_URL || 'http://localhost:5173') + '?debug=1'
}

// ─── Dev server handling ───
let devServer = null

async function reachable(base) {
  try {
    // AbortSignal.timeout so a half-open port (orphaned vite holding 5173)
    // fails fast instead of hanging ~5 min before undici's ETIMEDOUT.
    const res = await fetch(base, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  const base = process.env.VITE_URL || 'http://localhost:5173'
  if (await reachable(base)) {
    console.log(`[server] using already-running server at ${base}`)
    return
  }
  console.log(`[server] ${base} unreachable — spawning "npm run dev -- --port 5173 --strictPort"`)
  devServer = spawn('npm', ['run', 'dev', '--', '--port', '5173', '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (devServer.exitCode !== null) {
      throw new Error(`[server] dev server exited early (code ${devServer.exitCode})`)
    }
    if (await reachable(base)) {
      console.log('[server] dev server is up')
      return
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`[server] dev server never became reachable at ${base} within 30s`)
}

function stopServer() {
  if (devServer) {
    try { devServer.kill('SIGTERM') } catch {}
    devServer = null
  }
}
process.on('exit', stopServer)
process.on('SIGINT', () => { stopServer(); process.exit(130) })

// ─── Capture helpers ───
function withTimeout(promise, ms, name) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name}: TIMEOUT after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function loadPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__debug, { timeout: 15000 })
  // Headless Chrome reports `(hover: none)` and `(pointer: none)` (it has no
  // input devices), which trips the slot machine's mobile CSS media query
  // (`@media (max-width: 700px), (max-height: 620px) and (orientation:
  // landscape), (hover: none)`) even at desktop viewport sizes — hiding the
  // controls hint and switching the slot to the mobile layout. No flag or CDP
  // emulation can change hover/pointer in headless, so drop the `(hover: none)`
  // clause out of those rules via CSSOM (mediaText is writable). Real touch
  // devices are unaffected: the `(pointer: coarse)` clauses remain.
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules) {
        if (rule.media && typeof rule.media.mediaText === 'string' && rule.media.mediaText.includes('hover: none')) {
          rule.media.mediaText = rule.media.mediaText.replace(/(?:,\s*)?\(hover:\s*none\)/g, '')
        }
      }
    }
  })
}

async function runFixture(page, name) {
  // Never sleep() — always poll the ready flag.
  await page.evaluate(n => window.__debug.gotoFixture(n), name)
  await page.waitForFunction(() => window.__debug?.ready === true, { timeout: 15000 })
  const path = join(SHOTS_DIR, `${name}.png`)
  await page.screenshot({ path })
  const size = existsSync(path) ? statSync(path).size : 0
  return { ok: true, path, size }
}

async function runAll({ fixtures, concurrency, url, args, label }) {
  const results = new Map()
  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true, // puppeteer-core 25; the doc's 'new' string is a legacy alias
      defaultViewport: { width: 960, height: 720, deviceScaleFactor: 1 },
      args,
    })
  } catch (err) {
    // Launch failure (e.g. bad flags): mark every fixture failed so the caller's
    // fallback pass can retry them.
    for (const name of fixtures) results.set(name, { ok: false, error: err, mode: label })
    return results
  }
  try {
    const pages = []
    for (let i = 0; i < Math.min(concurrency, fixtures.length); i++) {
      pages.push(await browser.newPage())
    }
    const queue = [...fixtures]
    const workers = pages.map(async (page) => {
      let loaded = false
      while (queue.length) {
        const name = queue.shift()
        try {
          if (!loaded) {
            await loadPage(page, url)
            loaded = true
          }
          const res = await withTimeout(runFixture(page, name), FIXTURE_TIMEOUT_MS, name)
          results.set(name, { ...res, mode: label })
        } catch (err) {
          results.set(name, { ok: false, error: err, mode: label })
          const closed = err?.name === 'ConnectionClosedError' || /Connection closed/i.test(String(err?.message || err))
          if (closed) {
            // Browser/page is dead (e.g. the GPU process crashed). Nothing left
            // to do with this page — mark the rest failed so the caller's
            // fallback pass retries them in a fresh browser.
            while (queue.length) {
              const rest = queue.shift()
              results.set(rest, { ok: false, error: new Error('browser connection closed mid-run'), mode: label })
            }
            return
          }
          // Recover the page for the next fixture (gotoFixture is designed for
          // repeated use without reload, but a hang needs a fresh page).
          try {
            await loadPage(page, url)
            loaded = true
          } catch {}
        }
      }
      try { await page.close() } catch {}
    })
    await Promise.all(workers)
  } catch (err) {
    // Belt-and-braces: any unexpected top-level failure must not silently drop
    // fixtures from the results map.
    for (const name of fixtures) {
      if (!results.has(name)) results.set(name, { ok: false, error: err, mode: label })
    }
  } finally {
    try { await browser.close() } catch {}
  }
  return results
}

function isGood(res) {
  return res && res.ok && res.size >= BLANK_PNG_BYTES
}

function gitHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// ─── Main ───
async function main() {
  const startedAt = Date.now()
  const { fixtures, concurrency } = parseArgs()
  mkdirSync(SHOTS_DIR, { recursive: true })
  const url = getUrl()
  await ensureServer()

  console.log(`[capture] ${fixtures.length} fixture(s), concurrency=${concurrency}`)
  const gpuResults = await runAll({ fixtures, concurrency, url, args: GPU_ARGS, label: 'gpu' })

  const failed = fixtures.filter(name => !isGood(gpuResults.get(name)))
  let softResults = new Map()
  if (failed.length > 0) {
    console.log(`[fallback] ${failed.length} fixture(s) failed/blank with GPU flags — retrying WITHOUT GPU flags (software rendering)`)
    softResults = await runAll({ fixtures: failed, concurrency, url, args: SOFT_ARGS, label: 'software' })
  }

  // Combine: software result wins if the GPU attempt failed or was blank.
  const final = new Map()
  for (const name of fixtures) {
    const gpu = gpuResults.get(name)
    const soft = softResults.get(name)
    final.set(name, isGood(gpu) ? gpu : isGood(soft) ? soft : (gpu || soft))
  }

  // Report + write index.json. MERGE, don't clobber: a partial run
  // (--fixtures=...) keeps entries for fixtures captured by earlier runs, so
  // Part C's health check reading this manifest never sees false failures.
  let index = {}
  try {
    const existing = JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      index = existing
    }
  } catch { /* no previous manifest / corrupt — start fresh */ }
  let exitCode = 0
  const commit = gitHash() // computed once, not per fixture
  for (const name of fixtures) {
    const res = final.get(name)
    if (isGood(res)) {
      console.log(`${name}: OK (${res.size} bytes, ${res.mode})`)
      index[name] = {
        path: `tests/screenshots/${name}.png`,
        capturedAt: new Date().toISOString(),
        commit, // refreshed to the current HEAD on every write
      }
    } else {
      exitCode = 1
      const reason = res?.error?.message || 'unknown error'
      console.log(`${name}: FAILED (${reason})`)
    }
  }
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`[capture] done in ${elapsed}s — ${Object.keys(index).length}/${fixtures.length} captured`)
  if (exitCode !== 0) {
    console.error('[capture] one or more fixtures failed/timed out')
  }
  process.exit(exitCode)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})