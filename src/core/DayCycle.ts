import * as THREE from 'three'

// ─── Day/night cycle (slice 1) ───
// A pure module: given in-game minutes (0..1439) it produces the sky/lighting
// state (interpolated between keyframes), the sun/moon positions along their
// arcs, and the "HH:MM" HUD string. All THREE.Color/Vector3 outputs come from
// module-scope pools — nothing here allocates per call — so the main loop can
// call into this every frame.
//
// Keyframes (cozy Harvest Moon feel). Daytime must keep the original noon
// look EXACTLY at 720 minutes: sky 0x87ceeb, ambient 0xffeedd @ 0.7,
// sun 0xfff5e0 @ 0.9, fill 0xaaccff @ 0.3.

export interface DayKeyframe {
  minutes: number
  sky: number
  ambientColor: number
  ambientIntensity: number
  sunColor: number
  sunIntensity: number
  fillColor: number
  fillIntensity: number
}

export const DAY_KEYFRAMES: DayKeyframe[] = [
  // 00:00 — deep indigo night, cool blue ambient, moonlit pale sun-light
  { minutes: 0,   sky: 0x0c1230, ambientColor: 0x5566aa, ambientIntensity: 0.35, sunColor: 0xc8d0e8, sunIntensity: 0.20, fillColor: 0x8899cc, fillIntensity: 0.15 },
  // 05:00 — pre-dawn: indigo lifting, still night-cool
  { minutes: 300, sky: 0x1a2345, ambientColor: 0x6677bb, ambientIntensity: 0.40, sunColor: 0xd8d8f0, sunIntensity: 0.25, fillColor: 0x99aacc, fillIntensity: 0.18 },
  // 06:00 — sunrise: warm peach sky, golden sun low on the horizon
  { minutes: 360, sky: 0xffd9a8, ambientColor: 0xffc8a0, ambientIntensity: 0.55, sunColor: 0xffcf9e, sunIntensity: 0.65, fillColor: 0xc8c0e0, fillIntensity: 0.22 },
  // 12:00 — noon: EXACT original look (baseline lock)
  { minutes: 720, sky: 0x87ceeb, ambientColor: 0xffeedd, ambientIntensity: 0.70, sunColor: 0xfff5e0, sunIntensity: 0.90, fillColor: 0xaaccff, fillIntensity: 0.30 },
  // 17:00 — late afternoon: soft golden warmth, sky slightly warmer
  { minutes: 1020, sky: 0x9ac9e8, ambientColor: 0xffe8c8, ambientIntensity: 0.68, sunColor: 0xffe0a0, sunIntensity: 0.80, fillColor: 0xa8c0e8, fillIntensity: 0.28 },
  // 18:00 — sunset: orange glow, sun sinking low
  { minutes: 1080, sky: 0xff9a5c, ambientColor: 0xffb080, ambientIntensity: 0.50, sunColor: 0xff8844, sunIntensity: 0.55, fillColor: 0xd8a080, fillIntensity: 0.20 },
  // 20:00 — night: indigo returns, moon up
  { minutes: 1200, sky: 0x101838, ambientColor: 0x4455aa, ambientIntensity: 0.35, sunColor: 0xc0c8e0, sunIntensity: 0.20, fillColor: 0x7788bb, fillIntensity: 0.15 },
]

export const DAY_START = 360 // 06:00 — sun rises
export const DAY_END = 1080   // 18:00 — sun sets / moon rises
export const NIGHT_START = 1080
export const NIGHT_END = 360  // wraps to 06:00 — moon sets
export const DAY_LENGTH = 720 // minutes the sun/moon arcs take

// Night window: moon-up hours (18:00–06:00). Used for the moon mesh and the
// Moonpetal glow so both stay in sync with the light keyframes.
export function isNight(timeOfDay: number): boolean {
  return timeOfDay >= NIGHT_START || timeOfDay < NIGHT_END
}

export interface DayCycleState {
  sky: THREE.Color
  ambientColor: THREE.Color
  ambientIntensity: number
  sunColor: THREE.Color
  sunIntensity: number
  fillColor: THREE.Color
  fillIntensity: number
}

// ─── Pooled outputs (single caller in the main loop — apply immediately) ───
const outSky = new THREE.Color()
const outAmbient = new THREE.Color()
const outSun = new THREE.Color()
const outFill = new THREE.Color()

const STATE: DayCycleState = {
  sky: outSky,
  ambientColor: outAmbient,
  ambientIntensity: 0,
  sunColor: outSun,
  sunIntensity: 0,
  fillColor: outFill,
  fillIntensity: 0,
}

// Precompute THREE.Color versions of the keyframe entries once at module load.
const KEYFRAME_COLORS = DAY_KEYFRAMES.map(k => ({
  sky: new THREE.Color(k.sky),
  ambient: new THREE.Color(k.ambientColor),
  sun: new THREE.Color(k.sunColor),
  fill: new THREE.Color(k.fillColor),
}))

