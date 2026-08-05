import * as THREE from 'three'

// Disposes every geometry and material under `root` exactly once, guarding
// shared resources with Sets (a mesh's geometry can be shared, and a material
// can be an array of materials). Textures are deliberately NOT disposed:
// getTileTexture() caches textures module-wide (src/core/MeshFactory.ts), so
// they are shared across FarmGrid instances and mine scenes — disposing them
// would break the next scene that reuses the cache.
export function disposeObject(root: THREE.Object3D): void {
  const seenGeo = new Set<THREE.BufferGeometry>()
  const seenMat = new Set<THREE.Material>()
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) {
      if (!seenGeo.has(mesh.geometry)) {
        seenGeo.add(mesh.geometry)
        mesh.geometry.dispose()
      }
    }
    const material = mesh.material
    if (material) {
      const mats = Array.isArray(material) ? material : [material]
      for (const m of mats) {
        if (!seenMat.has(m)) {
          seenMat.add(m)
          m.dispose()
        }
      }
    }
  })
}
