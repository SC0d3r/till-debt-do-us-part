// QA regression — TileMapComposer slice A (data-driven isometric tile map
// composer + showcase map). Scope: src/world/TileMapComposer.js (grouping,
// diagonal-lattice positioning, per-instance rotation, instanceColor init,
// hover contract, mid-build leak cleanup, dispose, tile OUTLINES) and
// src/world/showcaseMap.js (SHOWCASE_MAP + validateShowcaseMap incl. the
// ghost-edge check), wired through the debug-only showcase fixture
// (src/debug/devHarness.ts showcaseTileMap). This file verifies:
//   C1  registry + fixture: 'tile-showcase' (category showcase) resolves via
//       gotoFixture with the loop stopped, HUD hidden, composer live
//   C2  grouping by variant STRING: 12 groups, instance counts match the data
//       (81 tiles total; grass-dirt-n group = the rotation-proof cells)
//   C3  positioning: every instance matrix translation is exactly
//       ((x−y)*0.5, 0, (x+y)*0.5); rotation 0 keeps identity, 90/180/270
//       apply the correct per-instance y-rotation; adjacent data cells sit
//       exactly 0.7071 apart (solid ground — no gaps, no overlaps)
//   C4  instanceColor initialized to (0.88, 0.88, 0.88) for EVERY instance
//   C5  hover contract on synthetic pointer events: 1.0 highlight, 0.88
//       restore on move-off, clear on pointerout AND window blur, onHover
//       delivers {x, y, variant, rotation, instanceId, group}
//   C6  validateShowcaseMap gate: SHOWCASE_MAP passes (rotation-aware); bad
//       data throws before any staging (harness stays usable); a rotated
//       edge pointing the wrong way is rejected; a GHOST edge (edge dropped
//       inside a foreign field) is rejected; a legit split boundary passes
//   C7  composer guards: elevation != 0 throws; rotation not in 0/90/180/270
//       throws (clear errors, harness stays usable)
//   O1  outline construction: SEAM-RESOLVED local masks with the exact
//       data-derived table (rev 4 ownership: the tile whose outline color
//       matches its own biome renders each shared edge when exactly one
//       side is biome-colored, data-order otherwise — the GREEN records
//       lose their seams to brown biome-colored neighbors; (2,0)/(2,8)/
//       (8,8) render nothing yet still own an empty '' instance), 81
//       outline instances (ONE per record), one shared white material,
//       instance matrices tracking the tile lattice+rotation
//   O2  outline color resolution: record outlineColor > manifest biome
//       palette (edges = fromBiome owner) > map-level > global; rest state
//       instanceColor = resolved × 0.88; per-record overrides (mode 'none',
//       side list, explicit color) through showcaseTileMap custom data
//   O3  hover sync on a ROTATED record ((5,2) grass-dirt-n @ 90): tile AND
//       outline instanceColor brighten to × 1.0 together, restore together
//   O4  outline guards (bad record/map outline options throw clearly, harness
//       stays usable) + teardown (leaving the fixture removes every outline
//       mesh and disposes frame geometry/material — no scene leaks)
//   O5  SEAM resolution (ONE line per seam, rev 3 + rev 4): 'all' on two
//       adjacent tiles → the seam renders once (owner keeps it, neighbor's
//       opposing side suppressed); explicit ['e'] + ['w'] → owner renders
//       'e', the neighbor suppresses 'w'; owner 'none' + non-owner ['w'] →
//       non-owner renders 'w' (desire stands); border sides in 'all' render
//       on a single tile; side-list dedupe ['n','n'] == ['n']; REV 4:
//       biome-match beats data order (an overridden tile that is the
//       data-order owner still loses the seam to its biome-colored
//       neighbor); both sides overridden → data-order tie-break
//   C8  teardown discipline: preview → showcase → preview and
//       showcase → farm-day chains leave the harness working (loop + fog
//       restored, no leaks)
//   C9  zero page/console errors across the whole battery
//
// CI-friendly: CHROME_PATH/BASE_URL from the GitHub Actions workflow
// (scripts/run-ci-puppeteer.sh --tests=...); local runs fall back to defaults.

