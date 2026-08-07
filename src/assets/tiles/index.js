/**
 * Tile registry — merged manifest for every biome family (Slice B pixel-art).
 *
 * Single entry point for variant STRING → factory resolution so the composer
 * and dev harness never need family knowledge. Each family module keeps its
 * own VARIANTS manifest + createXxxTile + dispose; this module merges them:
 *
 *   - VARIANTS:  merged manifest (name → entry with biome/kind/colors)
 *   - resolveFactory(variant): returns a zero-arg () => THREE.Mesh factory
 *   - createTile(variant)     : returns the tile mesh directly
 *   - dispose()               : frees every family's shared resources
 *
 * Importing this module pulls in all six families (grass, dirt, water, sand,
 * lava, snow). Family modules remain importable directly for their color
 * constants.
 */

import * as grass from './grass'
import * as dirt from './dirt'
import * as water from './water'
import * as sand from './sand'
import * as lava from './lava'
import * as snow from './snow'

/** Family modules, in a stable order (used by dispose + manifest merge). */
export const FAMILIES = [grass, dirt, water, sand, lava, snow]

/** Merged variant manifest: variant name → TileVariantManifestEntry. */
export const VARIANTS = Object.assign({}, ...FAMILIES.map(f => f.VARIANTS))

/** All variant names, in family order (grass first, then dirt/water/sand/lava/snow). */
export const VARIANT_NAMES = Object.keys(VARIANTS)

/**
 * Returns a zero-arg factory for the given variant (composer-compatible:
 * `resolveFactory(variant)()` → THREE.Mesh).
 *
 * @param {string} variant - key of VARIANTS
 * @returns {() => THREE.Mesh}
 */
export function resolveFactory(variant) {
  for (const f of FAMILIES) {
    if (Object.prototype.hasOwnProperty.call(f.VARIANTS, variant)) {
      return () => f.createTile(variant)
    }
  }
  throw new Error(`tile registry: unknown variant "${variant}"`)
}

/**
 * Creates a tile mesh directly (equivalent to resolveFactory(variant)()).
 *
 * @param {string} variant - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createTile(variant) {
  return resolveFactory(variant)()
}

/** Frees every family's shared geometry/materials/textures. */
export function dispose() {
  for (const f of FAMILIES) f.dispose()
}

// Re-export family modules so consumers can keep importing colors from one
// place (e.g. `import { GRASS_TOP } from '../assets/tiles'`).
export { grass, dirt, water, sand, lava, snow }