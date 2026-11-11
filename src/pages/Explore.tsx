import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoinCard, coinHref } from '../components/CoinCard'
import { CoinAvatar } from '../components/CoinAvatar'
import { Tabs, GradeBadge, cx, Countdown, MiniMeter, LiveDot } from '../components/ui'
import { PeekMochi } from '../components/ui'
import { IExplore, IFilter, ICreate } from '../components/icons'
import { useStore } from '../lib/store'
import { creatorBy, Coin, CoinStatus, Grade, maxRaise, SUPPLY, graduationOf } from '../lib/mock'
import { fmtPrice, fmtUsd, hms, SOL_USD } from '../lib/format'

const GRADES: (Grade | 'any')[] = ['any', 'A+', 'A', 'B', 'C']
const RANK: Record<Grade, number> = { 'N/A': 0, 'A+': 5, A: 4, B: 3, C: 2, D: 1 }
type Sort = 'hot' | 'ending' | 'pledged' | 'new' | 'mcap' | 'change'
const SORTS: { v: Sort; l: string }[] = [{ v: 'hot', l: 'Trending' }, { v: 'ending', l: 'Ending soon' }, { v: 'pledged', l: 'Most pledged' }, { v: 'new', l: 'Newest' }, { v: 'mcap', l: 'Market cap' }, { v: 'change', l: '24h change' }]

