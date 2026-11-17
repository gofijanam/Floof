import { CSSProperties, ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { CoinAvatar } from './CoinAvatar'
import { Countdown, cx } from './ui'

/**
 * Scroll-choreographed fair-launch explainer. Everything is a pure function of `p` (0..1 scroll progress
 * through the pinned section) and is expressed with transform/opacity only, so it is GPU-composited and
 * scrubbing backwards plays the story in reverse. No timers, no loops, no confetti.
 *
 *  0.00–0.20  window opens      timer + escrow appear, floofs arrive at the edges
 *  0.20–0.40  pledges fill      each pledge flies into the single escrow, the vault fills
 *  0.40–0.60  one clearing price  window hits zero, vault locks, one price for every wallet
 *  0.60–0.80  coin on Raydium    LaunchLab curve draws, presale lands as the first buy
 *  0.80–1.00  POOF               Mochi appears with one soft shockwave, coin is live
 */
export const STORY_STEPS = [
  { t: 'The window opens', d: 'Creating a coin opens a 5–60 minute fair window. Nobody can buy yet: not the dev, not a bot, not you.' },
  { t: 'Pledges fill one escrow', d: 'Everyone pledges into a single on-chain escrow. Max 1% per wallet, with anti-sybil checks on every pledge.' },
  { t: 'One clearing price', d: 'At zero the window closes. Miss the minimum and everyone is refunded. Oversubscribed? Everyone fills pro-rata, at the same price.' },
  { t: 'Created on Raydium', d: 'The coin is created on a Raydium LaunchLab curve and the whole presale executes atomically as its very first buy.' },
  { t: 'POOF. It’s live.', d: 'Every pledger holds tokens bought at one price, in one block. Snipers never got a turn. Trading opens on the curve.' },
] as const

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const out = (x: number) => 1 - Math.pow(1 - x, 3) // easeOutCubic
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const pulse = (x: number) => Math.sin(Math.PI * clamp(x)) // 0 → 1 → 0

const WALLETS = [
  { n: 'mochi.sol', a: '0.80', hue: 330, x: 9, y: 22 },
  { n: '@kiwi', a: '0.25', hue: 180, x: 91, y: 20 },
  { n: 'dango.sol', a: '1.20', hue: 275, x: 6, y: 47 },
  { n: '@yuzu', a: '0.40', hue: 50, x: 94, y: 45 },
  { n: '@boba', a: '0.65', hue: 205, x: 10, y: 72 },
  { n: 'momo.sol', a: '0.90', hue: 300, x: 90, y: 70 },
]
const CX = 50, CY = 50 // stage centre in %

function Abs({ x, y, style, className, children }: { x: number; y: number; style?: CSSProperties; className?: string; children: ReactNode }) {
  // positioned by its centre; callers only add transform/opacity on top
  return <div className={cx('pointer-events-none absolute', className)} style={{ left: `${x}%`, top: `${y}%`, ...style }}>{children}</div>
}

export function StoryStage({ p }: { p: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 820)); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // ---- beat 1–3: timer, escrow, pledges
  const timerIn = out(seg(p, 0.0, 0.06)), timerOut = seg(p, 0.5, 0.56)
  const ms = Math.round(900_000 * (1 - inOut(seg(p, 0.03, 0.44))) / 1000) * 1000
  const closed = ms === 0
  const vaultIn = out(seg(p, 0.01, 0.08)), vaultOut = inOut(seg(p, 0.58, 0.66))
  const fill = inOut(seg(p, 0.22, 0.4))
  const lock = out(seg(p, 0.41, 0.46))
  const priceIn = out(seg(p, 0.42, 0.48)), priceOut = seg(p, 0.6, 0.65)
  // ---- beat 4: Raydium curve + first buy
  const curveIn = seg(p, 0.6, 0.65), draw = inOut(seg(p, 0.61, 0.7)), firstBuy = out(seg(p, 0.67, 0.74))
  const curveDim = seg(p, 0.8, 0.86)
  // ---- beat 5: POOF
  const poof = out(seg(p, 0.82, 0.9)), wave = seg(p, 0.82, 0.96), ticket = out(seg(p, 0.89, 0.96))
  const raised = (fill * 42).toFixed(1)
  // first-buy point sits exactly on the curve (cubic bézier at t = .45)
  const bz = (t: number, a: number, b: number, c: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
  const fx = bz(0.45, 110, 320, 510, 690), fy = bz(0.45, 412, 392, 300, 120)

  return (
    <div ref={box} className="relative mx-auto aspect-[8/5] w-full max-w-[820px] select-none" aria-hidden>
     {/* designed at 820×512 and scaled as one layer, so phones get the same composition */}
     <div className="absolute left-0 top-0 h-[512px] w-[820px] origin-top-left" style={{ transform: `scale(${k})` }}>
      {/* stage frame + ambient glow */}
      <div className="absolute inset-0 rounded-[2rem] border border-lav/10 bg-gradient-to-b from-plum/50 to-night/40" />
      <div className="absolute inset-0 overflow-hidden rounded-[2rem]">
        <div className="absolute left-1/2 top-1/2 h-[90%] w-[70%] rounded-full blur-3xl"
          style={{ transform: `translate(-50%,-50%) scale(${0.8 + fill * 0.15 + poof * 0.25})`, opacity: 0.35 + fill * 0.25 + poof * 0.2, background: `radial-gradient(closest-side, ${poof > 0.05 ? 'rgba(255,95,184,.45)' : 'rgba(95,212,255,.32)'}, rgba(182,156,255,.12) 60%, transparent)` }} />
        <div className="absolute inset-0 opacity-[.35]" style={{ backgroundImage: 'radial-gradient(rgba(182,156,255,.18) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(70% 70% at 50% 50%, #000, transparent)', WebkitMaskImage: 'radial-gradient(70% 70% at 50% 50%, #000, transparent)' }} />
      </div>

      {/* timer */}
      <Abs x={CX} y={8} style={{ transform: `translate(-50%, ${(1 - timerIn) * 12 - timerOut * 12}px)`, opacity: timerIn * (1 - timerOut) }}>
        <div className="glass flex items-center gap-3 rounded-full py-1.5 pl-3 pr-4">
          <span className={cx('h-2 w-2 rounded-full', closed ? 'bg-pink' : 'bg-mint')} style={{ boxShadow: closed ? '0 0 10px #FF5FB8' : '0 0 10px #7CF5C8' }} />
          <span className="label whitespace-nowrap">{closed ? 'window closed' : 'fair window'}</span>
          <Countdown ms={ms} size="md" urgent={ms < 60_000} />
        </div>
      </Abs>

      {/* pledging wallets → escrow */}
      {WALLETS.map((w, i) => {
        const appear = out(seg(p, 0.04 + i * 0.012, 0.12 + i * 0.012))
        const t = inOut(seg(p, 0.2 + i * 0.022, 0.31 + i * 0.022))
        const left = w.x < 50
        return (
          <Abs key={w.n} x={w.x + (CX - w.x) * t * 0.35} y={w.y + (CY + 4 - w.y) * t * 0.35} style={{ transform: `translate(${left ? '-0%' : '-100%'}, -50%) translateY(${(1 - appear) * 10}px) scale(${1 - t * 0.2})`, transformOrigin: left ? 'left center' : 'right center', opacity: appear * (1 - seg(t, 0, 0.45)) }}>
            <div className="glass flex items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-xs font-extrabold">
              <CoinAvatar hue={w.hue} accessory="none" size={22} />
              <span className="text-cream">{w.n}</span>
              <span className="font-num text-blue tnum">{w.a} SOL</span>
            </div>
          </Abs>
        )
      })}

      {/* escrow vault */}
      <Abs x={CX} y={CY + 4} style={{ transform: `translate(-50%,-50%) scale(${(0.92 + vaultIn * 0.08) * (1 - vaultOut * 0.15)})`, opacity: vaultIn * (1 - vaultOut) }}>
        <div className="relative h-[190px] w-[230px] overflow-hidden rounded-3xl border border-lav/25 bg-night/70 shadow-[0_30px_80px_-30px_rgba(95,212,255,.5)]">
          <div className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-gradient-to-t from-pink/55 via-lav/35 to-blue/25" style={{ transform: `scaleY(${fill})` }} />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cream/50 to-transparent" />
          <div className="relative flex h-full flex-col items-center justify-center gap-1 text-center">
            <div className="label">{lock > 0.5 ? 'escrow locked' : 'one escrow'}</div>
            <div className="font-num text-3xl font-semibold text-cream tnum">{raised}<span className="ml-1 text-base text-lav">SOL</span></div>
            <div className="text-[11px] font-bold text-lav/80">{lock > 0.5 ? 'min target reached ✓' : 'max 1% per wallet'}</div>
          </div>
          {/* lock seal */}
          <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-mint/90 text-night" style={{ transform: `scale(${0.4 + lock * 0.6})`, opacity: lock }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </div>
        </div>
      </Abs>

      {/* pledge motes landing in the escrow */}
      {WALLETS.map((w, i) => {
        const t = inOut(seg(p, 0.2 + i * 0.022, 0.31 + i * 0.022))
        return (
          <Abs key={w.n} x={w.x + (CX - w.x) * t} y={w.y + (CY + 4 - w.y) * t} style={{ transform: `translate(-50%,-50%) scale(${1 - t * 0.5})`, opacity: pulse(t) * (t < 0.98 ? 1 : 0) }}>
            <span className="block h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${w.hue} 95% 80%)`, boxShadow: `0 0 14px 2px hsl(${w.hue} 95% 70%)` }} />
          </Abs>
        )
      })}

      {/* one clearing price */}
      <Abs x={CX} y={86} style={{ transform: `translate(-50%, calc(-50% + ${(1 - priceIn) * 16}px))`, opacity: priceIn * (1 - priceOut) }}>
        <div className="glass neon-p flex items-center gap-4 whitespace-nowrap rounded-2xl px-4 py-2.5">
          <div>
            <div className="label">clearing price · everyone</div>
            <div className="font-num text-xl font-semibold text-pink tnum">0.0478 <span className="text-sm text-lav">SOL / 1M</span></div>
          </div>
          <div className="flex items-end gap-1" title="every wallet pays the same">
            {WALLETS.map((w, i) => (
              <span key={w.n} className="block h-6 w-2 origin-bottom rounded-full" style={{ background: `hsl(${w.hue} 95% 76%)`, transform: `scaleY(${out(seg(p, 0.44 + i * 0.008, 0.5 + i * 0.008))})` }} />
            ))}
          </div>
        </div>
      </Abs>

      {/* Raydium LaunchLab curve: presale is the first buy */}
      <div className="absolute inset-0" style={{ opacity: curveIn * (1 - curveDim * 0.88) }}>
        <svg viewBox="0 0 800 500" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="st-curve" x1="0" x2="1"><stop offset="0" stopColor="#5FD4FF" /><stop offset=".5" stopColor="#B69CFF" /><stop offset="1" stopColor="#FF5FB8" /></linearGradient>
            <linearGradient id="st-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF5FB8" stopOpacity=".45" /><stop offset="1" stopColor="#FF5FB8" stopOpacity="0" /></linearGradient>
            <clipPath id="st-first"><rect x="110" y="0" width={(fx - 110) * firstBuy} height="500" /></clipPath>
          </defs>
          <path d="M110 420 H700" stroke="rgba(182,156,255,.2)" strokeWidth="1.5" />
          <path d="M110 420 V110" stroke="rgba(182,156,255,.2)" strokeWidth="1.5" />
          <path d="M110 412 C 320 392, 510 300, 690 120 L690 420 L110 420 Z" fill="url(#st-area)" clipPath="url(#st-first)" />
          <path d="M110 412 C 320 392, 510 300, 690 120" fill="none" stroke="url(#st-curve)" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
          <g style={{ opacity: firstBuy, transform: `translate(${fx}px, ${fy}px) scale(${0.6 + firstBuy * 0.4})` }}>
            <circle r="7" fill="#FF5FB8" /><circle r="14" fill="none" stroke="#FF5FB8" strokeOpacity=".35" strokeWidth="2" />
          </g>
          <text x="690" y="104" textAnchor="end" className="fill-lav font-num text-[13px] font-semibold" style={{ opacity: draw }}>migrates → CPMM</text>
        </svg>
        <Abs x={14} y={12} style={{ transform: `translateY(${(1 - curveIn) * 8}px)` }}>
          <div className="glass flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-extrabold">
            <span className="h-2 w-2 rounded-full bg-blue" style={{ boxShadow: '0 0 10px #5FD4FF' }} /> Raydium LaunchLab <span className="text-lav">· coin created</span>
          </div>
        </Abs>
        <Abs x={fx / 8} y={fy / 5} style={{ transform: `translate(-100%, calc(-100% - 18px + ${(1 - firstBuy) * 10}px))`, opacity: firstBuy * (1 - curveDim) }}>
          <div className="glass neon-p whitespace-nowrap rounded-2xl px-3 py-2 text-center">
            <div className="label">presale = first buy</div>
            <div className="text-sm font-extrabold text-cream">42 SOL · one block · <span className="text-pink">one price</span></div>
          </div>
        </Abs>
      </div>

      {/* POOF */}
      <Abs x={CX} y={CY} style={{ transform: 'translate(-50%,-50%)' }}>
        <div className="relative grid place-items-center">
          {/* single soft shockwave */}
          <div className="absolute h-[240px] w-[240px] rounded-full border-2 border-pink/70" style={{ transform: `scale(${0.5 + out(wave) * 1.3})`, opacity: pulse(wave) * 0.7 }} />
          <div className="absolute h-[240px] w-[240px] rounded-full border border-blue/50" style={{ transform: `scale(${0.4 + out(seg(p, 0.85, 0.99)) * 1.6})`, opacity: pulse(seg(p, 0.85, 0.99)) * 0.5 }} />
          {[0, 60, 120, 180, 240, 300].map((a, i) => {
            const k = seg(p, 0.84 + i * 0.006, 0.97)
            const r = 95 + out(k) * 55
            return <span key={a} className="absolute h-1.5 w-1.5 rounded-full bg-cream" style={{ transform: `translate(${Math.cos((a * Math.PI) / 180) * r}px, ${Math.sin((a * Math.PI) / 180) * r}px)`, opacity: pulse(k) * 0.8, boxShadow: '0 0 8px #FF8CCB' }} />
          })}
          <img src="./mochi/idle-512.webp" alt="" className="relative w-[180px] drop-shadow-[0_20px_40px_rgba(255,95,184,.35)]" style={{ transform: `translateY(${(1 - poof) * 24}px) scale(${0.72 + poof * 0.28})`, opacity: poof }} />
        </div>
      </Abs>
      <Abs x={CX} y={17} style={{ transform: `translate(-50%, ${(1 - poof) * 14}px)`, opacity: poof }}>
        <div className="h-display text-candy text-6xl">POOF.</div>
      </Abs>
      <Abs x={CX} y={85} style={{ transform: `translate(-50%, ${(1 - ticket) * 14}px)`, opacity: ticket }}>
        <div className="glass neon-p flex items-center gap-3 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4 text-sm font-extrabold">
          <CoinAvatar hue={330} accessory="halo" size={28} />
          <span className="text-cream">$MOCHI is live</span>
          <span className="text-lav">· 214 floofs · one price · 0 snipers</span>
        </div>
      </Abs>
     </div>
    </div>
  )
}