// Linear interpolation between two keyframes (wrapping minutes < 0 via 1440).
// t=0 yields the left keyframe EXACTLY, so keyframe minutes reproduce their
// literal values (that is what keeps 720 pixel-identical to the old noon).
function interpKeyframes(a: number, b: number, t: number): void {
  const ka = KEYFRAME_COLORS[a]
  const kb = KEYFRAME_COLORS[b]
  const fa = DAY_KEYFRAMES[a]
  const fb = DAY_KEYFRAMES[b]
  outSky.lerpColors(ka.sky, kb.sky, t)
  outAmbient.lerpColors(ka.ambient, kb.ambient, t)
  outSun.lerpColors(ka.sun, kb.sun, t)
  outFill.lerpColors(ka.fill, kb.fill, t)
  STATE.ambientIntensity = fa.ambientIntensity + (fb.ambientIntensity - fa.ambientIntensity) * t
  STATE.sunIntensity = fa.sunIntensity + (fb.sunIntensity - fa.sunIntensity) * t
  STATE.fillIntensity = fa.fillIntensity + (fb.fillIntensity - fa.fillIntensity) * t
}

// Returns the interpolated day-cycle state for `timeOfDay` (in-game minutes
// 0..1439). The returned colors are pooled and reused on the next call — copy
// or apply them immediately, never retain them across calls.
export function getDayCycleState(timeOfDay: number): DayCycleState {
  const m = ((timeOfDay % 1440) + 1440) % 1440
  if (m <= 0) { interpKeyframes(0, 1, 0); return STATE }
  for (let i = 0; i < DAY_KEYFRAMES.length - 1; i++) {
    const a = DAY_KEYFRAMES[i].minutes
    const b = DAY_KEYFRAMES[i + 1].minutes
    if (m >= a && m <= b) {
      interpKeyframes(i, i + 1, (m - a) / (b - a))
      return STATE
    }
  }
  // After the last keyframe (1200) the day wraps: interpolate toward the
  // midnight keyframe as if it sat at 1440.
  const last = DAY_KEYFRAMES.length - 1
  interpKeyframes(last, 0, (m - DAY_KEYFRAMES[last].minutes) / (1440 - DAY_KEYFRAMES[last].minutes))
  return STATE
}

// ─── Sun / moon arcs ───
// The sun sweeps east→west over 06:00–18:00 along an arc that peaks at noon
// EXACTLY on the original light position (target + (15, 26, 10)) so the noon
// baseline stays pixel-identical. The moon follows a similar arc at night on
// the opposite side of the sky, peaking at midnight. Both stay at least
// ~0.15 light intensity at night (see keyframes), keeping the farm playable.
const SUN_MAX_HEIGHT = 26
const MOON_MAX_HEIGHT = 20
// Original noon offset length sqrt(15² + 10²) ≈ 18.03 — the sun peaks EXACTLY
// on the original light position at noon so the baseline stays identical.
export const SUN_RADIUS = Math.sqrt(15 * 15 + 10 * 10)
export const MOON_RADIUS = 16

// Arc radius shrinks toward the horizon so rise/set stay close-in and the
// peak lands exactly on the original offset.
function arcRadius(peakRadius: number, t: number): number {
  return peakRadius * (0.6 + 0.4 * Math.sin(t))
}

const scratchVec = new THREE.Vector3()

/**
 * Position of the sun for a given timeOfDay, orbiting around `target`.
 * Valid for the day window [DAY_START, DAY_END]; outside it the sun is below
 * the horizon and the caller should use `moonPosition` instead.
 * `out` (or the module scratch vector) receives the result — no allocation.
 */
export function sunPosition(timeOfDay: number, target: THREE.Vector3, radius: number, out: THREE.Vector3 = scratchVec): THREE.Vector3 {
  const t = THREE.MathUtils.clamp((timeOfDay - DAY_START) / DAY_LENGTH, 0, 1) * Math.PI
  const noonAngle = Math.atan2(10, 15)
  const phi = noonAngle + (Math.PI / 2 - t) // sweeps east → west past noon
  const r = arcRadius(radius, t)
  return out.set(
    target.x + Math.cos(phi) * r,
    target.y + Math.sin(t) * SUN_MAX_HEIGHT,
    target.z + Math.sin(phi) * r,
  )
}

/**
 * Position of the moon for a given timeOfDay, orbiting around `target` on the
 * side opposite the sun. Valid for the night window (18:00–06:00).
 */
export function moonPosition(timeOfDay: number, target: THREE.Vector3, radius: number, out: THREE.Vector3 = scratchVec): THREE.Vector3 {
  // Night fraction: 0 at 18:00, 0.5 at midnight, 1 at 06:00 (wraps past 24:00).
  const nightMinutes = timeOfDay >= NIGHT_START ? timeOfDay - NIGHT_START : timeOfDay + NIGHT_END
  const t = THREE.MathUtils.clamp(nightMinutes / DAY_LENGTH, 0, 1) * Math.PI
  const noonAngle = Math.atan2(10, 15)
  const phi = noonAngle + Math.PI + (Math.PI / 2 - t) // opposite the sun, peaks at midnight
  const r = arcRadius(radius, t)
  return out.set(
    target.x + Math.cos(phi) * r,
    target.y + Math.sin(t) * MOON_MAX_HEIGHT,
    target.z + Math.sin(phi) * r,
  )
}

// 24h "HH:MM" clock string, e.g. formatClock(360) === "06:00".
export function formatClock(minutes: number): string {
  const m = Math.floor(minutes) % 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
