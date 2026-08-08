import type * as THREE from 'three'
import type { TileMapComposer } from './TileMapComposer'
import type { GeneratedChunk, GeneratedTile, GeneratedProp } from './worldGenerator'

export interface WorldManagerOptions {
  /** World seed (default 1337). */
  seed?: number
  /** Returns the game's `started` flag — the manager skips update + hover
   *  raycast when inactive so harness previews are never polluted. */
  isActive: () => boolean
}

export interface WorldPlayerState {
  x: number
  y: number
}

export interface WorldState {
  seed: number
  player: WorldPlayerState
  timeOfDay: number
  fovRadius: number
  loadedChunkCount: number
  lastChunkGenMs: number
  lastChunkGenMsMax: number
  biomeAtPlayer: string
  dayNightPhase: 'day' | 'night' | 'dawn' | 'dusk'
}

/** One tracked chunk wrapper. Void chunks are stubs: tiles is empty and
 *  composer/group/boundsSphere are null — they produce ZERO meshes (fix
 *  round 1: floating islands — the sky shows through between them). */
export interface WorldChunk {
  cx: number
  cy: number
  group: THREE.Group | null
  composer: TileMapComposer | null
  tiles: GeneratedTile[]
  props: GeneratedProp[]
  propMeshes: unknown[]
  boundsSphere: THREE.Sphere | null
  applyHover: ((hit: unknown) => void) | null
}

/**
 * The tile-world demo world (Slice C): chunk streaming (one TileMapComposer
 * per chunk, max 2 chunk loads/frame), the movable player cube (WASD via
 * InputManager + click-to-move), camera follow, FOV fog dims, and the
 * day/night lighting rig. PROD code — imported by src/main.ts.
 */
export class WorldManager {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, opts: WorldManagerOptions)

  /** Last hover record ({x, y, variant, rotation}) or null. */
  lastHover: { x: number; y: number; variant: string; rotation: number } | null

  /** Per-frame update (dt clamped to 0.05). Skips everything when inactive. */
  update(dt: number): void

  /** Rebuilds the world with a new seed (player back to spawn). */
  setSeed(seed: number): void
  /** Teleports the player to data coords (x, y). */
  teleport(x: number, y: number): void
  /** Sets the clock (0..1439, wraps). */
  setTimeOfDay(minutes: number): void
  /** Advances the clock (wraps at 1440). */
  fastForward(minutes: number): void
  /** Live FOV radius override (day/night tween resumes only if unset). */
  setFovRadius(r: number): void
  /** Clears a live FOV override — the day/night tween (day 9 / night 5)
   *  takes over again. Harness helper for deterministic fixtures. */
  resetFovOverride(): void
  /** Fast QA mode: InputManager fast-latch + instant camera snap. */
  setFastMode(enabled: boolean): void

  /** Plain serializable snapshot (harness getState additions). */
  getState(): WorldState
  /** The pure generator output for a chunk (determinism tests). */
  chunkData(cx: number, cy: number): GeneratedChunk
  /** Chunks still queued to be loaded (harness: fixtures poll until the
   *  streaming queue drains before screenshotting). */
  pendingChunkLoads(): number
  /** Biome for a global tile coordinate: the chunk's gate-passed biome for
   *  solid tiles, 'void' for void tiles (fix round 1: island mask). */
  biomeAt(x: number, y: number): string
  /** The computed dim factor for a tile (QA hook). */
  fogFactorAt(x: number, y: number): number
  /** Client pixel coords of a tile center through the current camera. */
  projectTile(x: number, y: number): { x: number; y: number } | null
  /** Chunk registry (harness/QA): every tracked chunk, including void stubs.
   *  loadedChunkCount counts only chunks with tiles; this map also holds the
   *  empty stubs so they are never rebuilt. */
  chunks: Map<string, WorldChunk>

  /** Full teardown: unbind listeners, dispose every chunk, remove the player
   *  mesh + lights. */
  dispose(): void
}