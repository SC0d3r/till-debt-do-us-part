#!/usr/bin/env node
/**
 * Post-build production-bundle safety check (docs/dev-log/DEBUG_HARNESS.md A.4).
 *
 * Greps dist/**\/*.js for the debug harness gate strings. The harness must be
 * fully tree-shaken out of the production bundle — not just runtime-gated:
 * debug hooks leaking into production are both a perf cost and a way for a
 * player to warp/cheat.
 *
 * Usage: run after `npm run build`:
 *   node scripts/check-prod-bundle.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), 'dist')
const GATES = [
  '__debug', 'devHarness',
  // TileMapComposer slice A (2026-08-06): the composer + showcase map are
  // debug-harness-only this slice (no game module imports them), so the whole
  // tile-kit must stay tree-shaken out of prod. Strings unique to the kit:
  'TileMapComposer', 'showcaseMap', 'SHOWCASE_MAP', 'tile-showcase',
  'showcaseTileMap', 'createGrassTile', 'OUTLINE_COLORS', 'grass-dirt', 'grass-tilled',
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.js')) out.push(full)
  }
  return out
}

let failures = 0
for (const file of walk(DIST)) {
  const content = readFileSync(file, 'utf8')
  for (const gate of GATES) {
    if (content.includes(gate)) {
      failures++
      console.error(`FAIL: "${gate}" found in ${file}`)
    }
  }
}

if (failures > 0) {
  console.error(`\nFAILED: debug harness leaked into the production bundle (${failures} match(es)).`)
  console.error('Check the import.meta.env.DEV gating in src/main.ts and that src/debug/devHarness.ts has no top-level side effects.')
  process.exit(1)
}

console.log('OK: debug harness fully tree-shaken out of production bundle')
process.exit(0)
