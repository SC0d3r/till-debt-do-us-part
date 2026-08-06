import * as THREE from 'three'
import { GAME_CONFIG } from '../data/gameData'
import { COLORS, createPlayerModel, createDogModel, createNPCModel } from '../core/MeshFactory'

/**
 * Farm-scene construction ONLY: renderer, scene, fog, camera, the three day/
 * night lights, the moon disc, the player model (+ cached bone refs), the dog
 * model (+ tail ref), the shop NPC model (+ arm refs), and the shop table with
 * its display items. No game logic, no loop involvement — the composition root
 * (Game) builds this once and hands the refs to the subsystems that need them.
 *
 * Quirk preserved verbatim: the arm bone lookups use the literal names
 * 'this.pRightArm' / 'this.pLeftArm' (which resolve to undefined today — held
 * tools are never parented to arms and arms never swing; screenshots encode
 * this). Do NOT "fix" to 'rightArm'/'leftArm'.
 */
export interface WorldBuilderOptions {
  fastMode: boolean
}

export class WorldBuilder {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly ambient: THREE.AmbientLight
  readonly sun: THREE.DirectionalLight
  readonly fill: THREE.DirectionalLight
  readonly moonMesh: THREE.Mesh
  readonly playerModel: THREE.Group
  readonly pLeftLeg: THREE.Group
  readonly pRightLeg: THREE.Group
  readonly pRightArm: THREE.Group
  readonly pLeftArm: THREE.Group
  readonly dogModel: THREE.Group
  readonly dogTail: THREE.Group
  readonly shopNpcModel: THREE.Group
  readonly shopLeftArm: THREE.Group
  readonly shopRightArm: THREE.Group

  constructor(opts: WorldBuilderOptions) {
    const fastMode = opts.fastMode
    this.renderer = new THREE.WebGLRenderer({ antialias: !fastMode })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(COLORS.sky)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Fast QA mode: render at half resolution — SwiftShader frame cost scales
    // with pixels, and QA never looks at the pixels, only at game state.
    if (fastMode) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.5))
    document.body.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(COLORS.sky, 18, 40)

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.set(8, 12, 14)
    this.camera.lookAt(8, 0, 6)

    // Wholesome lighting
    this.ambient = new THREE.AmbientLight(0xffeedd, 0.7)
    this.scene.add(this.ambient)
    this.sun = new THREE.DirectionalLight(0xfff5e0, 0.9)
    // Keep the same light direction ((15,20,10) offset from the farm center)
    // but target the farm so the shadow map only covers the playable area.
    // The whole background (mountains, forest, river, far ground) no longer
    // renders into the per-frame shadow pass, and farm shadows get ~2x sharper.
    this.sun.position.set(23, 26, 16)
    this.sun.target.position.set(8, 0, 6)
    // Fast QA mode skips the shadow pass entirely (shadow map render is a big
    // chunk of the SwiftShader frame cost); receivers keep their materials.
    this.sun.castShadow = !fastMode
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.left = -14; this.sun.shadow.camera.right = 14
    this.sun.shadow.camera.top = 14; this.sun.shadow.camera.bottom = -14
    this.sun.shadow.camera.updateProjectionMatrix()
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.fill = new THREE.DirectionalLight(0xaaccff, 0.3)
    this.fill.position.set(-10, 8, -5)
    this.scene.add(this.fill)

    // Moon disc: unlit basic material so it stays bright at night (fog
    // disabled so the farm fog can't wash it out). Positioned along the moon
    // arc each frame; hidden during the day. The "sun" directional light
    // doubles as moonlight at night (see DAY_KEYFRAMES sunColor/Intensity).
    this.moonMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8e4d8, fog: false }),
    )
    this.moonMesh.visible = false
    this.scene.add(this.moonMesh)

    // Player model
    this.playerModel = createPlayerModel()
    this.playerModel.position.set(1, 0, 1)
    this.playerModel.castShadow = true
    this.scene.add(this.playerModel)
    this.pLeftLeg = this.playerModel.getObjectByName('leftLeg') as THREE.Group
    this.pRightLeg = this.playerModel.getObjectByName('rightLeg') as THREE.Group
    this.pRightArm = this.playerModel.getObjectByName('this.pRightArm') as THREE.Group
    this.pLeftArm = this.playerModel.getObjectByName('this.pLeftArm') as THREE.Group

    // Dog
    this.dogModel = createDogModel()
    this.dogModel.position.set(1.5, 0, 1.5)
    this.dogModel.castShadow = true
    this.scene.add(this.dogModel)
    this.dogTail = this.dogModel.getObjectByName('tail') as THREE.Group

    // Shop NPC with table
    this.shopNpcModel = createNPCModel()
    const shopX = GAME_CONFIG.farmWidth - 1
    this.shopNpcModel.position.set(shopX, 0, 1.2)
    this.shopNpcModel.rotation.y = Math.PI // face toward farm
    this.shopNpcModel.castShadow = true
    this.scene.add(this.shopNpcModel)
    this.shopLeftArm = this.shopNpcModel.getObjectByName('this.pLeftArm') as THREE.Group
    this.shopRightArm = this.shopNpcModel.getObjectByName('this.pRightArm') as THREE.Group
    // Table in front of shop
    const tableGeo = new THREE.BoxGeometry(1.2, 0.6, 0.6)
    const tableMat = new THREE.MeshLambertMaterial({ color: 0x8b5a36 })
    const table = new THREE.Mesh(tableGeo, tableMat)
    table.position.set(shopX, 0.3, 0.5)
    table.castShadow = true
    table.receiveShadow = true
    this.scene.add(table)
    // Items on table
    for (let i = 0; i < 3; i++) {
      const itemBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.15),
        new THREE.MeshLambertMaterial({ color: [0x4a8e3a, 0xffe030, 0xe84040][i] })
      )
      itemBox.position.set(shopX - 0.3 + i * 0.3, 0.68, 0.5)
      this.scene.add(itemBox)
    }
  }
}
