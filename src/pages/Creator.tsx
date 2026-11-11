import { motion } from 'framer-motion'
import { useParams } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { CoinCard } from '../components/CoinCard'
import { Card, RepRing } from '../components/ui'
import { creatorBy } from '../lib/mock'
import { toast, useStore, followCreator } from '../lib/store'
import { ILock, IShield, ICheck, IUsers } from '../components/icons'

import {useApi} from '../lib/useApi'

export default function Creator() {
  const { handle = 'mochimaker' } = useParams()
  const c = creatorBy(handle)
  const coins = useStore((s) => s.coins).filter((x) => x.creator === c.handle)
  const detail = useApi<any>(`/creators/${encodeURIComponent(handle)}`)
  const history = detail.data?.history || []
  const following = useStore(s => s.following.includes(handle))

  return (
    <div className="mx-auto max-w-[1300px] px-4 pt-24 md:px-6 md:pt-28">
      <Card neon="p" className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: `hsl(${c.hue} 90% 65%)` }} />
        <div className="relative flex flex-wrap items-center gap-6">
          <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}><CoinAvatar hue={c.hue} accessory={c.accessory} size={128} className="anim-breathe" /></motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="h-display text-5xl">{c.name}</h1><span className="chip text-mint">{c.tier}</span></div>
            <div className="mt-1 font-bold text-lav">@{c.handle} · joined {c.joined} · {c.followers.toLocaleString()} followers</div>
            <p className="mt-3 max-w-xl font-semibold">{c.bio}</p>
            <button onClick={() => followCreator(c.handle)} className="btn-candy mt-4 px-5 py-2.5 text-sm"><IUsers s={16} /> {following ? 'Following' : 'Follow launches'}</button>
          </div>
          <div className="text-center"><RepRing v={c.rep} size={120} stroke={9} /><div className="label mt-2">reputation</div></div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" data-cursor="native">
          {[['Launches', c.launches], ['Graduated', c.graduated], ['Graduation rate', `${c.launches ? Math.round(c.graduated / c.launches * 100) : 0}%`], ['Followers', c.followers], ['Joined', c.joined]].map(([k, v]) => (
            <div key={k as string} className="rounded-2xl bg-night/50 p-4 ring-1 ring-lav/10"><div className="label">{k}</div><div className="mt-1 font-num text-2xl font-semibold tnum">{v}</div></div>
          ))}
        </div>
      </Card>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Launches</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">{coins.map((x) => <CoinCard key={x.id} coin={x} />)}</div>
        </div>
        <Card className="p-5 lg:self-start">
          <div className="flex items-center gap-2 font-display text-xl font-extrabold"><IShield s={18} className="text-mint" /> Launch history</div>
          <div className="relative mt-4 space-y-4 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-lav/20">
            {history.map((h: any, i: number) => (
              <div key={i} className="relative">
                <span className="absolute -left-6 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-mint text-night"><ICheck s={10} /></span>
                <div className="flex justify-between gap-2 text-sm font-extrabold"><span>{h.t}</span><span className="font-num text-mint tnum">{h.v}</span></div>
                <div className="text-xs font-bold text-lav">{h.d}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-blue/10 p-3 text-xs font-extrabold text-blue ring-1 ring-blue/20"><ILock s={14} /> Reputation is computed from recorded launches and graduations. It is not an on-chain risk rating.</div>
        </Card>
      </div>
    </div>
  )
}
