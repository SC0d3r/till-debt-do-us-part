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
    // Free the graph as soon as the note ends so repeated sounds (footsteps,
    // tool swings) don't accumulate AudioNodes and degrade the frame rate.
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
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
    source.onended = () => { source.disconnect(); gain.disconnect() }
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

  // ─── Slot machine SFX (all synthesized, with slight random pitch jitter) ───
  private blip(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.4, jitter = 0.07) {
    this.playTone(freq * (1 + (Math.random() - 0.5) * 2 * jitter), dur, type, vol)
  }

  private seq(notes: number[], gap = 0.06, type: OscillatorType = 'sine', vol = 0.3) {
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.09, type, vol), i * gap * 1000))
  }

  slotClick() {
    this.blip(1400, 0.05, 'square', 0.12)
    setTimeout(() => this.blip(1950, 0.06, 'square', 0.08), 35)
  }

  slotSpinWhoosh() {
    this.playNoise(0.5, 0.12)
    setTimeout(() => this.blip(280, 0.3, 'sine', 0.14), 60)
  }

  slotClink() {
    this.blip(850 + Math.random() * 500, 0.06, 'sine', 0.14)
  }

  slotMatch(size: number) {
    const n = Math.min(3 + Math.floor(size / 3), 6)
    const base = 480 + Math.min(size, 8) * 14
    const notes: number[] = []
    for (let i = 0; i < n; i++) notes.push(base + i * 150)
    this.seq(notes, 0.07, 'sine', 0.24)
  }

  slotPop(size: number) {
    this.playNoise(0.1 + Math.min(size, 10) * 0.018, 0.12 + Math.min(size, 8) * 0.02)
    this.blip(190 + Math.random() * 70, 0.1, 'triangle', 0.2)
  }

  slotCascadeUp(step: number) {
    const base = 300 + Math.min(step, 8) * 85
    this.seq([base, base * 1.25, base * 1.55], 0.05, 'triangle', 0.18)
  }

  slotMultDing(level: number) {
    const f = 840 * Math.pow(1.16, level)
    this.blip(f, 0.12, 'sine', 0.24)
    setTimeout(() => this.blip(f * 1.5, 0.16, 'sine', 0.15), 95)
  }

  slotCoin(n: number) {
    for (let i = 0; i < Math.min(n, 14); i++) {
      setTimeout(() => this.blip(1150 + Math.random() * 1700, 0.045, 'square', 0.055), i * 42)
    }
  }

  slotWin(intensity: number) {
    const n = 5 + Math.min(intensity, 8)
    const notes: number[] = []
    for (let i = 0; i < n; i++) notes.push(660 + i * 95)
    this.seq(notes, 0.05, 'sine', 0.2)
    this.slotCoin(8 + intensity)
  }

  slotBigWin() {
    this.blip(196, 0.9, 'sawtooth', 0.1)
    this.blip(247, 0.9, 'sawtooth', 0.08)
    this.blip(294, 0.8, 'sawtooth', 0.08)
    this.blip(392, 0.6, 'sine', 0.13)
    this.blip(523, 0.55, 'sine', 0.1)
    this.slotCoin(22)
    setTimeout(() => this.seq([660, 770, 880, 990, 1100], 0.06, 'sine', 0.13), 320)
  }

  slotNoWin() {
    this.blip(500, 0.12, 'sine', 0.14)
    setTimeout(() => this.blip(400, 0.12, 'sine', 0.12), 140)
    setTimeout(() => this.blip(300, 0.28, 'sine', 0.11), 280)
    this.playNoise(0.14, 0.07)
  }

  slotDeny() {
    this.playTone(110, 0.18, 'sawtooth', 0.18)
    setTimeout(() => this.playTone(90, 0.22, 'sawtooth', 0.13), 95)
  }

  // ─── Slot ambient (soft luxury drone, very subtle) ───
  private ambOscs: OscillatorNode[] = []
  private ambGain: GainNode | null = null
  private ambOn = false

  slotAmbientOn() {
    if (this.ambOn) return
    this.ensureCtx()
    this.ambOn = true
    const c = this.ctx!
    const g = c.createGain()
    g.gain.value = 0
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.connect(this.masterGain!)
    g.connect(filter)
    this.ambGain = g
    const freqs = [110, 110.8, 164.8, 220.4]
    const types: OscillatorType[] = ['sine', 'triangle', 'sine', 'sine']
    const vols = [0.35, 0.16, 0.12, 0.08]
    this.ambOscs = []
    freqs.forEach((f, i) => {
      const o = c.createOscillator()
      o.type = types[i]
      o.frequency.value = f
      const og = c.createGain()
      og.gain.value = vols[i]
      o.connect(og)
      og.connect(g)
      o.start()
      this.ambOscs.push(o)
    })
    g.gain.linearRampToValueAtTime(0.028, c.currentTime + 2)
  }

  slotAmbientOff() {
    if (!this.ambOn) return
    this.ambOn = false
    const c = this.ctx!
    if (this.ambGain) this.ambGain.gain.linearRampToValueAtTime(0, c.currentTime + 1.2)
    const oscs = this.ambOscs
    this.ambOscs = []
    this.ambGain = null
    setTimeout(() => {
      for (const o of oscs) { try { o.stop() } catch {} }
    }, 1400)
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
