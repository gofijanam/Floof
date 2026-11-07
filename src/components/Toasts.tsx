import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { dismissToast, useStore, getState } from '../lib/store'
import { CoinAvatar } from './CoinAvatar'
import { IShield, ICheck, ISparkle } from './icons'

export function Toasts() {
  const all = useStore((s) => s.toasts)
  // ambient social-proof toasts are desktop-only; on phones only your own actions toast
  const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  const toasts = small ? all.filter((t) => !t.ambient).slice(-2) : all
  return (
    <div className="pointer-events-none fixed bottom-[92px] left-1/2 z-[60] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const coin = t.coin ? getState().coins.find((c) => c.id === t.coin) : undefined
          const accent = t.kind === 'poof' ? '#FF5FB8' : t.kind === 'blocked' ? '#FFB86B' : t.kind === 'success' ? '#7CF5C8' : '#5FD4FF'
          const href = coin ? (coin.status === 'open' || coin.status === 'upcoming' ? `/coin/${coin.id}` : `/trade/${coin.id}`) : undefined
          const inner = (
            <div className="glass-strong flex items-center gap-3 rounded-2xl p-3 pr-4" style={{ boxShadow: `0 0 0 1px ${accent}40, 0 20px 40px -16px ${accent}66` }}>
              <div className="relative shrink-0">
                {coin ? <CoinAvatar hue={coin.hue} accessory={coin.accessory} size={40} mood={t.kind === 'poof' ? 'happy' : 'idle'} /> : (
                  <div className="grid h-10 w-10 place-items-center rounded-full" style={{ background: `${accent}22`, color: accent }}>{t.kind === 'success' ? <ICheck s={18} /> : t.kind === 'blocked' ? <IShield s={18} /> : <ISparkle s={18} />}</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold">{t.title}</div>
                {t.body && <div className="truncate text-xs font-semibold text-lav">{t.body}</div>}
              </div>
            </div>
          )
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.9 }} transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="pointer-events-auto" onClick={() => dismissToast(t.id)}>
              {href ? <Link to={href}>{inner}</Link> : inner}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
