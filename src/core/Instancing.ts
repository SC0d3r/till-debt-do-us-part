import * as THREE from 'three'

// Generic helper for turning repeated static meshes into a single InstancedMesh.
// Each placement is rendered with: T(pos) · Ry(rotY) · (scale · T(offset)  OR  T(offset) · scale)
// preScale=true  scales the local offset too (needed when the original builder multiplied
//                both geometry size AND part position by the scale, e.g. createTree).
// preScale=false keeps the offset fixed while scaling geometry about that point
//                (needed when only the geometry varies per instance, e.g. flower stems).
export interface InstPlacement {
  x: number
  z: number
  y?: number
  s?: THREE.Vector3
  rotY?: number
  color?: number
}

const _m = new THREE.Matrix4()
const _s = new THREE.Matrix4()
const _t = new THREE.Matrix4()
const _r = new THREE.Matrix4()
const _c = new THREE.Color()

const HIDDEN = new THREE.Matrix4().makeTranslation(0, -1000, 0)

export function buildInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
  placements: InstPlacement[],
  offset: THREE.Vector3,
  opts: { preScale?: boolean; castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geometry, material, capacity)
  im.frustumCulled = false
  im.castShadow = !!opts.castShadow
  im.receiveShadow = !!opts.receiveShadow
  const preScale = !!opts.preScale

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    _m.makeTranslation(p.x, p.y ?? 0, p.z)
    if (p.rotY) {
      _r.makeRotationY(p.rotY)
      _m.multiply(_r)
    }
    const sv = p.s
    if (sv) {
      if (preScale) {
        _s.makeScale(sv.x, sv.y, sv.z)
        _t.makeTranslation(offset.x, offset.y, offset.z)
        _m.multiply(_s).multiply(_t)
      } else {
        _t.makeTranslation(offset.x, offset.y, offset.z)
        _s.makeScale(sv.x, sv.y, sv.z)
        _m.multiply(_t).multiply(_s)
      }
    } else {
      _t.makeTranslation(offset.x, offset.y, offset.z)
      _m.multiply(_t)
    }
    im.setMatrixAt(i, _m)
    if (p.color !== undefined) {
      im.setColorAt(i, _c.setHex(p.color))
    }
  }

  for (let i = placements.length; i < capacity; i++) {
    im.setMatrixAt(i, HIDDEN)
  }

  im.instanceMatrix.needsUpdate = true
  if (im.instanceColor) im.instanceColor.needsUpdate = true
  return im
}
