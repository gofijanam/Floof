import { useEffect, useRef } from 'react'

/** Candy blob cursor: dot + lagging ring. Falls back to native over [data-cursor=native], inputs and dense data. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null), ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const html = document.documentElement
    html.classList.add('has-cursor')
    let x = -100, y = -100, rx = x, ry = y, raf = 0, scale = 1, ts = 1, hidden = false, down = false
    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY
      const t = e.target as HTMLElement
      const native = !!t.closest?.('[data-cursor=native], input, textarea, select')
      if (native !== hidden) { hidden = native; if (dot.current && ring.current) { dot.current.style.opacity = ring.current.style.opacity = native ? '0' : '1' } }
      const magnet = t.closest?.('a, button, [data-cursor=magnet], [role=button]')
      ts = magnet ? 2.1 : 1
      ring.current?.classList.toggle('is-link', !!magnet)
    }
    const onDown = () => { down = true }, onUp = () => { down = false }
    const loop = () => {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2
      scale += ((down ? ts * 0.8 : ts) - scale) * 0.2
      const vx = x - rx, vy = y - ry, sp = Math.min(Math.hypot(vx, vy) / 60, 0.45), ang = Math.atan2(vy, vx)
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0) translate(-50%,-50%) rotate(${ang}rad) scale(${scale * (1 + sp)},${scale * (1 - sp * 0.6)})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    addEventListener('pointermove', onMove, { passive: true }); addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp)
    return () => { cancelAnimationFrame(raf); html.classList.remove('has-cursor'); removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp) }
  }, [])
  return (
    <>
      <style>{`.fc-ring{position:fixed;left:0;top:0;width:34px;height:34px;border-radius:999px;pointer-events:none;z-index:9998;border:1.5px solid rgba(255,95,184,.85);background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.18),rgba(255,95,184,.06));transition:opacity .2s,border-color .2s,background .2s;mix-blend-mode:screen}
      .fc-ring.is-link{border-color:rgba(95,212,255,.9);background:radial-gradient(circle,rgba(95,212,255,.16),rgba(95,212,255,.04))}
      .fc-dot{position:fixed;left:0;top:0;width:7px;height:7px;border-radius:99px;background:#FFF4FB;box-shadow:0 0 10px #FF5FB8;pointer-events:none;z-index:9999;transition:opacity .2s}
      @media (pointer: coarse){.fc-ring,.fc-dot{display:none}}`}</style>
      <div ref={ring} className="fc-ring hidden md:block" aria-hidden />
      <div ref={dot} className="fc-dot hidden md:block" aria-hidden />
    </>
  )
}
