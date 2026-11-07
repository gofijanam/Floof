import { motion, useMotionValue, useSpring, useReducedMotion, AnimatePresence } from 'framer-motion'
import { ReactNode, useEffect, useRef, useState, PointerEvent as RPE } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../lib/audio'
import type { Coin, Grade } from '../lib/mock'
import { maxRaise } from '../lib/mock'
import { mmss } from '../lib/format'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/** Magnetic wrapper: pulls toward the pointer, springs back. Desktop pointers only. */
export function Magnetic({ children, strength = 0.35, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 })
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 })
  const move = (e: RPE) => {
    if (reduced || e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength)
  }
  return (
    <motion.div ref={ref} className={cx('inline-block', className)} style={{ x, y }} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0) }} onPointerEnter={() => sfx.hover()} data-cursor="magnet">
      {children}
    </motion.div>
  )
}

export function Card({ children, className = '', neon, as: As = 'div', ...rest }: { children: ReactNode; className?: string; neon?: 'p' | 'b'; as?: any; [k: string]: any }) {
  return <As className={cx('glass rounded-3xl', neon === 'p' && 'neon-p', neon === 'b' && 'neon-b', className)} {...rest}>{children}</As>
}

export function LiveDot({ color = 'mint' }: { color?: 'mint' | 'pink' }) {
  return <span className={cx('inline-block h-2 w-2 rounded-full', color === 'mint' ? 'bg-mint anim-live' : 'bg-pink anim-livep')} />
}

const GRADE_C: Record<Grade, string> = { 'N/A': '#9B8EA9', 'A+': '#7CF5C8', A: '#5FD4FF', B: '#B69CFF', C: '#FFB86B', D: '#FF6B8B' }
export const gradeColor = (g: Grade) => GRADE_C[g]
export function GradeBadge({ g, size = 'sm' }: { g: Grade; size?: 'sm' | 'lg' }) {
  const c = GRADE_C[g]
  if (size === 'lg') return (
    <div className="relative grid h-24 w-24 place-items-center rounded-[28px] font-display text-5xl font-extrabold" style={{ color: c, background: `radial-gradient(circle at 30% 25%, ${c}33, transparent 70%), rgba(14,8,24,.6)`, boxShadow: `0 0 0 1.5px ${c}66, 0 0 40px -6px ${c}88` }}>{g}</div>
  )
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tnum" style={{ color: c, background: `${c}1a`, boxShadow: `inset 0 0 0 1px ${c}44` }} title="TRUTH heuristic from recorded activity; N/A means insufficient evidence">TRUTH {g}</span>
}

export function RepRing({ v, size = 44, stroke = 4 }: { v: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r
  const col = v >= 85 ? '#7CF5C8' : v >= 70 ? '#5FD4FF' : v >= 55 ? '#B69CFF' : '#FFB86B'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Reputation ${v}/100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(182,156,255,.15)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} whileInView={{ strokeDashoffset: C * (1 - v / 100) }} viewport={{ once: true }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} style={{ filter: `drop-shadow(0 0 4px ${col}88)` }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-num font-semibold tnum" style={{ fontSize: Math.max(12, size * 0.3), color: col }}>{v}</span>
    </div>
  )
}

/** Fredoka tabular flip digits for countdowns */
export function Countdown({ ms, size = 'md', urgent }: { ms: number; size?: 'sm' | 'md' | 'lg' | 'xl'; urgent?: boolean }) {
  const s = mmss(ms)
  const cls = { sm: 'text-sm', md: 'text-2xl', lg: 'text-5xl', xl: 'text-7xl md:text-8xl' }[size]
  const u = urgent ?? ms < 10_000
  return (
    <span className={cx('font-num font-semibold tnum inline-flex', cls, u ? 'text-pink' : 'text-blue')} style={{ textShadow: u ? '0 0 24px rgba(255,95,184,.6)' : '0 0 24px rgba(95,212,255,.45)' }} aria-label={`${s} remaining`}>
      {s.split('').map((ch, i) => (
        <span key={i} className="relative inline-block overflow-hidden" style={{ width: ch === ':' ? '0.38em' : '0.62em', textAlign: 'center' }}>
          <span className={ch === ':' ? 'inline-block anim-colon' : 'inline-block'}>{ch}</span>
        </span>
      ))}
    </span>
  )
}

