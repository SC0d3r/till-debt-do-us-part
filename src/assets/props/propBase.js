/**
 * Shared prop base — Slice B prop library, FORM redesign (2026-08-07 v3).
 *
 * The previous prism-with-painted-top generation read as TILES, not props, so
 * the geometry language was replaced wholesale: props are now REAL low-poly
 * objects (dome blobs, angular chunks, posts, boxes, blades) built from the
 * shared pieces in this module. The integration layer (registry, harness,
 * fixtures, tests) is untouched; only the form + shading changed.
 *
 * Design contract (per the owner's references A/B):
 *
 *  1. Real recognizable form. Every prop is built from 3D primitives matched
 *     to its subject: bushes are flattened dome blobs (icosahedron detail 1,
 *     hard flat facets), rocks are angular jittered chunks, flowers are
 *     stems + petal domes + cores, grass is double-sided blades, lanterns are
 *     a post + a real box with visible side faces. No extruded polygon with a
 *     painted top as the whole object — texture was removed entirely from the
 *     prop pipeline (the tile kit keeps its own).
 *
 *  2. Baked 3-tone ramps, no scene lights on props. Colors are baked per-face
 *     from the classic upper-left-front pixel-art light (LIGHT_DIR) into
 *     vertex colors; props render with a MeshBasicMaterial (unlit), exactly
 *     like reference A's guidance ("bake flat colors directly onto low-poly
 *     faces and skip lighting response entirely"). Ramps are 3-5 tones:
 *     top/light-facing ~+25%, left/front mid, right/back ~-25% desaturated,
 *     plus a tinted near-black outline tone used for edge ribbons, the
 *     contact ring and ambient-occlusion blending at the base.
 *
 *  3. Outline + contact shadow. Every angular prop gets dark edge RIBBONS
 *     (thin quads on crease edges, merged into the same BufferGeometry with
 *     the same material — vertex colors encode outline vs body, so the prop
 *     stays ONE geometry + ONE material, InstancedMesh-safe). Every prop sits
 *     on a dark CONTACT RING (low annulus, outline tone) and sinks BURY into
 *     the tile top face so nothing floats. The bush family deliberately
 *     skips ribbons ("soft silhouette — no hard edges", reference A).
 *
 *  4. Hero face toward the camera. The world camera views from the south
 *     (+z), elevated ~32-38°; props are staged with rotation 0, so local +z
 *     faces the camera. Shading and detailing (lantern glass, flame front,
 *     cactus arms, petals) are all placed/oriented on the +z side.
 *
 *  5. InstancedMesh-safety: ONE merged geometry + ONE material per variant,
 *     module-scope shared resources, dispose() per module, zero per-instance
 *     allocation. mergePropParts merges geometries with identical attribute
 *     sets (position/normal/color — no UVs in the prop pipeline anymore).
 *
 * What this module owns:
 *
 *  - hexToColor / SeededRNG / LIGHT_DIR / faceTone — the color + light model.
 *  - buildIcosa / sitOnGround / shadeFaces — dome-blob + angular-chunk kit.
 *  - buildPost / buildBox / buildFlame / buildBlade / buildSpineDot — the
 *    prismatic + planar kit (posts, lantern bodies, flames, grass blades,
 *    cactus spines).
 *  - buildRibbons / buildContactRing — outline + ground-contact kit.
 *  - makeCelMaterial / mergePropParts — the material + merge kit.
 *
 * Prop modules export the tile-style manifest convention unchanged: VARIANTS
 * (name → socket metadata), createProp(name) → single merged Mesh, dispose().
 * The merged registry src/assets/props/index.js is untouched.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SeededRNG } from '../../core/procedural'

export { SeededRNG }

/** Lowest point of every solid prop sinks this far into the tile top face
 *  (anti-float; hidden inside the tile by the depth test). */
export const BURY = 0.012
/** Contact ring thickness (world). */
export const RING_HEIGHT = 0.009

/**
 * Baked-ramp brightness (visual-critic F7): props are UNLIT (MeshBasicMaterial
 * + vertex colors) so their baked ramps render at full hex, ~1.4x brighter
 * than the lit MeshLambert host tiles (~0.49 irradiance). Every vertex color
 * this module writes is scaled by this factor so props sit at the same light
 * level as the tiles. Direction/structure of the ramps is untouched — only
 * the overall level scales down.
 */
export const PROP_BRIGHTNESS = 0.575

