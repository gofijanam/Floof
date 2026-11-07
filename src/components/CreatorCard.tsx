import { Link } from 'react-router-dom'
import { creatorBy } from '../lib/mock'
import { CoinAvatar } from './CoinAvatar'
import { Card, RepRing } from './ui'
import { ILock, IShield } from './icons'

export function CreatorCard({ handle, bond, lockDays }: { handle: string; bond: number; lockDays: number }) {
  const c = creatorBy(handle)
  return (
    <Card className="p-5">
      <div className="label">creator</div>
      <Link to={`/creator/${c.handle}`} className="mt-3 flex items-center gap-3 group">
        <CoinAvatar hue={c.hue} accessory={c.accessory} size={52} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-extrabold group-hover:text-pink">{c.name}</div>
          <div className="text-xs font-bold text-lav">@{c.handle} · {c.tier}</div>
        </div>
        <RepRing v={c.rep} />
      </Link>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-night/50 p-2"><div className="font-num font-semibold tnum">{c.launches}</div><div className="text-[10px] font-extrabold text-lav">launches</div></div>
        <div className="rounded-2xl bg-night/50 p-2"><div className="font-num font-semibold text-mint tnum">{c.graduated}</div><div className="text-[10px] font-extrabold text-lav">graduated</div></div>
        <div className="rounded-2xl bg-night/50 p-2"><div className="font-num font-semibold tnum">{c.bondsReturned}/{c.bondsPosted}</div><div className="text-[10px] font-extrabold text-lav">bonds back</div></div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-blue/10 px-3 py-2 text-xs font-extrabold text-blue ring-1 ring-blue/20"><ILock s={14} /> {bond} SOL bond locked · creator tokens vest {lockDays}d</div>
      {c.rugs === 0 && <div className="mt-2 flex items-center gap-2 px-1 text-xs font-bold text-mint"><IShield s={14} /> No rugs, no bond slashes on record</div>}
    </Card>
  )
}
