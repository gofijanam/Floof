import { motion, useReducedMotion, type MotionValue } from 'framer-motion'
import { useMemo, useState } from 'react'
import { mmss } from '../lib/format'

/**
 * Hero stage: one crisp Mochi inside a ring that fills as the fair window runs.
 * Transform/opacity animations only (the ring progress steps once per second), low-density drifting motes,
 * no confetti. With prefers-reduced-motion everything is static except the once-a-second ring/timer update.
 */
export function HeroWindow({ start, end, now, live, px, py }: { start?: number; end?: number; now: number; live: boolean; px?: MotionValue<number>; py?: MotionValue<number> }) {
  const reduced = !!useReducedMotion()
  // Without a live window, loop a 60 s demo window so the ring still tells the story.
  const [t0] = useState(() => Date.now())
  const demoLen = 60_000
  const elapsedDemo = (now - t0) % demoLen
  const fill = live && start && end && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : elapsedDemo / demoLen
  const left = live && end ? Math.max(0, end - now) : demoLen - elapsedDemo
  const closing = left < 10_000
  const settled = !live && left > demoLen - 2_600 && now - t0 > demoLen // brief "one price" beat right after each demo window closes

  const R = 188, C = 2 * Math.PI * R
  const motes = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4, d = 0.36 + ((i * 37) % 23) / 100
    return { x: 50 + Math.cos(a) * d * 100, y: 50 + Math.sin(a) * d * 92, s: 2 + (i % 3), dur: 11 + (i % 5) * 2.2, delay: -(i * 1.7), c: ['#B69CFF', '#5FD4FF', '#FF8CCB'][i % 3] }
  }), [])

  return (
    <div className="hero-window absolute inset-0 grid place-items-center" aria-hidden>
      {/* soft glow */}
      <div className="hw-glow absolute left-1/2 top-1/2 aspect-square w-[78%] max-w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      {/* slow parallax motes */}
      <motion.div className="absolute inset-0" style={reduced ? undefined : { x: px, y: py }}>
        {motes.map((m, i) => (
          <span key={i} className={reduced ? 'absolute rounded-full' : 'hw-mote absolute rounded-full'}
            style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s, background: m.c, boxShadow: `0 0 ${m.s * 4}px ${m.c}`, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s`, opacity: 0.5 }} />
        ))}
      </motion.div>
      {/* ring */}
      <div className="relative aspect-square w-[min(84%,520px)]">
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="hw-arc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5FD4FF" /><stop offset=".55" stopColor="#B69CFF" /><stop offset="1" stopColor="#FF5FB8" /></linearGradient>
          </defs>
          <circle cx="200" cy="200" r={R} fill="none" stroke="rgba(182,156,255,.12)" strokeWidth="1.5" />
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1="200" y1={200 - R + 9} x2="200" y2={200 - R + (i % 5 ? 13 : 17)} stroke="rgba(182,156,255,.22)" strokeWidth={i % 5 ? 1 : 1.5} strokeLinecap="round" transform={`rotate(${i * 6} 200 200)`} />
          ))}
          <g transform="rotate(-90 200 200)">
            <circle cx="200" cy="200" r={R} fill="none" stroke="url(#hw-arc)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill)}
              style={{ transition: reduced || fill < 0.02 ? 'none' : 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 6px rgba(182,156,255,.55))' }} />
          </g>
          {/* leading point of the arc */}
          <g style={{ transform: `rotate(${fill * 360}deg)`, transformOrigin: '200px 200px', transition: reduced || fill < 0.02 ? 'none' : 'transform 1s linear' }}>
            <circle cx="200" cy={200 - R} r="5" fill="#FFF4FB" style={{ filter: 'drop-shadow(0 0 8px #FF5FB8)' }} />
          </g>
        </svg>
        {/* slow sheen orbiting the track */}
        {!reduced && <div className="hw-sheen absolute inset-0 rounded-full" />}
        {/* mascot */}
        <div className="absolute left-1/2 top-[44%] w-[70%] -translate-x-1/2 -translate-y-1/2">
          <div className={reduced ? '' : 'hw-float'}>
            <motion.img src={settled ? './mochi/happy.webp' : './mochi/idle.webp'} alt="" draggable={false} className={reduced ? 'w-full select-none' : 'hw-breathe w-full select-none'}
              animate={{ scale: settled ? 1.04 : 1 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }} style={{ filter: 'drop-shadow(0 24px 40px rgba(14,8,24,.55))' }} />
          </div>
          <div className={reduced ? 'mx-auto -mt-2 h-3 w-1/2 rounded-full bg-night/60 blur-md' : 'hw-shadow mx-auto -mt-2 h-3 w-1/2 rounded-full bg-night/60 blur-md'} />
        </div>
        {/* timer */}
        <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-[.28em] text-lav/70">{settled ? 'settled · one price' : live ? 'fair window' : 'fair window · demo'}</div>
          <div className={`mt-0.5 font-num text-[30px] font-semibold leading-none tnum md:text-[34px] ${closing ? 'text-pink' : 'text-cream'}`}>{settled ? '00:00' : mmss(left)}</div>
          <div className="mt-1 font-num text-[11px] font-bold tnum text-lav/60">{Math.round(fill * 100)}% of window elapsed</div>
        </div>
      </div>
    </div>
  )
}
