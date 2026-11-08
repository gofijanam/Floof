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

const STEPS = ['Details', 'Fair window', 'Bond & lock', 'Review']

interface Form {
  name: string; ticker: string; desc: string; image: string | null; hue: number; acc: Accessory; x: string; tg: string; web: string
  startIn: number; ceiling: string; alloc: number; minTarget: string; walletAge: boolean; balHistory: boolean
  bond: number; creatorPct: number; vest: number
}
const init: Form = { name: '', ticker: '', desc: '', image: null, hue: 200, acc: 'none', x: '', tg: '', web: '', startIn: 30, ceiling: '0.0000004', alloc: 30, minTarget: '40', walletAge: true, balHistory: false, bond: 5, creatorPct: 2, vest: 90 }

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
  useEffect(() => { let active = true; api('/drafts/launch').then(d => {
    if (!active) return
    if (d.form) { setF({ ...init, ...d.form }); setDraftNote('Saved draft restored') }
    setDraftRevision(d.revision)
  }).catch(() => { if (active) setDraftNote('Draft storage unavailable. You can still create a launch.') }).finally(() => { if (active) setDraftReady(true) }); return () => { active = false } }, [])
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
  const windowTokens = (SUPPLY * f.alloc) / 100
  const ceiling = parseFloat(f.ceiling) || 0
  const maxRaise = ceiling * windowTokens
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
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(f.ceiling) || !(ceiling > 0)) e.ceiling = 'Enter a price ceiling'
    else if (maxRaise < 10) e.ceiling = 'Max raise must be at least 10 SOL'
    else if (maxRaise > 2000) e.ceiling = 'Max raise capped at 2,000 test SOL'
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(f.minTarget) || !(minT > 0)) e.minTarget = 'Enter a min target'
    else if (minT < maxRaise * 0.1) e.minTarget = `At least 10% of max raise (${(maxRaise * 0.1).toFixed(1)} SOL)`
    else if (minT > maxRaise) e.minTarget = 'Cannot exceed max raise'
    if (wallet && f.bond + 0.02 + reserve > bal) e.bond = 'Not enough test SOL for the bond and fee'
    return e
  }, [f, ceiling, maxRaise, minT, bal, wallet, reserve])
  const stepFields = [['name', 'ticker', 'desc', 'web', 'x', 'tg'], ['ceiling', 'minTarget'], ['bond'], []]
  const stepOk = (i: number) => stepFields[i].every((k) => !errors[k])
  const next = () => { setTouched(true); setChecked(false); if (stepOk(step)) { setStep((s) => Math.min(3, s + 1)); setTouched(false) } }
  const err = (k: string) => (touched || (f as any)[k]) && errors[k]
  const preview: Coin = useMemo(() => {
    const now = Date.now()
    return {
      id: 'preview', ticker: f.ticker || 'TICKER', name: f.name || 'Your coin', tagline: f.desc, hue: f.hue, accessory: f.acc, creator: 'newfloof', status: 'upcoming', ca: 'pending',
      windowStart: now + f.startIn * 60e3, windowEnd: now + f.startIn * 60e3 + 600e3, durationMs: 600e3, priceCeiling: ceiling, windowTokens, minTarget: minT,
      pledged: 0, pledgers: 0, bondSol: f.bond, lockDays: f.vest, clearingPrice: 0, price: 0, change24h: 0, volume24h: 0, curveSol: 0, holders: 0, snipersBlocked: 0,
      truth: { grade: 'N/A', score: 0, realPct: 0, sybilClusters: 0, washPct: 0 }, createdAgo: 0, tags: [],
    }
  }, [f, ceiling, windowTokens, minT])
  const create = async () => {
    const result = await addCoin(f)
    try { const d = await api('/drafts/launch', { form: null, revision: draftRevision }); setDraftRevision(d.revision) } catch {}
    setOpen(false); setDone(result.coin); confetti({ n: 140 }); return result
  }
  if (done) return (
    <div className="mx-auto max-w-xl px-4 pt-32 text-center">
      <motion.div initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="relative mx-auto w-fit"><img src="./mochi/happy.webp" alt="" className="w-56" /><div className="absolute -bottom-2 -right-6 rounded-full bg-night/60 p-1 ring-2 ring-pink/50"><CoinAvatar image={f.image || undefined} hue={f.hue} accessory={f.acc} size={72} mood="happy" /></div></motion.div>
      <h1 className="h-display mt-4 text-5xl">${f.ticker} is scheduled!</h1>
      <p className="mt-3 font-bold text-lav">Your fair window opens in {f.startIn} minutes. Bond of {f.bond} SOL is locked. Share the link and gather your floofs.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => nav(`/coin/${done}`)} className="btn-candy">Open coin page <IArrow s={16} /></button><button onClick={() => { setF(init); setStep(0); setDone(null); setChecked(false); setDraftNote('') }} className="btn-ghost">Create another</button></div>
    </div>
  )
  return (
    <div className="relative mx-auto max-w-[1200px] px-4 pt-24 md:px-6 md:pt-28">
      <PeekMochi src="countdown" />
      <h1 className="h-display text-5xl md:text-6xl">Launch a coin</h1>
      <p className="mt-2 font-bold text-lav">Set up your coin, its fair window and your bond. Snipers not invited.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-lav">
        <span role="status">{draftNote || 'Your logo, your token. Launch settings are fixed after creation.'}</span>
        <button className="btn-ghost !px-3 !py-2 !text-xs" onClick={saveDraft} disabled={saving || uploading || !draftReady}>{saving ? 'Saving…' : 'Save draft'}</button>
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
                <div className="space-y-5">
                  <Field label="Window opens in">
                    <div className="flex flex-wrap gap-2">{[10, 30, 60, 180, 1440].map((m) => <button key={m} onClick={() => set('startIn', m)} className={cx('rounded-xl px-4 py-2.5 text-sm font-extrabold ring-1', f.startIn === m ? 'bg-blue/15 text-blue ring-blue/50' : 'ring-lav/20')}>{m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : '24 h'}</button>)}</div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Locked label="Window length" v="10 minutes" />
                    <Locked label="Per-account cap" v={`1% of max raise · ${(maxRaise * 0.01).toFixed(2)} SOL`} />
                  </div>
                  <Field label="Supply sold in window">
                    <div className="flex gap-2">{[20, 30, 40].map((a) => <button key={a} onClick={() => set('alloc', a)} className={cx('flex-1 rounded-xl py-2.5 text-sm font-extrabold ring-1', f.alloc === a ? 'bg-pink/15 text-pink ring-pink/50' : 'ring-lav/20')}>{a}%</button>)}</div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Price ceiling (SOL / token)" error={err('ceiling')} hint={ceiling > 0 ? fmtPrice(ceiling) : ''}><input className="input font-num tnum" inputMode="decimal" value={f.ceiling} onChange={(e) => set('ceiling', e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
                    <Field label="Min target (SOL)" error={err('minTarget')} hint="else auto-refund"><input className="input font-num tnum" inputMode="decimal" value={f.minTarget} onChange={(e) => set('minTarget', e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
                  </div>
                  <div className="rounded-2xl bg-night/50 p-4 text-sm font-bold ring-1 ring-lav/10">
                    <div className="flex justify-between"><span className="text-lav">Max raise (ceiling × window supply)</span><span className="font-num tnum">{maxRaise.toFixed(1)} SOL</span></div>
                    <div className="mt-1 flex justify-between"><span className="text-lav">If oversubscribed</span><span>everyone fills pro-rata</span></div>
                  </div>
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
                    <div className="flex items-end justify-between"><div className="label">Creator bond</div><div className="font-num text-3xl font-semibold text-blue tnum">{f.bond} SOL</div></div>
                    <input type="range" min={1} max={50} value={f.bond} onChange={(e) => set('bond', +e.target.value)} className="mt-2 w-full accent-[#5FD4FF]" aria-label="Bond SOL" />
                    {err('bond') && <div className="mt-1 text-xs font-extrabold text-danger">{errors.bond}</div>}
                    <p className="mt-2 text-sm font-semibold text-lav">{devnet?'The bond can be claimed after a failed window or 30 clean days. Creator tokens unlock after both your selected lock period and Raydium graduation.':'In the sandbox, your bond returns if the target is missed, or after 30 days following creation. Creator tokens stay locked for the period you choose.'}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Creator allocation · ${f.creatorPct}%`}><input aria-label="Creator allocation percentage" type="range" min={0} max={5} step={0.5} value={f.creatorPct} onChange={(e) => set('creatorPct', +e.target.value)} className="w-full accent-[#FF5FB8]" /></Field>
                    <Field label={`Vesting lock · ${f.vest} days`}><input aria-label="Vesting lock days" type="range" min={30} max={180} step={30} value={f.vest} onChange={(e) => set('vest', +e.target.value)} className="w-full accent-[#FF5FB8]" /></Field>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-mint/10 p-4 ring-1 ring-mint/25">
                    <IShield s={28} className="shrink-0 text-mint" />
                    <div className="text-sm font-bold"><span className="text-mint">Allocation stays locked.</span> You can claim creator tokens once the lock ends and the window has settled successfully. Reputation follows recorded launch outcomes.</div>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="divide-y divide-lav/10 rounded-2xl bg-night/50 text-sm ring-1 ring-lav/10">
                    {[['Coin', `${f.name} · $${f.ticker}`], ['Window', `opens in ${f.startIn} min · 10 min long`], ['Price ceiling', `${fmtPrice(ceiling)} SOL`], ['Window supply', `${f.alloc}% · ${(windowTokens / 1e6).toFixed(0)}M tokens`], ['Max raise / min target', `${maxRaise.toFixed(1)} / ${minT} SOL`], ['Per-account cap', `${(maxRaise * 0.01).toFixed(2)} SOL`], ['Creator allocation', `${f.creatorPct}% · vest ${f.vest}d`], ['After window', devnet?'Raydium LaunchLab':'Sandbox trading pool'], [devnet?'Trading fee':'Sandbox trading fee', `${FEES.total}% (${FEES.raydium} Raydium · ${FEES.creator} you · ${FEES.platform} platform)`]].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><span className="font-bold text-lav">{k}</span><span className="text-right font-extrabold">{v}</span></div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-blue/10 px-4 py-3 font-extrabold ring-1 ring-blue/25"><span className="flex items-center gap-2"><ILock s={16} /> Due now</span><span className="font-num tnum">{(f.bond + 0.02 + reserve).toFixed(2)} test SOL</span></div>
                  <p className="text-xs font-semibold text-lav">{f.bond} test SOL is refundable bond collateral; 0.02 test SOL is the creation fee. {devnet?'An additional 0.1 test SOL funds pool rent; unused reserve can be reclaimed. Network and account rent are additional. ':''} {wallet ? `Balance after creation: ${(bal - f.bond - 0.02 - reserve).toFixed(2)} test SOL.` : devnet ? 'Connect Phantom with Devnet SOL to continue.' : 'Open your sandbox to receive a test balance.'}</p>
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
              : <button onClick={() => setOpen(true)} disabled={!!Object.keys(errors).length || !checked || uploading || saving || !draftReady} className="btn-candy sheen disabled:opacity-40">Create & lock bond</button>}
          </div>
        </Card>
        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="label">live preview</div>
          <div className="pointer-events-none">{f.image ? <ImgCard f={f} preview={preview} /> : <CoinCard coin={preview} />}</div>
          <Card className="p-4 text-sm font-bold">
            <div className="mb-3 font-extrabold">Supply distribution</div>
            <div className="flex h-3 overflow-hidden rounded-full" aria-label={`Fair window ${f.alloc}%, creator ${f.creatorPct}%, trading pool ${100 - f.alloc - f.creatorPct}%`}><span className="bg-pink" style={{width: `${f.alloc}%`}} /><span className="bg-blue" style={{width: `${f.creatorPct}%`}} /><span className="flex-1 bg-mint" /></div>
            {[['Fair window', f.alloc, 'text-pink'], ['Creator · locked', f.creatorPct, 'text-blue'], ['Trading pool', 100 - f.alloc - f.creatorPct, 'text-mint']].map(([label, pct, color]) => <div key={label} className="mt-2 flex justify-between text-xs"><span className={String(color)}>{label}</span><span className="font-num tnum">{pct}% · {Number(pct) * 10}M</span></div>)}
          </Card>
          <Card className="p-4 text-xs font-bold text-lav"><div className="mb-1 font-extrabold text-cream">One window, one clearing price</div>Pledges share a 1% cap. Successful windows fill pro-rata; unused test SOL is claimable. Miss the minimum target and pledges are refunded. {devnet ? 'Successful windows settle into Raydium LaunchLab on Devnet.' : 'This preview uses the sandbox trading pool.'}</Card>
        </div>
      </div>
      <TxModal open={open} onClose={() => setOpen(false)} title={`Create $${f.ticker}`} confirmLabel="Create test launch"
        rows={[{ k: 'Bond (locked)', v: `${f.bond} SOL`, strong: true }, { k: 'Create fee', v: '0.02 SOL' }, { k: 'Window', v: `in ${f.startIn} min` }, { k: 'Programs', v: devnet?'Floof + Raydium LaunchLab':'Floof sandbox ledger' }]}
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