// ─── Light model (baked, upper-left-front per the references) ───
// Screen-left = world −x; the classic pixel-art ramp: top faces bright,
// left/front faces mid, right/back faces dark, bottoms darkest.
const _LX = -0.85
const _LY = 1.7
const _LZ = 0.7
const _LN = Math.hypot(_LX, _LY, _LZ)
export const LIGHT_DIR = { x: _LX / _LN, y: _LY / _LN, z: _LZ / _LN }

// ─── Color helpers ─────────────────────────────────────────────────────────

/**
 * Normalized 0-1 (linear working space) vertex color components for a hex
 * color — the tile kit's convention (THREE.Color; the renderer converts on
 * output). Never write raw sRGB bytes as vertex colors.
 */
export function hexToColor(hex) {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

/**
 * The 3-tone bucket for a face normal under the baked light: 'light' (top /
 * light-facing), 'mid' (left/front), 'dark' (right/back/bottom).
 *
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @param {{hi?: number, lo?: number}} [opts]
 * @returns {'light'|'mid'|'dark'}
 */
export function faceTone(nx, ny, nz, { hi = 0.55, lo = -0.05 } = {}) {
  const d = nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + nz * LIGHT_DIR.z
  return d > hi ? 'light' : d > lo ? 'mid' : 'dark'
}

// ─── Raw geometry plumbing ─────────────────────────────────────────────────

/** Wraps a plain position array (non-indexed tris) into a BufferGeometry with
 *  position + color (white default) + computed flat per-face normals. Colors
 *  are scaled by PROP_BRIGHTNESS (F7) — see the constant's doc. */
function finishGeo(positions, color = [1, 1, 1]) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const n = positions.length / 3
  const cols = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    cols[i * 3] = color[0] * PROP_BRIGHTNESS
    cols[i * 3 + 1] = color[1] * PROP_BRIGHTNESS
    cols[i * 3 + 2] = color[2] * PROP_BRIGHTNESS
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals() // non-indexed → per-face (flat) normals
  return geo
}

/**
 * Translates a geometry so its lowest vertex sits at y = −BURY (the tile-top
 * burial depth). Call before shadeFaces so AO bands are measured from the
 * final ground line.
 */
export function sitOnGround(geo) {
  const pos = geo.getAttribute('position').array
  let minY = Infinity
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] < minY) minY = pos[i]
  }
  geo.translate(0, -BURY - minY, 0)
  return geo
}

// ─── Dome-blob / angular-chunk kit ─────────────────────────────────────────

/**
 * An icosahedron-based blob: flat-faceted, optionally jittered (organic blobs)
 * and squashed (flattened domes). Sits on the ground via sitOnGround.
 *
 * @param {object} opts
 * @param {number} [opts.r=0.1] - radius
 * @param {number} [opts.detail=1] - icosahedron subdivision (1 = 80 facets)
 * @param {number} [opts.seed=1] - jitter seed
 * @param {number} [opts.jitter=0] - radial displacement 0..~0.7
 * @param {number} [opts.squash=1] - y scale (0.7 typical dome)
 * @param {number} [opts.yaw=0] - rotation around Y (radians)
 * @returns {THREE.BufferGeometry}
 */
export function buildIcosa({ r = 0.1, detail = 1, seed = 1, jitter = 0, squash = 1, yaw = 0 }) {
  const rng = new SeededRNG(seed)
  const g = new THREE.IcosahedronGeometry(r, detail)
  const pos = g.getAttribute('position').array
  for (let i = 0; i < pos.length; i += 3) {
    if (jitter > 0) {
      const f = 1 + (rng.next() * 2 - 1) * jitter
      // Vertices below the equator stay exactly on the base plane (only xz
      // jittered): the chunk's base must remain perfectly flat so it rests
      // flush on the tile instead of hovering on a wobbly ring of vertices.
      if (pos[i + 1] >= 0) {
        pos[i] *= f
        pos[i + 1] *= f
        pos[i + 2] *= f
      } else {
        pos[i] *= f
        pos[i + 2] *= f
      }
    }
    pos[i + 1] *= squash
  }
  if (yaw !== 0) g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw))
  // IcosahedronGeometry is already non-indexed (per-face vertices).
  return finishGeo(g.getAttribute('position').array)
}

