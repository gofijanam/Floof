import { motion } from 'framer-motion'
import { CoinAvatar } from '../components/CoinAvatar'
import { Card, cx, PeekMochi } from '../components/ui'
import {useStore} from '../lib/store'
import { ITrophy } from '../components/icons'

export default function Scouts() {
  const SCOUTS = useStore(s => s.scouts)
  const me = SCOUTS.find(s => s.me)
  const ME = {scoutRank:me?.rank || '—',scoutPoints:me?.points || 0}
  const top = SCOUTS.slice(0, 3)
  const order = [top[1], top[0], top[2]].filter(Boolean)
  return (
    <div className="relative mx-auto max-w-[1200px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="puffed" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="h-display text-5xl md:text-6xl">Scout leaderboard</h1><p className="mt-2 max-w-xl font-bold text-lav">Scouts join windows early, hold through the curve and get rewarded from the platform fee. Sandbox season · recorded activity.</p></div>
        <div className="chip py-2 text-pink"><ITrophy s={14} /> You: #{ME.scoutRank} · {ME.scoutPoints.toLocaleString()} pts</div>
      </div>
      {!SCOUTS.length && <Card className="mt-8 p-6 text-center font-bold text-lav">No Scouts yet. Join a window to start earning points.</Card>}
      <div className="mt-10 grid grid-cols-3 items-end gap-2 md:gap-5">
        {order.map((s, i) => {
          const place = s.rank
          const h = place === 1 ? 'h-44 md:h-56' : place === 2 ? 'h-32 md:h-40' : 'h-24 md:h-32'
          return (
            <motion.div key={s.rank} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * place, type: 'spring', stiffness: 160, damping: 16 }} className="text-center">
              <CoinAvatar hue={s.hue} accessory={place === 1 ? 'crown' : s.accessory} size={place === 1 ? 96 : 72} mood="happy" className={cx('mx-auto', place === 1 && 'anim-floaty')} />
              <div className="mt-1 truncate font-extrabold">{s.wallet}</div>
              <div className="font-num text-sm text-lav tnum">{s.points.toLocaleString()} pts</div>
              <div className={cx('mt-2 grid place-items-center rounded-t-3xl font-display text-5xl font-extrabold', h)} style={{ background: place === 1 ? 'linear-gradient(180deg,rgba(255,95,184,.5),rgba(255,95,184,.05))' : place === 2 ? 'linear-gradient(180deg,rgba(95,212,255,.4),rgba(95,212,255,.04))' : 'linear-gradient(180deg,rgba(182,156,255,.4),rgba(182,156,255,.04))' }}>{place}</div>
            </motion.div>
          )
        })}
      </div>
      <Card className="mt-0 overflow-x-auto rounded-t-none" data-cursor="native">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="text-left text-[11px] font-black uppercase tracking-wider text-lav/60">{['Rank', 'Scout', 'Points', 'Windows joined', 'Avg hold', 'Earned'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>{SCOUTS.slice(3).map((s) => (
            <tr key={s.rank} className={cx('border-t border-lav/10 font-bold', s.me && 'bg-pink/10')}>
              <td className="px-4 py-2.5 font-num text-lav tnum">#{s.rank}</td>
              <td className="px-4"><div className="flex items-center gap-2"><CoinAvatar hue={s.hue} accessory={s.accessory} size={28} /><span className={s.me ? 'text-pink' : ''}>{s.wallet}</span></div></td>
              <td className="px-4 font-num tnum">{s.points.toLocaleString()}</td>
              <td className="px-4 font-num tnum">{s.windows}</td>
              <td className="px-4 font-num tnum">{s.hold}%</td>
              <td className="px-4 font-num text-mint tnum">{s.earned} SOL</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {[['Join early', 'Pledge in the first 3 minutes of a window: 2× points.'], ['Hold through', 'Points accrue while you hold through the LaunchLab curve.'], ['Graduate bonus', 'Coins that graduate to CPMM pay a Scout bonus from the 0.5% platform fee.']].map(([t, d]) => <Card key={t} className="p-5"><div className="font-display text-xl font-extrabold">{t}</div><p className="mt-1 text-sm font-semibold text-lav">{d}</p></Card>)}
      </div>
    </div>
  )
}
