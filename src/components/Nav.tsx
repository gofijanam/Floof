import { motion, AnimatePresence } from 'framer-motion'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { connectWallet, disconnectWallet, useStore, linkWallet } from '../lib/store'
import { sound } from '../lib/audio'
import { useSound } from '../lib/useSound'
import { cx, Magnetic } from './ui'
import { IExplore, ICreate, IWallet, ITrophy, IShield, IHome, ISound, IBook } from './icons'

export const NAV = [
  { to: '/explore', label: 'Explore', n: 1, icon: IExplore },
  { to: '/create', label: 'Create', n: 2, icon: ICreate },
  { to: '/portfolio', label: 'Portfolio', n: 3, icon: IWallet },
  { to: '/scouts', label: 'Scouts', n: 4, icon: ITrophy },
  { to: '/truth', label: 'TRUTH', n: 5, icon: IShield },
  { to: '/docs', label: 'Docs', n: 6, icon: IBook },
]

export function SoundToggle() {
  const on = useSound()
  return (
    <button onClick={() => sound.toggle()} aria-label={on ? 'Mute sound' : 'Enable sound'} aria-pressed={on} className={cx('grid h-10 w-10 place-items-center rounded-full border transition', on ? 'border-pink/50 bg-pink/15 text-pink' : 'border-lav/20 bg-plum/60 text-lav hover:text-cream')}>
      <ISound on={on} s={18} />
    </button>
  )
}

export function WalletButton({ compact }: { compact?: boolean }) {
  const wallet = useStore((s) => s.wallet), connecting = useStore((s) => s.connecting), sol = useStore((s) => s.sol)
  const address = useStore(s => s.walletAddress)
  const devnet = useStore(s => s.mode==='devnet')
  const [open, setOpen] = useState(false)
  if (!wallet) return (
    <Magnetic strength={0.25}>
      <button onClick={connectWallet} className={cx('btn-candy sheen', compact ? 'px-4 py-2 text-sm' : 'px-5 py-2.5 text-sm')}>
        {connecting ? <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-night/30 border-t-night" />Connecting</span> : <><IWallet s={16} />{devnet ? 'Connect wallet' : compact ? 'Sandbox' : 'Open sandbox'}</>}
      </button>
    </Magnetic>
  )
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-lav/25 bg-plum/70 py-1.5 pl-1.5 pr-3 text-sm font-extrabold hover:border-pink/50">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue to-pink text-[10px] text-night">{address.slice(0,2) || 'sf'}</span>
        <span className="tnum">{sol.toFixed(2)} <span className="text-lav">SOL</span></span>
        {!compact && <span className="text-lav/70">{address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'sandbox'}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }} className="glass-strong absolute right-0 top-12 z-50 w-56 rounded-2xl p-2 text-sm font-bold">
            <div className="px-3 py-2 text-xs text-lav">{devnet ? 'Solana Devnet · test SOL' : 'Sandbox · test SOL'}</div>
            <Link to="/portfolio" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 hover:bg-lav/10">Portfolio & rewards</Link>
            <button onClick={() => { linkWallet(); setOpen(false) }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-lav/10">Link Phantom wallet</button>
            <button onClick={() => { disconnectWallet(); setOpen(false) }} className="block w-full rounded-xl px-3 py-2 text-left text-danger hover:bg-danger/10">Disconnect</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CASearch() {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/truth/${encodeURIComponent(q.trim())}`) }} className="relative hidden xl:block" data-cursor="native">
      <IExplore s={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lav/60" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TRUTH-check any CA" className="h-10 w-56 rounded-full border border-lav/20 bg-night/60 pl-9 pr-3 text-sm font-bold outline-none placeholder:text-lav/50 focus:border-blue/60" />
    </form>
  )
}

export function Nav() {
  const mode=useStore(s=>s.mode)
  const loc = useLocation()
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto mt-3 flex max-w-[1400px] items-center gap-3 px-3 md:px-6">
        <div className="glass flex h-14 flex-1 items-center gap-2 rounded-full pl-3 pr-2 md:gap-4 md:pl-4">
          <Link to="/" className="group flex shrink-0 items-center gap-2" aria-label="floof.fun home">
            <img src="./logo/floof-mark-mochi.svg" alt="" className="h-9 w-9 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
            <img src="./logo/floof-wordmark-cream.svg" alt="floof.fun" className="hidden h-7 sm:block" />
          </Link>
          <span className="hidden rounded-full bg-blue/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue ring-1 ring-blue/30 sm:inline">{mode==='devnet'?'devnet':'sandbox'}</span>
          <nav className="ml-2 hidden items-center lg:flex">
            {NAV.map((n) => {
              const active = loc.pathname.startsWith(n.to)
              return (
                <NavLink key={n.to} to={n.to} className={cx('relative rounded-full px-3 py-2 text-sm font-extrabold transition-colors', active ? 'text-cream' : 'text-lav hover:text-cream')}>
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-lav/15 ring-1 ring-lav/25" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <span className="relative"><span className="mr-0.5 font-num text-[10px] text-pink">.{n.n}</span>{n.label}</span>
                </NavLink>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <CASearch />
            <SoundToggle />
            <div className="hidden sm:block"><WalletButton /></div>
            <div className="sm:hidden"><WalletButton compact /></div>
          </div>
        </div>
      </div>
    </header>
  )
}

export function MobileDock() {
  const loc = useLocation()
  const items = [{ to: '/', label: 'Home', icon: IHome }, ...NAV.slice(0, 4)]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden" aria-label="Primary">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-between rounded-full p-1.5 shadow-card">
        {items.map((n) => {
          const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-extrabold">
              {active && <motion.span layoutId="dock-bubble" className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg,rgba(255,95,184,.25),rgba(182,156,255,.12))', boxShadow: 'inset 0 0 0 1px rgba(255,95,184,.4)' }} transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
              <motion.span whileTap={{ scale: 0.8 }} className={cx('relative', active ? 'text-pink' : 'text-lav')}><Icon s={20} /></motion.span>
              <span className={cx('relative', active ? 'text-cream' : 'text-lav/80')}>{n.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
