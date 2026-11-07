import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { MochiScene } from '../three/MochiScene'

export interface MochiHandle { puff(): void; poke(s?: number): void }

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

/** Lazy, code-split real-time WebGL mochi. Falls back to the brand PNG. */
export const Mochi3D = forwardRef<MochiHandle, { className?: string }>(function Mochi3D({ className = '' }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<MochiScene | null>(null)
  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(false)
  const reduced = !!useReducedMotion()
  useImperativeHandle(ref, () => ({ puff: () => scene.current?.puff(), poke: (s = 1) => scene.current?.poke(s) }), [])
  useEffect(() => {
    if (!webglOK()) { setFallback(true); return }
    let dead = false
    import('../three/MochiScene').then(({ MochiScene }) => {
      if (dead || !host.current) return
      try { scene.current = new MochiScene(host.current, { reduced, glb: './floof-mochi.glb', onReady: () => setReady(true) }) } catch (e) { console.warn('mochi3d init failed', e); setFallback(true) }
    }).catch((e) => { console.warn('mochi3d load failed', e); setFallback(true) })
    return () => { dead = true; scene.current?.dispose(); scene.current = null }
  }, [reduced])
  return (
    <div className={className || 'relative'}>
      <div ref={host} className="absolute inset-0" onPointerDown={() => scene.current?.poke(1)} style={{ touchAction: 'pan-y' }} />
      {(!ready || fallback) && (
        <img src="./mochi/idle.webp" alt="floof mochi mascot" className={`pointer-events-none absolute left-1/2 top-1/2 w-[46%] max-w-[420px] -translate-x-1/2 -translate-y-1/2 anim-breathe transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`} />
      )}
    </div>
  )
})
