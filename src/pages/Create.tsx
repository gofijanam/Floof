import { AnimatePresence, motion } from 'framer-motion'
import { Children, cloneElement, isValidElement, useId, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoinAvatar } from '../components/CoinAvatar'
import { CoinCard } from '../components/CoinCard'
import { TxModal } from '../components/TxModal'
import { Card, cx } from '../components/ui'
import { PeekMochi } from '../components/ui'
import { confetti } from '../components/confetti'
import { ICheck, ILock, IUpload, IShield, IArrow, IBack } from '../components/icons'
import { addCoin, connectWallet, getState, toast, useStore } from '../lib/store'
import { Accessory, Coin, FEES, SUPPLY } from '../lib/mock'
import { fmtPrice } from '../lib/format'
import { api, uploadImage } from '../lib/api'
import { firstBuyQuote, MAX_FIRST_BUY, MIN_FIRST_BUY, SELL, MIN_WINDOW_SECS, MAX_WINDOW_SECS, DEFAULT_WINDOW_SECS, MAX_LOCK_DAYS, QUOTES } from '../../server/launchlab-curve.mjs'

const MAX_BUY_SOL = Number(MAX_FIRST_BUY) / 1e9, MIN_BUY_SOL = Number(MIN_FIRST_BUY) / 1e9
const toLamports = (sol: number) => BigInt(Math.round((Number.isFinite(sol) && sol > 0 ? sol : 0) * 1e9))

const STEPS = ['Details', 'Fair window', 'Dev buy & pair', 'Review']
const MIN_WIN = MIN_WINDOW_SECS / 60, MAX_WIN = MAX_WINDOW_SECS / 60
const LOCK_STOPS = [0, 7, 14, 30, 60, 90, 180, MAX_LOCK_DAYS]
const fmtSol = (n: number) => (Math.round(n * 100) / 100).toString()

interface Form {
  name: string; ticker: string; desc: string; image: string | null; hue: number; acc: Accessory; x: string; tg: string; web: string
  durationMin: number; maxRaise: string; creatorBuy: string; minTarget: string; walletAge: boolean; balHistory: boolean
  creatorPct: number; lockDays: number; quote: string
}
const init: Form = { name: '', ticker: '', desc: '', image: null, hue: 200, acc: 'none', x: '', tg: '', web: '', durationMin: DEFAULT_WINDOW_SECS / 60, maxRaise: '40', creatorBuy: '0', minTarget: '20', walletAge: true, balHistory: false, creatorPct: 2, lockDays: 90, quote: 'SOL' }