export default function Explore() {
  const coins = useStore((s) => s.coins)
  const now = useStore((s) => s.now)
  const [tab, setTab] = useState<CoinStatus>('open')
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState<Grade | 'any'>('any')
  const [rep, setRep] = useState(0)
  const [sort, setSort] = useState<Sort>('hot')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const counts = useMemo(() => ({ open: 0, upcoming: 0, curve: 0, graduated: 0, ...Object.fromEntries((['open', 'upcoming', 'curve', 'graduated'] as const).map((s) => [s, coins.filter((c) => c.status === s).length])) }), [coins])
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const r = coins.filter((c) => c.status === tab)
      .filter((c) => !ql || c.ticker.toLowerCase().includes(ql.replace('$', '')) || c.name.toLowerCase().includes(ql) || c.ca.toLowerCase().includes(ql) || c.creator.includes(ql))
      .filter((c) => grade === 'any' || RANK[c.truth.grade] >= RANK[grade])
      .filter((c) => creatorBy(c.creator).rep >= rep)
    const key: Record<Sort, (c: Coin) => number> = {
      hot: (c) => -(c.pledged + c.volume24h / 1000 + c.truth.score), ending: (c) => c.windowEnd, pledged: (c) => -c.pledged, new: (c) => c.createdAgo,
      mcap: (c) => -c.price, change: (c) => -c.change24h,
    }
    return [...r].sort((a, b) => key[sort](a) - key[sort](b))
  }, [coins, tab, q, grade, rep, sort])
  const totalEscrow = coins.filter((c) => c.status === 'open').reduce((a, c) => a + c.pledged, 0)
  return (
    <div className="relative mx-auto max-w-[1400px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="idle" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-display text-5xl md:text-6xl">Explore</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-lav">
            <span className="flex items-center gap-1.5"><LiveDot /> {counts.open} windows live</span>
            <span className="tnum">{totalEscrow.toFixed(1)} SOL in escrow</span>
            <span>{counts.upcoming} opening soon</span>
          </div>
        </div>
        <Link to="/create" className="btn-candy px-5 py-2.5 text-sm"><ICreate s={16} /> Launch a coin</Link>
      </div>

      {/* controls */}
      <div className="glass mt-6 flex flex-col gap-3 rounded-3xl p-3 lg:flex-row lg:items-center" data-cursor="native">
        <div className="-mx-1 overflow-x-auto px-1"><Tabs id="explore" value={tab} onChange={setTab} items={[{ v: 'open', label: 'Open window', count: counts.open }, { v: 'upcoming', label: 'Upcoming', count: counts.upcoming }, { v: 'curve', label: 'On curve', count: counts.curve }, { v: 'graduated', label: 'Graduated', count: counts.graduated }]} /></div>
        <div className="relative flex-1">
          <IExplore s={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lav/60" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker, name, creator or CA" className="input h-11 rounded-full py-2 pl-10 text-sm" aria-label="Search coins" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-11 rounded-full border border-lav/20 bg-night/70 px-4 text-sm font-extrabold text-cream outline-none" aria-label="Sort">
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <div className="flex rounded-full bg-night/60 p-1 ring-1 ring-lav/15">
            {(['grid', 'list'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx('rounded-full px-3 py-1.5 text-xs font-extrabold capitalize', view === v ? 'bg-lav/20 text-cream' : 'text-lav')}>{v}</button>)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 px-1 text-xs font-extrabold text-lav" data-cursor="native">
        <span className="flex items-center gap-1.5"><IFilter s={14} /> Filters</span>
        <div className="flex items-center gap-1.5">
          <span>TRUTH ≥</span>
          {GRADES.map((g) => <button key={g} onClick={() => setGrade(g)} className={cx('rounded-full px-2.5 py-1 ring-1 transition', grade === g ? 'bg-mint/15 text-mint ring-mint/40' : 'ring-lav/20 hover:text-cream')}>{g === 'any' ? 'Any' : g}</button>)}
        </div>
        <label className="flex items-center gap-2">
          <span>Creator rep ≥ <span className="font-num text-cream tnum">{rep}</span></span>
          <input type="range" min={0} max={95} step={5} value={rep} onChange={(e) => setRep(+e.target.value)} className="w-32 accent-pink" />
        </label>
        {(grade !== 'any' || rep > 0 || q) && <button onClick={() => { setGrade('any'); setRep(0); setQ('') }} className="text-pink hover:underline">Reset</button>}
        <span className="ml-auto text-lav/70 tnum">{list.length} result{list.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-5">
        {list.length === 0 ? (
          <div className="glass grid place-items-center rounded-3xl py-20 text-center">
            <img src="./mochi/sleepy-512.webp" alt="" className="w-36 anim-breathe" />
            <div className="mt-3 font-display text-2xl font-extrabold">No floofs match</div>
            <div className="text-sm font-bold text-lav">Try lowering the TRUTH or rep filter.</div>
          </div>
        ) : view === 'grid' ? (
          <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">{list.map((c) => <CoinCard key={c.id} coin={c} />)}</AnimatePresence>
          </motion.div>
        ) : <ListView list={list} now={now} />}
      </div>
    </div>
  )
}

function ListView({ list, now }: { list: Coin[]; now: number }) {
  const nav = useNavigate()
  return (
    <div className="glass overflow-x-auto rounded-3xl" data-cursor="native">
      <table className="w-full min-w-[860px] text-sm">
        <thead><tr className="text-left text-[11px] font-black uppercase tracking-wider text-lav/70">
          {['Coin', 'Status', 'Escrow / Mcap', 'Ceiling / Price', 'Progress', 'TRUTH', 'Creator', 'Bond'].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}
        </tr></thead>
        <tbody>
          {list.map((c) => {
            const cr = creatorBy(c.creator)
            const pre = c.status === 'open' || c.status === 'upcoming'
            return (
              <tr key={c.id} onClick={() => nav(coinHref(c))} className="cursor-pointer border-t border-lav/10 font-bold transition hover:bg-lav/5">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><CoinAvatar image={c.image} hue={c.hue} accessory={c.accessory} size={36} /><div><div className="font-extrabold">${c.ticker}</div><div className="text-xs text-lav">{c.name}</div></div></div></td>
                <td className="px-4 py-3 tnum">{c.status === 'open' ? <Countdown ms={c.windowEnd - now} size="sm" /> : c.status === 'upcoming' ? <span className="text-blue">in {hms(c.windowStart - now)}</span> : c.status === 'curve' ? <span className="text-pink">On curve</span> : <span className="text-lav">CPMM</span>}</td>
                <td className="px-4 py-3 font-num tnum">{pre ? `${c.pledged.toFixed(1)} / ${maxRaise(c).toFixed(0)} SOL` : fmtUsd(c.price * SUPPLY * SOL_USD)}</td>
                <td className="px-4 py-3 font-num tnum">{fmtPrice(pre ? c.priceCeiling : c.price)}</td>
                <td className="w-40 px-4 py-3">{c.status === 'open' ? <MiniMeter coin={c} /> : <div className="h-2 rounded-full bg-night"><div className="h-full rounded-full bg-gradient-to-r from-lav to-pink" style={{ width: `${(c.curveSol / graduationOf(c)) * 100}%` }} /></div>}</td>
                <td className="px-4 py-3"><GradeBadge g={c.truth.grade} /></td>
                <td className="px-4 py-3 text-xs">@{cr.handle} <span className="text-mint tnum">{cr.rep}</span></td>
                <td className="px-4 py-3 font-num text-blue tnum">{c.bondSol} SOL</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
