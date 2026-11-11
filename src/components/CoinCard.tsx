import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { memo, forwardRef } from 'react'
import type { Coin } from '../lib/mock'
import { creatorBy, graduationOf, SUPPLY, walletCap } from '../lib/mock'
import { fmtPrice, fmtUsd, hms, SOL_USD } from '../lib/format'
import { CoinAvatar } from './CoinAvatar'
import { Countdown, GradeBadge, LiveDot, MiniMeter, cx } from './ui'
import { useNow } from '../lib/store'
import { ILock } from './icons'

export const coinHref = (c: Coin) => c.status === 'refunding' ? `/coin/${c.id}/poof` : (c.status === 'open' || c.status === 'upcoming' ? `/coin/${c.id}` : `/trade/${c.id}`)

export const CoinCard = memo(forwardRef<HTMLDivElement, { coin: Coin }>(function CoinCard({ coin: c }, ref) {
  const now = useNow()
  const cr = creatorBy(c.creator)
  const left = c.windowEnd - now
  return (
    <motion.div ref={ref} layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}>
      <Link to={coinHref(c)} className="group glass relative block overflow-hidden rounded-3xl p-4 transition duration-300 hover:-translate-y-1 hover:border-lav/30 hover:shadow-glowp">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60" style={{ background: `hsl(${c.hue} 95% 65%)` }} />
        <div className="relative flex items-start gap-3">
          <motion.div layoutId={`avatar-${c.id}`} className="shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
            <CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={56} mood={c.status === 'open' && left < 60e3 ? 'wait' : 'idle'} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <motion.span layoutId={`ticker-${c.id}`} className="font-display text-xl font-extrabold leading-none">${c.ticker}</motion.span>
              <GradeBadge g={c.truth.grade} />
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-lav">{c.name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-extrabold text-lav/80">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${cr.hue} 90% 70%)` }} />@{cr.handle}
              <span className="text-mint tnum">rep {cr.rep}</span>
              <span className="inline-flex items-center gap-0.5 text-blue tnum"><ILock s={11} />{c.lockDays ? `${c.lockDays}d lock` : 'no lock'}</span>
            </div>
          </div>
          <StatusPill c={c} />
        </div>
        <div className="relative mt-4">
          {c.status === 'open' && (
            <>
              <div className="mb-2 flex items-end justify-between">
                <div><div className="label">window closes</div><Countdown ms={left} size="md" /></div>
                <div className="text-right"><div className="label">ceiling</div><div className="font-num text-sm font-semibold tnum">{fmtPrice(c.priceCeiling)}</div></div>
              </div>
              <MiniMeter coin={c} />
              <div className="mt-2 flex justify-between text-[11px] font-bold text-lav/70 tnum"><span>{c.pledgers} floofs</span><span>cap {walletCap(c).toFixed(2)} SOL / wallet</span></div>
            </>
          )}
          {c.status === 'upcoming' && (
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-night/50 p-3 ring-1 ring-lav/10">
              <div><div className="label">opens in</div><div className="font-num text-sm font-semibold text-blue tnum">{hms(c.windowStart - now)}</div></div>
              <div><div className="label">min target</div><div className="font-num text-sm font-semibold tnum">{c.minTarget} SOL</div></div>
              <div><div className="label">lock</div><div className="font-num text-sm font-semibold tnum">{c.lockDays}d</div></div>
            </div>
          )}
          {(c.status === 'curve' || c.status === 'graduated') && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div><div className="label">price</div><div className="font-num text-sm font-semibold tnum">{fmtPrice(c.price)}</div></div>
                <div><div className="label">mcap</div><div className="font-num text-sm font-semibold tnum">{fmtUsd(c.price * SUPPLY * SOL_USD)}</div></div>
                <div className="text-right"><div className="label">24h</div><div className={cx('font-num text-sm font-semibold tnum', c.change24h >= 0 ? 'text-mint' : 'text-danger')}>{c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(1)}%</div></div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-night/80 ring-1 ring-lav/10">
                <div className="h-full rounded-full" style={{ width: `${(c.curveSol / graduationOf(c)) * 100}%`, background: c.status === 'graduated' ? 'linear-gradient(90deg,#7CF5C8,#5FD4FF)' : 'linear-gradient(90deg,#B69CFF,#FF5FB8)' }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-bold text-lav/70 tnum">
                <span>{c.status === 'graduated' ? 'Graduated → Raydium CPMM' : `LaunchLab curve ${((c.curveSol / graduationOf(c)) * 100).toFixed(0)}%`}</span>
                <span>{c.snipersBlocked} snipers blocked</span>
              </div>
            </>
          )}
        </div>
      </Link>
    </motion.div>
  )
}))

function StatusPill({ c }: { c: Coin }) {
  const map = { refunding: ['REFUND', 'text-blue bg-blue/10 ring-blue/30'],
    open: ['LIVE', 'text-mint bg-mint/10 ring-mint/30'], upcoming: ['SOON', 'text-blue bg-blue/10 ring-blue/30'], curve: ['CURVE', 'text-pink bg-pink/10 ring-pink/30'], graduated: ['CPMM', 'text-lav bg-lav/10 ring-lav/30'] } as const
  const [t, cls] = map[c.status]
  return <span className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black ring-1', cls)}>{c.status === 'open' && <LiveDot />}{t}</span>
}
