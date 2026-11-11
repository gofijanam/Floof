import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MochiHandle } from '../components/Mochi3D'
import { Magnetic, Countdown, MiniMeter, LiveDot, Num, Sparkline, SectionTitle, cx } from '../components/ui'
import { CoinCard } from '../components/CoinCard'
import { CoinAvatar } from '../components/CoinAvatar'
import { useCoin, useStore } from '../lib/store'
import { sfx } from '../lib/audio'
import { fmtPrice, mmss } from '../lib/format'
import { maxRaise, FEES } from '../lib/mock'
import { IArrow, IShield, IGhost, ICheck, IX, ISparkle, ILock, IUsers } from '../components/icons'
import { confetti } from '../components/confetti'

const Mochi3D = lazy(() => import('../components/Mochi3D').then((m) => ({ default: m.Mochi3D })))

export default function Landing({ ready }: { ready: boolean }) {
  return (
    <div className="overflow-x-clip">
      <Hero ready={ready} />
      <Marquee />
      <Story />
      <LiveStats />
      <LiveWindows />
      <Compare />
      <Finale />
    </div>
  )
}

/* ------------------------------------------------------------------ HERO */
function Hero({ ready }: { ready: boolean }) {
  const floof = useStore(s => s.coins.find(c=>c.id==='floof') || s.coins.find(c=>c.status==='open') || s.coins[0])
  const active = floof?.status === 'open'
  const featuredPath = floof ? (['open','upcoming','refunding'].includes(floof.status) ? `/coin/${floof.id}` : `/trade/${floof.id}`) : '/explore'
  const now = useStore((s) => s.now)
  const feed = useStore((s) => s.feed)
  const blocked = useStore((s) => s.stats.snipersBlocked)
  const mochi = useRef<MochiHandle>(null)
  const reduced = useReducedMotion()
  // parallax for HUD widgets
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 60, damping: 20 }), sy = useSpring(my, { stiffness: 60, damping: 20 })
  const p1x = useTransform(sx, (v) => v * -18), p1y = useTransform(sy, (v) => v * -12)
  const p2x = useTransform(sx, (v) => v * 26), p2y = useTransform(sy, (v) => v * 18)
  useEffect(() => {
    const f = (e: PointerEvent) => { mx.set(e.clientX / innerWidth - 0.5); my.set(e.clientY / innerHeight - 0.5) }
    addEventListener('pointermove', f, { passive: true }); return () => removeEventListener('pointermove', f)
  }, [mx, my])
  // demo countdown → POOF loop above the mochi's head
  const [demo, setDemo] = useState(10)
  const [poofed, setPoofed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ready) return
    const t = setInterval(() => setDemo((d) => (d <= 0 ? 0 : d - 1)), 1000)
    return () => clearInterval(t)
  }, [ready])
  useEffect(() => {
    if (demo !== 0 || poofed) return
    setPoofed(true); mochi.current?.puff(); sfx.poof()
    const r = stage.current?.getBoundingClientRect()
    if (r && !reduced) setTimeout(() => confetti({ x: r.left + r.width / 2, y: r.top + r.height * 0.45, n: 70, power: 0.8 }), 180)
    const t = setTimeout(() => { setPoofed(false); setDemo(10) }, 3200)
    return () => clearTimeout(t)
  }, [demo, poofed, reduced])
  const cap = floof ? maxRaise(floof) : 0
  const recent = feed.filter((f) => f.coin === floof?.id && f.kind === 'pledge').slice(0, 1)[0]
  const spark = useMemo(() => Array.from({ length: 24 }, (_, i) => 20 + i * 2 + Math.sin(i * 1.3) * 6), [])
  const left = floof ? floof.windowEnd - now : 0
  const H = { initial: { opacity: 0, y: 30 }, animate: ready ? { opacity: 1, y: 0 } : {}, }
  return (
    <section className="relative min-h-[100svh] pt-24 md:pt-20">
      <div className="hero-grid mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-x-2 px-4 md:px-6 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* copy */}
        <div className="relative z-20 pt-4 lg:pt-0 [grid-area:top] lg:self-end">
          <motion.div {...H} transition={{ delay: 0.05, duration: 0.6 }}>
            <Link to={featuredPath} className="inline-flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 py-1 pl-2 pr-3 text-xs font-extrabold text-mint">
              <LiveDot /> {active ? `$${floof.ticker} fair window is live` : 'Explore fair launches'} {active && <span className="font-num tnum">· {mmss(left)}</span>} <IArrow s={13} />
            </Link>
          </motion.div>
          <h1 className="h-display mt-5 text-[15vw] leading-[.9] sm:text-7xl lg:text-[5.6rem] xl:text-[6.4rem]">
            {['Everyone', 'buys at'].map((w, i) => (
              <motion.span key={w} className="block" initial={{ opacity: 0, y: 60, rotate: 4 }} animate={ready ? { opacity: 1, y: 0, rotate: 0 } : {}} transition={{ delay: 0.12 + i * 0.08, type: 'spring', stiffness: 120, damping: 16 }}>{w}</motion.span>
            ))}
            <motion.span className="relative inline-block text-candy" initial={{ opacity: 0, scale: 0.6 }} animate={ready ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.32, type: 'spring', stiffness: 200, damping: 11 }}>
              zero.
              <svg className="absolute -bottom-3 left-0 w-full" viewBox="0 0 300 20" preserveAspectRatio="none"><motion.path d="M4 14 Q 75 2 150 12 T 296 8" stroke="#FF5FB8" strokeWidth="5" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={ready ? { pathLength: 1 } : {}} transition={{ delay: 0.7, duration: 0.8 }} /></svg>
            </motion.span>
          </h1>
        </div>
        <div className="relative z-20 [grid-area:bottom] lg:self-start">
          <motion.p {...H} transition={{ delay: 0.45, duration: 0.6 }} className="mt-2 max-w-md text-lg font-semibold text-lav md:text-xl lg:mt-6">
            A short fair window (5–60 min). Everyone pledges into one cloud, then <span className="text-cream">all buy together at one price, in one block.</span> Snipers get poof’d.
          </motion.p>
          <motion.div {...H} transition={{ delay: 0.55, duration: 0.6 }} className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic><Link to={featuredPath} className="btn-candy sheen px-7 py-4 text-base">{active ? `Join the $${floof.ticker} window` : 'Explore launches'} <IArrow s={18} /></Link></Magnetic>
            <Magnetic strength={0.2}><Link to="/create" className="btn-ghost px-6 py-4 text-base">Launch a coin</Link></Magnetic>
          </motion.div>
          <motion.div {...H} transition={{ delay: 0.65, duration: 0.6 }} className="mt-8 hidden gap-6 text-sm font-bold text-lav sm:flex">
            <span className="flex items-center gap-1.5"><IShield s={16} className="text-mint" /> no snipers</span>
            <span className="flex items-center gap-1.5"><IUsers s={16} className="text-blue" /> 1% wallet cap</span>
            <span className="flex items-center gap-1.5"><ILock s={16} className="text-pink" /> dev-buy lock</span>
          </motion.div>
        </div>

        {/* 3D stage + HUD */}
        <div ref={stage} className="relative h-[min(100vw,440px)] [grid-area:stage] lg:h-[min(86svh,760px)]">
          <div className="absolute inset-[-10%] rounded-full opacity-70 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 55%, rgba(95,212,255,.28), rgba(182,156,255,.12) 40%, transparent 65%)' }} />
          <Suspense fallback={<img src="./mochi/idle.webp" alt="" className="absolute left-1/2 top-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2" />}>
            <Mochi3D ref={mochi} className="absolute inset-0" />
          </Suspense>
          {/* countdown chip above head */}
          <div className="pointer-events-none absolute left-[22%] top-[8%] z-20 -translate-x-1/2 lg:left-1/2 lg:top-[19%]">
            <AnimatePresence mode="wait">
              {!poofed ? (
                <motion.div key="cd" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }} className={cx('rounded-full border-2 bg-night/80 px-3 py-0.5 font-num text-lg font-semibold tnum', demo <= 3 ? 'border-pink text-pink anim-shiver' : 'border-pink/60 text-cream')}>
                  0:{String(demo).padStart(2, '0')}
                </motion.div>
              ) : (
                <motion.div key="poof" initial={{ scale: 0.2, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                  className="h-display text-6xl text-cream md:text-7xl" style={{ WebkitTextStroke: '3px #FF5FB8', textShadow: '0 6px 0 #B69CFF, 0 0 40px rgba(255,95,184,.8)' }}>POOF!</motion.div>
              )}
            </AnimatePresence>
          </div>
          {poofed && !reduced && <Rays />}
          {/* HUD widgets */}
          <motion.div style={{ x: p1x, y: p1y }} className="absolute left-0 top-[4%] z-10 hidden w-[46%] max-w-[230px] md:block lg:left-[0%] lg:top-[10%]">
            <div className="glass neon-b anim-floaty rounded-2xl p-3 md:p-4">
              <div className="flex items-center justify-between"><span className="label">{active ? `$${floof.ticker} closes` : floof ? `$${floof.ticker} window` : 'Fair launch windows'}</span><LiveDot /></div>
              {active ? <Countdown ms={left} size="md" /> : <div className="font-num text-xl">{floof ? 'Settled' : 'No active window'}</div>}
              <div className="mt-2">{floof && <MiniMeter coin={floof} />}</div>
            </div>
          </motion.div>
          <motion.div style={{ x: p2x, y: p2y }} className="absolute right-0 top-[2%] z-10 w-[44%] max-w-[220px] lg:top-[8%]">
            <div className="glass neon-p anim-floaty2 rounded-2xl p-3 md:p-4">
              <div className="label">escrow cloud</div>
              <div className="font-num text-2xl font-semibold text-pink tnum md:text-3xl"><Num v={floof?.pledged || 0} d={1} /> <span className="text-sm text-lav">SOL</span></div>
              <div className="mt-1 hidden md:block"><Sparkline data={spark} w={180} h={30} color="#FF5FB8" /></div>
              <div className="text-[11px] font-bold text-lav tnum">{floof?.pledgers || 0} floofs · cap {cap.toFixed(0)}</div>
            </div>
          </motion.div>
          <motion.div style={{ x: p2x, y: p1y }} className="absolute bottom-[6%] left-0 z-10 hidden w-[200px] md:block lg:bottom-[14%]">
            <div className="glass anim-floaty2 rounded-2xl p-4" style={{ animationDelay: '-2s' }}>
              <div className="label">one price for all</div>
              <div className="font-num text-2xl font-semibold text-blue tnum">≤ {fmtPrice(floof?.priceCeiling || 0)}</div>
              <div className="text-[11px] font-bold text-lav">SOL / token · price ceiling</div>
            </div>
          </motion.div>
          <motion.div style={{ x: p1x, y: p2y }} className="absolute bottom-[4%] right-0 z-10 w-[48%] max-w-[230px] lg:bottom-[12%]">
            <div className="glass anim-floaty rounded-2xl p-3 md:p-4" style={{ animationDelay: '-1s' }}>
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-peach/15 text-peach"><IGhost s={18} /></span><span className="label">snipers poof’d</span></div>
              <div className="mt-1 font-num text-2xl font-semibold tnum"><Num v={blocked} /></div>
            </div>
          </motion.div>
          {recent && (
            <div className="absolute bottom-[-2%] left-1/2 z-10 hidden -translate-x-1/2 lg:block">
              <AnimatePresence mode="popLayout">
                <motion.div key={recent.id} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} className="glass flex items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4 text-xs font-bold">
                  <CoinAvatar hue={205} accessory="halo" size={26} /> <span className="text-cream">@{recent.wallet}</span> <span className="text-lav">pledged</span> <span className="font-num text-pink tnum">{recent.amount} SOL</span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      <motion.div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.3em] text-lav/60 lg:flex" animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
        scroll the story <span className="h-8 w-[2px] rounded-full bg-gradient-to-b from-pink to-transparent" />
      </motion.div>
    </section>
  )
}

