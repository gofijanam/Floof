import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ICheck, IX } from './icons'
import { useStore } from '../lib/store'
import { short } from '../lib/format'

export interface TxRow { k: string; v: ReactNode; strong?: boolean }
/** Review → sign (mock) → confirmed. Shared by pledge, buy/sell, create, claim. */
export function TxModal({ open, title, rows, note, confirmLabel = 'Confirm', onConfirm, onClose, accent = 'pink' }:
  { open: boolean; title: string; rows: TxRow[]; note?: ReactNode; confirmLabel?: string; onConfirm: () => unknown | Promise<unknown>; onClose: () => void; accent?: 'pink' | 'blue' | 'mint' }) {
  const devnet=useStore(s=>s.mode==='devnet')
  const [phase, setPhase] = useState<'review' | 'signing' | 'done'>('review')
  const [sig, setSig] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setPhase('review'); setError('') } }, [open])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'signing') onClose() }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [open, phase, onClose])
  const go = async () => {
    setPhase('signing'); setError('')
    try { const result = await onConfirm() as any; setSig(result?.signature || result?.receipt || 'Saved'); setPhase('done') }
    catch (e) { setError((e as Error).message || 'Action failed. Please retry.'); setPhase('review') }
  }
  const btn = accent === 'blue' ? 'btn-ice' : accent === 'mint' ? 'btn-ice' : 'btn-candy'
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-end bg-night/70 backdrop-blur-sm sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => phase !== 'signing' && onClose()} data-cursor="native">
          <motion.div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="glass-strong w-full rounded-t-[2rem] p-5 sm:w-[440px] sm:rounded-[2rem] sm:p-6"
            initial={{ y: 40, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl font-extrabold">{phase === 'done' ? 'Confirmed' : title}</div>
              {phase !== 'signing' && <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-lav/10 text-lav hover:text-cream" aria-label="Close"><IX s={16} /></button>}
            </div>
            {phase === 'done' ? (
              <div className="py-6 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint text-night"><ICheck s={30} /></motion.div>
                <div className="mt-3 font-bold text-lav">{devnet?'Finalized on Solana Devnet':'Saved to your sandbox account'}</div>
                <div className="mt-1 font-num text-xs text-lav/70 tnum">receipt {short(sig, 8)}</div>
                <button onClick={onClose} className="btn-ghost mt-5 w-full py-3">Done</button>
              </div>
            ) : (
              <>
                <div className="mt-4 divide-y divide-lav/10 rounded-2xl bg-night/50 ring-1 ring-lav/10">
                  {rows.map((r) => (
                    <div key={r.k} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="font-bold text-lav">{r.k}</span><span className={r.strong ? 'font-num text-base font-semibold text-cream tnum' : 'font-num font-medium tnum'}>{r.v}</span></div>
                  ))}
                </div>
                <div className="mt-3 text-xs font-bold text-blue">{devnet?'Devnet transaction · review and sign in your wallet. Test SOL only.':'Sandbox transaction · test balances only. No on-chain transfer.'}</div>
                {error && <div role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{error}</div>}
                {note && <div className="mt-3 text-xs font-bold text-lav/80">{note}</div>}
                <button disabled={phase === 'signing'} onClick={go} className={`${btn} mt-5 w-full py-3.5 text-base disabled:opacity-80`}>
                  {phase === 'signing' ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-night/30 border-t-night" />Saving securely…</span> : confirmLabel}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
