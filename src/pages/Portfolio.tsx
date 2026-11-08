import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { Card, Tabs, cx, Num, Magnetic } from '../components/ui'
import { PeekMochi } from '../components/ui'
import { TxModal } from '../components/TxModal'
import { useState } from 'react'
import { claim, connectWallet, getState, useStore } from '../lib/store'

import { fmtCompact, fmtPrice, SOL_USD } from '../lib/format'
import { ITrophy, IArrow, ICheck } from '../components/icons'

export default function Portfolio() {
  const mode=useStore(s=>s.mode)
  const MY_TICKETS = useStore(s => s.tickets)
  const address = useStore(s => s.walletAddress)
  const scout = useStore(s => s.scouts.find(r => r.me))
  const ME = {wallet:address,scoutRank:scout?.rank || '—',scoutPoints:scout?.points || 0}
  const wallet = useStore((s) => s.wallet)
  const positions = useStore((s) => s.positions)
  const coins = useStore((s) => s.coins)
  const claims = useStore((s) => s.claims)
  const pledges = useStore((s) => s.myPledges)
  const sol = useStore((s) => s.sol)
  const [tab, setTab] = useState<'positions' | 'pledges' | 'tickets' | 'claims'>('positions')
  const [claimId, setClaimId] = useState<string | null>(null)
  const rows = Object.entries(positions).filter(([, p]) => p.tokens > 0).map(([id, p]) => { const c = coins.find((x) => x.id === id)!; const value = p.tokens * c.price; return { c, ...p, value, pnl: value - p.cost } })
  const totalValue = rows.reduce((a, r) => a + r.value, 0)
  const allCostsKnown=rows.every(r=>r.costKnown!==false)
  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0)
  const unclaimed = claims.filter((c) => !c.claimed).reduce((a, c) => a + c.amount, 0)
  const pendingClaim = claims.find((c) => c.id === claimId)
  if (!wallet) return (
    <div className="mx-auto max-w-xl px-4 pt-36 text-center">
      <img src="./mochi/sleepy-512.webp" alt="sleepy mochi" className="mx-auto w-44 anim-breathe" />
      <h1 className="h-display mt-4 text-5xl">Your floof pouch</h1>
      <p className="mt-2 font-bold text-lav">Connect your wallet to see positions, window tickets, Scout rewards and claims.</p>
      <Magnetic className="mt-6"><button onClick={connectWallet} className="btn-candy px-8 py-4">{mode==='devnet'?'Connect Phantom':'Open sandbox'}</button></Magnetic>
    </div>
  )
  return (
    <div className="relative mx-auto max-w-[1300px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="happy" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="h-display text-5xl md:text-6xl">Portfolio</h1><div className="mt-1 font-num text-sm text-lav tnum">{ME.wallet.slice(0, 8)}…{ME.wallet.slice(-6)} · {mode}</div></div>
        <Link to="/scouts" className="chip py-2 text-blue"><ITrophy s={14} /> Scout rank #{ME.scoutRank} · {ME.scoutPoints.toLocaleString()} pts</Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-5"><div className="label">holdings value</div><div className="mt-1 font-num text-3xl font-semibold tnum"><Num v={totalValue} d={3} /> <span className="text-sm text-lav">SOL</span></div><div className="text-xs font-bold text-lav tnum">≈ ${(totalValue * SOL_USD).toFixed(0)}</div></Card>
        <Card className="p-5"><div className="label">unrealised PnL</div><div className={cx('mt-1 font-num text-3xl font-semibold tnum', totalPnl >= 0 ? 'text-mint' : 'text-danger')}>{allCostsKnown?<>{totalPnl >= 0 ? '+' : ''}<Num v={totalPnl} d={3} /></>:'—'}</div><div className="text-xs font-bold text-lav">SOL across {rows.length} coins</div></Card>
        <Card className="p-5"><div className="label">wallet</div><div className="mt-1 font-num text-3xl font-semibold tnum">{sol.toFixed(2)}</div><div className="text-xs font-bold text-lav">SOL available</div></Card>
        <Card neon="p" className="p-5"><div className="label">claimable</div><div className="mt-1 font-num text-3xl font-semibold text-pink tnum">{unclaimed.toFixed(3)}</div><div className="text-xs font-bold text-lav">SOL refunds + Scout rewards</div></Card>
      </div>
      <div className="mt-6 overflow-x-auto"><Tabs id="pf" value={tab} onChange={setTab} items={[{ v: 'positions', label: 'Positions', count: rows.length }, { v: 'pledges', label: 'Open pledges', count: Object.keys(pledges).length }, { v: 'tickets', label: 'Window tickets', count: MY_TICKETS.length }, { v: 'claims', label: 'Claims', count: claims.filter((c) => !c.claimed).length }]} /></div>
      <div className="mt-4" data-cursor="native">
        {tab === 'positions' && (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-[11px] font-black uppercase tracking-wider text-lav/60">{['Coin', 'Tokens', 'Price', 'Cost', 'Value', 'PnL', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.c.id} className="border-t border-lav/10 font-bold">
                  <td className="px-4 py-3"><Link to={`/trade/${r.c.id}`} className="flex items-center gap-3 hover:text-pink"><CoinAvatar image={r.c.image} hue={r.c.hue} accessory={r.c.accessory} size={34} />${r.c.ticker}</Link></td>
                  <td className="px-4 font-num tnum">{fmtCompact(r.tokens, 2)}</td>
                  <td className="px-4 font-num tnum">{fmtPrice(r.c.price)}</td>
                  <td className="px-4 font-num tnum">{r.costKnown===false?'Unknown':r.cost.toFixed(3)}</td>
                  <td className="px-4 font-num tnum">{r.value.toFixed(3)}</td>
                  <td className={cx('px-4 font-num tnum', r.pnl >= 0 ? 'text-mint' : 'text-danger')}>{r.costKnown===false?'—':<>{r.pnl >= 0 ? '+' : ''}{r.pnl.toFixed(3)} {r.cost>0&&<span className="text-xs">({((r.pnl / r.cost) * 100).toFixed(0)}%)</span>}</>}</td>
                  <td className="px-4 text-right"><Link to={`/trade/${r.c.id}`} className="btn-ghost px-3 py-1.5 text-xs">Trade</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
        {tab === 'pledges' && (
          <div className="grid gap-3 md:grid-cols-2">{Object.entries(pledges).map(([id, amt]) => { const c = coins.find((x) => x.id === id)!; return (
            <Link key={id} to={`/coin/${id}`}><Card className="flex items-center gap-4 p-4 hover:border-pink/40"><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={48} /><div className="flex-1"><div className="font-display text-xl font-extrabold">${c.ticker}</div><div className="text-xs font-bold text-lav">{c.status === 'open' ? 'window live — settles at zero' : 'settled'}</div></div><div className="font-num text-lg font-semibold text-pink tnum">{amt.toFixed(3)} SOL</div><IArrow s={16} className="text-lav" /></Card></Link>
          ) })}</div>
        )}
        {tab === 'tickets' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MY_TICKETS.map((t, i) => (
              <motion.div key={t.coin} initial={{ opacity: 0, y: 20, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ y: -6, rotate: i % 2 ? 1.5 : -1.5 }}
                className="ticket-edge relative overflow-hidden rounded-3xl p-5 text-night" style={{ background: t.rarity === 'Gold' ? 'linear-gradient(135deg,#FFE9A8,#FFC86B 50%,#FF8CCB)' : t.rarity === 'Ice' ? 'linear-gradient(135deg,#E6FBFF,#7FDDFF 55%,#B69CFF)' : 'linear-gradient(135deg,#FFE3F3,#FF8CCB 55%,#B69CFF)' }}>
                <div className="sheen absolute inset-0" />
                <div className="relative flex items-start justify-between">
                  <div><div className="text-[10px] font-black uppercase tracking-widest opacity-70">{t.rarity} ticket</div><div className="font-display text-3xl font-extrabold">${t.ticker}</div><div className="font-num text-xs font-semibold opacity-70">#{t.no} · {t.date}</div></div>
                  <CoinAvatar hue={t.hue} accessory={t.accessory} size={56} mood="happy" />
                </div>
                <div className="relative mt-4 flex justify-between border-t border-dashed border-night/30 pt-3 font-num text-xs font-semibold"><span>pledged {t.pledged}</span><span>filled {t.filled}</span></div>
              </motion.div>
            ))}
          </div>
        )}
        {tab === 'claims' && (
          <div className="space-y-3">{claims.map((cl) => { const c = coins.find((x) => x.id === cl.coin)!; return (
            <Card key={cl.id} className="flex flex-wrap items-center gap-4 p-4">
              <CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={44} />
              <div className="min-w-0 flex-1"><div className="font-extrabold">{cl.kind === 'refund' ? 'Window claim' : cl.kind === 'vesting' ? 'Vested tokens' : cl.kind === 'fees' ? 'Creator fees' : 'Scout reward'} · ${c.ticker}</div><div className="text-xs font-bold text-lav">{cl.note}{cl.tokens > 0 ? ` · ${fmtCompact(cl.tokens)} tokens` : ''}</div></div>
              <div className="font-num text-lg font-semibold tnum">{cl.amount.toFixed(3)} SOL</div>
              {cl.claimed ? <span className="chip text-mint"><ICheck s={13} /> claimed</span> : <button onClick={() => setClaimId(cl.id)} className="btn-candy px-5 py-2 text-sm">Claim</button>}
            </Card>
          ) })}</div>
        )}
      </div>
      <TxModal open={!!pendingClaim && !pendingClaim.claimed} onClose={() => setClaimId(null)} title="Claim" accent="blue" confirmLabel="Confirm claim"
        rows={pendingClaim ? [{ k: 'Amount', v: `${pendingClaim.amount.toFixed(3)} SOL`, strong: true }, { k: 'Source', v: pendingClaim.kind === 'refund' ? 'Escrow refund' : 'Scout rewards vault' }] : []}
        onConfirm={() => claimId && claim(claimId)} />
    </div>
  )
}
