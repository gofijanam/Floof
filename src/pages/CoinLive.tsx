import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { EscrowCloud } from '../components/EscrowCloud'
import { CreatorCard } from '../components/CreatorCard'
import { TxModal } from '../components/TxModal'
import { Card, Countdown, GradeBadge, LiveDot, cx, Magnetic, Num } from '../components/ui'
import { IBack, ICheck, ICopy, IShield, IGhost, IClock, IBolt } from '../components/icons'
import { connectWallet, jumpToZero, fillTestWindow, pledge, toast, useCoin, useStore } from '../lib/store'
import { maxRaise, settle, walletCap } from '../lib/mock'
import { ago, fmtPrice, hms, short } from '../lib/format'

export default function CoinLive() {
  const { id } = useParams()
  const c = useCoin(id)
  const now = useStore((s) => s.now)
  const feed = useStore((s) => s.feed)
  const mine = useStore((s) => (id ? s.myPledges[id] ?? 0 : 0))
  if (!c) return <Navigate to="/explore" replace />
  if (c.status === 'refunding') return <Navigate to={`/coin/${c.id}/poof`} replace />
  if (c.status === 'curve' || c.status === 'graduated') return <Navigate to={`/trade/${c.id}`} replace />
  const cap = maxRaise(c)
  const st = settle(c, mine)
  const left = c.windowEnd - now
  const upcoming = c.status === 'upcoming'
  const items = feed.filter((f) => f.coin === c.id).slice(0, 14)
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-24 md:px-6 md:pt-28">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-lav hover:text-cream"><IBack s={16} /> Explore</Link>
      {/* header */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <motion.div layoutId={`avatar-${c.id}`}><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={84} mood={left < 15000 && !upcoming ? 'wait' : 'idle'} className={left < 10000 && !upcoming ? 'anim-shiver' : 'anim-breathe'} /></motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <motion.h1 layoutId={`ticker-${c.id}`} className="h-display text-4xl md:text-5xl">${c.ticker}</motion.h1>
            <GradeBadge g={c.truth.grade} />
            {upcoming ? <span className="chip text-blue"><IClock s={13} /> opens in {hms(c.windowStart - now)}</span> : <span className="chip text-mint"><LiveDot /> window live</span>}
          </div>
          <div className="mt-1 text-base font-bold text-lav">{c.name} — {c.tagline}</div>
          <button onClick={() => { navigator.clipboard?.writeText(c.ca).catch(() => {}); toast({ kind: 'success', title: 'Sandbox identifier copied' }) }} className="mt-1 inline-flex items-center gap-1.5 font-num text-xs text-lav/70 hover:text-cream tnum"><ICopy s={12} /> ID {short(c.ca, 6)}</button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          {/* cloud meter */}
          <Card neon="b" className="relative overflow-hidden p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={upcoming ? './mochi/idle-512.webp' : './mochi/countdown-512.webp'} alt="" aria-hidden className="hidden w-20 shrink-0 sm:block md:w-24" />
                <div>
                  <div className="label">{upcoming ? 'window opens in' : 'window closes in'}</div>
                  <Countdown ms={upcoming ? c.windowStart - now : left} size="xl" />
                </div>
              </div>
              <div className="text-right">
                <div className="label">in the cloud</div>
                <div className="font-num text-4xl font-semibold text-pink tnum md:text-5xl"><Num v={c.pledged} d={2} /></div>
                <div className="text-sm font-bold text-lav tnum">of {cap.toFixed(0)} SOL max raise · {c.pledgers} floofs</div>
              </div>
            </div>
            <div className="mx-auto mt-2 max-w-[760px]"><EscrowCloud coin={c} /></div>
            <div className="grid grid-cols-2 gap-3 border-t border-lav/10 pt-4 sm:grid-cols-4" data-cursor="native">
              <Mini k="Price ceiling" v={fmtPrice(c.priceCeiling)} s="SOL / token" />
              <Mini k="If it closed now" v={st.failed ? 'refund' : fmtPrice(st.price)} s={st.failed ? 'below min target' : 'one price for all'} accent={st.failed ? 'text-peach' : 'text-blue'} />
              <Mini k="Oversubscription" v={`${st.oversub.toFixed(2)}×`} s={st.over ? `fill ${(st.fill * 100).toFixed(0)}% pro-rata` : 'everyone fills 100%'} accent={st.over ? 'text-pink' : 'text-mint'} />
              <Mini k="Snipers blocked" v={c.snipersBlocked.toLocaleString()} s="sybil + bundle checks" />
            </div>
          </Card>

          {/* mechanic strip */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[{ i: <IBolt s={18} />, t: 'One price, one block', d: `At zero every pledge buys at the same price ≤ ${fmtPrice(c.priceCeiling)}.` }, { i: <IShield s={18} />, t: `Min ${c.minTarget} SOL or refund`, d: 'Miss the min target and every lamport goes back automatically.' }, { i: <IGhost s={18} />, t: '1% wallet cap', d: `Max ${walletCap(c).toFixed(2)} SOL per wallet. Linked wallets are clustered & blocked.` }].map((x) => (
              <Card key={x.t} className="p-4"><div className="flex items-center gap-2 font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-pink/15 text-pink">{x.i}</span>{x.t}</div><p className="mt-2 text-sm font-semibold text-lav">{x.d}</p></Card>
            ))}
          </div>

          {/* participants feed */}
          <Card className="p-4 md:p-5" data-cursor="native">
            <div className="flex items-center justify-between"><div className="font-display text-xl font-extrabold">Pledges</div><span className="chip"><LiveDot /> live</span></div>
            <div className="mt-3 divide-y divide-lav/10">
              <AnimatePresence initial={false}>
                {items.map((f) => (
                  <motion.div key={f.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }} className={cx('flex items-center justify-between py-2.5 text-sm', f.wallet === 'you' && 'anim-rowflash rounded-xl px-2')}>
                    <div className="flex items-center gap-2.5 font-bold">
                      {f.kind === 'blocked' ? <span className="grid h-7 w-7 place-items-center rounded-full bg-danger/15 text-danger"><IGhost s={14} /></span> : <span className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-black text-night" style={{ background: `hsl(${(f.wallet.charCodeAt(0) * 37) % 360} 90% 75%)` }}>{f.wallet.slice(0, 2)}</span>}
                      <span className={f.wallet === 'you' ? 'text-pink' : ''}>{f.wallet === 'you' ? 'You' : f.wallet}</span>
                      {f.kind === 'blocked' && <span className="whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-black text-danger"><span className="hidden sm:inline">sybil cluster · </span>bounced</span>}
                    </div>
                    <div className="flex items-center gap-4"><span className={cx('font-num tnum', f.kind === 'blocked' ? 'text-lav/50 line-through' : 'text-cream')}>{f.amount.toFixed(3)} SOL</span><span className="w-10 text-right text-xs text-lav/60 tnum">{ago(now - f.t)}</span></div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {items.length === 0 && <div className="py-6 text-center text-sm font-bold text-lav">{upcoming ? 'Pledges open when the window does.' : 'Be the first floof in.'}</div>}
            </div>
          </Card>
        </div>

        {/* sidebar */}
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <PledgeForm coinId={c.id} />
          <CreatorCard handle={c.creator} bond={c.bondSol} lockDays={c.lockDays} />
          {!upcoming && (
            <Card className="flex items-center justify-between gap-3 p-4">
              <div className="text-xs font-bold text-lav"><span className="font-extrabold text-cream">Demo control</span><br />Fast-forward this window to zero.</div>
              <div className="flex shrink-0 flex-col gap-1"><button onClick={() => fillTestWindow(c.id)} className="btn-ghost px-3 py-2 text-xs">Add test participants</button><button onClick={() => jumpToZero(c.id, 5000)} className="btn-ghost px-3 py-2 text-xs">Skip to zero ⏩</button></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Mini({ k, v, s, accent = 'text-cream' }: { k: string; v: string; s: string; accent?: string }) {
  return <div><div className="label">{k}</div><div className={cx('mt-0.5 font-num text-lg font-semibold tnum', accent)}>{v}</div><div className="text-[11px] font-bold text-lav/70">{s}</div></div>
}

function PledgeForm({ coinId }: { coinId: string }) {
  const c = useCoin(coinId)!
  const wallet = useStore((s) => s.wallet)
  const bal = useStore((s) => s.sol)
  const mine = useStore((s) => s.myPledges[coinId] ?? 0)
  const [amt, setAmt] = useState('')
  const [open, setOpen] = useState(false)
  const cap = walletCap(c)
  const room = Math.max(0, cap - mine)
  const v = parseFloat(amt)
  const upcoming = c.status === 'upcoming'
  const err = useMemo(() => {
    if (!amt) return ''
    if (isNaN(v) || v <= 0) return 'Enter an amount'
    if (v < 0.01) return 'Minimum pledge is 0.01 SOL'
    if (v > room + 1e-9) return `Over the 1% wallet cap — you can add ${room.toFixed(3)} SOL`
    if (v > bal) return 'Not enough SOL in wallet'
    return ''
  }, [amt, v, room, bal])
  const proj = settle({ ...c, pledged: c.pledged + (v || 0) }, mine + (v || 0))
  const valid = !!amt && !err
  return (
    <Card neon="p" className="p-5" data-cursor="native">
      <div className="flex items-center justify-between"><div className="font-display text-2xl font-extrabold">Pledge SOL</div><span className="chip text-lav tnum">bal {bal.toFixed(2)}</span></div>
      {mine > 0 && <div className="mt-3 flex items-center justify-between rounded-2xl bg-pink/10 px-3 py-2 text-sm font-extrabold text-pink ring-1 ring-pink/25"><span>Your pledge</span><span className="font-num tnum">{mine.toFixed(3)} SOL</span></div>}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-extrabold text-lav"><span>Amount</span><span className="tnum">cap {cap.toFixed(2)} · room {room.toFixed(3)}</span></div>
        <div className={cx('mt-1.5 flex items-center rounded-2xl border bg-night/70 pr-3 transition', err ? 'border-danger/60' : 'border-lav/20 focus-within:border-pink/70')}>
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" disabled={upcoming} className="w-full bg-transparent px-4 py-3.5 font-num text-2xl font-semibold outline-none tnum placeholder:text-lav/30" aria-label="Pledge amount in SOL" aria-invalid={!!err} />
          <span className="font-extrabold text-lav">SOL</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[0.1, 0.25, 0.5].map((p) => <button key={p} disabled={upcoming} onClick={() => setAmt(String(Math.min(p, room)))} className="rounded-xl bg-lav/10 py-2 text-xs font-extrabold hover:bg-lav/20 disabled:opacity-40">{p}</button>)}
          <button disabled={upcoming} onClick={() => setAmt(room.toFixed(3))} className="rounded-xl bg-pink/15 py-2 text-xs font-extrabold text-pink hover:bg-pink/25 disabled:opacity-40">MAX</button>
        </div>
        <AnimatePresence>{err && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-xs font-extrabold text-danger" role="alert">{err}</motion.div>}</AnimatePresence>
      </div>
      <div className="mt-4 space-y-1.5 rounded-2xl bg-night/50 p-3 text-xs font-bold ring-1 ring-lav/10">
        <Row k="Est. fill at zero" v={proj.failed ? '— (below min)' : `${(proj.fill * 100).toFixed(0)}%`} />
        <Row k="Est. tokens" v={proj.myTokens ? Math.round(proj.myTokens).toLocaleString() : '—'} />
        <Row k="Est. refund" v={`${proj.myRefund.toFixed(3)} SOL`} />
        <Row k="Price" v={`one price ≤ ${fmtPrice(c.priceCeiling)}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-extrabold text-mint">
        <span className="flex items-center gap-1"><ICheck s={12} /> sandbox identity</span><span className="flex items-center gap-1"><ICheck s={12} /> chain checks pending</span><span className="flex items-center gap-1"><ICheck s={12} /> under 1% cap</span>
      </div>
      {upcoming ? (
        <button onClick={() => jumpToZero(c.id, 5000)} className="btn-ice mt-4 w-full py-3.5">Advance sandbox window</button>
      ) : !wallet ? (
        <Magnetic className="mt-4 w-full" strength={0.15}><button onClick={connectWallet} className="btn-candy w-full py-3.5">Open sandbox to pledge</button></Magnetic>
      ) : (
        <button disabled={!valid} onClick={() => setOpen(true)} className="btn-candy mt-4 w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-40">Pledge {valid ? `${v} SOL` : ''}</button>
      )}
      <p className="mt-2 text-center text-[11px] font-bold text-lav/60">Pledges sit in escrow until zero. Sandbox ledger — test balances only.</p>
      <TxModal open={open} onClose={() => { setOpen(false) }} title={`Pledge to $${c.ticker}`} confirmLabel="Confirm pledge"
        rows={[{ k: 'Amount', v: `${v || 0} SOL`, strong: true }, { k: 'Est. fill', v: proj.failed ? 'below min' : `${(proj.fill * 100).toFixed(0)}%` }, { k: 'Est. tokens', v: proj.myTokens ? Math.round(proj.myTokens).toLocaleString() : '—' }, { k: 'Escrow program', v: 'FLooF…escr (devnet)' }, { k: 'Network fee', v: '~0.000005 SOL' }]}
        note="Your SOL is held by the escrow program. At zero you either buy at the one clearing price (pro-rata if oversubscribed) or get refunded."
        onConfirm={async () => { const result = await pledge(c.id, v); setAmt(''); toast({ kind: 'pledge', title: `You pledged ${v} SOL`, body: `into the $${c.ticker} cloud ☁️`, coin: c.id }); return result }} />
    </Card>
  )
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span className="text-lav">{k}</span><span className="font-num text-cream tnum">{v}</span></div>
