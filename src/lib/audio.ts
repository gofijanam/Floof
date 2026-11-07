// Hand-rolled Web Audio sonic ID: generative music-box loop + candy SFX. Off by default.
let ctx: AudioContext | null = null
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, delay: DelayNode
let musicTimer: number | null = null
let enabled = false
const listeners = new Set<(on: boolean) => void>()

function ensure() {
  if (ctx) return ctx
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
  ctx = new AC()
  master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination)
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7
  delay = ctx.createDelay(1); delay.delayTime.value = 0.36
  const fb = ctx.createGain(); fb.gain.value = 0.32
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600
  delay.connect(fb); fb.connect(lp); lp.connect(delay)
  musicBus.connect(master); musicBus.connect(delay); delay.connect(master); sfxBus.connect(master)
  return ctx
}

function note(freq: number, t: number, dur = 0.5, type: OscillatorType = 'triangle', vol = 0.2, bus?: GainNode) {
  const c = ensure()
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(bus ?? musicBus); o.start(t); o.stop(t + dur + 0.05)
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]
const CHORDS = [[57, 64, 69, 72], [53, 60, 65, 69], [60, 64, 67, 72], [55, 62, 67, 71]]
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
let step = 0
function scheduleBar() {
  const c = ensure()
  const t0 = c.currentTime + 0.05
  const chord = CHORDS[Math.floor(step / 8) % CHORDS.length]
  // soft pad
  chord.forEach((m) => note(mtof(m - 12), t0, 2.6, 'sine', 0.035))
  // music-box arpeggio
  for (let i = 0; i < 8; i++) {
    const deg = SCALE[(i * 3 + step) % SCALE.length]
    if (Math.random() < 0.22 && i % 2) continue
    note(mtof(chord[0] + 12 + deg), t0 + i * 0.3, 0.7, 'triangle', 0.07)
    if (i === 0) note(mtof(chord[0] + 24 + deg), t0, 1.2, 'sine', 0.03)
  }
  step += 8
}

export const sound = {
  get on() { return enabled },
  subscribe(fn: (on: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  async set(on: boolean) {
    enabled = on
    try { localStorage.setItem('floof-sound', on ? '1' : '0') } catch {}
    listeners.forEach((l) => l(on))
    if (on) {
      const c = ensure(); await c.resume()
      master.gain.cancelScheduledValues(c.currentTime)
      master.gain.setTargetAtTime(0.6, c.currentTime, 0.4)
      if (musicTimer == null) { scheduleBar(); musicTimer = window.setInterval(scheduleBar, 2400) }
      sfx.pop()
    } else if (ctx) {
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
      if (musicTimer != null) { clearInterval(musicTimer); musicTimer = null }
    }
  },
  toggle() { return this.set(!enabled) },
}

function noiseBurst(t: number, dur: number, from: number, to: number, vol = 0.25) {
  const c = ensure()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource(); src.buffer = buf
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t)
}

export const sfx = {
  pop(pitch = 1) {
    if (!enabled || !ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(900 * pitch, t); o.frequency.exponentialRampToValueAtTime(220 * pitch, t + 0.09)
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.15)
  },
  tick() { if (enabled && ctx) note(1760, ctx.currentTime, 0.06, 'square', 0.03, sfxBus) },
  hover() { if (enabled && ctx) note(2093, ctx.currentTime, 0.05, 'sine', 0.025, sfxBus) },
  chime() { if (!enabled || !ctx) return; const t = ctx.currentTime;[72, 76, 79, 84].forEach((m, i) => note(mtof(m), t + i * 0.06, 0.6, 'triangle', 0.09, sfxBus)) },
  whoosh() { if (enabled && ctx) noiseBurst(ctx.currentTime, 0.55, 300, 4000, 0.3) },
  poof() {
    if (!enabled || !ctx) return
    const t = ctx.currentTime
    noiseBurst(t, 0.7, 2400, 180, 0.45)
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4)
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.55)
    ;[84, 88, 91, 96, 100].forEach((m, i) => note(mtof(m), t + 0.15 + i * 0.07, 0.9, 'triangle', 0.08, sfxBus))
  },
}
