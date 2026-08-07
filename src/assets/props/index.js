/**
 * Prop registry — merged manifest for the Slice B prop library.
 *
 * Single entry point for prop name → factory resolution so the composer and
 * dev harness never need per-prop knowledge. Each prop module keeps its own
 * VARIANTS manifest (name → entry with socket metadata: center/corner/edge/
 * surface + max count) + createProp + dispose; this module merges them:
 *
 *   - PROPS:               merged manifest (name → entry)
 *   - PROP_NAMES:          all prop names
 *   - resolvePropFactory(name): returns a zero-arg () => THREE.Object3D
 *   - createProp(name):    returns the prop mesh directly
 *   - dispose():           frees every module's shared resources
 *
 * Socket metadata is mirrored onto each created mesh as
 * `mesh.userData.socket = { type, max }` (center max 1, corner max 4,
 * edge max 4, surface max 1).
 *
 * Importing this module pulls in all 13 prop modules (the bush family owns
 * three manifest entries: bush / bush-snow / dry-shrub — one geometry,
 * palette resolved per biome). Prop modules remain importable directly for
 * their color constants and named factories.
 */

import * as flower from './flower'
import * as rock from './rock'
import * as bush from './bush'
import * as tallGrass from './tall-grass'
import * as smallStone from './small-stone'
import * as bigStone from './big-stone'
import * as pebbleCluster from './pebble-cluster'
import * as torch from './torch'
import * as lantern from './lantern'
import * as gravelPatch from './gravel-patch'
import * as cactus from './cactus'
import * as snowPatch from './snow-patch'
import * as lavaRock from './lava-rock'

/** Prop modules, in a stable order (used by dispose + manifest merge). */
export const PROP_MODULES = [
  flower,
  rock,
  bush,
  tallGrass,
  smallStone,
  bigStone,
  pebbleCluster,
  torch,
  lantern,
  gravelPatch,
  cactus,
  snowPatch,
  lavaRock,
]

/** Merged prop manifest: prop name → PropManifestEntry (socket metadata). */
export const PROPS = Object.assign({}, ...PROP_MODULES.map(m => m.VARIANTS))

/** All prop names, in module order. */
export const PROP_NAMES = Object.keys(PROPS)

/**
 * Returns a zero-arg factory for the given prop (composer-compatible:
 * `resolvePropFactory(name)()` → THREE.Mesh).
 *
 * @param {string} name - key of PROPS
 * @returns {() => THREE.Mesh}
 */
export function resolvePropFactory(name) {
  for (const m of PROP_MODULES) {
    if (Object.prototype.hasOwnProperty.call(m.VARIANTS, name)) {
      return () => m.createProp(name)
    }
  }
  throw new Error(`prop registry: unknown prop "${name}"`)
}

/**
 * Creates a prop mesh directly (equivalent to resolvePropFactory(name)()).
 *
 * @param {string} name - key of PROPS
 * @returns {THREE.Mesh}
 */
export function createProp(name) {
  return resolvePropFactory(name)()
}

/** Frees every prop module's shared geometry/materials/textures. */
export function dispose() {
  for (const m of PROP_MODULES) m.dispose()
}

// Re-export prop modules so consumers can keep importing colors from one
// place (e.g. `import { bush } from '../assets/props'`).
export {
  flower,
  rock,
  bush,
  tallGrass,
  smallStone,
  bigStone,
  pebbleCluster,
  torch,
  lantern,
  gravelPatch,
  cactus,
  snowPatch,
  lavaRock,
}