/**
 * Applies the per-face 3-tone ramp + base AO to a geometry. For each triangle:
 * the face normal selects light/mid/dark, and faces whose centers sit in the
 * bottom `aoHeight` fraction blend toward the outline tone (ambient occlusion
 * where the object meets the ground).
 *
 * @param {THREE.BufferGeometry} geo
 * @param {object} tones
 * @param {number|string|number[]} tones.light - +25% tone
 * @param {number|string|number[]} tones.mid - base tone
 * @param {number|string|number[]} tones.dark - −25% desaturated tone
 * @param {number|string|number[]} tones.outline - tinted near-black
 * @param {object} [opts]
 * @param {number} [opts.aoHeight=0.22] - base AO band (fraction of height)
 * @param {number} [opts.aoAmount=0.55] - AO blend strength 0..1
 * @param {number} [opts.hi] - light-bucket threshold (faceTone)
 * @param {number} [opts.lo] - dark-bucket threshold (faceTone)
 * @returns {THREE.BufferGeometry}
 */
export function shadeFaces(geo, { light, mid, dark, outline }, { aoHeight = 0.22, aoAmount = 0.55, hi, lo } = {}) {
  const pos = geo.getAttribute('position').array
  const col = geo.getAttribute('color').array
  let maxY = -Infinity
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] > maxY) maxY = pos[i]
  }
  const band = Math.max(0.008, aoHeight * (maxY + BURY))
  const L = LIGHT_DIR
  const cLight = hexToColor(light)
  const cMid = hexToColor(mid)
  const cDark = hexToColor(dark)
  const cOutline = hexToColor(outline)
  for (let t = 0; t < pos.length / 9; t++) {
    const a = t * 9
    const b = a + 3
    const c = a + 6
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    const tone = faceTone(nx, ny, nz, { hi, lo })
    const base = tone === 'light' ? cLight : tone === 'mid' ? cMid : cDark
    let r = base[0]
    let g = base[1]
    let bl = base[2]
    const cyAvg = (ay + by + cy) / 3
    if (cyAvg < band) {
      const t2 = Math.min(1, (band - cyAvg) / band) * aoAmount
      r += (cOutline[0] - r) * t2
      g += (cOutline[1] - g) * t2
      bl += (cOutline[2] - bl) * t2
    }
    for (const i of [a, b, c]) {
      col[i] = r
      col[i + 1] = g
      col[i + 2] = bl
    }
  }
  return geo
}

// ─── Prismatic kit ─────────────────────────────────────────────────────────

/**
 * A regular n-gon post (prism) with per-face 3-tone shading, vertical band
 * darkening down the walls, base AO and a flat light top cap — all baked into
 * vertex colors. No texture/UV (the prop pipeline is unlit + vertex-colored).
 *
 * @param {object} opts
 * @param {number} [opts.r=0.02] - bottom circumradius
 * @param {number} [opts.rTop] - top circumradius (taper)
 * @param {number} opts.h - height
 * @param {number} [opts.y0=0] - bottom height (world)
 * @param {number} [opts.sides=6] - wall count
 * @param {object} opts.tones - { light, mid, dark, outline } (see shadeFaces)
 * @param {number} [opts.bands=2] - vertical wall bands (1.0, 0.78 per band)
 * @param {number} [opts.aoHeight=0.28] - base AO band
 * @returns {THREE.BufferGeometry}
 */
