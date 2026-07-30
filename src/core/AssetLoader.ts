// Minimal asset loader - textures are now generated procedurally in MeshFactory
// This file kept for compatibility but simplified

import * as THREE from 'three'

const texCache: Record<string, THREE.Texture> = {}

export function loadTexture(path: string): THREE.Texture {
  if (texCache[path]) return texCache[path]
  const loader = new THREE.TextureLoader()
  const tex = loader.load(path)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  texCache[path] = tex
  return tex
}

// Kept for mine system compatibility
export function createSprite(texture: THREE.Texture, scale: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: texture })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(scale, scale, 1)
  return sprite
}