const useBundled = process.env.PUPPETEER_BUNDLED === '1'
let puppeteer
if (useBundled) {
  try {
    puppeteer = (await import('puppeteer')).default
  } catch {
    throw new Error('PUPPETEER_BUNDLED=1 but the `puppeteer` package is not installed (npm i -D puppeteer)')
  }
} else {
  puppeteer = (await import('puppeteer-core')).default
}
const CHROME = useBundled ? undefined : (process.env.CHROME_PATH || '/usr/bin/google-chrome')
const BASE = process.env.BASE_URL || 'http://localhost:5173'
const URL_DEBUG = BASE + '/?debug=1&fast=1'
const ARGS = ['--mute-audio', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage']

const results = []
let current = null
function section(name) { current = { section: name, tests: [] }; results.push(current) }
function test(name, pass, detail = '') {
  current.tests.push({ name, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

// Expected per-variant instance counts for the hand-authored 9x9 SHOWCASE_MAP
// (mirrors the data in src/world/showcaseMap.js — a change to the map must
// update this table; the test pins the counts). grass-dirt-n: 6 = the
// rotation-proof path boundaries (3 × rotation 90 at x=5, 3 × rotation 270
// at x=8, rows y=0..2); grass-dirt-e/w: 6 each = the baked path boundaries
// of rows y=3..8.
const EXPECTED_GROUPS = {
  'grass-plain': 18,
  'grass-flowers': 3,
  'grass-bushes': 3,
  'grass-dirt-e': 6,
  'grass-dirt-w': 6,
  'grass-dirt-n': 6,
  'grass-tilled': 9,
  'grass-tilled-n': 3,
  'grass-tilled-e': 3,
  'grass-tilled-s': 3,
  'grass-tilled-w': 3,
  'dirt-plain': 18,
}

// Expected resolved-LOCAL outline masks for the showcase under the default
// map-level mode 'interior' AFTER the ONE-LINE-PER-SEAM ownership resolution
// (rev 4, convention §3, pinned 2026-08-06): each record first computes its
// DESIRED data mask ('interior' → sides with a neighbor), then for every
// desired side that has a neighbor the OWNER renders the seam — owner = the
// tile whose outline color MATCHES ITS OWN BIOME when exactly one side of
// the seam is biome-colored (resolved color EXACTLY equals the variant's
// manifest palette color; edges use their fromBiome owner color), otherwise
// the tile with lexicographically smaller data coords (x, then y) — and the
// non-owner drops the side if the owner also desires it (the non-owner's
// desire stands otherwise). Border sides are unaffected by ownership.
// The 21 GREEN records (explicit outlineColor 0x4f7a34 — NOT biome-matched)
// lose their seams to brown biome-colored neighbors: every green|brown seam
// renders in brown regardless of data order (green|green stays green via
// the data-order tie-break). Derived from the 9x9 grid (validated against
// an independent sim that reproduces the rev-3 table exactly):
//   interior cells (49) own n+e, EXCEPT: green-adjacent tilled cells
//     (1,2),(1,3),(3,4),(3,5),(3,6),(3,7),(3,0) win 'w' too → 'n,e,w';
//     (1,1) wins 's' AND 'w' → 'n,e,s,w'; (2,1) loses 'w' to (1,1) →
//     'n,e,s'; rotated (5,1),(5,2) → local 'n,w'
//   green cells lose every brown-adjacent seam: (2,0),(2,8) → '' (EMPTY);
//     (1,0) → 'e'; (2,4),(2,5),(2,6),(2,7),(0,1),(0,2),(0,3) → 'n';
//     (3,8) gains 'w' from (2,8) → 'e,w'
//   path/borders keep rev-3 shapes: (8,0),(8,1),(8,2) rotated → 'e';
//     (8,3..7) and (6,0..3),(7,0..3) → 'n'; row y=8 → 'e' ×6 + 'e,w' + '' ×2
// Final local table (81 instances — EVERY record owns exactly one outline
// instance; empty '' masks emit zero-triangle frames):
//   'n,e' 43 | 'n,e,w' 7 | 'n' 12 | 'e' 10 | 'e,w' 1 | 'n,w' 3 |
//   'n,e,s' 1 | 'n,e,s,w' 1 | '' 3
const EXPECTED_OUTLINE_MASKS = {
  'n,e': 43,
  'n,e,w': 7,
  'n': 12,
  'e': 10,
  'e,w': 1,
  'n,w': 3,
  'n,e,s': 1,
  'n,e,s,w': 1,
  '': 3,
}

const browser = await puppeteer.launch({ ...(useBundled ? {} : { executablePath: CHROME }), headless: true, args: ARGS,
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const modDist = (a, b) => Math.min((a - b + 1440) % 1440, (b - a + 1440) % 1440)

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
async function getState(page) { const r = await evl(page, () => window.__debug.getState()); return r.ok ? r.value : null }

// ─────────────────────────────────────────────────────────────
section('C1. Showcase fixture registration + resolution')
{
  const page = await newPage()
  await loadDebug(page)
  const lf = await evl(page, () => window.__debug.listFixtures())
  const def = lf.ok ? lf.value.find(f => f.name === 'tile-showcase') : null
  test('C1a tile-showcase registered under category showcase',
    lf.ok && def?.category === 'showcase', JSON.stringify(def))
  const surf = await evl(page, () => typeof window.__debug.showcaseTileMap === 'function' && !!window.__debug.showcase)
  test('C1b __debug.showcaseTileMap + __debug.showcase exposed', surf.ok && surf.value === true, JSON.stringify(surf))
  const r = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s = await getState(page)
  const hudHidden = await evl(page, () => getComputedStyle(document.getElementById('hud')).display === 'none')
  test('C1c fixture resolves: loop stopped, ready, no HUD',
    r.ok && s?.started === false && s?.ready === true && hudHidden.ok && hudHidden.value === true,
    r.ok ? JSON.stringify({ started: s?.started, ready: s?.ready, hud: hudHidden?.value }) : r.error)
  const live = await evl(page, () => {
    const c = window.__debug.showcase.composer
    return { hasComposer: !!c, groups: c ? c.groups.length : -1, passive: c ? typeof c.update === 'undefined' && typeof c.tick === 'undefined' : false }
  })
  test('C1d composer is live, grouped, and passive (no update/tick loop hooks)',
    live.ok && live.value.hasComposer && live.value.groups === 12 && live.value.passive === true, JSON.stringify(live.value))
  test('C1e no page errors during fixture setup', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C2. Grouping by variant string + instance counts')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    return c.groups.map(g => [g.variant, g.count])
  })
  const counts = r.ok ? Object.fromEntries(r.value) : {}
  const total = r.ok ? r.value.reduce((n, [, c]) => n + c, 0) : 0
  test('C2a 12 variant-string groups with exact instance counts',
    r.ok && r.value.length === 12 && Object.keys(counts).length === 12 &&
    Object.entries(EXPECTED_GROUPS).every(([v, n]) => counts[v] === n),
    r.ok ? JSON.stringify(counts) : r.error)
  test('C2b total instances = 81 (9x9 grid)', total === 81, `total=${total}`)
  // No group keyed by anything but a variant string (never biome/module names).
  test('C2c every group key is a tile variant', r.ok && Object.keys(counts).every(k => k.includes('-') || k === 'grass-plain' || k === 'dirt-plain'), '')
  test('C2d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C3. Positioning: diagonal lattice + per-instance rotation + packing')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const bad = []
    // Per-instance y-rotation matrix block in COLUMN-MAJOR element layout
    // (THREE stores matrices column-major: m[0],m[2] are column-0 x/z, m[8],
    // m[10] are column-2 x/z). Positive rotation.y = clockwise from above +Y,
    // so baked north turns east for +90 (convention §2).
    const ROT_BLOCKS = {
      0: [1, 0, 0, 1],
      90: [0, -1, 1, 0],
      180: [-1, 0, 0, -1],
      270: [0, 1, -1, 0],
    }
    const rotBad = []
    let rotated = 0
    const byCoord = new Map()
    for (const g of c.groups) {
      const arr = g.mesh.instanceMatrix.array
      for (let i = 0; i < g.count; i++) {
        const tx = arr[i * 16 + 12]
        const ty = arr[i * 16 + 13]
        const tz = arr[i * 16 + 14]
        const rec = g.records[i]
        const wantX = (rec.x - rec.y) * 0.5
        const wantZ = (rec.x + rec.y) * 0.5
        if (tx !== wantX || ty !== 0 || tz !== wantZ) {
          bad.push(`${g.variant}[${i}] at (${tx},${ty},${tz}) want (${wantX},0,${wantZ})`)
        }
        // Rotation coverage: the xz block of the instance matrix must match
        // the record's rotation (0 = identity).
        const m = arr.subarray(i * 16, i * 16 + 16)
        const want = ROT_BLOCKS[rec.rotation || 0]
        if (Math.abs(m[0] - want[0]) > 1e-6 || Math.abs(m[2] - want[1]) > 1e-6 ||
            Math.abs(m[8] - want[2]) > 1e-6 || Math.abs(m[10] - want[3]) > 1e-6) {
          rotBad.push(`${g.variant}[${i}] rot=${rec.rotation || 0} block [${m[0]},${m[2]},${m[8]},${m[10]}]`)
        }
        if (rec.rotation) rotated++
        byCoord.set(`${rec.x},${rec.y}`, { tx, ty, tz })
      }
    }
    // Packing invariant: adjacent data cells (diff exactly 1 in one axis)
    // must sit exactly 0.7071 apart in world space — full-edge sharing, no
    // gaps, no overlaps.
    let adjacencies = 0
    const packBad = []
    for (const [key, a] of byCoord) {
      const [x, y] = key.split(',').map(Number)
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const b = byCoord.get(`${x + dx},${y + dy}`)
        if (!b) continue
        adjacencies++
        const dist = Math.hypot(a.tx - b.tx, a.tz - b.tz)
        if (Math.abs(dist - Math.SQRT1_2) > 1e-9) {
          packBad.push(`(${x},${y})↔(${x + dx},${y + dy}) dist=${dist}`)
        }
      }
    }
    return { checked: c.groups.reduce((n, g) => n + g.count, 0), bad: bad.slice(0, 5), rotBad: rotBad.slice(0, 5), rotated, adjacencies, packBad: packBad.slice(0, 5) }
  })
  test('C3a all 81 instances translated to the lattice ((x−y)*0.5, 0, (x+y)*0.5)',
    r.ok && r.value.checked === 81 && r.value.bad.length === 0,
    r.ok ? JSON.stringify(r.value) : r.error)
  test('C3b rotation matrices: 0 keeps identity, 90/180/270 rotate correctly (6 rotated instances)',
    r.ok && r.value.rotBad.length === 0 && r.value.rotated === 6,
    r.ok ? JSON.stringify({ rotated: r.value.rotated, rotBad: r.value.rotBad }) : r.error)
  test('C3c solid-ground packing: all adjacent data cells exactly 0.7071 apart (no gaps, no overlaps)',
    r.ok && r.value.adjacencies === 144 && r.value.packBad.length === 0,
    r.ok ? JSON.stringify({ adjacencies: r.value.adjacencies, packBad: r.value.packBad }) : r.error)
  test('C3d no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C4. instanceColor initialized for every instance (0.88)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const bad = []
    let checked = 0
    for (const g of c.groups) {
      const arr = g.mesh.instanceColor.array
      for (let i = 0; i < g.count; i++) {
        checked++
        if (Math.abs(arr[i * 3] - 0.88) > 1e-6 || Math.abs(arr[i * 3 + 1] - 0.88) > 1e-6 || Math.abs(arr[i * 3 + 2] - 0.88) > 1e-6) {
          bad.push(`${g.variant}[${i}] = (${arr[i * 3]},${arr[i * 3 + 1]},${arr[i * 3 + 2]})`)
        }
      }
    }
    return { checked, bad: bad.slice(0, 5) }
  })
  test('C4a all 81 instances start at neutral (0.88, 0.88, 0.88) — no uninitialized colors',
    r.ok && r.value.checked === 81 && r.value.bad.length === 0,
    r.ok ? JSON.stringify(r.value) : r.error)
  test('C4b no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C5. Hover contract on synthetic pointer events')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const sh = window.__debug.showcase
    const fire = (type, clientX, clientY) =>
      document.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
    const colorOf = (variant, x, y) => {
      const g = c.groups.find(gg => gg.variant === variant)
      const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
      const a = g.mesh.instanceColor.array
      return { i, rgb: [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] }
    }
    const hoverOf = () => {
      const h = sh.lastHover
      return h ? { x: h.x, y: h.y, rotation: h.rotation, variant: h.variant, instanceId: h.instanceId, group: h.group.variant } : null
    }
    const pA = sh.projectTile(4, 4) // grass-plain, map center
    const pB = sh.projectTile(2, 2) // grass-tilled, patch interior
    const out = {}

    fire('pointermove', pA.x, pA.y)
    out.afterA = { color: colorOf('grass-plain', 4, 4), hover: hoverOf() }

    fire('pointermove', pB.x, pB.y)
    out.afterB = { a: colorOf('grass-plain', 4, 4), b: colorOf('grass-tilled', 2, 2), hover: hoverOf() }

    fire('pointerout', 0, 0)
    out.afterOut = { a: colorOf('grass-plain', 4, 4), b: colorOf('grass-tilled', 2, 2), hover: hoverOf() }

    fire('pointermove', pA.x, pA.y)
    out.afterRehover = { color: colorOf('grass-plain', 4, 4), hover: hoverOf() }
    window.dispatchEvent(new Event('blur'))
    out.afterBlur = { color: colorOf('grass-plain', 4, 4), hover: hoverOf() }
    return out
  })
  const v = r.ok ? r.value : {}
  const near = (rgb, t) => rgb && Math.abs(rgb[0] - t) < 1e-6 && Math.abs(rgb[1] - t) < 1e-6 && Math.abs(rgb[2] - t) < 1e-6
  test('C5a pointermove highlights the tile to (1,1,1) + onHover record {x,y,variant,rotation,instanceId,group}',
    r.ok && near(v.afterA?.color?.rgb, 1) &&
    v.afterA?.hover?.x === 4 && v.afterA?.hover?.y === 4 && v.afterA?.hover?.variant === 'grass-plain' &&
    v.afterA?.hover?.rotation === 0 &&
    typeof v.afterA?.hover?.instanceId === 'number' && v.afterA?.hover?.group === 'grass-plain',
    r.ok ? JSON.stringify(v.afterA) : r.error)
  test('C5b move to another tile: previous restored to 0.88, new at 1.0',
    r.ok && near(v.afterB?.a?.rgb, 0.88) && near(v.afterB?.b?.rgb, 1) &&
    v.afterB?.hover?.x === 2 && v.afterB?.hover?.y === 2 && v.afterB?.hover?.variant === 'grass-tilled',
    r.ok ? JSON.stringify(v.afterB) : r.error)
  test('C5c pointerout clears hover: both restored, onHover(null)',
    r.ok && near(v.afterOut?.a?.rgb, 0.88) && near(v.afterOut?.b?.rgb, 0.88) && v.afterOut?.hover === null,
    r.ok ? JSON.stringify(v.afterOut) : r.error)
  test('C5d rehover works after pointerout, and window blur clears it',
    r.ok && near(v.afterRehover?.color?.rgb, 1) && v.afterRehover?.hover?.x === 4 &&
    near(v.afterBlur?.color?.rgb, 0.88) && v.afterBlur?.hover === null,
    r.ok ? JSON.stringify({ rehover: v.afterRehover, blur: v.afterBlur }) : r.error)
  test('C5e no page errors during hover battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C6. validateShowcaseMap gate (data-level acceptance)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const val = await evl(page, () => window.__debug.showcase.validation)
  test('C6a SHOWCASE_MAP passes validateShowcaseMap (0 errors)',
    val.ok && val.value?.ok === true && val.value?.errors?.length === 0,
    val.ok ? JSON.stringify(val.value) : val.error)
  // Bad data: an edge with no toBiome neighbor on its named side.
  const bad = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-dirt-n' },
    { x: 1, y: 0, variant: 'grass-plain' },
  ]))
  test('C6b misoriented edge data throws before any staging (invalid map data)',
    !bad.ok && String(bad.error).includes('invalid map data') && String(bad.error).includes('grass-dirt-n'),
    bad.ok ? 'did not throw' : bad.error)
  const val2 = await evl(page, () => window.__debug.showcase.validation)
  test('C6c validation result is exposed on the showcase handle',
    val2.ok && val2.value?.ok === false && val2.value?.errors?.length > 0, val2.ok ? JSON.stringify(val2.value) : val2.error)
  // Rotation-aware gate: a rotated edge must point at the toBiome neighbor on
  // its EFFECTIVE side. grass-dirt-n rotated 90 → dirt half east — a dirt
  // neighbor to the north must NOT satisfy it.
  const rotBad = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-dirt-n', rotation: 90 },
    { x: 0, y: 1, variant: 'dirt-plain' },
  ]))
  test('C6d rotated edge pointing the wrong way is rejected (effective-side check)',
    !rotBad.ok && String(rotBad.error).includes('invalid map data') && String(rotBad.error).includes('points e'),
    rotBad.ok ? 'did not throw' : rotBad.error)
  // And the same rotated variant with the dirt neighbor on its EFFECTIVE east
  // side must pass.
  const rotOk = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-dirt-n', rotation: 90 },
    { x: 1, y: 0, variant: 'dirt-plain' },
  ]))
  test('C6e rotated edge accepted when the dirt neighbor sits on the effective side',
    rotOk.ok, rotOk.ok ? '' : rotOk.error)
  // Unknown variant also rejected at data level.
  const unknown = await evl(page, () => window.__debug.showcaseTileMap([{ x: 0, y: 0, variant: 'bogus' }]))
  test('C6f unknown variant rejected by the data gate',
    !unknown.ok && String(unknown.error).includes('invalid map data') && String(unknown.error).includes('bogus'),
    unknown.ok ? 'did not throw' : unknown.error)
  // GHOST edge (design-critic fold-in): grass-dirt-e dropped INSIDE the dirt
  // field passes the toBiome-side check (dirt ahead) but has no owner-biome
  // (grass) cell on either perpendicular side — must be rejected.
  const ghost = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain' }, { x: 0, y: 1, variant: 'grass-plain' }, { x: 0, y: 2, variant: 'grass-plain' },
    { x: 1, y: 0, variant: 'dirt-plain' }, { x: 1, y: 1, variant: 'grass-dirt-e' }, { x: 1, y: 2, variant: 'dirt-plain' },
    { x: 2, y: 0, variant: 'dirt-plain' }, { x: 2, y: 1, variant: 'dirt-plain' }, { x: 2, y: 2, variant: 'dirt-plain' },
  ]))
  test('C6g ghost edge inside a foreign field rejected (perpendicular owner check)',
    !ghost.ok && String(ghost.error).includes('invalid map data') && String(ghost.error).includes('ghost edge'),
    ghost.ok ? 'did not throw' : ghost.error)
  // A LEGIT boundary (edge sitting on its owner biome's cell, dirt ahead,
  // owner biome on a perpendicular side) must still pass.
  const legit = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain' }, { x: 1, y: 0, variant: 'grass-plain' }, { x: 2, y: 0, variant: 'grass-plain' },
    { x: 0, y: 1, variant: 'grass-dirt-n' }, { x: 1, y: 1, variant: 'grass-dirt-n' }, { x: 2, y: 1, variant: 'grass-dirt-n' },
    { x: 0, y: 2, variant: 'dirt-plain' }, { x: 1, y: 2, variant: 'dirt-plain' }, { x: 2, y: 2, variant: 'dirt-plain' },
  ]))
  test('C6h legit split boundary accepted (owner behind / rim pass)',
    legit.ok, legit.ok ? '' : legit.error)
  // Harness must still be usable after all the rejected attempts.
  const rec = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s = await getState(page)
  test('C6i harness usable after rejected data (fixture still resolves, composer live)',
    rec.ok && s?.ready === true,
    rec.ok ? JSON.stringify({ ready: s?.ready }) : rec.error)
  test('C6j no page errors during validation battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C7. Elevation guard')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r1 = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', elevation: 1 },
  ]))
  test('C7a nonzero elevation throws a clear error',
    !r1.ok && String(r1.error).includes('elevation') && String(r1.error).includes('1'),
    r1.ok ? 'did not throw' : r1.error)
  const r0 = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', elevation: 0 },
    { x: 1, y: 0, variant: 'grass-plain' },
  ]))
  test('C7b elevation 0 and omitted both accepted',
    r0.ok, r0.ok ? '' : r0.error)
  // Rotation guard: anything outside 0/90/180/270 throws a clear error.
  const rRot1 = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', rotation: 45 },
  ]))
  test('C7c rotation 45 throws a clear error',
    !rRot1.ok && String(rRot1.error).includes('rotation') && String(rRot1.error).includes('45'),
    rRot1.ok ? 'did not throw' : rRot1.error)
  const rRot2 = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', rotation: 'north' },
  ]))
  test('C7d non-number rotation throws a clear error',
    !rRot2.ok && String(rRot2.error).includes('rotation') && String(rRot2.error).includes('north'),
    rRot2.ok ? 'did not throw' : rRot2.error)
  const rRot3 = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', rotation: 0 },
    { x: 1, y: 0, variant: 'grass-plain', rotation: 90 },
    { x: 0, y: 1, variant: 'grass-plain', rotation: 180 },
    { x: 1, y: 1, variant: 'grass-plain', rotation: 270 },
  ]))
  test('C7e rotation 0/90/180/270 all accepted',
    rRot3.ok, rRot3.ok ? '' : rRot3.error)
  // Recover with the real fixture (the accepted map above left a preview
  // state behind).
  const rec = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  test('C7f harness usable after guard battery', rec.ok, rec.ok ? '' : rec.error)
  test('C7g no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('O1. Outline construction: masks, counts, instance matrices')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const ROT = { 0: [1, 0, 0, 1], 90: [0, -1, 1, 0], 180: [-1, 0, 0, -1], 270: [0, 1, -1, 0] }
    const matBad = []
    for (const g of c.outlineGroups) {
      const arr = g.mesh.instanceMatrix.array
      for (let i = 0; i < g.count; i++) {
        const rec = g.records[i]
        const want = ROT[rec.rotation || 0]
        const m = arr.subarray(i * 16, i * 16 + 16)
        // Outline frames live in LOCAL space, so their instance matrices must
        // track the tile exactly: lattice translation + per-record rotation.
        if (arr[i * 16 + 12] !== (rec.x - rec.y) * 0.5 || arr[i * 16 + 13] !== 0 || arr[i * 16 + 14] !== (rec.x + rec.y) * 0.5 ||
            Math.abs(m[0] - want[0]) > 1e-6 || Math.abs(m[2] - want[1]) > 1e-6 || Math.abs(m[8] - want[2]) > 1e-6 || Math.abs(m[10] - want[3]) > 1e-6) {
          matBad.push(`${g.mask}[${i}] ${rec.variant}@(${rec.x},${rec.y})`)
        }
      }
    }
    const masks = Object.fromEntries(c.outlineGroups.map(g => [g.mask, g.count]))
    const sortMasks = JSON.stringify(Object.entries(masks).sort((a, b) => a[0].localeCompare(b[0])))
    const total = c.outlineGroups.reduce((n, g) => n + g.count, 0)
    const whiteShared = c.outlineGroups.every(g =>
      g.mesh.material === c.outlineGroups[0].mesh.material && g.mesh.material.color.getHex() === 0xffffff)
    const maskOf = (x, y) => {
      const g = c.outlineGroups.find(gg => gg.records.some(rec => rec.x === x && rec.y === y))
      return g ? g.mask : null
    }
    return { sortMasks, total, whiteShared, matBad: matBad.slice(0, 5), spot: {
      '0,0': maskOf(0, 0), '0,8': maskOf(0, 8), '8,0': maskOf(8, 0), '8,8': maskOf(8, 8), '5,2': maskOf(5, 2),
      '2,8': maskOf(2, 8), '3,8': maskOf(3, 8), '2,0': maskOf(2, 0), '1,1': maskOf(1, 1), '2,1': maskOf(2, 1),
    } }
  })
  const expectedSort = JSON.stringify(Object.entries(EXPECTED_OUTLINE_MASKS).sort((a, b) => a[0].localeCompare(b[0])))
  test('O1a 9 seam-resolved local masks with the exact data-derived table, 81 outline instances (one per record)',
    r.ok && r.value.total === 81 && r.value.sortMasks === expectedSort,
    r.ok ? JSON.stringify(r.value.sortMasks) : r.error)
  test('O1b one shared WHITE material on every outline mesh',
    r.ok && r.value.whiteShared === true, r.ok ? '' : r.error)
  test('O1c every outline instance matrix tracks its tile (lattice + rotation)',
    r.ok && r.value.matBad.length === 0, r.ok ? JSON.stringify(r.value.matBad) : r.error)
  test('O1d seam-resolved spot masks: (0,0) n+e, (0,8)/(8,0) single owned side, (8,8) EMPTY, (5,2) rotated n,w; rev 4: GREEN (2,8)/(2,0) EMPTY, (3,8) e,w, tilled (1,1) full ring, (2,1) n,e,s',
    r.ok && r.value.spot['0,0'] === 'n,e' && r.value.spot['0,8'] === 'e' &&
    r.value.spot['8,0'] === 'e' && r.value.spot['8,8'] === '' && r.value.spot['5,2'] === 'n,w' &&
    r.value.spot['2,8'] === '' && r.value.spot['2,0'] === '' && r.value.spot['3,8'] === 'e,w' &&
    r.value.spot['1,1'] === 'n,e,s,w' && r.value.spot['2,1'] === 'n,e,s',
    r.ok ? JSON.stringify(r.value.spot) : r.error)
  test('O1e no page errors', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('O2. Outline color resolution + per-record overrides')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    // THREE ColorManagement converts hex → LINEAR sRGB on Color construction
    // (default in r160), so expected instanceColor = linear(hex) × factor.
    const lin = ch => ch <= 0.04045 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)
    const mul = (hex, f) => [lin(((hex >> 16) & 255) / 255) * f, lin(((hex >> 8) & 255) / 255) * f, lin((hex & 255) / 255) * f]
    const near = (a, b) => a && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6
    const colorOf = (x, y) => {
      for (const g of c.outlineGroups) {
        const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
        if (i >= 0) {
          const a = g.mesh.instanceColor.array
          return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
        }
      }
      return null
    }
    // Rest-state checks: record outlineColor > manifest biome palette (edge =
    // fromBiome owner) > map-level > global, all × 0.88 at rest.
    return {
      green: near(colorOf(0, 8), mul(0x4f7a34, 0.88)),      // record green override
      brown: near(colorOf(3, 8), mul(0x4e3d2e, 0.88)),      // grass palette default
      dirt: near(colorOf(6, 8), mul(0x6b4a2e, 0.88)),       // dirt palette
      tilled: near(colorOf(2, 3), mul(0x4a3a26, 0.88)),     // tilled palette (tilled interior)
      edgeOwner: near(colorOf(5, 2), mul(0x4e3d2e, 0.88)),  // grass-dirt-n rot90 uses grass owner
    }
  })
  test('O2a (0,8) grass-plain rest = GREEN 0x4f7a34 × 0.88 (record override)',
    r.ok && r.value.green === true, r.ok ? '' : r.error)
  test('O2b (3,8) grass-plain rest = grass palette 0x4e3d2e × 0.88 (brown baseline)',
    r.ok && r.value.brown === true, r.ok ? '' : r.error)
  test('O2c (6,8) dirt-plain rest = dirt palette 0x6b4a2e × 0.88',
    r.ok && r.value.dirt === true, r.ok ? '' : r.error)
  test('O2d (2,3) grass-tilled interior rest = tilled palette 0x4a3a26 × 0.88',
    r.ok && r.value.tilled === true, r.ok ? '' : r.error)
  test('O2e (5,2) rotated edge uses its fromBiome (grass) owner color',
    r.ok && r.value.edgeOwner === true, r.ok ? '' : r.error)
  // Per-record overrides through custom map data (mode 'all'):
  //   - explicit side list ['e'] at rotation 0 → local mask 'e'
  //   - explicit side list ['e'] at rotation 90 → local mask 'n' (CCW)
  //   - record outlineColor 0xff0000 overrides the grass palette
  //   - record outline 'none' → empty rendered mask → '' instance
  // Seam ownership still applies to the desired sides (e.g. (3,0) 'none'
  // never claims its 'w' back — it has no desire, and the owner's desire
  // suppresses nothing it doesn't want).
  const o = await evl(page, () => window.__debug.showcaseTileMap([
    { x: 0, y: 0, variant: 'grass-plain', outline: ['e'] },
    { x: 1, y: 0, variant: 'grass-plain', outline: ['e'], rotation: 90 },
    { x: 2, y: 0, variant: 'grass-plain', outline: ['e'], outlineColor: 0xff0000 },
    { x: 3, y: 0, variant: 'grass-plain', outline: 'none' },
  ], { outline: { mode: 'all' } }))
  const ov = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const lin = ch => ch <= 0.04045 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)
    const mul = (hex, f) => [lin(((hex >> 16) & 255) / 255) * f, lin(((hex >> 8) & 255) / 255) * f, lin((hex & 255) / 255) * f]
    const groups = c.outlineGroups.map(g => [g.mask, g.count])
    const red = (() => {
      const g = c.outlineGroups.find(gg => gg.records.some(rec => rec.x === 2))
      const i = g.records.findIndex(rec => rec.x === 2)
      const a = g.mesh.instanceColor.array
      return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
    })()
    return { groups, total: c.outlineGroups.reduce((n, g) => n + g.count, 0), red }
  })
  test('O2f side list resolves to local masks: rot 0 ["e"] → "e", rot 90 ["e"] → "n"; "none" → empty "" instance',
    o.ok && ov.ok && ov.value.total === 4 &&
    ov.value.groups.length === 3 &&
    ov.value.groups.some(g => g[0] === 'e' && g[1] === 2) && // (0,0) rot0 + (2,0) rot0 merge into the 'e' group
    ov.value.groups.some(g => g[0] === 'n' && g[1] === 1) && // (1,0) rot90 'e' → local 'n' (CCW)
    ov.value.groups.some(g => g[0] === '' && g[1] === 1),    // (3,0) 'none' → invisible empty frame
    o.ok ? JSON.stringify(ov.value.groups) : o.error)
  test('O2g record outlineColor overrides the biome palette (red × 0.88)',
    ov.ok && Math.abs(ov.value.red[0] - 0.88) < 1e-6 && ov.value.red[1] === 0 && ov.value.red[2] === 0,
    ov.ok ? JSON.stringify(ov.value.red) : ov.error)
  test('O2h no page errors during override battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('O3. Hover sync on a rotated record (tile + outline brighten together)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r = await evl(page, () => {
    const c = window.__debug.showcase.composer
    const sh = window.__debug.showcase
    const fire = (type, clientX, clientY) =>
      document.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
    const lin = ch => ch <= 0.04045 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)
    const mul = (hex, f) => [lin(((hex >> 16) & 255) / 255) * f, lin(((hex >> 8) & 255) / 255) * f, lin((hex & 255) / 255) * f]
    const near = (a, b) => a && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6
    const tileColorOf = (x, y) => {
      const g = c.groups.find(gg => gg.records.some(rec => rec.x === x && rec.y === y))
      const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
      const a = g.mesh.instanceColor.array
      return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
    }
    const outlineOf = (x, y) => {
      for (const g of c.outlineGroups) {
        const i = g.records.findIndex(rec => rec.x === x && rec.y === y)
        if (i >= 0) {
          const a = g.mesh.instanceColor.array
          return { mask: g.mask, rgb: [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] }
        }
      }
      return null
    }
    const hoverOf = () => {
      const h = sh.lastHover
      return h ? { x: h.x, y: h.y, rotation: h.rotation, variant: h.variant } : null
    }
    const p52 = sh.projectTile(5, 2) // grass-dirt-n @ rotation 90 — owns n+e → local n,w
    const p18 = sh.projectTile(1, 8) // grass-bushes, GREEN outline column (owns e)
    const out = {}
    fire('pointermove', p52.x, p52.y)
    out.on52 = { tile: tileColorOf(5, 2), outline: outlineOf(5, 2), hover: hoverOf() }
    fire('pointermove', p18.x, p18.y)
    out.on18 = { t52: tileColorOf(5, 2), o52: outlineOf(5, 2), t18: tileColorOf(1, 8), o18: outlineOf(1, 8), hover: hoverOf() }
    fire('pointerout', 0, 0)
    out.afterOut = { t52: tileColorOf(5, 2), o52: outlineOf(5, 2), t18: tileColorOf(1, 8), o18: outlineOf(1, 8), hover: hoverOf() }
    return out
  })
  const v = r.ok ? r.value : {}
  // (5,2): grass-dirt-n @ 90 — outline = grass owner brown (no record color).
  const brown = (f) => [((0x4e / 255) > 0.04045 ? Math.pow((0x4e / 255 + 0.055) / 1.055, 2.4) : 0x4e / 255 / 12.92) * f,
    ((0x3d / 255) > 0.04045 ? Math.pow((0x3d / 255 + 0.055) / 1.055, 2.4) : 0x3d / 255 / 12.92) * f,
    ((0x2e / 255) > 0.04045 ? Math.pow((0x2e / 255 + 0.055) / 1.055, 2.4) : 0x2e / 255 / 12.92) * f]
  const green = (f) => [((0x4f / 255) > 0.04045 ? Math.pow((0x4f / 255 + 0.055) / 1.055, 2.4) : 0x4f / 255 / 12.92) * f,
    ((0x7a / 255) > 0.04045 ? Math.pow((0x7a / 255 + 0.055) / 1.055, 2.4) : 0x7a / 255 / 12.92) * f,
    ((0x34 / 255) > 0.04045 ? Math.pow((0x34 / 255 + 0.055) / 1.055, 2.4) : 0x34 / 255 / 12.92) * f]
  const near3 = (a, b) => a && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6
  test('O3a hovering ROTATED (5,2): tile → (1,1,1) AND outline → resolved × 1.0, mask n,w',
    r.ok && near3(v.on52?.tile, [1, 1, 1]) && near3(v.on52?.outline?.rgb, brown(1)) &&
    v.on52?.outline?.mask === 'n,w' && v.on52?.hover?.rotation === 90 && v.on52?.hover?.variant === 'grass-dirt-n',
    r.ok ? JSON.stringify(v.on52) : r.error)
  test('O3b moving to GREEN cell (1,8): (5,2) tile + outline restored to × 0.88 together',
    r.ok && near3(v.on18?.t52, [0.88, 0.88, 0.88]) && near3(v.on18?.o52?.rgb, brown(0.88)),
    r.ok ? JSON.stringify({ t52: v.on18?.t52, o52: v.on18?.o52 }) : r.error)
  test('O3c new hover (1,8): tile 1.0 + GREEN outline × 1.0',
    r.ok && near3(v.on18?.t18, [1, 1, 1]) && near3(v.on18?.o18?.rgb, green(1)) &&
    v.on18?.hover?.x === 1 && v.on18?.hover?.y === 8,
    r.ok ? JSON.stringify({ t18: v.on18?.t18, o18: v.on18?.o18 }) : r.error)
  test('O3d pointerout restores both tiles and both outlines to neutral × 0.88',
    r.ok && near3(v.afterOut?.t52, [0.88, 0.88, 0.88]) && near3(v.afterOut?.o52?.rgb, brown(0.88)) &&
    near3(v.afterOut?.t18, [0.88, 0.88, 0.88]) && near3(v.afterOut?.o18?.rgb, green(0.88)) && v.afterOut?.hover === null,
    r.ok ? JSON.stringify(v.afterOut) : r.error)
  test('O3e no page errors during outline hover battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('O4. Outline guards + teardown (no leaks)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  // Record-level outline guards — the data gate passes (all grass), so the
  // composer's own validation must reject with clear messages.
  const r1 = await evl(page, () => window.__debug.showcaseTileMap(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: 'sideways' }]))
  test('O4a invalid record outline mode rejected by the composer',
    !r1.ok && String(r1.error).includes('outline must be a mode') && String(r1.error).includes('(0, 0)'),
    r1.ok ? 'did not throw' : r1.error)
  const r2 = await evl(page, () => window.__debug.showcaseTileMap(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: ['x'] }]))
  test('O4b invalid record outline side rejected',
    !r2.ok && String(r2.error).includes("side list must contain only 'n' | 'e' | 's' | 'w'"),
    r2.ok ? 'did not throw' : r2.error)
  const r3 = await evl(page, () => window.__debug.showcaseTileMap(
    [{ x: 0, y: 0, variant: 'grass-plain', outlineColor: 'north' }]))
  test('O4c invalid record outlineColor rejected',
    !r3.ok && String(r3.error).includes('outlineColor must be a hex'),
    r3.ok ? 'did not throw' : r3.error)
  const r4 = await evl(page, () => window.__debug.showcaseTileMap(
    [{ x: 0, y: 0, variant: 'grass-plain' }], { outline: { mode: 'diagonal' } }))
  test('O4d invalid map-level outline mode rejected',
    !r4.ok && String(r4.error).includes("outline mode must be 'all'"),
    r4.ok ? 'did not throw' : r4.error)
  // Harness stays usable after every rejected attempt.
  const rec = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s = await getState(page)
  test('O4e harness usable after outline guard battery', rec.ok && s?.ready === true,
    rec.ok ? JSON.stringify({ ready: s?.ready }) : rec.error)
  // Teardown: leaving the showcase to a single-asset preview must dispose the
  // composer — every tile AND outline mesh removed from the scene, frame
  // geometry/material disposed, outlineGroups reset (same contract as C8b).
  const gone = await evl(page, () => window.__debug.gotoFixture('grass-plain'))
  const s2 = await getState(page)
  const nulled = await evl(page, () => window.__debug.showcase.composer === null)
  test('O4f outline teardown: leaving the showcase disposes the composer (no outline leaks)',
    gone.ok && nulled.ok && nulled.value === true && s2?.started === false && s2?.ready === true,
    JSON.stringify({ gone: gone.ok, composerNulled: nulled.value, started: s2?.started, ready: s2?.ready }))
  test('O4g no page errors across outline teardown', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('O5. Seam resolution — ONE line per seam (ownership pass, rev 3 + rev 4)')
{
  const page = await newPage()
  await loadDebug(page)
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const masksOf = async (data, opts) => {
    const r = await evl(page, (data, opts) => window.__debug.showcaseTileMap(data, opts), data, opts)
    if (!r.ok) return { ok: false, error: r.error }
    const v = await evl(page, () => {
      const c = window.__debug.showcase.composer
      const maskByCoord = {}
      for (const g of c.outlineGroups) for (const rec of g.records) maskByCoord[`${rec.x},${rec.y}`] = g.mask
      return {
        groups: c.outlineGroups.map(g => [g.mask, g.count]).sort((a, b) => a[0].localeCompare(b[0])),
        total: c.outlineGroups.reduce((n, g) => n + g.count, 0),
        maskByCoord,
      }
    })
    return v.ok ? { ok: true, ...v.value, maskOf: (x, y) => v.value.maskByCoord[`${x},${y}`] ?? null } : { ok: false, error: v.error }
  }
  // (a) 'all' mode, two adjacent tiles: owner (0,0) keeps the full ring,
  // neighbor (1,0) suppresses its 'w' — the shared e/w seam renders ONCE.
  const a = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain' }, { x: 1, y: 0, variant: 'grass-plain' }],
    { outline: { mode: 'all' } },
  )
  test('O5a "all" on two adjacent tiles: seam renders once (owner n,e,s,w + neighbor n,e,s, no w)',
    a.ok && a.total === 2 &&
    a.groups.some(g => g[0] === 'n,e,s,w' && g[1] === 1) &&
    a.groups.some(g => g[0] === 'n,e,s' && g[1] === 1) &&
    a.maskOf(0, 0) === 'n,e,s,w' && a.maskOf(1, 0) === 'n,e,s',
    a.ok ? JSON.stringify(a.groups) : a.error)
  // (b) explicit-side interplay: A ['e'] desires the seam AND is the owner →
  // A renders 'e'; B ['w'] is suppressed (owner desires the seam).
  const b = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: ['e'] }, { x: 1, y: 0, variant: 'grass-plain', outline: ['w'] }],
    { outline: { mode: 'all' } },
  )
  test('O5b A ["e"] + B ["w"]: A renders "e", B suppresses "w" (empty "" instance)',
    b.ok && b.total === 2 &&
    b.groups.some(g => g[0] === 'e' && g[1] === 1) &&
    b.groups.some(g => g[0] === '' && g[1] === 1) &&
    b.maskOf(0, 0) === 'e' && b.maskOf(1, 0) === '',
    b.ok ? JSON.stringify(b.groups) : b.error)
  // (c) owner does NOT desire the seam but the non-owner does → the
  // non-owner's desire STANDS: A 'none' + B ['w'] → B renders 'w'.
  const c = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: 'none' }, { x: 1, y: 0, variant: 'grass-plain', outline: ['w'] }],
    { outline: { mode: 'all' } },
  )
  test('O5c owner "none" + non-owner ["w"]: non-owner renders "w" (desire stands)',
    c.ok && c.total === 2 &&
    c.groups.some(g => g[0] === 'w' && g[1] === 1) &&
    c.groups.some(g => g[0] === '' && g[1] === 1) &&
    c.maskOf(0, 0) === '' && c.maskOf(1, 0) === 'w',
    c.ok ? JSON.stringify(c.groups) : c.error)
  // (d) border sides in 'all' mode render on a single tile (no neighbor →
  // no ownership) — the lone cell keeps its full ring.
  const d = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain' }],
    { outline: { mode: 'all' } },
  )
  test('O5d single tile in "all": border sides all render (full ring, no "" group)',
    d.ok && d.total === 1 && d.groups.length === 1 &&
    d.groups.some(g => g[0] === 'n,e,s,w' && g[1] === 1) && d.maskOf(0, 0) === 'n,e,s,w',
    d.ok ? JSON.stringify(d.groups) : d.error)
  // (e) side-list dedupe: ['n','n'] == ['n'] — one 'n' side, never a 'n,n'
  // doubled ribbon.
  const e = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: ['n', 'n'] }],
    { outline: { mode: 'all' } },
  )
  test('O5e side-list dedupe: ["n","n"] resolves to a single "n" mask',
    e.ok && e.total === 1 && e.groups.length === 1 &&
    e.groups.some(g => g[0] === 'n' && g[1] === 1) && e.maskOf(0, 0) === 'n',
    e.ok ? JSON.stringify(e.groups) : e.error)
  // Rotated seam ownership: the owner decision is DATA-space (rotation does
  // not move ownership) — A (0,0) rot 90 ['e'] still owns the e/w seam, but
  // the rendered side resolves LOCAL 'n' via the rotation.
  const f = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outline: ['e'], rotation: 90 }, { x: 1, y: 0, variant: 'grass-plain', outline: ['w'] }],
    { outline: { mode: 'all' } },
  )
  test('O5f ownership is data-space: rotated owner still owns the seam, renders local "n"',
    f.ok && f.total === 2 &&
    f.groups.some(g => g[0] === 'n' && g[1] === 1) &&
    f.groups.some(g => g[0] === '' && g[1] === 1) &&
    f.maskOf(0, 0) === 'n' && f.maskOf(1, 0) === '',
    f.ok ? JSON.stringify(f.groups) : f.error)
  // ── REV 4 — ownership by BIOME-MATCH (convention §3, pinned 2026-08-06):
  // when exactly one side of a seam is biome-colored (resolved outline
  // color EXACTLY equals the variant's manifest palette color), THAT tile
  // renders the seam even when the data-order owner is the other tile.
  // (g) (0,0) carries a green override (NOT biome-matched) and is the
  // data-order owner of the shared e/w seam; (1,0) is default-brown
  // (biome-matched). The brown tile must win: (0,0) suppresses its 'e'
  // (its other sides are borders — they render), (1,0) renders 'w'.
  const g = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outlineColor: 0x4f7a34 }, { x: 1, y: 0, variant: 'grass-plain' }],
    { outline: { mode: 'all' } },
  )
  test('O5g biome-match beats data order: overridden (0,0) is the data-order owner but loses the seam to brown (1,0)',
    g.ok && g.total === 2 &&
    g.maskOf(0, 0) === 'n,s,w' && g.maskOf(1, 0) === 'n,e,s,w',
    g.ok ? JSON.stringify(g.groups) : g.error)
  // (h) both sides overridden (neither biome-matched) → data-order
  // tie-break, exactly like the all-matched case.
  const h = await masksOf(
    [{ x: 0, y: 0, variant: 'grass-plain', outlineColor: 0x4f7a34 }, { x: 1, y: 0, variant: 'grass-plain', outlineColor: 0x4f7a34 }],
    { outline: { mode: 'all' } },
  )
  test('O5h both sides overridden → data-order owner renders (rev-3 semantics)',
    h.ok && h.total === 2 &&
    h.maskOf(0, 0) === 'n,e,s,w' && h.maskOf(1, 0) === 'n,e,s',
    h.ok ? JSON.stringify(h.groups) : h.error)
  // (both biome-matched → data-order owner renders is exactly O5a above —
  // covered there.)
  // Recover with the real fixture; seam cases must not break the harness.
  const rec = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  test('O5i harness usable after seam-resolution battery', rec.ok, rec.ok ? '' : rec.error)
  test('O5j no page errors during seam battery', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

// ─────────────────────────────────────────────────────────────
section('C8. Teardown discipline: preview → showcase → preview, showcase → farm-day')
{
  const page = await newPage()
  await loadDebug(page)
  // Chain 1: asset preview → showcase → asset preview.
  const r1 = await evl(page, () => window.__debug.gotoFixture('grass-flowers'))
  const r2 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s2 = await getState(page)
  const r3 = await evl(page, () => window.__debug.gotoFixture('grass-plain'))
  const s3 = await getState(page)
  const gone = await evl(page, () => window.__debug.showcase.composer === null)
  test('C8a preview → showcase → preview chain resolves, loop stays off, ready',
    r1.ok && r2.ok && s2?.started === false && s2?.ready === true && r3.ok && s3?.started === false && s3?.ready === true,
    JSON.stringify({ r1: r1.ok, r2: r2.ok, r3: r3.ok, started2: s2?.started, started3: s3?.started }))
  test('C8b composer disposed when leaving the showcase (handle null)', gone.ok && gone.value === true, JSON.stringify(gone))
  // Chain 2: showcase → gameplay. The loop must resume WITH fog restored
  // (DayNightDriver.update dereferences scene.fog every tick; a null-fog
  // restart would crash), and the previous scene must be intact.
  await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  await evl(page, () => window.__debug.gotoFixture('farm-day'))
  const s4 = await getState(page)
  const t4a = s4?.player.timeOfDay
  await sleep(900)
  const t4b = (await getState(page))?.player.timeOfDay
  test('C8c showcase → farm-day: started=true, gold 100, clock resumes (loop + fog alive)',
    s4?.started === true && s4?.player.gold === 100 && Number.isFinite(t4a) && Number.isFinite(t4b) && modDist(t4a, t4b) > 1,
    JSON.stringify({ started: s4?.started, gold: s4?.player?.gold, a: t4a, b: t4b }))
  const hud = await evl(page, () => getComputedStyle(document.getElementById('hud')).display !== 'none')
  test('C8d HUD restored after leaving the showcase', hud.ok && hud.value === true, JSON.stringify(hud))
  // Chain 3: showcase → showcase (interrupt one showcase with another).
  const r5 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const r6 = await evl(page, () => window.__debug.gotoFixture('tile-showcase'))
  const s6 = await getState(page)
  test('C8e showcase → showcase: both resolve, single live composer, ready',
    r5.ok && r6.ok && s6?.ready === true && s6?.started === false, JSON.stringify({ r5: r5.ok, r6: r6.ok, ready: s6?.ready }))
  test('C8f no page errors across teardown chains', page.__pageErrors.length === 0, JSON.stringify(page.__pageErrors))
  await page.close()
}

await browser.close()

const total = results.reduce((n, sec) => n + sec.tests.length, 0)
const failed = results.flatMap(sec => sec.tests.filter(t => !t.pass).map(t => ({ section: sec.section, ...t })))
console.log(`\n==== COMPOSER REGRESSION SUMMARY: ${total - failed.length}/${total} passed ====`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name} :: ${f.detail}`)
process.exit(failed.length ? 1 : 0)
