/**
 * LAVA-ROCK prop — center socket, angular basalt chunk pile with ember cracks
 * (FORM redesign).
 *
 * Three angular basalt CHUNKS (jittered icosahedron detail 0, hard flat
 * facets) in a tight cluster, dark 3-tone ramp, dark edge ribbons — plus the
 * lava signature: a few up-facing facets recolor to ember orange / glow
 * yellow and a seeded subset of the crease ribbons recolor to ember, so the
 * rock reads as cooling lava with glowing cracks (all baked — no lights, no
 * emissive). Base AO + contact ring.
 *
 * World height ~0.17.
 *
 * Palette (6): basalt light/mid/dark, near-black basalt outline, ember
 * orange, glow yellow.
 *
 * Socket: center (max 1). InstancedMesh-safe: ONE merged geometry + ONE
 * material (see propBase.js buildIcosa / shadeFaces / buildRibbons /
 * buildContactRing / SeededRNG).
 */

import * as THREE from 'three'
import {
  SeededRNG,
  buildIcosa,
  sitOnGround,
  shadeFaces,
  buildRibbons,
  buildContactRing,
  makeCelMaterial,
  mergePropParts,
} from './propBase'

// ─── Palette (basalt + ember) ───
const B = { light: 0x666673, mid: 0x4a4a55, dark: 0x33333c, outline: 0x232329 }
const EMBER = 0xff7a1a
const GLOW = 0xffc832

// ─── Shared resources (module scope, built once, disposed exactly once) ───
let geometry = null
let material = null

function getGeometry() {
  if (!geometry) {
    const chunks = [
      { r: 0.095, jitter: 0.5, squash: 0.74, seed: 91, yaw: 0.4, off: [0, 0] },
      { r: 0.062, jitter: 0.55, squash: 0.7, seed: 92, yaw: 1.3, off: [0.05, 0.02] },
      { r: 0.05, jitter: 0.58, squash: 0.68, seed: 93, yaw: 2.2, off: [-0.045, 0.052] },
    ]
    const bodyParts = []
    for (const ch of chunks) {
      const g = buildIcosa({ r: ch.r, detail: 0, seed: ch.seed, jitter: ch.jitter, squash: ch.squash, yaw: ch.yaw })
      sitOnGround(g)
      shadeFaces(g, B, { aoAmount: 0.62 })
      g.translate(ch.off[0], 0, ch.off[1])
      bodyParts.push(g)
    }
    const body = mergePropParts(bodyParts)

    // Ember facets: seeded subset of up-facing faces recolor to ember/glow.
    const rng = new SeededRNG(905)
    const pos = body.getAttribute('position').array
    const col = body.getAttribute('color').array
    const nTri = pos.length / 9
    for (let t = 0; t < nTri; t++) {
      if (rng.next() > 0.16) continue
      const a = t * 9
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
      const bx = pos[a + 3], by = pos[a + 4], bz = pos[a + 5]
      const cx = pos[a + 6], cy = pos[a + 7], cz = pos[a + 8]
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
      const nl = Math.hypot(nx, ny, nz) || 1
      ny /= nl
      nx /= nl
      nz /= nl
      if (ny < 0.5) continue // only top/light-facing facets glow
      const c3 = hexToColorRaw(rng.next() < 0.7 ? EMBER : GLOW)
      for (const i of [a, a + 3, a + 6]) {
        col[i] = c3[0]
        col[i + 1] = c3[1]
        col[i + 2] = c3[2]
      }
    }

    const parts = [body]
    // Dark crease ribbons, then a seeded subset recolor to ember (glowing
    // crack lines).
    const ribbons = buildRibbons(body, { color: B.outline, width: 0.011, minDihedral: 0.16 })
    const rng2 = new SeededRNG(906)
    const rcol = ribbons.getAttribute('color').array
    for (let i = 0; i < rcol.length; i += 9) {
      if (rng2.next() < 0.3) {
        const c3 = hexToColorRaw(EMBER)
        for (let k = 0; k < 3; k++) {
          rcol[i + k * 3] = c3[0]
          rcol[i + k * 3 + 1] = c3[1]
          rcol[i + k * 3 + 2] = c3[2]
        }
      }
    }
    parts.push(ribbons)
    parts.push(buildContactRing({ r: 0.1, color: B.outline }))
    geometry = mergePropParts(parts)
  }
  return geometry
}

/** Local color helper (avoids importing THREE in the hot path). */
function hexToColorRaw(hex) {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

function getMaterial() {
  if (!material) material = makeCelMaterial()
  return material
}

// ─── Machine-readable manifest (fixture registration + composer) ───
export const VARIANTS = {
  'lava-rock': {
    name: 'lava-rock',
    socket: 'center',
    max: 1,
    height: 0.17,
    hostTile: 'lava-plain',
  },
}

/**
 * Factory: returns the single merged lava-rock Mesh (InstancedMesh-safe).
 *
 * @param {string} [name='lava-rock'] - key of VARIANTS
 * @returns {THREE.Mesh}
 */
export function createProp(name = 'lava-rock') {
  if (!VARIANTS[name]) {
    throw new Error(`lava-rock: unknown prop variant "${name}"`)
  }
  const mesh = new THREE.Mesh(getGeometry(), getMaterial())
  mesh.userData.prop = name
  mesh.userData.socket = { type: VARIANTS[name].socket, max: VARIANTS[name].max }
  mesh.castShadow = true
  return mesh
}

/** Named alias for direct imports. */
export const createLavaRock = createProp

/** Frees the shared geometry/material exactly once. */
export function dispose() {
  if (geometry) {
    geometry.dispose()
    geometry = null
  }
  if (material) {
    material.dispose()
    material = null
  }
}
