import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState, useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { NeonChart } from '../components/NeonChart'
import { TxModal } from '../components/TxModal'
import { Card, GradeBadge, LiveDot, Tabs, cx, gradeColor } from '../components/ui'
import { CreatorCard } from '../components/CreatorCard'
import { IBack, ICopy, IGear, ISwap, IShield, IArrow } from '../components/icons'
import { connectWallet, toast, trade, useCoin, useStore } from '../lib/store'
import { graduationOf, SUPPLY, FEES } from '../lib/mock'
import { ago, fmtCompact, fmtPrice, fmtUsd, short, SOL_USD } from '../lib/format'
import { sfx } from '../lib/audio'

import {api} from '../lib/api'
import {useApi} from '../lib/useApi'

type TF = '5m' | '1h' | '4h' | '1d'
export default function Trade() {
  const devnet=useStore(s=>s.mode==='devnet')
  const { id } = useParams()
  const c = useCoin(id)
  const now = useStore((s) => s.now)
  const feed = useStore((s) => s.feed)
  const pos = useStore((s) => (id ? s.positions[id] : undefined))
  const [tf, setTf] = useState<TF>('1h')
  const [tab, setTab] = useState<'trades' | 'holders' | 'position'>('trades')
  const candleResult = useApi<number[][]>(id ? `/coins/${id}/candles?tf=${tf}` : null)
  const holderResult = useApi<any[]>(id ? `/coins/${id}/holders` : null)
  const base = candleResult.data?.map(row => row[4]) || []
  if (!c) return <Navigate to="/explore" replace />
  if (c.status === 'refunding') return <Navigate to={`/coin/${c.id}/poof`} replace />
  if (c.status === 'open' || c.status === 'upcoming') return <Navigate to={`/coin/${c.id}`} replace />
  const data = base.length ? [...base, c.price] : [c.price, c.price]
  const mcap = c.price * SUPPLY * SOL_USD
  const mult = c.price / (c.clearingPrice || c.priceCeiling)
  const grad = c.status === 'graduated'
  const trades = feed.filter((f) => f.coin === c.id && (f.kind === 'buy' || f.kind === 'sell')).slice(0, 18)
  const holders = holderResult.data || []
  const value = pos ? pos.tokens * c.price : 0
  const pnl = pos ? value - pos.cost : 0
  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-24 md:px-6 md:pt-24">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-lav hover:text-cream"><IBack s={16} /> Explore</Link>
      {/* header */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <motion.div layoutId={`avatar-${c.id}`}><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={56} /></motion.div>
          <div>
            <div className="flex items-center gap-2"><motion.h1 layoutId={`ticker-${c.id}`} className="h-display text-3xl">${c.ticker}</motion.h1><GradeBadge g={c.truth.grade} /></div>
            <div className="flex items-center gap-2 text-xs font-bold text-lav">{c.name}
              <button onClick={() => { navigator.clipboard?.writeText(c.ca).catch(() => {}); toast({ kind: 'success', title: 'CA copied' }) }} className="inline-flex items-center gap-1 font-num hover:text-cream tnum"><ICopy s={11} />{short(c.ca, 4)}</button>
            </div>
          </div>
        </div>
        <div>
          <div className="font-num text-3xl font-semibold tnum">{fmtPrice(c.price)} <span className="text-base text-lav">SOL</span></div>
          <div className={cx('text-sm font-extrabold tnum', c.change24h >= 0 ? 'text-mint' : 'text-danger')}>{c.change24h >= 0 ? '▲' : '▼'} {Math.abs(c.change24h).toFixed(2)}% 24h</div>
        </div>
        <div className="grid flex-1 basis-full grid-cols-3 gap-3 sm:basis-auto sm:grid-cols-5 sm:gap-4 lg:max-w-3xl" data-cursor="native">
          <HS k="Market cap" v={fmtUsd(mcap)} />
          <HS k="Vol 24h" v={`${c.volume24h.toFixed(3)} SOL`} />
          <HS k="Holders" v={c.holders.toLocaleString()} />
          <HS k="vs window" v={`${mult.toFixed(2)}×`} accent={mult >= 1 ? 'text-mint' : 'text-danger'} />
          <HS k="Venue" v={grad ? (devnet?'Raydium CPMM':'Sandbox pool') : (devnet?'Raydium LaunchLab':'Sandbox curve')} accent={grad ? 'text-lav' : 'text-pink'} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-sm font-extrabold"><LiveDot /> ${c.ticker}/SOL <span className="text-lav">· {grad ? (devnet?'Raydium CPMM':'Sandbox pool') : (devnet?'Raydium LaunchLab':'Sandbox curve')}</span></div>
              <Tabs id="tf" size="sm" value={tf} onChange={setTf} items={(['5m', '1h', '4h', '1d'] as TF[]).map((v) => ({ v, label: v }))} />
            </div>
            <div className="mt-3"><NeonChart data={data} height={360} clearing={c.clearingPrice || undefined} /></div>
          </Card>

          <Card className="p-3 md:p-4" data-cursor="native">
            <Tabs id="tt" size="sm" value={tab} onChange={setTab} items={[{ v: 'trades', label: 'Trades' }, { v: 'holders', label: 'Holders', count: c.holders }, { v: 'position', label: 'Your position' }]} />
            <div className="mt-3">
              {tab === 'trades' && (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] font-black uppercase tracking-wider text-lav/60"><th className="py-2">Trader</th><th>Side</th><th className="text-right">SOL</th><th className="hidden text-right sm:table-cell">Tokens</th><th className="text-right">Age</th></tr></thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {trades.map((t) => (
                        <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cx('border-t border-lav/10 font-bold', t.wallet === 'you' && 'anim-rowflash')}>
                          <td className="py-2">{t.wallet === 'you' ? <span className="text-pink">You</span> : t.wallet}</td>
                          <td className={t.kind === 'buy' ? 'text-mint' : 'text-danger'}>{t.kind === 'buy' ? 'Buy' : 'Sell'}</td>
                          <td className="text-right font-num tnum">{t.amount.toFixed(3)}</td>
                          <td className="hidden text-right font-num text-lav tnum sm:table-cell">{fmtCompact(t.tokens ?? 0, 2)}</td>
                          <td className="text-right text-xs text-lav/60 tnum">{ago(now - t.t)}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
              {tab === 'trades' && trades.length === 0 && <div className="py-6 text-center text-sm font-bold text-lav">Waiting for trades…</div>}
              {tab === 'holders' && (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] font-black uppercase tracking-wider text-lav/60"><th className="py-2">#</th><th>Holder</th><th className="w-1/2">Share</th><th className="text-right">%</th></tr></thead>
                  <tbody>{holders.map((h, i) => (
                    <tr key={i} className="border-t border-lav/10 font-bold">
                      <td className="py-2 text-lav tnum">{i + 1}</td>
                      <td>{h.wallet} {h.tag && <span className={cx('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black', h.tag === 'curve' ? 'bg-lav/15 text-lav' : h.tag === 'window' ? 'bg-pink/15 text-pink' : 'bg-blue/15 text-blue')}>{h.tag === 'window' ? 'window ticket' : h.tag}</span>}</td>
                      <td><div className="h-1.5 rounded-full bg-night"><div className="h-full rounded-full bg-gradient-to-r from-blue to-pink" style={{ width: `${Math.min(100, (h.pct / holders[0].pct) * 100)}%` }} /></div></td>
                      <td className="text-right font-num tnum">{h.pct.toFixed(2)}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {tab === 'position' && (pos && pos.tokens > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <HS k="Tokens" v={fmtCompact(pos.tokens, 2)} /><HS k="Cost" v={`${pos.cost.toFixed(3)} SOL`} /><HS k="Value" v={`${value.toFixed(3)} SOL`} />
                  <HS k="PnL" v={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)} SOL (${pos.cost ? ((pnl / pos.cost) * 100).toFixed(1) : '0'}%)`} accent={pnl >= 0 ? 'text-mint' : 'text-danger'} />
                </div>
              ) : <div className="py-6 text-center text-sm font-bold text-lav">No position yet.</div>)}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TradePanel id={c.id} />
          <Card className="p-4">
            <div className="flex items-center justify-between"><div className="label">bonding curve</div><span className="font-num text-xs font-semibold text-lav tnum">{c.curveSol.toFixed(1)} / {graduationOf(c)} SOL</span></div>
            <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-night ring-1 ring-lav/10">
              <motion.div className="absolute inset-y-0 left-0 rounded-full anim-gradient" style={{ backgroundImage: grad ? 'linear-gradient(90deg,#7CF5C8,#5FD4FF,#7CF5C8)' : 'linear-gradient(90deg,#B69CFF,#FF5FB8,#B69CFF)' }} animate={{ width: `${(c.curveSol / (graduationOf(c))) * 100}%` }} />
            </div>
            <div className="mt-2 text-xs font-bold text-lav">{grad ? (devnet?'Graduated to Raydium CPMM on Devnet.':'Graduated — sandbox pool target reached.') : <>When the curve reaches {graduationOf(c)} SOL, the intended Devnet flow migrates to <span className="text-cream">Raydium CPMM</span>. {devnet?'Migration is completed by Raydium’s authorized migrator.':'This sandbox does not migrate on-chain.'} {Math.max(0,(graduationOf(c)) - c.curveSol).toFixed(1)} SOL to go.</>}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-extrabold"><IShield s={16} className="text-mint" /> TRUTH</div><Link to={`/truth/${c.ca}`} className="text-xs font-extrabold text-blue hover:underline">Full report →</Link></div>
            <div className="mt-3 flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-2xl font-display text-3xl font-extrabold" style={{ color: gradeColor(c.truth.grade), background: `${gradeColor(c.truth.grade)}14`, boxShadow: `inset 0 0 0 1.5px ${gradeColor(c.truth.grade)}55` }}>{c.truth.grade}</div>
              <div className="flex-1 space-y-1.5 text-xs font-bold">
                <Bar k="Real buys" v={c.truth.realPct} c="#7CF5C8" /><Bar k="Wash volume" v={c.truth.washPct} c="#FF6B8B" />
                <div className="flex justify-between"><span className="text-lav">Sybil clusters</span><span className="font-num tnum">{c.truth.sybilClusters}</span></div>
              </div>
            </div>
          </Card>
          <CreatorCard handle={c.creator} bond={c.bondSol} lockDays={c.lockDays} />
        </div>
      </div>
    </div>
  )
}
const HS = ({ k, v, accent = 'text-cream' }: { k: string; v: string; accent?: string }) => <div className="min-w-0"><div className="label truncate">{k}</div><div className={cx('truncate font-num text-sm font-semibold tnum md:text-base', accent)}>{v}</div></div>
const Bar = ({ k, v, c }: { k: string; v: number; c: string }) => (
  <div><div className="flex justify-between"><span className="text-lav">{k}</span><span className="font-num tnum">{v.toFixed(1)}%</span></div><div className="mt-0.5 h-1.5 rounded-full bg-night"><div className="h-full rounded-full" style={{ width: `${v}%`, background: c }} /></div></div>
)

function TradePanel({ id }: { id: string }) {
  const c = useCoin(id)!
  const wallet = useStore((s) => s.wallet)
  const bal = useStore((s) => s.sol)
  const pos = useStore((s) => s.positions[id])
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const devnet=useStore(s=>s.mode==='devnet')
  useEffect(()=>{if(devnet)setUnit(side==='buy'?'sol':'token')},[side,devnet])
  const [unit, setUnit] = useState<'sol' | 'token'>('sol')
  const [amt, setAmt] = useState('')
  const [slip, setSlip] = useState(1)
  const [showSlip, setShowSlip] = useState(false)
  const [open, setOpen] = useState(false)
  const v = parseFloat(amt) || 0
  const held = pos?.tokens ?? 0
  const [q, setQ] = useState<any>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoting, setQuoting] = useState(false)
  useEffect(() => {
    let live = true; setQ(null); setQuoteError('')
    if (!(v > 0) || !wallet) { setQuoting(false); return }
    setQuoting(true)
    const timer = setTimeout(() => api('/quote', {coin:id,side,amount:v,unit,slippageBps:Math.round(slip*100)}).then(result => {if(live)setQ(result)}).catch(e => {if(live)setQuoteError(e.message)}).finally(() => {if(live)setQuoting(false)}), 300)
    return () => {live=false;clearTimeout(timer)}
  }, [id,side,v,unit,slip,wallet])
  const err = quoteError || (!amt ? '' : v <= 0 ? 'Enter an amount' : side === 'buy' && q && q.sol > bal ? 'Not enough SOL' : side === 'sell' && q && q.tokens > held + 1 ? `You hold ${fmtCompact(held, 2)} $${c.ticker}` : q && q.impact > 25 ? 'Price impact too high (>25%)' : '')
  const presets = side === 'buy' ? (unit === 'sol' ? ['0.1', '0.5', '1', '2'] : ['100K', '500K', '1M', '5M']) : ['25%', '50%', '75%', '100%']
  const applyPreset = (p: string) => {
    sfx.tick()
    if (side === 'sell') { const pct = parseInt(p) / 100; if (unit === 'token') setAmt(String(Math.floor(held * pct))); else setAmt((held * pct * c.price * 0.99).toFixed(4)); return }
    if (unit === 'sol') setAmt(p); else setAmt(String(parseFloat(p) * (p.endsWith('M') ? 1e6 : 1e3)))
  }
  const minOut = q ? (side === 'buy' ? q.tokens : q.sol) * (1 - slip / 100) : 0
  const impactCls = !q ? '' : q.impact > 10 ? 'text-danger' : q.impact > 3 ? 'text-peach' : 'text-mint'
  return (
    <Card neon={side === 'buy' ? 'b' : 'p'} className="p-4" data-cursor="native">
      <div className="flex items-center justify-between">
        <div className="relative grid flex-1 grid-cols-2 rounded-full bg-night/70 p-1 ring-1 ring-lav/15">
          {(['buy', 'sell'] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setAmt(''); setUnit(s === 'sell' ? 'token' : 'sol') }} className={cx('relative rounded-full py-2 text-sm font-black capitalize', side === s ? 'text-night' : 'text-lav')}>
              {side === s && <motion.span layoutId="bs-pill" className={cx('absolute inset-0 rounded-full', s === 'buy' ? 'bg-mint' : 'bg-danger')} transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="relative">{s}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setShowSlip((x) => !x)} className={cx('ml-2 flex h-10 items-center gap-1 rounded-full px-3 text-xs font-extrabold ring-1', showSlip ? 'bg-lav/20 ring-lav/40' : 'bg-night/60 ring-lav/15 text-lav')} aria-label="Slippage settings"><IGear s={14} />{slip}%</button>
      </div>
      <AnimatePresence>{showSlip && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="mt-3 rounded-2xl bg-night/60 p-3 ring-1 ring-lav/10">
            <div className="label">max slippage</div>
            <div className="mt-2 flex gap-1.5">{[0.5, 1, 2, 5].map((s) => <button key={s} onClick={() => setSlip(s)} className={cx('flex-1 rounded-xl py-1.5 text-xs font-extrabold', slip === s ? 'bg-pink text-night' : 'bg-lav/10')}>{s}%</button>)}
              <input aria-label="Custom slippage" inputMode="decimal" placeholder="custom" onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0 && n <= 50) setSlip(n) }} className="w-20 rounded-xl bg-lav/10 px-2 text-xs font-bold outline-none" /></div>
            {slip > 5 && <div className="mt-2 text-[11px] font-bold text-peach">High slippage — you may get a worse price.</div>}
          </div>
        </motion.div>
      )}</AnimatePresence>
      <div className="mt-4 flex items-center justify-between text-xs font-extrabold text-lav">
        <span>{side === 'buy' ? 'You pay' : 'You sell'}</span>
        <span className="tnum">{side === 'buy' ? `bal ${bal.toFixed(3)} SOL` : `${fmtCompact(held, 2)} $${c.ticker}`}</span>
      </div>
      <div className={cx('mt-1.5 flex items-center rounded-2xl border bg-night/70 pr-2', err ? 'border-danger/60' : 'border-lav/20 focus-within:border-blue/60')}>
        <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" className="w-full bg-transparent px-4 py-3 font-num text-2xl font-semibold outline-none tnum placeholder:text-lav/30" aria-label="Amount" aria-invalid={!!err} />
        <button onClick={() => { if(!devnet){setUnit((u) => (u === 'sol' ? 'token' : 'sol')); setAmt('')} }} className="flex shrink-0 items-center gap-1 rounded-xl bg-lav/10 px-2.5 py-2 text-xs font-black hover:bg-lav/20" aria-label="Toggle SOL or token amount">
          {unit === 'sol' ? 'SOL' : `$${c.ticker}`} <ISwap s={12} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">{presets.map((p) => <button key={p} onClick={() => applyPreset(p)} className="rounded-xl bg-lav/10 py-2 text-xs font-extrabold hover:bg-lav/20">{p}</button>)}</div>
      {err && <div className="mt-2 text-xs font-extrabold text-danger" role="alert">{err}</div>}
      <div className="mt-3 space-y-1.5 rounded-2xl bg-night/50 p-3 text-xs font-bold ring-1 ring-lav/10">
        <R k="You receive" v={q ? (side === 'buy' ? `${fmtCompact(q.tokens, 2)} $${c.ticker}` : `${q.sol.toFixed(4)} SOL`) : '—'} strong />
        {side === 'buy' && unit === 'token' && <R k="You pay" v={q ? `${q.sol.toFixed(4)} SOL` : '—'} />}
        <R k="Avg price" v={q ? fmtPrice(q.avg) : '—'} />
        <R k="Price impact" v={q ? `${q.impact.toFixed(2)}%` : '—'} cls={impactCls} />
        <R k={`Min received (${slip}% slip)`} v={q ? (side === 'buy' ? fmtCompact(minOut, 2) : `${minOut.toFixed(4)} SOL`) : '—'} />
        <R k={`Fee ${FEES.total}%`} v={q ? `${q.fee.toFixed(4)} SOL` : '—'} />
      </div>
      {!wallet ? <button onClick={connectWallet} className="btn-candy mt-4 w-full py-3.5">{devnet?'Connect wallet':'Open sandbox'}</button> : (
        <button disabled={!q || !!err} onClick={() => setOpen(true)} className={cx('mt-4 w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-40', side === 'buy' ? 'btn-ice' : 'btn-candy')}>
          {quoting ? 'Getting quote…' : side === 'buy' ? `Buy $${c.ticker}` : `Sell $${c.ticker}`} 
        </button>
      )}
      <TxModal open={open} onClose={() => setOpen(false)} title={`${side === 'buy' ? 'Buy' : 'Sell'} $${c.ticker}`} accent={side === 'buy' ? 'blue' : 'pink'} confirmLabel={`Confirm ${side}`}
        rows={q ? [
          { k: side === 'buy' ? 'Pay' : 'Sell', v: side === 'buy' ? `${q.sol.toFixed(4)} SOL` : `${fmtCompact(q.tokens, 2)} $${c.ticker}`, strong: true },
          { k: 'Receive', v: side === 'buy' ? `${fmtCompact(q.tokens, 2)} $${c.ticker}` : `${q.sol.toFixed(4)} SOL`, strong: true },
          { k: 'Price impact', v: <span className={impactCls}>{q.impact.toFixed(2)}%</span> }, { k: 'Max slippage', v: `${slip}%` },
          { k: 'Fee', v: `${q.fee.toFixed(4)} SOL (${FEES.raydium}% Raydium · ${FEES.creator}% creator · ${FEES.platform}% platform)` },
          { k: 'Route', v: c.status === 'graduated' ? (devnet?'Raydium CPMM':'Sandbox pool') : (devnet?'Raydium LaunchLab':'Sandbox curve') },
        ] : []}
        onConfirm={async () => { if (!q) throw new Error('Review a quote first.'); const result = await trade(q.quoteId); sfx.pop(side === 'buy' ? 1.3 : 0.8); setAmt(''); toast({ kind: 'success', title: `${side === 'buy' ? 'Bought' : 'Sold'} ${fmtCompact(result.tokens, 2)} $${c.ticker}`, body: `${result.sol.toFixed(4)} test SOL · position saved`, coin: c.id }); return result }} />
    </Card>
  )
}
const R = ({ k, v, strong, cls }: { k: string; v: string; strong?: boolean; cls?: string }) => <div className="flex justify-between gap-3"><span className="text-lav">{k}</span><span className={cx('text-right font-num tnum', strong ? 'text-sm font-semibold text-cream' : 'text-cream', cls)}>{v}</span></div>
