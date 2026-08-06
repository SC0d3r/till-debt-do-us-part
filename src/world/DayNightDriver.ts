import * as THREE from 'three'
import { getDayCycleState, sunPosition, moonPosition, isNight, SUN_RADIUS, MOON_RADIUS } from '../core/DayCycle'

/**
 * Day/night cycle driver — owns the per-frame updateDayCycle body (sky color,
 * sun/moon position + visibility, clear color, HUD clock updates). The root
 * calls update(timeOfDay) once per loop tick; all colors/positions come from
 * pooled DayCycle outputs — zero per-frame allocations. Not called while
 * paused (time is frozen then).
 */
export interface DayNightDriverContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  ambient: THREE.AmbientLight
  sun: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  moonMesh: THREE.Mesh
  camera: THREE.PerspectiveCamera
  updateClock: (minutes: number) => void
}

export class DayNightDriver {
  private sunTarget = new THREE.Vector3(8, 0, 6)
  private skyColor = new THREE.Color()
  private lastClockMinute = -1

  constructor(private ctx: DayNightDriverContext) {}

  update(timeOfDay: number) {
    const t = timeOfDay
    const s = getDayCycleState(t)
    this.skyColor.copy(s.sky)
    this.ctx.renderer.setClearColor(this.skyColor)
    ;(this.ctx.scene.fog as THREE.Fog).color.copy(this.skyColor)
    this.ctx.ambient.color.copy(s.ambientColor)
    this.ctx.ambient.intensity = s.ambientIntensity
    this.ctx.sun.color.copy(s.sunColor)
    this.ctx.sun.intensity = s.sunIntensity
    this.ctx.fill.color.copy(s.fillColor)
    this.ctx.fill.intensity = s.fillIntensity

    // Sun arc by day; at night the "sun" light doubles as moonlight along the
    // moon arc (keyframes tint it pale blue) and the moon disc becomes visible.
    const night = isNight(t)
    if (night) {
      this.ctx.sun.position.copy(moonPosition(t, this.sunTarget, MOON_RADIUS))
      this.ctx.moonMesh.visible = true
      this.ctx.moonMesh.position.copy(this.ctx.sun.position)
      this.ctx.moonMesh.lookAt(this.ctx.camera.position)
    } else {
      this.ctx.sun.position.copy(sunPosition(t, this.sunTarget, SUN_RADIUS))
      this.ctx.moonMesh.visible = false
    }

    // HUD clock: only when the displayed minute actually changes.
    const minute = Math.floor(t)
    if (minute !== this.lastClockMinute) {
      this.lastClockMinute = minute
      this.ctx.updateClock(t)
    }
  }
}