export function buildPost({ r = 0.02, rTop, h, y0 = 0, sides = 6, tones, bands = 2, aoHeight = 0.28 }) {
  const top = rTop !== undefined ? rTop : r
  const positions = []
  const ring = (radius, y) => {
    const pts = []
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides
      pts.push([Math.sin(a) * radius, y, Math.cos(a) * radius])
    }
    return pts
  }
  const bottom = ring(r, y0)
  const topRing = ring(top, y0 + h)
  // Walls: one quad per side per band.
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands
      const t1 = (b + 1) / bands
      const A = [bottom[i][0] + (topRing[i][0] - bottom[i][0]) * t0, y0 + h * t0, bottom[i][2] + (topRing[i][2] - bottom[i][2]) * t0]
      const B = [bottom[j][0] + (topRing[j][0] - bottom[j][0]) * t0, y0 + h * t0, bottom[j][2] + (topRing[j][2] - bottom[j][2]) * t0]
      const C = [bottom[j][0] + (topRing[j][0] - bottom[j][0]) * t1, y0 + h * t1, bottom[j][2] + (topRing[j][2] - bottom[j][2]) * t1]
      const D = [bottom[i][0] + (topRing[i][0] - bottom[i][0]) * t1, y0 + h * t1, bottom[i][2] + (topRing[i][2] - bottom[i][2]) * t1]
      positions.push(...A, ...B, ...C, ...A, ...C, ...D)
    }
  }
  // Top cap (fan from centroid).
  for (let i = 1; i < sides - 1; i++) {
    positions.push(0, y0 + h, 0, topRing[i][0], y0 + h, topRing[i][2], topRing[i + 1][0], y0 + h, topRing[i + 1][2])
  }
  const geo = finishGeo(positions)
  shadeFaces(geo, tones, { aoHeight })
  // Vertical band darkening on the wall tris (the cap tris stay untouched):
  // identify wall tris by their non-horizontal normal.
  const pos = geo.getAttribute('position').array
  const col = geo.getAttribute('color').array
  const bandShade = [1.0, 0.78]
  for (let t = 0; t < pos.length / 9; t++) {
    const a = t * 9
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[a + 3], by = pos[a + 4], bz = pos[a + 5]
    const cx = pos[a + 6], cy = pos[a + 7], cz = pos[a + 8]
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    if (ny > 0.7) continue // cap tri: leave at its baked face tone
    const avgY = (ay + by + cy) / 3
    const hRel = (avgY - y0) / h
    const bIdx = Math.min(bands - 1, Math.floor(hRel * bands))
    const f = bandShade[Math.min(bands - 1, bIdx)] ?? 1
    if (f !== 1) {
      for (const i of [a, a + 3, a + 6]) {
        col[i] *= f
        col[i + 1] *= f
        col[i + 2] *= f
      }
    }
  }
  return geo
}

/**
 * A real box (lantern bodies, chests...) with explicit per-face colors, all
 * baked as vertex colors. Face order: { front (+z), back (−z), left (−x),
 * right (+x), top (+y), bottom (−y) }.
 *
 * @param {object} opts
 * @param {number} opts.w - x extent
 * @param {number} opts.h - y extent
 * @param {number} opts.d - z extent
 * @param {number} [opts.y0=0] - bottom height
 * @param {Record<string, number|string|number[]>} opts.tones
 * @returns {THREE.BufferGeometry}
 */
