// Sound system:
// - All game sound effects are synthesized with the Web Audio API (no files).
// - The gameplay-loop song is a real MP3 file (public/gameplayloopsong.mp3)
//   streamed through an HTMLAudioElement — no per-9.6s WebAudio node churn.

export class SoundManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicEl: HTMLAudioElement | null = null
  private musicPlaying = false
  private volume = 0.3

  init() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.volume
    this.masterGain.connect(this.ctx.destination)
  }

  private ensureCtx() {
    if (!this.ctx) this.init()
    if (this.ctx!.state === 'suspended') this.ctx!.resume()
  }

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.5) {
    this.ensureCtx()
    const osc = this.ctx!.createOscillator()
    const gain = this.ctx!.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, this.ctx!.currentTime)
    gain.gain.setValueAtTime(volume, this.ctx!.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + duration)
    osc.connect(gain)
    gain.connect(this.masterGain!)
    osc.start()
    osc.stop(this.ctx!.currentTime + duration)
  }

  playNoise(duration: number, volume = 0.3) {
    this.ensureCtx()
    const bufferSize = this.ctx!.sampleRate * duration
    const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume
    }
    const source = this.ctx!.createBufferSource()
    source.buffer = buffer
    const gain = this.ctx!.createGain()
    gain.gain.setValueAtTime(volume, this.ctx!.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + duration)
    source.connect(gain)
    gain.connect(this.masterGain!)
    source.start()
  }

  // Sound effects
  footstep() {
    this.playNoise(0.08, 0.1)
  }

  toolSwing() {
    this.playTone(200, 0.15, 'triangle', 0.3)
  }

  plant() {
    this.playTone(400, 0.1, 'sine', 0.3)
    setTimeout(() => this.playTone(500, 0.1, 'sine', 0.2), 80)
  }

  water() {
    this.playNoise(0.3, 0.15)
  }

  harvest() {
    this.playTone(600, 0.1, 'sine', 0.4)
    setTimeout(() => this.playTone(800, 0.15, 'sine', 0.3), 100)
    setTimeout(() => this.playTone(1000, 0.2, 'sine', 0.2), 200)
  }

  collect() {
    this.playTone(880, 0.1, 'square', 0.2)
    setTimeout(() => this.playTone(1100, 0.15, 'square', 0.15), 80)
  }

  collectRare() {
    this.playTone(660, 0.1, 'sine', 0.4)
    setTimeout(() => this.playTone(880, 0.1, 'sine', 0.35), 100)
    setTimeout(() => this.playTone(1100, 0.15, 'sine', 0.3), 200)
    setTimeout(() => this.playTone(1320, 0.3, 'sine', 0.25), 300)
  }

  menuOpen() {
    this.playTone(440, 0.08, 'square', 0.15)
  }

  menuClose() {
    this.playTone(330, 0.08, 'square', 0.15)
  }

  menuSelect() {
    this.playTone(550, 0.06, 'square', 0.2)
  }

  error() {
    this.playTone(150, 0.2, 'sawtooth', 0.3)
  }

  sleep() {
    this.playTone(300, 0.3, 'sine', 0.2)
    setTimeout(() => this.playTone(250, 0.4, 'sine', 0.15), 300)
    setTimeout(() => this.playTone(200, 0.5, 'sine', 0.1), 600)
  }

  spoil() {
    this.playTone(100, 0.3, 'sawtooth', 0.2)
    setTimeout(() => this.playTone(80, 0.4, 'sawtooth', 0.15), 200)
  }

  // ─── Background music (MP3) ───
  private ensureMusicEl(): HTMLAudioElement {
    if (!this.musicEl) {
      this.musicEl = new Audio('gameplayloopsong.mp3')
      this.musicEl.loop = true
      this.musicEl.volume = this.volume
      this.musicEl.addEventListener('error', () => { this.musicEl = null })
    }
    return this.musicEl
  }

  startMusic() {
    if (this.musicPlaying) return
    this.ensureCtx()
    this.musicPlaying = true
    const el = this.ensureMusicEl()
    el.play().catch(() => { this.musicPlaying = false })
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.masterGain) this.masterGain.gain.value = this.volume
    if (this.musicEl) this.musicEl.volume = this.volume
  }

  pauseMusic() {
    this.musicPlaying = false
    this.musicEl?.pause()
    if (this.ctx?.state === 'running') this.ctx.suspend()
  }

  resumeMusic() {
    if (this.ctx?.state === 'suspended') this.ctx.resume()
    if (!this.musicPlaying) {
      this.musicPlaying = true
      const el = this.ensureMusicEl()
      el.play().catch(() => { this.musicPlaying = false })
    }
  }

  stopMusic() {
    this.musicPlaying = false
    if (this.musicEl) {
      this.musicEl.pause()
      this.musicEl.currentTime = 0
    }
  }
}

export const sound = new SoundManager()