export default function Create() {
  const [f, setF] = useState<Form>(init)
  const [step, setStep] = useState(0)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const wallet = useStore((s) => s.wallet)
  const devnet=useStore(s=>s.mode==='devnet')
  const reserve=devnet?0.1:0
  const bal = useStore((s) => s.sol)
  const nav = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftRevision, setDraftRevision] = useState(0)
  const [draftNote, setDraftNote] = useState('')
  const [checked, setChecked] = useState(false)
  useEffect(() => { if(!wallet){setDraftReady(true);setDraftNote('Connect your wallet to save and restore drafts.');return} let active = true; setDraftReady(false); api('/drafts/launch').then(d => {
    if (!active) return
    if (d.form) { setF({ ...init, ...d.form }); setDraftNote('Saved draft restored') }
    setDraftRevision(d.revision)
  }).catch(() => { if (active) setDraftNote('Draft storage unavailable. You can still create a launch.') }).finally(() => { if (active) setDraftReady(true) }); return () => { active = false } }, [wallet])
  const saveDraft = async () => { setSaving(true); try {
    const result = await api('/drafts/launch', { form: f, revision: draftRevision })
    setDraftRevision(result.revision); setDraftNote('Draft saved. Come back whenever you’re ready.')
  } catch (e: any) { setDraftNote(e.message) } finally { setSaving(false) } }
  const upload = async (file?: File) => {
    if (!file) return
    if (file.size > 4 * 1024 * 1024 || !['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) {
      toast({ kind: 'info', title: 'Choose a token image', body: 'Use PNG, JPG, GIF or WebP up to 4 MB.' }); return
    }
    setUploading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file) })
      const image = await uploadImage(data); setF(p => ({ ...p, image }))
    } catch (e: any) { toast({ kind: 'info', title: 'Image upload failed', body: e.message || 'Choose the file again.' }) } finally { setUploading(false) }
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  // Live numbers from the standard Raydium LaunchLab curve (same integer math and constants as the program).
  const maxRaise = parseFloat(f.maxRaise) || 0
  const creatorBuy = parseFloat(f.creatorBuy) || 0
  const curve = useMemo(() => { try { return firstBuyQuote({ raise: toLamports(maxRaise), creatorBuy: toLamports(creatorBuy), locked: BigInt(Math.round(SUPPLY * f.creatorPct / 100 * 1e6)) }) } catch { return null } }, [maxRaise, creatorBuy, f.creatorPct])
  const windowTokens = curve ? Number(curve.windowTokens) / 1e6 : 0
  const ceiling = curve ? curve.avgPrice : 0
  const minT = parseFloat(f.minTarget) || 0
  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (f.name.trim().length < 2) e.name = 'Name needs at least 2 characters'
    if (!/^[A-Z0-9]{2,10}$/.test(f.ticker)) e.ticker = '2–10 letters or digits'
    else if (getState().coins.some((c) => c.ticker === f.ticker)) e.ticker = `$${f.ticker} already exists`
    if (f.desc.length > 160) e.desc = 'Max 160 characters'
    const url = /^https?:\/\/[^\s.]+\.[^\s]+$/
    if (f.web && (!url.test(f.web) || !f.web.startsWith('https://') || /@/.test(f.web))) e.web = 'Enter a public HTTPS website URL'
    if (f.x && !/^@?[A-Za-z0-9_]{1,15}$/.test(f.x)) e.x = 'Invalid X handle'
    if (f.tg && !/^(?:https:\/\/)?t\.me\/(?:[A-Za-z0-9_]{5,32}|\+[A-Za-z0-9_-]{5,})$/.test(f.tg)) e.tg = 'Use t.me/yourchannel or an invite link'
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(f.maxRaise)) e.maxRaise = 'Enter the presale size in SOL (0 for none)'
    else if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(f.creatorBuy)) e.creatorBuy = 'Enter your buy in SOL (0 for none)'
    else if (maxRaise + creatorBuy < MIN_BUY_SOL) e.maxRaise = `Presale + your buy must be at least ${MIN_BUY_SOL} SOL`
    else if (maxRaise + creatorBuy > MAX_BUY_SOL) e.maxRaise = `Presale + your buy cannot exceed ${MAX_BUY_SOL} SOL (the whole curve)`
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(f.minTarget) || (maxRaise > 0 && !(minT > 0))) e.minTarget = 'Enter a min target'
    else if (maxRaise === 0 && minT !== 0) e.minTarget = 'No presale: min target must be 0'
    else if (minT < maxRaise * 0.1) e.minTarget = `At least 10% of max raise (${(maxRaise * 0.1).toFixed(1)} SOL)`
    else if (minT > maxRaise) e.minTarget = 'Cannot exceed max raise'
    if (!(Number.isInteger(f.durationMin) && f.durationMin >= MIN_WIN && f.durationMin <= MAX_WIN)) e.durationMin = `Choose ${MIN_WIN}–${MAX_WIN} minutes`
    if (f.creatorPct > 0 && f.lockDays < 30) e.lockDays = 'A creator allocation needs a lock of at least 30 days'
    if (!QUOTES.some((q) => q.symbol === f.quote && q.live)) e.quote = 'Only SOL pairs are live right now'
    if (wallet && !e.creatorBuy && 0.02 + reserve + creatorBuy > bal) e.creatorBuy = 'Not enough test SOL for the fee, reserve and your dev buy'
    return e
  }, [f, maxRaise, creatorBuy, minT, bal, wallet, reserve])
  const stepFields = [['name', 'ticker', 'desc', 'web', 'x', 'tg'], ['durationMin', 'maxRaise', 'minTarget'], ['creatorBuy', 'lockDays', 'quote'], []]
  const stepOk = (i: number) => stepFields[i].every((k) => !errors[k])
  const next = () => { setTouched(true); setChecked(false); if (stepOk(step)) { setStep((s) => Math.min(3, s + 1)); setTouched(false) } }
  const err = (k: string) => (touched || (f as any)[k]) && errors[k]
  const preview: Coin = useMemo(() => {
    const now = Date.now()
    return {
      id: 'preview', ticker: f.ticker || 'TICKER', name: f.name || 'Your coin', tagline: f.desc, hue: f.hue, accessory: f.acc, creator: 'newfloof', status: 'open', ca: 'pending',
      windowStart: now, windowEnd: now + f.durationMin * 60e3, durationMs: f.durationMin * 60e3, priceCeiling: ceiling, windowTokens, minTarget: minT, graduationTarget: curve?.graduationSol ?? 0,
      pledged: 0, pledgers: 0, lockDays: f.lockDays, quote: f.quote, clearingPrice: 0, price: 0, change24h: 0, volume24h: 0, curveSol: 0, holders: 0, snipersBlocked: 0,
      truth: { grade: 'N/A', score: 0, realPct: 0, sybilClusters: 0, washPct: 0 }, createdAgo: 0, tags: [],
    }
  }, [f, ceiling, windowTokens, minT, curve])
  const create = async () => {
    const result = await addCoin(f)
    try { const d = await api('/drafts/launch', { form: null, revision: draftRevision }); setDraftRevision(d.revision) } catch {}
    setOpen(false); setDone(result.coin); confetti({ n: 140 }); return result
  }
  if (done) return (
    <div className="mx-auto max-w-xl px-4 pt-32 text-center">
      <motion.div initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="relative mx-auto w-fit"><img src="./mochi/happy.webp" alt="" className="w-56" /><div className="absolute -bottom-2 -right-6 rounded-full bg-night/60 p-1 ring-2 ring-pink/50"><CoinAvatar image={f.image || undefined} hue={f.hue} accessory={f.acc} size={72} mood="happy" /></div></motion.div>
      <h1 className="h-display mt-4 text-5xl">${f.ticker} is live!</h1>
      <p className="mt-3 font-bold text-lav">Your fair window is open now for {f.durationMin} minutes. Share the link and gather your floofs.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => nav(`/coin/${done}`)} className="btn-candy">Open coin page <IArrow s={16} /></button><button onClick={() => { setF(init); setStep(0); setDone(null); setChecked(false); setDraftNote('') }} className="btn-ghost">Create another</button></div>
    </div>
  )
  return (
    <div className="relative mx-auto max-w-[1200px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="countdown" />
      <h1 className="h-display text-5xl md:text-6xl">Launch a coin</h1>
      <p className="mt-2 font-bold text-lav">Set up your coin, its fair window and your dev buy. Snipers not invited.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-lav">
        <span role="status">{draftNote || 'Your logo, your token. Launch settings are fixed after creation.'}</span>
        <button className="btn-ghost !px-3 !py-2 !text-xs" onClick={saveDraft} disabled={!wallet || saving || uploading || !draftReady}>{saving ? 'Saving…' : 'Save draft'}</button>
      </div>
      {/* stepper */}
      <div className="mt-6 flex gap-2" role="list">
        {STEPS.map((s, i) => (
          <button key={s} aria-label={`Step ${i + 1}: ${s}`} aria-current={i === step ? 'step' : undefined} disabled={i > step} onClick={() => i < step && setStep(i)} className={cx('relative flex flex-1 items-center gap-2 overflow-hidden rounded-2xl px-3 py-3 text-left text-sm font-extrabold ring-1 transition', i === step ? 'ring-pink/50' : i < step ? 'ring-mint/30' : 'ring-lav/15 text-lav')}>
            {i === step && <motion.span layoutId="step-bg" className="absolute inset-0 bg-pink/15" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className={cx('relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', i < step ? 'bg-mint text-night' : i === step ? 'bg-pink text-night' : 'bg-lav/15')}>{i < step ? <ICheck s={13} /> : i + 1}</span>
            <span className="relative hidden sm:inline">{s}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 md:p-6" data-cursor="native">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              {step === 0 && (
                <fieldset disabled={!draftReady || uploading} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <Field label="Name" error={err('name')}><input className="input" value={f.name} maxLength={32} onChange={(e) => set('name', e.target.value)} placeholder="Your token name" /></Field>
                    <Field label="Ticker" error={err('ticker')}><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-lav">$</span><input className="input pl-8 uppercase" value={f.ticker} maxLength={10} onChange={(e) => set('ticker', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="TOKEN" /></div></Field>
                  </div>
                  <Field label="Description" hint={`${f.desc.length}/160`} error={err('desc')}><textarea className="input min-h-[84px] resize-none" value={f.desc} onChange={(e) => set('desc', e.target.value)} maxLength={160} placeholder="Tell people what your token is about." /></Field>
                  <div>
                    <div className="label mb-2">Token image</div>
                    <div className="flex flex-wrap items-center gap-5">
                      <label className="group relative grid h-36 w-36 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-lav/30 bg-night/50 text-center transition hover:border-pink/60 focus-within:ring-2 focus-within:ring-pink">
                        {f.image ? <img src={f.image} alt="Your token" className="h-full w-full object-cover" /> : <div className="text-xs font-extrabold text-lav"><IUpload s={22} className="mx-auto mb-2" />{uploading ? 'Uploading…' : 'Upload image'}</div>}
                        <input aria-label="Upload token image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                      <div className="max-w-xs text-sm font-semibold text-lav">
                        <p className="font-extrabold text-cream">Make your token recognizable</p>
                        <p className="mt-1">Square artwork works best. PNG, JPG, GIF or WebP, up to 4 MB.</p>
                        <p className="mt-2 text-xs">No image yet? The Floof icon is used until you choose one before launch.</p>
                        {f.image && <button type="button" onClick={() => set('image', null)} className="mt-2 text-xs font-extrabold text-pink underline underline-offset-4">Remove image</button>}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Locked label="Total supply" v="1,000,000,000 tokens" />
                    <Locked label="Token decimals" v="6 · fixed for every launch" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="X (optional)" error={err('x')}><input className="input" value={f.x} onChange={(e) => set('x', e.target.value)} placeholder="@yourproject" /></Field>
                    <Field label="Telegram (optional)" error={err('tg')}><input className="input" value={f.tg} onChange={(e) => set('tg', e.target.value)} placeholder="t.me/…" /></Field>
                    <Field label="Website (optional)" error={err('web')}><input className="input" value={f.web} onChange={(e) => set('web', e.target.value)} placeholder="https://yourproject.com" /></Field>
                  </div>
                </fieldset>
              )}
              {step === 1 && (
                <div className="space-y-6">
                  <SliderField label="Fair window duration" value={`${f.durationMin} min`} hint="opens the moment your coin is created" error={err('durationMin')}
                    min={MIN_WIN} max={MAX_WIN} step={5} v={f.durationMin} onChange={(v) => set('durationMin', v)} aria="Fair window duration in minutes" ticks={['5 min', '15', '30', '45', '60 min']} accent="blue" />
                  <div>
                    <SliderField label="Presale raise" value={`${fmtSol(maxRaise)} SOL`} hint={`0–${fmtSol(MAX_BUY_SOL - creatorBuy)} SOL · drag or type`} error={err('maxRaise')}
                      min={0} max={MAX_BUY_SOL - creatorBuy} step={0.5} v={maxRaise} onChange={(v) => { set('maxRaise', fmtSol(v)); if ((parseFloat(f.minTarget) || 0) > v || (v > 0 && (parseFloat(f.minTarget) || 0) < v * 0.1) || v === 0) set('minTarget', fmtSol(v === 0 ? 0 : Math.max(v * 0.5, 0))) }} aria="Presale raise in SOL" ticks={['0', '20', '40', '60', `${fmtSol(MAX_BUY_SOL - creatorBuy)} SOL`]} accent="pink"
                      input={<input aria-label="Presale raise SOL amount" className="input w-24 !py-1.5 text-right font-num tnum" inputMode="decimal" value={f.maxRaise} onChange={(e) => set('maxRaise', e.target.value.replace(/[^0-9.]/g, ''))} />} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Min target (SOL)" error={err('minTarget')} hint="else everyone is refunded"><input aria-label="Minimum target in SOL" className="input font-num tnum" inputMode="decimal" value={f.minTarget} onChange={(e) => set('minTarget', e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
                    <Locked label="Per-account cap" v={`1% of raise · ${(maxRaise * 0.01).toFixed(2)} SOL`} />
                  </div>
                  <CurvePanel curve={curve} raise={maxRaise} creatorBuy={creatorBuy} quote={f.quote} />
                  <div>
                    <div className="label mb-2">Anti-sybil</div>
                    <Toggle on locked label="Linked accounts share one cap" />
                    <Toggle on={f.walletAge} onChange={(v) => set('walletAge', v)} label="Wallet age ≥ 7 days" />
                    <Toggle on={f.balHistory} onChange={(v) => set('balHistory', v)} label="Require prior on-chain activity (≥ 10 tx)" />
                    <p className="mt-2 text-xs font-semibold text-lav">{devnet?'Wallet history and common funding sources are checked before each pledge. Linked groups share the 1% cap.':'Wallet-history preferences are saved for Devnet. The current sandbox enforces the account cap only.'}</p>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-end justify-between"><div className="label">Quote pair</div><span className="text-[11px] font-bold text-lav/60">what buyers pay with</span></div>
                    <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Quote pair">
                      {QUOTES.map((q) => (
                        <button key={q.symbol} type="button" role="radio" aria-checked={f.quote === q.symbol} aria-disabled={!q.live} title={q.note || q.name} onClick={() => q.live && set('quote', q.symbol)}
                          className={cx('relative rounded-2xl px-3 py-3 text-left ring-1 transition', f.quote === q.symbol ? 'bg-pink/15 ring-pink/60' : q.live ? 'ring-lav/20 hover:ring-pink/40' : 'cursor-not-allowed opacity-55 ring-lav/10')}>
                          <div className="flex items-center justify-between"><span className="font-display text-lg font-extrabold">${f.ticker || 'TOKEN'}/{q.symbol}</span>{f.quote === q.symbol && <ICheck s={14} className="text-pink" />}</div>
                          <div className="mt-0.5 text-[11px] font-bold text-lav">{q.live ? `${q.name} · migrates at ${q.graduation}` : 'Coming soon'}</div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-lav/70">Raydium LaunchLab supports more quote mints (USD1, USDC, USDT and others). Floof’s fair-window escrow holds SOL today, so stable pairs arrive once the escrow supports SPL tokens.</p>
                  </div>
                  <SliderField label="Dev buy" value={`${fmtSol(creatorBuy)} SOL`} hint="optional · same clearing price as every pledger" error={err('creatorBuy')}
                    min={0} max={Math.max(0, Math.min(10, MAX_BUY_SOL - maxRaise))} step={0.1} v={creatorBuy} onChange={(v) => set('creatorBuy', fmtSol(v))} aria="Dev buy in SOL" ticks={['0', `${fmtSol(Math.max(0, Math.min(10, MAX_BUY_SOL - maxRaise)))} SOL`]} accent="blue"
                    input={<input aria-label="Dev buy SOL amount" className="input w-24 !py-1.5 text-right font-num tnum" inputMode="decimal" value={f.creatorBuy} onChange={(e) => set('creatorBuy', e.target.value.replace(/[^0-9.]/g, ''))} />} />
                  {curve && creatorBuy > 0 && <div className="grid gap-2 rounded-2xl bg-night/50 p-4 text-sm font-bold ring-1 ring-lav/10 sm:grid-cols-3">
                    <Stat k="You receive" v={`${(Number(curve.creatorTokens) / 1e12).toFixed(2)}M tokens`} />
                    <Stat k="Share of supply" v={`${(Number(curve.creatorTokens) / 1e13).toFixed(2)}%`} />
                    <Stat k="Your price" v={`${fmtPrice(curve.avgPrice)} SOL`} />
                  </div>}
                  <SliderField label="Dev token lock" value={f.lockDays === 0 ? 'No lock' : `${f.lockDays} days`} hint="covers your dev buy and creator allocation" error={err('lockDays')}
                    min={0} max={LOCK_STOPS.length - 1} step={1} v={Math.max(0, LOCK_STOPS.indexOf(f.lockDays))} onChange={(i) => set('lockDays', LOCK_STOPS[i])} aria="Dev token lock" ticks={LOCK_STOPS.map((d) => d === 0 ? 'none' : d < 365 ? `${d}d` : '1y')} accent="mint" />
                  <SliderField label="Creator allocation" value={`${f.creatorPct}% · ${(f.creatorPct * 10).toFixed(0)}M`} hint="optional · vests through LaunchLab, unlocks after the lock" min={0} max={5} step={0.5} v={f.creatorPct} onChange={(v) => set('creatorPct', v)} aria="Creator allocation percentage" ticks={['0%', '5%']} accent="pink" />
                  <div className="flex items-center gap-4 rounded-2xl bg-mint/10 p-4 ring-1 ring-mint/25">
                    <IShield s={28} className="shrink-0 text-mint" />
                    <div className="text-sm font-bold">{f.lockDays > 0 ? <><span className="text-mint">Locked on-chain for {f.lockDays} days.</span> Your dev-buy tokens wait in the window vault and the creator allocation vests; both are claimable after the lock.</> : <><span className="text-mint">No lock.</span> Dev-buy tokens arrive in your wallet at settlement. Buyers see “no lock” on your coin.</>} No bond needed.</div>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="divide-y divide-lav/10 rounded-2xl bg-night/50 text-sm ring-1 ring-lav/10">
                    {[['Coin', `${f.name} · $${f.ticker}`], ['Pair', `$${f.ticker}/${f.quote}`], ['Fair window', `opens at creation · ${f.durationMin} min`], ['First buy', `${(maxRaise + creatorBuy).toFixed(2)} SOL (${fmtSol(maxRaise)} presale + ${fmtSol(creatorBuy)} dev buy)`], ['Clearing price at full raise', `${fmtPrice(ceiling)} SOL`], ['Supply bought at full raise', `${curve ? curve.pctOfSupply.toFixed(2) : '0'}% · ${(windowTokens / 1e6).toFixed(1)}M to presale`], ['Max raise / min target', `${maxRaise} / ${minT} SOL`], ['Migrates to Raydium at', `~${curve?.graduationSol ?? 85} SOL on the curve`], ['Per-account cap', `${(maxRaise * 0.01).toFixed(2)} SOL`], ['Dev lock', f.lockDays ? `${f.lockDays} days` : 'none'], ['Creator allocation', `${f.creatorPct}%`], ['After window', devnet?'Raydium LaunchLab':'Sandbox trading pool'], [devnet?'Trading fee':'Sandbox trading fee', `${FEES.total}% (${FEES.raydium} Raydium · ${FEES.creator} you · ${FEES.platform} platform)`]].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><span className="font-bold text-lav">{k}</span><span className="text-right font-extrabold">{v}</span></div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-blue/10 px-4 py-3 font-extrabold ring-1 ring-blue/25"><span className="flex items-center gap-2"><ILock s={16} /> Due now</span><span className="font-num tnum">{(0.02 + reserve + creatorBuy).toFixed(2)} test SOL</span></div>
                  <p className="text-xs font-semibold text-lav">0.02 test SOL is the creation fee{creatorBuy > 0 ? `; your ${fmtSol(creatorBuy)} SOL dev buy is escrowed and refunded if the window misses its target` : ''}. {devnet?'An additional 0.1 test SOL funds pool rent; unused reserve can be reclaimed. Network and account rent are additional. ':''} {wallet ? `Balance after creation: ${(bal - 0.02 - reserve - creatorBuy).toFixed(2)} test SOL.` : devnet ? 'Connect Phantom with Devnet SOL to continue.' : 'Open your sandbox to receive a test balance.'}</p>
                  <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-lav"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#FF5FB8]" checked={checked} onChange={e => setChecked(e.target.checked)} />I reviewed these settings. They cannot be edited after creation. {devnet ? 'This reserves a Devnet launch using test SOL. A token is minted if its window settles successfully.' : 'This creates a test launch with no real SOL or on-chain token.'}</label>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-between border-t border-lav/10 pt-5">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-ghost disabled:opacity-30"><IBack s={16} /> Back</button>
            {touched && !stepOk(step) && <span className="text-xs font-extrabold text-danger">Fix the highlighted fields</span>}
            {step < 3 ? <button onClick={next} disabled={uploading || !draftReady} className="btn-candy disabled:opacity-40">Continue <IArrow s={16} /></button>
              : !wallet ? <button onClick={connectWallet} className="btn-candy">{devnet?'Connect wallet':'Open sandbox'}</button>
              : <button onClick={() => setOpen(true)} disabled={!!Object.keys(errors).length || !checked || uploading || saving || !draftReady} className="btn-candy sheen disabled:opacity-40">Create & open window</button>}
          </div>
        </Card>
        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="label">live preview</div>
          <div className="pointer-events-none">{f.image ? <ImgCard f={f} preview={preview} /> : <CoinCard coin={preview} />}</div>
          <Card className="p-4 text-sm font-bold">
            <div className="mb-3 font-extrabold">Supply distribution at full raise</div>
            {(() => { const presale = curve ? Number(curve.windowTokens) / 1e13 : 0, mine = curve ? Number(curve.creatorTokens) / 1e13 : 0, curveLeft = Math.max(0, Number(SELL) / 1e13 - presale - mine), lp = Math.max(0, 100 - presale - mine - curveLeft - f.creatorPct); const rows: [string, number, string][] = [['Fair window', presale, 'text-pink'], ['Dev buy', mine, 'text-blue'], ['Creator · locked', f.creatorPct, 'text-blue'], ['Public curve', curveLeft, 'text-mint'], ['Raydium LP at migration', lp, 'text-lav']]; return <>
              <div className="flex h-3 overflow-hidden rounded-full" aria-label={rows.map(([l, p]) => `${l} ${p.toFixed(1)}%`).join(', ')}><span className="bg-pink" style={{ width: `${presale}%` }} /><span className="bg-blue" style={{ width: `${mine + f.creatorPct}%` }} /><span className="bg-mint" style={{ width: `${curveLeft}%` }} /><span className="flex-1 bg-lav/40" /></div>
              {rows.map(([label, pct, color]) => <div key={label} className="mt-2 flex justify-between text-xs"><span className={color}>{label}</span><span className="font-num tnum">{pct.toFixed(1)}% · {(pct * 10).toFixed(1)}M</span></div>)}</> })()}
          </Card>
          <Card className="p-4 text-xs font-bold text-lav"><div className="mb-1 font-extrabold text-cream">One window, one clearing price</div>The presale is the first buy on Raydium LaunchLab’s standard curve, executed atomically when the pool is created; your optional buy is added to it at the same average price. Pledges share a 1% cap and fill pro-rata if oversubscribed; miss the minimum target and everything is refunded. Public trading then continues on the curve until ~{curve?.graduationSol ?? 85} SOL migrates it to Raydium.</Card>
        </div>
      </div>
      <TxModal open={open} onClose={() => setOpen(false)} title={`Create $${f.ticker}`} confirmLabel="Create test launch"
        rows={[{ k: 'Dev buy (escrowed)', v: `${fmtSol(creatorBuy)} SOL`, strong: true }, { k: 'Create fee', v: '0.02 SOL' }, { k: 'Fair window', v: `opens now · ${f.durationMin} min` }, { k: 'Pair', v: `$${f.ticker}/${f.quote}` }, { k: 'Programs', v: devnet?'Floof + Raydium LaunchLab':'Floof sandbox ledger' }]}
        note={devnet?'Signs a Devnet launch reservation. The mint and pool are created atomically at successful settlement.':'Creates a persistent sandbox launch. No on-chain mint is created.'} onConfirm={create} />
    </div>
  )
}

function ImgCard({ f, preview }: { f: Form; preview: Coin }) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-center gap-3"><img src={f.image!} alt="" className="h-14 w-14 rounded-2xl object-cover" /><div><div className="font-display text-xl font-extrabold">${preview.ticker}</div><div className="text-sm font-bold text-lav">{preview.name}</div></div></div>
      <div className="mt-3 text-xs font-bold text-lav">{preview.tagline || 'Your description appears here.'}</div>
    </Card>
  )
}
function Field({ label, children, error, hint }: { label: string; children: React.ReactNode; error?: string | false; hint?: string }) {
  const id = useId(); let linked = false
  const controls = (nodes: React.ReactNode): React.ReactNode => Children.map(nodes, child => {
    if (!isValidElement<any>(child)) return child
    if (!linked && ['input', 'textarea'].includes(String(child.type))) { linked = true; return cloneElement(child, { id, 'aria-invalid': !!error, 'aria-describedby': error ? id + '-error' : undefined }) }
    return child.props.children ? cloneElement(child, {}, controls(child.props.children)) : child
  })
  const content = controls(children)
  return <div className="block" role="group" aria-label={label}>
    <div className="mb-1.5 flex justify-between"><label htmlFor={linked ? id : undefined} className="label">{label}</label>{hint && <span className="text-[11px] font-bold text-lav/60">{hint}</span>}</div>
    <div className={error ? '[&_.input]:border-danger/60' : ''}>{content}</div>
    {error && <div id={id + '-error'} className="mt-1 text-xs font-extrabold text-danger" role="alert">{error}</div>}
  </div>
}

const Locked = ({ label, v }: { label: string; v: string }) => (
  <div><div className="label mb-1.5">{label}</div><div className="flex items-center justify-between rounded-2xl bg-night/40 px-4 py-3 text-sm font-extrabold ring-1 ring-lav/10"><span>{v}</span><ILock s={14} className="text-lav" /></div></div>
)
function Toggle({ on, onChange, label, locked }: { on: boolean; onChange?: (v: boolean) => void; label: string; locked?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-disabled={locked} onClick={() => !locked && onChange?.(!on)} className="flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left text-sm font-bold">
      <span>{label} {locked && <span className="ml-1 text-[10px] font-black uppercase text-lav/60">always on</span>}</span>
      <span className={cx('relative h-6 w-11 rounded-full transition', on ? 'bg-mint' : 'bg-lav/20')}><motion.span layout className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow', on ? 'right-0.5' : 'left-0.5')} /></span>
    </button>
  )
}

function CurvePanel({ curve, raise, creatorBuy, quote = 'SOL' }: { curve: ReturnType<typeof firstBuyQuote> | null; raise: number; creatorBuy: number; quote?: string }) {
  if (!curve) return null
  const rows: [string, string][] = [
    ['First buy at full raise', `${(raise + creatorBuy).toFixed(2)} SOL${curve.completes ? ` (curve fills at ${curve.capacitySol.toFixed(3)})` : ''}`],
    ['Share of supply', `${curve.pctOfSupply.toFixed(2)}% · ${(Number(curve.tokens) / 1e12).toFixed(1)}M tokens`],
    ['Clearing price (everyone)', `${fmtPrice(curve.avgPrice)} SOL`],
    ['Implied market cap at clearing', `${curve.impliedMcapSol.toFixed(1)} SOL`],
    ['Curve price after first buy', `${fmtPrice(curve.spotAfter)} SOL · mcap ${curve.mcapAfterSol.toFixed(1)} SOL`],
    ['Left for public buyers', `${curve.remainingToMigrateSol.toFixed(2)} SOL net (~${curve.remainingToMigrateGrossSol.toFixed(2)} SOL incl. 1% fee)`],
  ]
  return (
    <div className="rounded-2xl bg-night/50 p-4 text-sm font-bold ring-1 ring-lav/10" aria-live="polite">
      <div className="mb-2 flex items-center justify-between"><span className="font-extrabold text-cream">Standard Raydium LaunchLab curve · {quote}</span><span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-black text-mint">migrates at ~{curve.graduationSol} SOL</span></div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-lav/10"><div className="h-full rounded-full bg-gradient-to-r from-pink to-blue" style={{ width: `${Math.min(100, curve.curveSolAfter / curve.graduationSol * 100)}%` }} /></div>
      {rows.map(([k, v]) => <div key={k} className="mt-1 flex justify-between gap-3"><span className="text-lav">{k}</span><span className="text-right font-num tnum">{v}</span></div>)}
      <div className="mt-2 flex justify-between"><span className="text-lav">If oversubscribed</span><span>everyone fills pro-rata</span></div>
      <p className="mt-2 text-[11px] font-semibold text-lav/70">1B supply · 793.1M sold on the curve · 1% fee · computed with the same integer math the Floof program pins.{curve.completes ? ' This first buy completes the curve: migration starts at settlement and unspent SOL is refunded pro-rata.' : ''}</p>
    </div>
  )
}

const ACCENT = { pink: 'accent-[#FF5FB8]', blue: 'accent-[#5FD4FF]', mint: 'accent-[#7CF5C8]' } as const
const TEXT = { pink: 'text-pink', blue: 'text-blue', mint: 'text-mint' } as const
function SliderField({ label, value, hint, error, min, max, step, v, onChange, aria, ticks, accent, input }: { label: string; value: string; hint?: string; error?: string | false; min: number; max: number; step: number; v: number; onChange: (v: number) => void; aria: string; ticks?: string[]; accent: keyof typeof ACCENT; input?: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="flex items-end justify-between gap-3">
        <div><div className="label">{label}</div>{hint && <div className="mt-0.5 text-[11px] font-bold text-lav/60">{hint}</div>}</div>
        <div className="flex items-center gap-2">{input}<div className={cx('font-num text-3xl font-semibold tnum', TEXT[accent])}>{value}</div></div>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, v))} onChange={(e) => onChange(+e.target.value)} aria-label={aria} aria-valuetext={value}
        className={cx('mt-3 w-full', ACCENT[accent])} style={{ background: 'transparent' }} />
      {ticks && <div className="mt-1.5 flex justify-between text-[10px] font-black uppercase text-lav/50">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>}
      {error && <div className="mt-1 text-xs font-extrabold text-danger" role="alert">{error}</div>}
    </div>
  )
}
const Stat = ({ k, v }: { k: string; v: string }) => <div><div className="text-[11px] font-black uppercase text-lav/70">{k}</div><div className="mt-0.5 font-num text-base tnum">{v}</div></div>
