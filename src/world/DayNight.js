/**
 * DayNight — day/night lighting phase for the tile world (Slice C).
 *
 * timeOfDay is 0..1439 in-game minutes. Day runs 6:00 (360) to 20:00 (1200);
 * night otherwise. Dawn (5:00-7:00) and dusk (18:00-20:00) are smooth lerp
 * bands — no hard switches. Don't Starve-style night: everything past a
 * short radius reads near-black (very dark ambient/directional values), with
 * a small warm point-light pool around the player only.
 *
 * No sun/moon meshes — light only (the isometric camera barely sees the sky).
 *
 * The module is a pure phase calculator plus a small apply() that writes the
 * lerped light values into the world manager's rig (scratch colors reused).
 *
 * PERFORMANCE (fix round 1): the per-frame path (apply) allocates NOTHING —
 * the day factor is computed by the scalar `dayFactorAt(timeOfDay)`, which
 * returns a number, never an object. `phaseAt` still returns the
 * { phase, dayFactor } record for the rare getState/debug path only.
 */

import * as THREE from 'three'

/** Dawn band start (5:00). */
export const DAWN_START = 300
/** Day start (6:00) — dayFactor reaches 1.0 here. */
export const DAY_START = 360
/** Day end (18:00) — dayFactor starts falling here. */
export const DAY_END = 1080
/** Dusk band end (20:00) — dayFactor reaches 0.0 here. */
export const DUSK_END = 1200
/** Minutes per day. */
export const DAY_LENGTH = 1440

/** Day FOV radius (tiles). */
export const DAY_FOV = 9
/** Night FOV radius (tiles). */
export const NIGHT_FOV = 5

/** Day light values. */
const DAY_LIGHTS = {
  ambientColor: 0xffffff,
  ambient: 0.55,
  key: 0.9,
  fill: 0.35,
  rim: 0.3,
  player: 0,
}
/** Night light values (Don't Starve-style: near-black outside the pool). */
const NIGHT_LIGHTS = {
  ambientColor: 0x1a1a2e,
  ambient: 0.06,
  key: 0.05,
  fill: 0.02,
  rim: 0.02,
  // 0.9 (was 1.6 — hot): the pool light rides high + forward in WorldManager
  // (0, 1.7, 0.4), so ~0.9 keeps the near tiles + cube readable without
  // clipping (completion round).
  player: 0.9,
}

export class DayNight {
  constructor() {
    // Scratch colors for the light lerp (apply() is called once per frame —
    // reuse, never allocate).
    this._scratch = new THREE.Color()
    this._scratch2 = new THREE.Color()
  }

  /**
   * Scalar day factor for a timeOfDay (0..1439): 0 = full night, 1 = full
   * day. The PER-FRAME path — returns a number, allocates nothing (fix
   * round 1: phaseAt's object literal is no longer created per frame).
   *
   * @param {number} timeOfDay
   * @returns {number} dayFactor 0..1
   */
  dayFactorAt(timeOfDay) {
    const t = ((timeOfDay % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH
    if (t < DAWN_START) return 0
    if (t < DAY_START) return (t - DAWN_START) / (DAY_START - DAWN_START)
    if (t < DAY_END) return 1
    if (t < DUSK_END) return 1 - (t - DAY_END) / (DUSK_END - DAY_END)
    return 0
  }

  /**
   * Phase + day factor for a timeOfDay (0..1439). RARE path (getState /
   * debug overlay) — allocates a fresh record per call; the per-frame path
   * uses dayFactorAt instead (fix round 1).
   *
   * @param {number} timeOfDay
   * @returns {{phase: 'day'|'night'|'dawn'|'dusk', dayFactor: number}}
   *   dayFactor 0 = full night, 1 = full day.
   */
  phaseAt(timeOfDay) {
    const t = ((timeOfDay % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH
    if (t < DAWN_START) return { phase: 'night', dayFactor: 0 }
    if (t < DAY_START) return { phase: 'dawn', dayFactor: this.dayFactorAt(t) }
    if (t < DAY_END) return { phase: 'day', dayFactor: 1 }
    if (t < DUSK_END) return { phase: 'dusk', dayFactor: this.dayFactorAt(t) }
    return { phase: 'night', dayFactor: 0 }
  }

  /**
   * Writes the lerped light values into the world's lighting rig (scratch
   * colors — zero allocations). Also returns the day factor so the world can
   * tween its FOV radius with the same phase lerp.
   *
   * @param {{ambient: THREE.AmbientLight, key: THREE.DirectionalLight, fill: THREE.DirectionalLight, rim: THREE.DirectionalLight, playerLight: THREE.PointLight}} rig
   * @param {number} timeOfDay
   * @returns {number} dayFactor 0..1
   */
  apply(rig, timeOfDay) {
    const dayFactor = this.dayFactorAt(timeOfDay)
    const night = 1 - dayFactor
    this._scratch.setHex(DAY_LIGHTS.ambientColor)
    this._scratch2.setHex(NIGHT_LIGHTS.ambientColor)
    rig.ambient.color.copy(this._scratch).lerp(this._scratch2, night)
    rig.ambient.intensity = DAY_LIGHTS.ambient + (NIGHT_LIGHTS.ambient - DAY_LIGHTS.ambient) * night
    rig.key.intensity = DAY_LIGHTS.key + (NIGHT_LIGHTS.key - DAY_LIGHTS.key) * night
    rig.fill.intensity = DAY_LIGHTS.fill + (NIGHT_LIGHTS.fill - DAY_LIGHTS.fill) * night
    rig.rim.intensity = DAY_LIGHTS.rim + (NIGHT_LIGHTS.rim - DAY_LIGHTS.rim) * night
    rig.playerLight.intensity = DAY_LIGHTS.player + (NIGHT_LIGHTS.player - DAY_LIGHTS.player) * night
    return dayFactor
  }
}