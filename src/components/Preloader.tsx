import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { sound, sfx } from '../lib/audio'
import { useSound } from '../lib/useSound'

const LINES = ['fluffing the clouds…', 'warming up the escrow…', 'locking the sniper door…', 'aligning one price…']

export function Preloader({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0)
  const [phase, setPhase] = useState<'load' | 'puff' | 'out'>('load')
  const [line, setLine] = useState(0)
  const on = useSound()
  useEffect(() => {
    const start = performance.now(); let raf = 0
    const dur = 1900
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      setP(Math.round((1 - Math.pow(1 - k, 2.2)) * 100))
      if (k < 1) raf = requestAnimationFrame(step); else setPhase('puff')
    }
    raf = requestAnimationFrame(step)
    const li = setInterval(() => setLine((l) => (l + 1) % LINES.length), 520)
    return () => { cancelAnimationFrame(raf); clearInterval(li) }
  }, [])
  useEffect(() => {
    if (phase === 'puff') { sfx.poof(); const t = setTimeout(() => setPhase('out'), 650); return () => clearTimeout(t) }
    if (phase === 'out') { const t = setTimeout(onDone, 700); return () => clearTimeout(t) }
  }, [phase, onDone])
  return (
    <AnimatePresence>
      <motion.div key="pre" className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden" style={{ contain: 'paint', background: 'radial-gradient(120% 90% at 50% 40%, #2A1650 0%, #160C2A 45%, #0E0818 100%)' }}
        initial={{ clipPath: 'circle(150% at 50% 50%)' }} animate={phase === 'out' ? { clipPath: 'circle(0% at 50% 46%)' } : { clipPath: 'circle(150% at 50% 50%)' }} transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1] }}>
        {/* rays */}
        <motion.div className="pointer-events-none absolute left-1/2 top-[46%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 anim-spin-slow opacity-40"
          style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,95,184,.14) 0 6deg, transparent 6deg 18deg, rgba(95,212,255,.12) 18deg 24deg, transparent 24deg 36deg)', maskImage: 'radial-gradient(circle, #000 0, transparent 55%)', WebkitMaskImage: 'radial-gradient(circle, #000 0, transparent 55%)' }}
          animate={{ opacity: phase === 'puff' ? 0.9 : 0.35, scale: phase === 'puff' ? 1.2 : 1 }} />
        <div className="relative flex flex-col items-center">
          <div className="relative h-48 w-48 md:h-60 md:w-60">
            <motion.img src={phase === 'load' ? './mochi/countdown.webp' : './mochi/puffed.webp'} alt="" className="absolute inset-0 h-full w-full object-contain"
              animate={phase === 'puff' ? { scale: [0.86, 1.22, 1.12], rotate: [0, -4, 0] } : { y: [0, -14, 0], scaleX: [1, 0.96, 1.06, 1], scaleY: [1, 1.05, 0.93, 1] }}
              transition={phase === 'puff' ? { duration: 0.5, ease: 'easeOut' } : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
            {phase === 'puff' && Array.from({ length: 10 }).map((_, i) => (
              <motion.span key={i} className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full" style={{ background: i % 2 ? '#FF5FB8' : '#5FD4FF', boxShadow: '0 0 12px currentColor' }}
                initial={{ x: 0, y: 0, scale: 0 }} animate={{ x: Math.cos((i / 10) * 6.28) * 150, y: Math.sin((i / 10) * 6.28) * 150, scale: [0, 1.4, 0] }} transition={{ duration: 0.6, ease: 'easeOut' }} />
            ))}
          </div>
          <img src="./logo/floof-wordmark-cream.svg" alt="floof.fun" className="mt-2 h-14 md:h-16" />
          <div className="mt-6 h-2 w-56 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
            <div className="h-full rounded-full" style={{ width: `${p}%`, background: 'linear-gradient(90deg,#5FD4FF,#B69CFF,#FF5FB8)', boxShadow: '0 0 16px rgba(255,95,184,.8)' }} />
          </div>
          <div className="mt-3 flex w-56 justify-between font-num text-xs font-semibold text-lav tnum">
            <span>{phase === 'load' ? LINES[line] : 'POOF!'}</span><span>{p}%</span>
          </div>
          <button onClick={() => sound.toggle()} className="mt-8 rounded-full border border-lav/25 px-4 py-1.5 text-xs font-extrabold text-lav/90 hover:text-cream">♪ sound {on ? 'on' : 'off'} · tap to toggle</button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