export function buildBox({ w, h, d, y0 = 0, tones }) {
  const hw = w / 2
  const hd = d / 2
  const y1 = y0 + h
  const V = {
    'front': [[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]],
    'back': [[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]],
    'left': [[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]],
    'right': [[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]],
    'top': [[-hw, y1, hd], [hw, y1, hd], [hw, y1, -hd], [-hw, y1, -hd]],
    'bottom': [[-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd]],
  }
  const positions = []
  const colors = []
  for (const name of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
    const col = hexToColor(tones[name] ?? tones.mid ?? 0x808080)
    const [a, b, c, dV] = V[name]
    for (const p of [a, b, c, a, c, dV]) {
      positions.push(p[0], p[1], p[2])
      colors.push(col[0] * PROP_BRIGHTNESS, col[1] * PROP_BRIGHTNESS, col[2] * PROP_BRIGHTNESS)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * A small tapered flame: 3 vertical bands (dark base → bright tip) baked per
 * face, leaning slightly toward +z (the camera) — the torch's fire.
 *
 * @param {object} opts
 * @param {number} [opts.r=0.02] - base radius
 * @param {number} [opts.h=0.08] - total height
 * @param {number} [opts.y0=0] - base height
 * @param {number} [opts.lean=0] - tip lean toward +z (radians)
 * @param {[number|string|number[], number|string|number[], number|string|number[]]} opts.tones
 *   [dark, mid, bright] bottom → top
 * @param {number} [opts.sides=5]
 * @returns {THREE.BufferGeometry}
 */
export function buildFlame({ r = 0.02, h = 0.08, y0 = 0, lean = 0, tones, sides = 5 }) {
  const bands = [
    { f0: 0, f1: 0.3, r0: 1.0, r1: 0.62, tone: tones[0] },
    { f0: 0.3, f1: 0.66, r0: 0.62, r1: 0.2, tone: tones[1] },
    { f0: 0.66, f1: 1.0, r0: 0.2, r1: 0.004, tone: tones[2] },
  ]
  const positions = []
  for (const bd of bands) {
    const yA = y0 + h * bd.f0
    const yB = y0 + h * bd.f1
    const rA = r * bd.r0
    const rB = r * bd.r1
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides
      const a1 = (i * Math.PI * 2) / sides
      const a2 = (j * Math.PI * 2) / sides
      const A = [Math.sin(a1) * rA, yA, Math.cos(a1) * rA]
      const B = [Math.sin(a2) * rA, yA, Math.cos(a2) * rA]
      const C = [Math.sin(a2) * rB, yB, Math.cos(a2) * rB]
      const D = [Math.sin(a1) * rB, yB, Math.cos(a1) * rB]
      positions.push(...A, ...B, ...C, ...A, ...C, ...D)
    }
  }
  // Tip cap (tiny fan).
  const yTip = y0 + h
  const rTip = r * 0.004
  for (let i = 1; i < sides - 1; i++) {
    const a1 = (i * Math.PI * 2) / sides
    const a2 = ((i + 1) * Math.PI * 2) / sides
    positions.push(0, yTip, 0, Math.sin(a1) * rTip, yTip, Math.cos(a1) * rTip, Math.sin(a2) * rTip, yTip, Math.cos(a2) * rTip)
  }
  const geo = finishGeo(positions)
  // Color per band by face-center height.
  const pos = geo.getAttribute('position').array
  const col = geo.getAttribute('color').array
  for (let t = 0; t < pos.length / 9; t++) {
    const a = t * 9
    const yAvg = (pos[a + 1] + pos[a + 4] + pos[a + 7]) / 3
    const rel = (yAvg - y0) / h
    const tone = rel < 0.3 ? tones[0] : rel < 0.66 ? tones[1] : tones[2]
    const c3 = hexToColor(tone)
    for (const i of [a, a + 3, a + 6]) {
      col[i] = c3[0]
      col[i + 1] = c3[1]
      col[i + 2] = c3[2]
    }
  }
  if (lean !== 0) {
    const m = new THREE.Matrix4().makeRotationX(lean)
    // Pivot at the flame base so the lean tips the flame over.
    const to = new THREE.Matrix4().makeTranslation(0, y0, 0)
    const from = new THREE.Matrix4().makeTranslation(0, -y0, 0)
    geo.applyMatrix4(to.multiply(m).multiply(from))
  }
  return geo
}

// ─── Blade kit (double-sided planes) ───────────────────────────────────────

/**
 * A tapered blade plane (double-sided — pair with material side: DoubleSide):
 * base width `w` at the ground, tip at height `h`, lighter on the −x (screen
 * left) side, darker on the +x side (reference A grass rule), fanned by yaw /
 * leaned by lean.
 *
 * @param {object} opts
 * @param {number} opts.h - blade height
 * @param {number} [opts.w=0.032] - base width
 * @param {number} [opts.yaw=0] - fan rotation around Y
 * @param {number} [opts.lean=0] - tip lean toward +z (radians)
 * @param {number|string|number[]} opts.colLight - −x edge tone
 * @param {number|string|number[]} opts.colDark - +x edge tone
 * @param {number|string|number[]} [opts.colTip] - tip tone (defaults to light)
 * @returns {THREE.BufferGeometry}
 */
export function buildBlade({ h, w = 0.032, yaw = 0, lean = 0, colLight, colDark, colTip }) {
  const hw = w / 2
  const tip = colTip ?? colLight
  const cL = hexToColor(colLight)
  const cD = hexToColor(colDark)
  const cT = hexToColor(tip)
  const positions = [-hw, 0, 0, hw, 0, 0, 0, h, 0]
  const colors = [...cL.map((v) => v * PROP_BRIGHTNESS), ...cD.map((v) => v * PROP_BRIGHTNESS), ...cT.map((v) => v * PROP_BRIGHTNESS)]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  if (lean !== 0 || yaw !== 0) {
    const m = new THREE.Matrix4().makeRotationX(lean).multiply(new THREE.Matrix4().makeRotationY(yaw))
    geo.applyMatrix4(m)
  }
  return geo
}

// ─── Outline + contact kit ─────────────────────────────────────────────────

/**
 * Dark edge ribbons along the SHARP creases of a geometry (face-normal angle
 * above `minDihedral`) plus true border edges, offset outward so they never
 * z-fight. Merged into the body geometry — same material, vertex colors
 * encode outline vs body. This is the tinted non-black silhouette outline of
 * reference B, InstancedMesh-safe.
 *
 * Edges are paired by POSITION (the prop pipeline is non-indexed, so
 * index-based pairing would treat every edge as a border and ribbon
 * everything — the wireframe look the critics flagged). Identical doubled
 * vertex coordinates hash to the same edge; adjacent coplanar-ish facets
 * (angle below minDihedral) get no ribbon.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {object} opts
 * @param {number|string|number[]} opts.color - outline tone
 * @param {number} [opts.width=0.011] - ribbon width
 * @param {number} [opts.minDihedral=0.12] - crease threshold (radians): edges
 *   whose adjacent face-normal angle is BELOW this get no ribbon
 * @returns {THREE.BufferGeometry}
 */
export function buildRibbons(geo, { color, width = 0.011, minDihedral = 0.12 }) {
  const pos = geo.getAttribute('position').array
  const triCount = pos.length / 9
  const tris = []
  for (let t = 0; t < triCount; t++) {
    const a = t * 9
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[a + 3], by = pos[a + 4], bz = pos[a + 5]
    const cx = pos[a + 6], cy = pos[a + 7], cz = pos[a + 8]
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const area = Math.hypot(nx, ny, nz)
    if (area < 1e-9) continue
    nx /= area
    ny /= area
    nz /= area
    tris.push({ a, n: { x: nx, y: ny, z: nz } })
  }
  // Edge map keyed by the exact (injective) string repr of the doubled
  // vertex coordinates — non-indexed geometry duplicates shared vertices
  // bit-exactly, so equal positions collide, distinct ones never do.
  const edges = new Map()
  const addEdge = (i1, i2, t) => {
    const p1x = pos[i1 * 3], p1y = pos[i1 * 3 + 1], p1z = pos[i1 * 3 + 2]
    const p2x = pos[i2 * 3], p2y = pos[i2 * 3 + 1], p2z = pos[i2 * 3 + 2]
    const k1 = `${p1x},${p1y},${p1z}`
    const k2 = `${p2x},${p2y},${p2z}`
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
    let e = edges.get(key)
    if (!e) {
      e = { p1: [p1x, p1y, p1z], p2: [p2x, p2y, p2z], faces: [] }
      edges.set(key, e)
    }
    if (e.faces.length < 2) e.faces.push(t)
  }
  for (let t = 0; t < tris.length; t++) {
    const v = tris[t].a / 3
    addEdge(v, v + 1, t)
    addEdge(v + 1, v + 2, t)
    addEdge(v + 2, v, t)
  }
  const hw = width / 2
  const col = hexToColor(color)
  const out = []
  for (const e of edges.values()) {
    let d
    if (e.faces.length >= 2) {
      const n1 = tris[e.faces[0]].n
      const n2 = tris[e.faces[1]].n
      const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z
      if (dot > Math.cos(minDihedral)) continue // nearly coplanar: no crease
      d = { x: n1.x + n2.x, y: n1.y + n2.y, z: n1.z + n2.z }
    } else {
      d = { ...tris[e.faces[0]].n } // true border edge: always outlined
    }
    const dl = Math.hypot(d.x, d.y, d.z) || 1
    d.x /= dl
    d.y /= dl
    d.z /= dl
    const p1 = e.p1
    const p2 = e.p2
    const q1 = [p1[0] - d.x * hw, p1[1] - d.y * hw, p1[2] - d.z * hw]
    const q2 = [p2[0] - d.x * hw, p2[1] - d.y * hw, p2[2] - d.z * hw]
    const q3 = [p2[0] + d.x * hw, p2[1] + d.y * hw, p2[2] + d.z * hw]
    const q4 = [p1[0] + d.x * hw, p1[1] + d.y * hw, p1[2] + d.z * hw]
    out.push(...q1, ...q2, ...q3, ...q1, ...q3, ...q4)
  }
  return finishGeo(out, col)
}

/**
 * The contact ring: a low dark annulus every prop sits on — the visible
 * "sits on the ground" seam + contact shadow (reference A/B). Hexagon annulus
 * with a top cap, outer wall and inner wall, all in the outline tone.
 *
 * @param {object} opts
 * @param {number} opts.r - ring radius (centerline)
 * @param {number|string|number[]} opts.color - outline tone
 * @param {number} [opts.thickness=0.024] - annulus width
 * @param {number} [opts.height=RING_HEIGHT] - ring height
 * @param {number} [opts.y=0.001] - base height above ground
 * @param {number} [opts.sides=6]
 * @returns {THREE.BufferGeometry}
 */
export function buildContactRing({ r, color, thickness = 0.024, height = RING_HEIGHT, y = 0.001, sides = 6 }) {
  const col = hexToColor(color)
  const ro = r + thickness / 2
  const ri = Math.max(0.003, r - thickness / 2)
  const outer = []
  const inner = []
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides + Math.PI / sides
    outer.push([Math.sin(a) * ro, Math.cos(a) * ro])
    inner.push([Math.sin(a) * ri, Math.cos(a) * ri])
  }
  const positions = []
  // Top cap: trapezoids between rings.
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    const [ox1, oz1] = outer[i]
    const [ox2, oz2] = outer[j]
    const [ix1, iz1] = inner[i]
    const [ix2, iz2] = inner[j]
    positions.push(ox1, y + height, oz1, ox2, y + height, oz2, ix1, y + height, iz1)
    positions.push(ix1, y + height, iz1, ox2, y + height, oz2, ix2, y + height, iz2)
    positions.push(ox1, y, oz1, ox2, y, oz2, ox1, y + height, oz1)
    positions.push(ox2, y, oz2, ox2, y + height, oz2, ox1, y + height, oz1)
    positions.push(ix1, y, iz1, ix1, y + height, iz1, ix2, y, iz2)
    positions.push(ix2, y, iz2, ix1, y + height, iz1, ix2, y + height, iz2)
  }
  return finishGeo(positions, col)
}