export function MiniMeter({ coin }: { coin: Coin }) {
  const cap = maxRaise(coin)
  const pct = Math.min(1, coin.pledged / cap)
  const over = coin.pledged / cap
  const minPct = coin.minTarget / cap
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-night/80 ring-1 ring-lav/15">
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: 'linear-gradient(90deg,#5FD4FF,#B69CFF,#FF5FB8)' }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
        <div className="absolute inset-y-0 w-px bg-cream/60" style={{ left: `${minPct * 100}%` }} title="Min target" />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-bold text-lav/80 tnum">
        <span>{coin.pledged.toFixed(1)} / {cap.toFixed(0)} SOL</span>
        <span className={over > 1 ? 'text-pink' : coin.pledged < coin.minTarget ? 'text-peach' : 'text-mint'}>{over > 1 ? `${over.toFixed(2)}× oversub` : coin.pledged < coin.minTarget ? 'below min' : `${(pct * 100).toFixed(0)}%`}</span>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items, id, size = 'md', className = '' }: { value: T; onChange: (v: T) => void; items: { v: T; label: ReactNode; count?: number }[]; id: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-full bg-night/60 p-1 ring-1 ring-lav/15', className)} role="tablist">
      {items.map((it) => (
        <button key={it.v} role="tab" aria-selected={value === it.v} onClick={() => { onChange(it.v); sfx.tick() }}
          className={cx('relative rounded-full font-extrabold transition-colors', size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm', value === it.v ? 'text-night' : 'text-lav hover:text-cream')}>
          {value === it.v && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg,#FFF4FB,#E9DEFF)' }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative z-10 whitespace-nowrap">{it.label}{it.count != null && <span className={cx('ml-1.5 tnum', value === it.v ? 'text-plum/60' : 'text-lav/60')}>{it.count}</span>}</span>
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: 'pink' | 'blue' | 'mint' }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={cx('mt-1 font-num text-xl font-semibold tnum', accent === 'pink' && 'text-pink', accent === 'blue' && 'text-blue', accent === 'mint' && 'text-mint')}>{value}</div>
      {sub && <div className="text-xs font-bold text-lav/70 tnum">{sub}</div>}
    </div>
  )
}

/** Count-up number that springs to new values */
export function Num({ v, d = 0, prefix = '', suffix = '' }: { v: number; d?: number; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(v)
  const from = useRef(v)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = v
    let raf = 0
    const step = (t: number) => { const k = Math.min(1, (t - start) / 700); const e = 1 - Math.pow(1 - k, 3); setShown(a + (b - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = b }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [v])
  return <span className="tnum">{prefix}{shown.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}{suffix}</span>
}

export function Sparkline({ data, w = 120, h = 36, color = '#5FD4FF' }: { data: number[]; w?: number; h?: number; color?: string }) {
  const min = Math.min(...data), max = Math.max(...data)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)])
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  return <svg width={w} height={h} className="overflow-visible"><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} /></svg>
}

export function SectionTitle({ kicker, title, sub, className = '' }: { kicker?: string; title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {kicker && <div className="mb-2 font-num text-xs font-semibold uppercase tracking-[.3em] text-blue">{kicker}</div>}
      <h2 className="h-display text-4xl md:text-6xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-base font-semibold text-lav md:text-lg">{sub}</p>}
    </div>
  )
}

export function CreatorChip({ handle, rep, hue }: { handle: string; rep: number; hue: number }) {
  return (
    <Link to={`/creator/${handle}`} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-lav hover:text-cream">
      <span className="h-3 w-3 rounded-full" style={{ background: `hsl(${hue} 90% 70%)` }} />@{handle}
      <span className="rounded-full bg-mint/10 px-1.5 text-[10px] text-mint tnum">rep {rep}</span>
    </Link>
  )
}

/** Decorative mascot peeking into page headers (desktop only). */
export function PeekMochi({ src = 'idle', className = '' }: { src?: 'idle' | 'countdown' | 'puffed' | 'happy' | 'sleepy'; className?: string }) {
  return (
    <motion.img src={`./mochi/${src}-512.webp`} alt="" aria-hidden initial={{ y: 40, opacity: 0, rotate: 8 }} animate={{ y: 0, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 140, damping: 14, delay: 0.15 }}
      className={cx('pointer-events-none absolute right-[22%] top-14 hidden w-32 drop-shadow-[0_20px_40px_rgba(95,212,255,.35)] md:block xl:w-36', className)} />
  )
}
