import { motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { TxModal } from '../components/TxModal'
import { Card, Magnetic, cx } from '../components/ui'
import { confetti } from '../components/confetti'
import { sfx } from '../lib/audio'
import { toast, useCoin, useStore, claim } from '../lib/store'
import { settle } from '../lib/mock'
import { fmtPrice } from '../lib/format'
import { IArrow, ICheck, IGhost, IUsers, IBolt } from '../components/icons'
import {useApi} from '../lib/useApi'
import type { MochiHandle } from '../components/Mochi3D'

const Mochi3D = lazy(() => import('../components/Mochi3D').then((m) => ({ default: m.Mochi3D })))

export default function Poof() {
  const { id } = useParams()
  const c = useCoin(id)
  const mine = useStore((s) => (id ? s.myPledges[id] ?? 0 : 0))
  const settlement = useApi<any>(id ? `/coins/${id}/settlement` : null)
  const savedClaim = useStore(s => s.claims.find(cl => cl.id === `window:${id}`)?.claimed)
  const reduced = useReducedMotion()
  const [claimed, setClaimed] = useState(false)
  const [open, setOpen] = useState(false)
  const mochi = useRef<MochiHandle>(null)
  const [snap] = useState(() => (c ? { coin: c, st: settle(c, mine) } : null))
  useEffect(() => {
    if (!snap) return
    sfx.poof()
    const t1 = setTimeout(() => mochi.current?.puff(), 300)
    const bursts = reduced ? [] : [
      setTimeout(() => confetti({ x: innerWidth / 2, y: innerHeight * 0.32, n: 160, power: 1.2 }), 420),
      setTimeout(() => confetti({ x: innerWidth * 0.15, y: innerHeight * 0.5, n: 70 }), 800),
      setTimeout(() => confetti({ x: innerWidth * 0.85, y: innerHeight * 0.5, n: 70 }), 1000),
    ]
    return () => { clearTimeout(t1); bursts.forEach(clearTimeout) }
  }, [snap, reduced])
  if (!c || !snap) return <Navigate to="/explore" replace />
  const st = {...snap.st, ...(settlement.data?.settled ? settlement.data : {})}
  const failed = st.failed
  return (
    <motion.div className="relative" animate={reduced ? {} : { x: [0, -14, 12, -9, 6, -3, 0], y: [0, 6, -5, 3, 0] }} transition={{ delay: 0.35, duration: 0.55 }}>
      {/* flash */}
      <motion.div className="pointer-events-none fixed inset-0 z-[70] bg-cream" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ delay: 0.32, duration: 0.6 }} />
      <section className="relative mx-auto max-w-[1200px] px-4 pt-24 text-center md:px-6 md:pt-24">
        <div className="pointer-events-none absolute left-1/2 top-40 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 anim-spin-slow opacity-50"
          style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,95,184,.22) 0 6deg, transparent 6deg 18deg, rgba(95,212,255,.2) 18deg 24deg, transparent 24deg 36deg)', maskImage: 'radial-gradient(circle, #000 10%, transparent 60%)', WebkitMaskImage: 'radial-gradient(circle, #000 10%, transparent 60%)' }} />
        <div className="relative mx-auto h-[260px] w-full max-w-[520px] md:h-[320px]">
          {failed ? <img src="./mochi/sleepy.webp" alt="sleepy mochi — refunds" className="mx-auto h-full object-contain anim-breathe" /> : <Suspense fallback={<img src="./mochi/puffed.webp" alt="" className="mx-auto h-full" />}><Mochi3D ref={mochi} className="absolute inset-0" /></Suspense>}
        </div>
        <h1 className="h-display relative -mt-6 text-[22vw] leading-[.8] md:text-[11rem]" aria-label={failed ? 'Refunded' : 'POOF!'}>
          {(failed ? 'refund' : 'POOF!').split('').map((ch, i) => (
            <motion.span key={i} className="inline-block text-cream" style={{ WebkitTextStroke: 'clamp(3px,0.6vw,6px) #FF5FB8', textShadow: '0 10px 0 #B69CFF, 0 0 60px rgba(255,95,184,.6)' }}
              initial={{ y: 120, scale: 0.3, rotate: -30, opacity: 0 }} animate={{ y: 0, scale: 1, rotate: i % 2 ? 4 : -4, opacity: 1 }} transition={{ delay: 0.4 + i * 0.06, type: 'spring', stiffness: 300, damping: 12 }}>{ch}</motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="relative mx-auto mt-6 max-w-xl text-lg font-bold text-lav md:text-xl">
          {failed ? <>The ${c.ticker} window missed its {c.minTarget} SOL min target. Every pledge is available to refund — no harm, no foul.</> : <><span className="text-cream">${c.ticker} is born.</span> {c.pledgers.toLocaleString()} floofs bought together at one clearing price in the sandbox ledger.</>}
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="relative mt-5 flex flex-wrap justify-center gap-2">
          <span className="chip text-mint"><IUsers s={13} /> {c.pledgers.toLocaleString()} buyers</span>
          <span className="chip text-blue"><IBolt s={13} /> sandbox settlement</span>
          <span className="chip text-danger"><IGhost s={13} /> {c.snipersBlocked} snipers locked out</span>
          <span className="chip tnum">price {failed ? '—' : fmtPrice(st.price)} SOL</span>
        </motion.div>
      </section>

      <motion.section initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, type: 'spring', stiffness: 120, damping: 18 }} className="relative mx-auto mt-10 grid max-w-[1000px] gap-5 px-4 md:grid-cols-[1.3fr_1fr] md:px-6">
        <Card neon="p" className="p-5 text-left md:p-6" data-cursor="native">
          <div className="flex items-center gap-3">
            <motion.div layoutId={`avatar-${c.id}`}><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={56} mood="happy" /></motion.div>
            <div><div className="font-display text-2xl font-extrabold">Your share</div><div className="text-sm font-bold text-lav">{mine ? `You pledged ${mine.toFixed(3)} SOL` : 'You didn’t pledge in this window'}</div></div>
          </div>
          {mine > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Big k="Tokens received" v={Math.round(st.myTokens).toLocaleString()} s={`$${c.ticker}`} accent="text-pink" />
                <Big k="Refund" v={`${st.myRefund.toFixed(3)}`} s="SOL back to you" accent="text-blue" />
                <Big k="Filled" v={`${st.myFilled.toFixed(3)}`} s={`SOL · ${(st.fill * 100).toFixed(1)}% pro-rata`} />
                <Big k="Your price" v={failed ? '—' : fmtPrice(st.price)} s="same as everyone" />
              </div>
              {st.over && <div className="mt-3 rounded-2xl bg-pink/10 px-3 py-2 text-xs font-extrabold text-pink ring-1 ring-pink/20">Oversubscribed {st.oversub.toFixed(2)}× — everyone filled {(st.fill * 100).toFixed(1)}% and the rest is refunded.</div>}
              <button disabled={claimed || savedClaim} onClick={() => setOpen(true)} className={cx('mt-5 w-full py-4 text-base', (claimed || savedClaim) ? 'btn-ghost' : 'btn-candy sheen')}>{(claimed || savedClaim) ? <><ICheck s={18} /> Claimed</> : failed ? `Claim ${mine.toFixed(3)} SOL refund` : `Claim tokens + ${st.myRefund.toFixed(3)} SOL refund`}</button>
            </>
          ) : (
            <div className="mt-5 rounded-2xl bg-night/50 p-4 text-sm font-bold text-lav">Next time, pledge before zero to buy at the window price. The curve is open now.</div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="relative overflow-hidden p-5 text-left">
            <div className="label">window ticket</div>
            <div className="ticket-edge mt-3 rounded-2xl p-4" style={{ background: `linear-gradient(135deg, hsl(${c.hue} 90% 72%), #B69CFF 60%, #FF5FB8)` }}>
              <div className="flex items-center justify-between text-night">
                <div><div className="font-display text-2xl font-extrabold">${c.ticker}</div><div className="text-xs font-black opacity-70">FAIR WINDOW · #{(c.pledgers % 997) + 1}</div></div>
                <CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={54} mood="happy" />
              </div>
              <div className="mt-3 border-t border-dashed border-night/30 pt-2 font-num text-xs font-semibold text-night/80">{mine ? 'Collected · counts toward Scout rewards' : 'Spectator'}</div>
            </div>
          </Card>
          <Magnetic className="w-full" strength={0.15}><Link to={`/trade/${c.id}`} className="btn-ice w-full py-4 text-base">Trade ${c.ticker} on the curve <IArrow s={18} /></Link></Magnetic>
          <Link to="/portfolio" className="btn-ghost w-full py-3">View portfolio</Link>
        </div>
      </motion.section>
      <TxModal open={open} onClose={() => setOpen(false)} title="Claim" confirmLabel="Confirm claim" accent="blue"
        rows={[{ k: 'Tokens', v: `${Math.round(st.myTokens).toLocaleString()} $${c.ticker}`, strong: true }, { k: 'Refund', v: `${st.myRefund.toFixed(3)} SOL` }, { k: 'Network fee', v: '~0.000005 SOL' }]}
        onConfirm={async () => { const result = await claim(`window:${c.id}`); setClaimed(true); return result }} />
    </motion.div>
  )
}
const Big = ({ k, v, s, accent = 'text-cream' }: { k: string; v: string; s: string; accent?: string }) => (
  <div className="rounded-2xl bg-night/50 p-3 ring-1 ring-lav/10"><div className="label">{k}</div><div className={cx('mt-1 font-num text-2xl font-semibold tnum', accent)}>{v}</div><div className="text-[11px] font-bold text-lav/70">{s}</div></div>
)
