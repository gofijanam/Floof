import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, GradeBadge, cx, gradeColor } from '../components/ui'
import { PeekMochi } from '../components/ui'
import { CoinAvatar } from '../components/CoinAvatar'
import { IShield, IExplore, ICheck, IX, IGhost } from '../components/icons'
import { useStore } from '../lib/store'
import { Grade } from '../lib/mock'
import {useApi} from '../lib/useApi'
import { short } from '../lib/format'

export default function Truth() {
  const { ca } = useParams()
  const coins = useStore((s) => s.coins)
  const nav = useNavigate()
  const [q, setQ] = useState(ca ?? '')
  const coin = coins.find((c) => c.ca === ca || c.ticker.toLowerCase() === (ca ?? '').toLowerCase().replace('$', ''))
  const result = useApi<any>(ca ? `/truth/${encodeURIComponent(ca)}` : null)
  const report = result.data?.status !== 'unavailable' ? result.data : null
  const nodes = useMemo(() => (report?.clusters?.nodes || []).map((node: any, i: number, list: any[]) => ({...node,x:300+220*Math.cos(i/list.length*Math.PI*2),y:140+100*Math.sin(i/list.length*Math.PI*2),fake:node.linked,r:6})),[report])
  return (
    <div className="relative mx-auto max-w-[1200px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="idle" />
      <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint/15 text-mint"><IShield s={26} /></span><h1 className="h-display text-5xl md:text-6xl">TRUTH</h1></div>
      <p className="mt-2 max-w-2xl font-bold text-lav">Inspect token controls, recorded trades and funding links. Scores are evidence-based heuristics, not a guarantee of safety.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/truth/${encodeURIComponent(q.trim())}`) }} className="glass mt-5 flex items-center gap-2 rounded-full p-2" data-cursor="native">
        <IExplore s={18} className="ml-3 text-lav" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Contract address or $TICKER" className="flex-1 bg-transparent px-2 py-2 font-num text-base outline-none placeholder:text-lav/50" aria-label="Contract address" />
        <button className="btn-candy px-6 py-2.5 text-sm">Check</button>
      </form>
      {result.error && <Card className="mt-4 p-4 text-danger">{result.error}</Card>}
      {ca && !result.data && !result.error && <div className="mt-5 font-bold text-lav">Loading report…</div>}
      {result.data?.status === 'unavailable' && <Card className="mt-5 p-5 font-bold text-lav">{result.data.reason}</Card>}
      {(report?.status === 'insufficient_data'||report?.status === 'partial') && <Card className="mt-5 p-5 font-bold text-lav">Not enough evidence for a grade. {report.reason} No safety conclusion has been made.</Card>}
      {!report ? (
        <div className="mt-8">
          <div className="label mb-3">recently checked</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {coins.slice(9, 16).slice(0, 4).map((c) => (
              <Link key={c.id} to={`/truth/${c.ca}`}><Card className="flex items-center gap-3 p-4 hover:border-mint/40"><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={40} /><div className="flex-1"><div className="font-extrabold">${c.ticker}</div><div className="font-num text-[11px] text-lav tnum">{short(c.ca, 5)}</div></div><GradeBadge g={c.truth.grade} /></Card></Link>
            ))}
          </div>
        </div>
      ) : (
        <motion.div key={ca} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card neon="b" className="p-6 text-center">
            <CoinAvatar hue={report.hue} accessory={report.acc} size={72} className="mx-auto" />
            <div className="mt-2 font-display text-2xl font-extrabold">{report.name}</div>
            <div className="font-num text-xs text-lav tnum">{short(report.ca, 8)}</div>
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.15 }} className="mx-auto mt-5 w-fit"><GradeBadge g={(report.grade||'N/A') as Grade} size="lg" /></motion.div>
            <div className="mt-3 font-num text-lg font-semibold tnum">TRUTH score {report.score==null?'—':`${report.score}/100`}</div>
            <div className="mt-1 text-xs font-bold text-lav">{report.source==='sandbox'?'Sandbox':'Devnet'} activity · {report.sampleSize||0} recorded trades · heuristic only</div>
          </Card>
          <div className="space-y-5" data-cursor="native">
            <Card className="p-5">
              <div className="font-display text-xl font-extrabold">Observed buyer activity</div>
              <div className="mt-4 flex h-6 overflow-hidden rounded-full ring-1 ring-lav/15">
                <motion.div initial={{ width: 0 }} animate={{ width: `${report.realPct}%` }} transition={{ duration: 1 }} className="bg-gradient-to-r from-mint to-blue" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${100 - report.realPct}%` }} transition={{ duration: 1 }} className="bg-danger/80" />
              </div>
              <div className="mt-2 flex justify-between text-sm font-extrabold"><span className="text-mint tnum">{report.grade?report.realPct.toFixed(1):'—'}% unflagged</span><span className="text-danger tnum">{report.grade?(100 - report.realPct).toFixed(1):'—'}% linked</span></div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[['Sybil clusters', report.sybilClusters], ['Wash volume', report.grade?`${report.washPct.toFixed(1)}%`:'Not verified'], ['Bundled at launch', 'Not verified']].map(([k, v]) => <div key={k as string} className="rounded-2xl bg-night/50 p-3"><div className="label">{k}</div><div className="mt-1 font-num text-lg font-semibold tnum">{v}</div></div>)}
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between"><div className="font-display text-xl font-extrabold">Wallet cluster map</div><div className="flex gap-3 text-xs font-bold"><span className="text-mint">● real</span><span className="text-danger">● linked</span></div></div>
              <svg viewBox="0 0 600 280" className="mt-3 w-full">
                {nodes.map((n: any, i: number) => nodes.slice(i + 1).filter((m: any) => report.clusters.edges.some((e: any) => (e.source === n.id && e.target === m.id) || (e.target === n.id && e.source === m.id))).map((m: any, j: number) => <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="#FF6B8B" strokeOpacity=".35" strokeDasharray="3 4" />))}
                {nodes.map((n: any, i: number) => <motion.circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.fake ? '#FF6B8B' : '#7CF5C8'} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.02 }} style={{ filter: `drop-shadow(0 0 6px ${n.fake ? '#FF6B8B' : '#7CF5C8'})` }} />)}
              </svg>
            </Card>
            <Card className="p-5">
              <div className="font-display text-xl font-extrabold">Checks</div>
              <div className="mt-3 space-y-2 text-sm font-bold">
                {(report.checks || []).map((check: any) => [check.ok, check.label]).map(([ok, t]: any[], i: number) => (
                  <div key={i} className="flex items-center gap-2">{ok ? <span className="grid h-5 w-5 place-items-center rounded-full bg-mint text-night"><ICheck s={12} /></span> : <span className="grid h-5 w-5 place-items-center rounded-full bg-danger text-night"><IX s={12} /></span>}<span className={ok ? '' : 'text-danger'}>{t as string}</span></div>
                ))}
              </div>
            </Card>
          </div>
        </motion.div>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-5">
        {(['A+', 'A', 'B', 'C', 'D'] as Grade[]).map((g) => <div key={g} className="rounded-2xl p-3 text-center text-xs font-bold" style={{ background: `${gradeColor(g)}10`, boxShadow: `inset 0 0 0 1px ${gradeColor(g)}33` }}><div className="font-display text-2xl font-extrabold" style={{ color: gradeColor(g) }}>{g}</div>{{ 'N/A': 'Insufficient data', 'A+': '≥97% heuristic score', A: '≥90% real', B: '≥78% real', C: '≥60% real', D: 'mostly fake' }[g]}</div>)}
      </div>
    </div>
  )
}
