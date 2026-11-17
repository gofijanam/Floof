import { useEffect, useRef } from 'react'

/** Canvas 2D candy-cloud particles with depth parallax (scroll + pointer). Cheap: dpr 1, ~40 sprites, paused offscreen. */
export function CandyField({ calm = false }: { calm?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const cols = ['255,95,184', '95,212,255', '182,156,255', '255,244,251']
    let W = 0, H = 0, raf = 0, mx = 0, my = 0
    const N = calm ? 16 : innerWidth < 768 ? 22 : 38
    const parts = Array.from({ length: N }, (_, i) => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, r: 0, c: cols[i % cols.length], s: 0.2 + Math.random() * 0.6, ph: Math.random() * 6.28, kind: Math.random() < 0.35 ? 'puff' : 'dot' }))
    // pre-render sprites
    const sprite = (c: string, puff: boolean) => {
      const s = document.createElement('canvas'); s.width = s.height = 128; const x = s.getContext('2d')!
      const blob = (cx: number, cy: number, r: number, a: number) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill() }
      if (puff) { blob(50, 70, 34, 0.5); blob(78, 66, 30, 0.45); blob(64, 50, 32, 0.5) } else blob(64, 64, 60, 0.6)
      return s
    }
    const cache = new Map<string, HTMLCanvasElement>()
    const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight }
    resize(); addEventListener('resize', resize)
    const onMove = (e: PointerEvent) => { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5 }
    addEventListener('pointermove', onMove, { passive: true })
    const draw = (t: number) => {
      g.clearRect(0, 0, W, H)
      const sy = scrollY
      for (const p of parts) {
        const key = p.c + p.kind; let sp = cache.get(key); if (!sp) { sp = sprite(p.c, p.kind === 'puff'); cache.set(key, sp) }
        const size = (p.kind === 'puff' ? 160 : 26) * p.z * (calm ? 0.8 : 1)
        let x = p.x * W + Math.sin(t * 0.0002 * p.s + p.ph) * 30 * p.z - mx * 40 * p.z
        let y = ((p.y * H - sy * p.z * 0.35 + Math.cos(t * 0.00025 * p.s + p.ph) * 24 - my * 30 * p.z) % (H + 200) + H + 200) % (H + 200) - 100
        g.globalAlpha = (calm ? 0.35 : 0.7) * p.z
        g.drawImage(sp, x - size / 2, y - size / 2, size, size)
      }
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw) }
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', vis) }
  }, [calm])
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0" aria-hidden />
}