/**
 * A flat quad facing +z (the camera), used for baked glow patches and small
 * flat details (lantern glow). Vertex-colored.
 *
 * @param {object} opts
 * @param {number} opts.w - width (x)
 * @param {number} opts.h - height (y)
 * @param {number} [opts.y0=0] - bottom height
 * @param {number} [opts.z=0] - z position
 * @param {number|string|number[]} opts.color
 * @returns {THREE.BufferGeometry}
 */
export function buildQuad({ w, h, y0 = 0, z = 0, color }) {
  const hw = w / 2
  const positions = [-hw, y0, z, hw, y0, z, hw, y0 + h, z, -hw, y0, z, hw, y0 + h, z, -hw, y0 + h, z]
  return finishGeo(positions, hexToColor(color))
}

// ─── Spine dots (cactus) ───────────────────────────────────────────────────

/**
 * A tiny outward-facing square dot on a cylindrical surface (cactus spines),
 * baked pale — merged into the body geometry.
 *
 * @param {object} opts
 * @param {number} opts.r - surface radius
 * @param {number} opts.y - surface height
 * @param {number} opts.theta - azimuth (radians; 0 = +z toward camera)
 * @param {number} [opts.size=0.005] - dot half-size
 * @param {number|string|number[]} opts.color
 * @returns {THREE.BufferGeometry}
 */