function Rays() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 0], scale: [0.6, 1.3, 1.5] }} transition={{ duration: 1.4 }} className="pointer-events-none absolute left-1/2 top-[48%] h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2"
      style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,95,184,.35) 0 5deg, transparent 5deg 20deg, rgba(95,212,255,.3) 20deg 25deg, transparent 25deg 40deg)', maskImage: 'radial-gradient(circle, #000 15%, transparent 60%)', WebkitMaskImage: 'radial-gradient(circle, #000 15%, transparent 60%)' }} />
  )
}

/* ------------------------------------------------------------------ MARQUEE */
function Marquee() {
  const coins = useStore((s) => s.coins)
  const items = [...coins, ...coins]
  return (
    <div className="relative z-10 -rotate-1 border-y border-lav/10 bg-plum/60 py-3 backdrop-blur" data-cursor="native">
      <div className="flex w-max gap-8 anim-marquee hover:[animation-play-state:paused]">
        {items.map((c, i) => (
          <Link key={i} to={c.status === 'open' || c.status === 'upcoming' ? `/coin/${c.id}` : `/trade/${c.id}`} className="flex items-center gap-2 whitespace-nowrap text-sm font-extrabold">
            <CoinAvatar hue={c.hue} accessory={c.accessory} size={28} />
            <span>${c.ticker}</span>
            {c.status === 'open' ? <span className="text-mint">LIVE window</span> : c.status === 'upcoming' ? <span className="text-blue">soon</span> : <span className={c.change24h >= 0 ? 'text-mint tnum' : 'text-danger tnum'}>{c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(1)}%</span>}
            <span className="text-lav/30">✦</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ SCROLL STORY (pinned) */
const BEATS = [
  { k: '01', t: 'Floofs gather.', d: 'A 5–60 minute fair window opens the moment a coin is created. Everyone pledges SOL into one escrow cloud — max 1% per wallet, anti-sybil checks on every pledge.' },
  { k: '02', t: 'One cloud. One price.', d: 'No one buys early. At zero, the cloud settles: hit the min target or everyone is auto-refunded. Oversubscribed? Everyone fills pro-rata.' },
  { k: '03', t: 'POOF! A coin is born.', d: 'Every pledger buys together, at one price, in one block. Snipers and bundlers are locked outside. Then trading opens on a Raydium LaunchLab curve → graduates to CPMM.' },
]
function Story() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [p, setP] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setP(v))
  const beat = p < 0.36 ? 0 : p < 0.68 ? 1 : 2
  const prog = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  const lastBeat = useRef(0)
  useEffect(() => { if (beat !== lastBeat.current) { beat === 2 ? sfx.poof() : sfx.whoosh(); lastBeat.current = beat } }, [beat])
  return (
    <section ref={ref} className="relative h-[340vh]" aria-label="How a fair launch works">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-4 px-4 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="relative z-10 order-2 lg:order-1">
            <div className="mb-6 flex gap-2">
              {BEATS.map((b, i) => (
                <div key={b.k} className="h-1.5 flex-1 overflow-hidden rounded-full bg-lav/15">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-blue to-pink" style={{ scaleX: useTransform(prog, [i / 3, (i + 1) / 3], [0, 1]), transformOrigin: 'left' }} />
                </div>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={beat} initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }} transition={{ duration: 0.4 }}>
                <div className="font-num text-sm font-semibold tracking-[.3em] text-blue">BEAT {BEATS[beat].k}</div>
                <h2 className={cx('h-display mt-2 text-5xl md:text-7xl', beat === 2 && 'text-candy')}>{BEATS[beat].t}</h2>
                <p className="mt-4 max-w-md text-base font-semibold text-lav md:text-lg">{BEATS[beat].d}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="order-1 lg:order-2"><StoryScene p={p} /></div>
        </div>
      </div>
    </section>
  )
}

function StoryScene({ p }: { p: number }) {
  const floofs = useMemo(() => Array.from({ length: 34 }, (_, i) => {
    const a = (i / 34) * Math.PI * 2 + (i % 3) * 0.4, r = 290 + (i % 5) * 26
    return { sx: 400 + Math.cos(a) * r * 1.25, sy: 250 + Math.sin(a) * r * 0.72, ex: 400 + Math.cos(a * 3) * (40 + (i % 6) * 18), ey: 262 + Math.sin(a * 3) * (24 + (i % 4) * 12), hue: [205, 330, 275, 180, 50][i % 5], d: (i % 7) * 0.02 }
  }), [])
  const e = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3))
  const g = e((p - 0.02) / 0.3) // gather
  const merge = e((p - 0.36) / 0.26) // one cloud
  const boom = e((p - 0.68) / 0.12) // poof
  const ms = Math.max(0, (1 - Math.min(1, p / 0.66)) * 600000)
  return (
    <div className="relative mx-auto aspect-[8/5] w-full max-w-[820px]">
      <svg viewBox="0 0 800 500" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="sc-cloud" cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#E6FBFF" /><stop offset=".5" stopColor="#B69CFF" /><stop offset="1" stopColor="#FF5FB8" /></radialGradient>
          <radialGradient id="sc-glow"><stop offset="0" stopColor="#FF5FB8" stopOpacity=".55" /><stop offset="1" stopColor="#FF5FB8" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="400" cy="260" r={180 + boom * 120} fill="url(#sc-glow)" opacity={0.3 + merge * 0.5} />
        {/* shield ring in beat 3 */}
        <circle cx="400" cy="260" r="200" fill="none" stroke="#7CF5C8" strokeWidth="3" strokeDasharray="8 10" opacity={boom} className="anim-dash" />
        {/* escrow cloud grows */}
        <g transform={`translate(400 262) scale(${(0.35 + merge * 0.75) * (1 - boom * 0.9)})`} opacity={g * (1 - boom)}>
          {[[-90, 10, 80], [-20, -40, 100], [70, -20, 85], [120, 30, 60], [10, 40, 105], [-140, 40, 50]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="url(#sc-cloud)" opacity=".92" />)}
        </g>
        {/* floofs */}
        {floofs.map((f, i) => {
          const k = e((g - f.d) / (1 - f.d))
          const x = f.sx + (f.ex - f.sx) * k, y = f.sy + (f.ey - f.sy) * k
          const s = (1 - merge * 0.85) * (1 - boom)
          return (
            <g key={i} transform={`translate(${x} ${y}) scale(${0.55 * s + 0.0001})`} opacity={1 - merge * 0.6}>
              <ellipse cx="-14" cy="-20" rx="8" ry="7" fill={`hsl(${f.hue} 95% 78%)`} /><ellipse cx="14" cy="-20" rx="8" ry="7" fill={`hsl(${f.hue} 95% 78%)`} />
              <ellipse rx="30" ry="24" fill={`hsl(${f.hue} 95% 76%)`} /><ellipse cx="-8" cy="-2" rx="3.5" ry="4.5" fill="#1B0E2C" /><ellipse cx="8" cy="-2" rx="3.5" ry="4.5" fill="#1B0E2C" />
            </g>
          )
        })}
        {/* snipers bouncing off the shield */}
        {[[90, 90], [710, 110], [70, 420], [730, 410], [400, 30]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x + (400 - x) * 0.18 * Math.sin(p * 40 + i) * boom} ${y + (260 - y) * 0.18 * Math.sin(p * 40 + i) * boom})`} opacity={boom}>
            <path d="M-16 18 V-2 a16 16 0 0 1 32 0 V18 l-5.5 -4 -5 4 -5 -4 -5 4 -5.5 -4z" fill="#FF6B8B" opacity=".9" />
            <circle cx="-6" cy="-2" r="2.6" fill="#0E0818" /><circle cx="6" cy="-2" r="2.6" fill="#0E0818" />
            <text y="40" textAnchor="middle" className="fill-danger font-num text-[12px] font-semibold">sniper</text>
          </g>
        ))}
      </svg>
      {/* timer + price HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div className={cx('glass rounded-2xl px-5 py-2 text-center transition-opacity', boom > 0.1 ? 'opacity-0' : 'opacity-100')}>
          <div className="label">fair window</div>
          <Countdown ms={ms} size="lg" urgent={ms < 60000} />
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-[4%] left-1/2 -translate-x-1/2" style={{ opacity: merge * (1 - boom), transform: `translate(-50%, ${(1 - merge) * 20}px)` }}>
        <div className="glass neon-p rounded-full px-5 py-2 text-center font-extrabold"><span className="text-lav">one price for everyone</span> <span className="font-num text-pink tnum">0.0₆400 SOL</span></div>
      </div>
      {/* POOF coin born */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ opacity: boom }}>
        <div style={{ transform: `scale(${0.5 + boom * 0.6}) rotate(${(1 - boom) * -20}deg)` }} className="relative">
          <img src="./mochi/puffed.webp" alt="POOF!" className="w-[380px] max-w-[64vw]" />
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-2" style={{ opacity: boom }}>
        <span className="chip text-mint"><ICheck s={14} /> 412 buyers · 1 block</span>
        <span className="chip text-danger"><IX s={14} /> 37 snipers locked out</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ LIVE STATS */
function LiveStats() {
  const s = useStore((x) => x.stats)
  const items = [
    { l: 'coins launched fairly', v: s.launched, d: 0, c: 'text-cream' },
    { l: 'snipers poof’d', v: s.snipersBlocked, d: 0, c: 'text-pink' },
    { l: 'SOL auto-refunded', v: s.refunded, d: 1, c: 'text-blue' },
    { l: 'SOL pledged · 24h', v: s.pledged24h, d: 1, c: 'text-mint' },
  ]
  return (
    <section className="relative mx-auto max-w-[1400px] px-4 py-20 md:px-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {items.map((it, i) => (
          <motion.div key={it.l} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: i * 0.08 }} className="glass hover-lift rounded-3xl p-5 md:p-7">
            <div className={cx('font-num text-3xl font-semibold md:text-5xl', it.c)}><Num v={it.v} d={it.d} /></div>
            <div className="mt-2 flex items-center gap-2 text-sm font-extrabold text-lav"><LiveDot /> {it.l}</div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function LiveWindows() {
  const coins = useStore((s) => s.coins)
  const open = coins.filter((c) => c.status === 'open').slice(0, 3)
  return (
    <section className="mx-auto max-w-[1400px] px-4 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle kicker="happening now" title={<>Windows <span className="text-ice">open</span> right now</>} sub="Pledge before zero. Everyone gets the same price — no matter how fast your bot is." />
        <Magnetic strength={0.2}><Link to="/explore" className="btn-ghost">Explore all <IArrow s={16} /></Link></Magnetic>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{open.map((c) => <CoinCard key={c.id} coin={c} />)}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ COMPARE */
const ROWS: [string, string, string, string][] = [
  ['Launch-block snipers & bundlers', 'Locked out — everyone buys in one block', 'Bots buy first', 'Whitelist games'],
  ['Price for early supporters', 'One price for all, capped by ceiling', 'Rises with every tx', 'Fixed, but gated'],
  ['If the launch underfills', 'Auto-refund, every lamport', 'You hold the bag', 'Manual refunds (maybe)'],
  ['Whale protection', '1% cap per wallet + anti-sybil', 'None', 'Tiers'],
  ['Creator accountability', 'Dev buy at the same price + on-chain lock', 'None', 'Off-chain promises'],
  ['Real vs fake buys', 'TRUTH grade on every coin', '—', '—'],
]
function Compare() {
  return (
    <section className="mx-auto mt-28 max-w-[1400px] px-4 md:px-6">
      <SectionTitle kicker="why floof" title={<>Fair isn’t a feature.<br /><span className="text-candy">It’s the launch.</span></>} />
      <div className="mt-4 overflow-x-auto pb-2 pt-12" data-cursor="native">
        <div className="grid min-w-[760px] grid-cols-[1.2fr_1.3fr_1fr_1fr] gap-2">
          <div />
          <div className="neon-p glass relative rounded-t-3xl p-5 text-center">
            <img src="./logo/floof-mark-mochi.svg" alt="" className="mx-auto -mt-12 h-16 w-16 anim-floaty" />
            <div className="mt-1 font-display text-2xl font-extrabold">floof.fun</div>
          </div>
          <div className="rounded-t-3xl p-5 text-center font-extrabold text-lav">Typical bonding-curve launchpad</div>
          <div className="rounded-t-3xl p-5 text-center font-extrabold text-lav">Classic presale</div>
          {ROWS.map(([k, a, b, c], i) => (
            <motion.div key={k} className="contents" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <div className="flex items-center rounded-2xl bg-plum/40 px-4 py-4 text-sm font-extrabold">{k}</div>
              <div className="flex items-center gap-2 bg-pink/10 px-4 py-4 text-sm font-extrabold text-cream ring-1 ring-pink/25"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint text-night"><ICheck s={14} /></span>{a}</div>
              <div className="flex items-center gap-2 rounded-2xl bg-plum/30 px-4 py-4 text-sm font-bold text-lav/80"><IX s={14} className="shrink-0 text-danger" />{b}</div>
              <div className="flex items-center gap-2 rounded-2xl bg-plum/30 px-4 py-4 text-sm font-bold text-lav/80"><IX s={14} className="shrink-0 text-peach" />{c}</div>
            </motion.div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs font-bold text-lav/60">Comparison describes general launch models, not specific products.</p>
    </section>
  )
}

function Finale() {
  return (
    <section className="relative mx-auto mt-28 max-w-[1400px] px-4 md:px-6">
      <div className="glass neon-p relative overflow-hidden rounded-[2.5rem] px-6 py-14 text-center md:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(60% 80% at 50% 110%, rgba(255,95,184,.35), transparent 70%), radial-gradient(40% 60% at 10% 0%, rgba(95,212,255,.25), transparent 70%)' }} />
        <motion.img src="./mochi/happy.webp" alt="" className="relative mx-auto w-48 md:w-60" whileHover={{ scale: 1.08, rotate: -4 }} whileTap={{ scale: 0.9 }} onTap={(e) => { sfx.poof(); const t = e.target as HTMLElement; const r = t.getBoundingClientRect(); confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, n: 60 }) }} animate={{ y: [0, -10, 0] }} transition={{ y: { repeat: Infinity, duration: 3 } }} />
        <h2 className="h-display relative mt-4 text-5xl md:text-8xl">Ready to <span className="text-candy">floof?</span></h2>
        <p className="relative mx-auto mt-4 max-w-lg text-lg font-semibold text-lav">Launch with a fair window, one clearing price and a TRUTH grade — or join one before zero.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Magnetic><Link to="/create" className="btn-candy sheen px-8 py-4 text-base"><ISparkle s={18} /> Launch a coin</Link></Magnetic>
          <Magnetic strength={0.2}><Link to="/explore" className="btn-ice px-8 py-4 text-base">Find a window</Link></Magnetic>
        </div>
        <div className="relative mt-8 text-xs font-extrabold text-lav/80">Trading fee {FEES.total}% → {FEES.raydium}% Raydium · {FEES.creator}% creator · {FEES.platform}% platform</div>
      </div>
    </section>
  )
}
