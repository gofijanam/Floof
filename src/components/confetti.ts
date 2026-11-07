// Candy confetti: puffs, stars, hearts. One shared fixed canvas, created on demand.
type P = { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string; shape: number; life: number; max: number }
let cv: HTMLCanvasElement | null = null, g: CanvasRenderingContext2D, parts: P[] = [], raf = 0
const COLS = ['#FF5FB8', '#5FD4FF', '#B69CFF', '#FFF4FB', '#FFE27A', '#7CF5C8', '#FF8CCB']
function ensure() {
  if (cv) return
  cv = document.createElement('canvas')
  Object.assign(cv.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9997' })
  document.body.appendChild(cv); g = cv.getContext('2d')!
  const rs = () => { const d = Math.min(devicePixelRatio, 1.5); cv!.width = innerWidth * d; cv!.height = innerHeight * d; g.setTransform(d, 0, 0, d, 0, 0) }
  rs(); addEventListener('resize', rs)
}
function star(r: number) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) } g.closePath(); g.fill() }
function heart(r: number) { g.beginPath(); g.moveTo(0, r * 0.35); g.bezierCurveTo(r, -r * 0.4, r * 0.5, -r * 1.1, 0, -r * 0.45); g.bezierCurveTo(-r * 0.5, -r * 1.1, -r, -r * 0.4, 0, r * 0.35); g.fill() }
function puff(r: number) { g.beginPath(); g.arc(-r * 0.45, 0, r * 0.6, 0, 7); g.arc(r * 0.45, 0, r * 0.6, 0, 7); g.arc(0, -r * 0.4, r * 0.65, 0, 7); g.fill() }
function tick() {
  g.clearRect(0, 0, innerWidth, innerHeight)
  parts = parts.filter((p) => p.life < p.max)
  for (const p of parts) {
    p.life++; p.vy += 0.16; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, (p.max - p.life) / 30); g.fillStyle = p.c
    if (p.shape === 0) puff(p.r); else if (p.shape === 1) star(p.r); else if (p.shape === 2) heart(p.r); else { g.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7) }
    g.restore()
  }
  if (parts.length) raf = requestAnimationFrame(tick); else { raf = 0; g.clearRect(0, 0, innerWidth, innerHeight) }
}
export function confetti({ x = innerWidth / 2, y = innerHeight / 2, n = 120, spread = 1, power = 1 }: { x?: number; y?: number; n?: number; spread?: number; power?: number } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) n = Math.min(n, 20)
  ensure()
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (4 + Math.random() * 11) * power
    parts.push({ x, y, vx: Math.cos(a) * s * spread, vy: Math.sin(a) * s - 6 * power, r: 4 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: COLS[i % COLS.length], shape: Math.floor(Math.random() * 4), life: 0, max: 90 + Math.random() * 80 })
  }
  if (!raf) raf = requestAnimationFrame(tick)
}