export function buildSpineDot({ r, y, theta, size = 0.005, color }) {
  const nx = Math.sin(theta)
  const nz = Math.cos(theta)
  const cx = nx * r
  const cz = nz * r
  // Tangent axes (u along Y, v around the cylinder).
  const vx = -nz
  const vz = nx
  const col = hexToColor(color)
  const p = (su, sv) => [cx + vx * sv * size, y + su * size, cz + vz * sv * size]
  const a = p(-1, -1)
  const b = p(-1, 1)
  const c = p(1, 1)
  const d = p(1, -1)
  const positions = [...a, ...b, ...c, ...a, ...c, ...d]
  return finishGeo(positions, col)
}

// ─── Material + merge ──────────────────────────────────────────────────────

/**
 * The shared unlit cel material: MeshBasicMaterial + vertexColors — colors
 * are baked, the scene lights never touch props (reference A: skip lighting
 * response entirely). `side: DoubleSide` for blade/plane props.
 *
 * @param {{side?: THREE.Side}} [opts]
 * @returns {THREE.MeshBasicMaterial}
 */
export function makeCelMaterial({ side = THREE.FrontSide } = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, side, flatShading: true })
}

/**
 * Merges part geometries into ONE InstancedMesh-safe geometry. All parts must
 * carry identical attribute sets (position/normal/color — every builder in
 * this module does). Callers apply per-part transforms BEFORE merging.
 *
 * @param {THREE.BufferGeometry[]} parts
 * @returns {THREE.BufferGeometry}
 */
export function mergePropParts(parts) {
  return mergeGeometries(parts, false)
}
