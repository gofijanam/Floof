import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { KeyboardEvent, memo, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { QuoteGroup, QuoteToken } from '../types/quotes'
import { useQuotes } from '../lib/useQuotes'
import {
  GROUP_LABEL, QUOTE_GROUPS, WSOL_MINT, countByGroup, filterQuotes, fmtQuoteAmount, fmtUsdAmount, isMintLike, lookupMint,
  migrationTarget, quoteNumbers, solUsdFrom, type MigrationTarget, type MintLookup, type QuoteNumbers,
} from '../lib/quotes.ts'
import { short } from '../lib/format'
import { CoinAvatar } from './CoinAvatar'
import { cx } from './ui'
import { ICheck, IExplore, IX, IShield, ISparkle, IBolt } from './icons'
import type { Accessory } from '../lib/mock'

/** Hand-picked pairs shown as one-tap chips (only rendered when present in the list). */
const FEATURED = [
  WSOL_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
]
const GROUP_HINT: Record<QuoteGroup, string> = {
  solana: 'SOL and Solana-native majors', stocks: 'Tokenized equities: xStocks, PreStocks, Backpack, Tessera', currencies: 'Stablecoins and fiat-pegged tokens',
  leverage: 'Leveraged exposure tokens', baskets: 'Index and basket tokens', collectibles: 'Collectible-backed tokens', custom: 'Memecoins and majors with a LaunchLab market, or paste any mint',
}
/** Used before/without the list so the default SOL pair always renders (SOL needs no price to size). */
const SOL_FALLBACK: QuoteToken = { mint: WSOL_MINT, symbol: 'SOL', name: 'Solana', logo: null, decimals: 9, group: 'solana', token2022: false, configId: '6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX', minMigration: '24000000000', priceUsd: null }
const ROW = 64

type Props = {
  ticker: string; value: string; onSelect: (q: QuoteToken) => void
  raiseSol: number; devBuySol: number; launchable: (mint: string) => boolean
  coin: { image?: string | null; hue: number; acc: Accessory }
}

export function PairPicker({ ticker, value, onSelect, raiseSol, devBuySol, launchable, coin }: Props) {
  const { status, data, error, retry } = useQuotes()
  const quotes = data?.quotes ?? []
  const solUsd = useMemo(() => solUsdFrom(quotes), [quotes])
  const [tab, setTab] = useState<QuoteGroup>('solana')
  const [scope, setScope] = useState<QuoteGroup | 'all'>('all')
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const searching = q.trim().length > 0
  const mintMode = isMintLike(q)
  useEffect(() => { if (!searching) setScope('all') }, [searching])
  const matches = useMemo(() => (mintMode ? [] : filterQuotes(quotes, { group: tab, query: q })), [quotes, tab, q, mintMode])
  const results = useMemo(() => (searching && scope !== 'all' ? matches.filter((t) => t.group === scope) : matches), [matches, scope, searching])
  const counts = useMemo(() => countByGroup(searching ? matches : quotes), [matches, quotes, searching])
  const selected = quotes.find((t) => t.mint === value) ?? (value === WSOL_MINT ? SOL_FALLBACK : null)
  const featured = useMemo(() => FEATURED.map((m) => quotes.find((t) => t.mint === m)).filter((t): t is QuoteToken => !!t), [quotes])
  const lookup = useMemo(() => (mintMode ? lookupMint(q, quotes) : null), [mintMode, q, quotes])
  const T = ticker || 'TOKEN'
  const pick = (t: QuoteToken) => { if (t.configId) onSelect(t) }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="label">Quote pair</div><div className="mt-0.5 text-[11px] font-bold text-lav/60">what buyers pay with · every pair below has a Raydium LaunchLab market</div></div>
        {data && <span className="chip !text-[10px] text-lav" title={data.source}><span className="h-1.5 w-1.5 rounded-full bg-mint anim-live" />prices {new Date(data.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* featured chips */}
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Popular pairs">
        {status === 'loading' && !data ? Array.from({ length: 6 }, (_, i) => <span key={i} className="h-10 w-24 shrink-0 animate-pulse rounded-full bg-lav/10" />)
          : featured.map((t) => (
            <motion.button key={t.mint} type="button" whileTap={{ scale: 0.94 }} onClick={() => pick(t)} aria-pressed={value === t.mint}
              className={cx('relative flex shrink-0 snap-start items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-extrabold ring-1 transition', value === t.mint ? 'bg-pink/15 text-cream ring-pink/60 shadow-glowp' : 'bg-night/40 text-cream/90 ring-lav/20 hover:bg-lav/10 hover:ring-pink/40')}>
              <QuoteLogo t={t} size={26} />{t.symbol}
              {value === t.mint && <motion.span layoutId="feat-dot" className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-pink text-night"><ICheck s={10} /></motion.span>}
            </motion.button>
          ))}
      </div>

      {/* browser */}
      <div className="overflow-hidden rounded-3xl bg-night/45 ring-1 ring-lav/15">
        <Browser {...{ status, error, retry, quotes, results, counts, tab, setTab, scope, setScope, query, setQuery, searching, mintMode, lookup, value, pick, solUsd, T }} />
      </div>
      {/* selected pair summary */}
      <PairSummary quote={selected} ticker={T} solUsd={solUsd} raiseSol={raiseSol} devBuySol={devBuySol} launchable={selected ? launchable(selected.mint) : false} coin={coin} loading={status === 'loading' && !data} />

    </div>
  )
}

/* ---------------- browser: search, tabs, list ---------------- */
function Browser(p: {
  status: string; error: string | null; retry: () => void; quotes: QuoteToken[]; results: QuoteToken[]; counts: Record<QuoteGroup, number>
  tab: QuoteGroup; setTab: (g: QuoteGroup) => void; scope: QuoteGroup | 'all'; setScope: (g: QuoteGroup | 'all') => void
  query: string; setQuery: (s: string) => void; searching: boolean; mintMode: boolean; lookup: MintLookup | null
  value: string; pick: (t: QuoteToken) => void; solUsd: number | null; T: string
}) {
  const { status, error, retry, quotes, results, counts, tab, setTab, scope, setScope, query, setQuery, searching, mintMode, lookup, value, pick, solUsd, T } = p
  const listId = useId(), inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setActive(0); if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [tab, scope, query])
  const tabs: (QuoteGroup | 'all')[] = searching && !mintMode ? ['all', ...QUOTE_GROUPS.filter((g) => counts[g] > 0)] : [...QUOTE_GROUPS]
  const cur = searching && !mintMode ? scope : tab
  const setCur = (g: QuoteGroup | 'all') => { if (searching && !mintMode) setScope(g); else if (g !== 'all') setTab(g) }
  const onTabKey = (e: KeyboardEvent) => {
    const i = tabs.indexOf(cur), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null
    if (n == null) return
    e.preventDefault(); const g = tabs[(n + tabs.length) % tabs.length]; setCur(g)
    requestAnimationFrame(() => document.getElementById(`${listId}-tab-${g}`)?.focus())
  }
  const showList = !mintMode && status !== 'error' && !(status === 'loading' && quotes.length === 0)
  const onListKey = (e: KeyboardEvent) => {
    if (!showList || !results.length) return
    const n = e.key === 'ArrowDown' ? active + 1 : e.key === 'ArrowUp' ? active - 1 : e.key === 'PageDown' ? active + 5 : e.key === 'PageUp' ? active - 5 : null
    if (n != null) { e.preventDefault(); setActive(Math.max(0, Math.min(results.length - 1, n))); return }
    if (e.key === 'Enter') { e.preventDefault(); const t = results[active]; if (t) pick(t) }
  }
  const onInputKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } else onListKey(e) }
  const activeId = showList && results[active] ? `${listId}-opt-${results[active].mint}` : undefined

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-lav/10 p-3">
        <div className="relative flex-1">
          <IExplore s={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lav/70" />
          <input ref={inputRef} className="input !rounded-2xl !py-2.5 pl-10 pr-10 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKey}
            placeholder="Search ticker or name, or paste a mint address" aria-label="Search quote tokens or paste a mint address" spellCheck={false} autoComplete="off"
            role="combobox" aria-expanded={showList} aria-controls={listId} aria-activedescendant={activeId} aria-autocomplete="list" />
          {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-lav hover:bg-lav/15 hover:text-cream"><IX s={14} /></button>}
        </div>
      </div>
      {!mintMode && (
        <div role="tablist" aria-label="Quote groups" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b border-lav/10 px-2 py-2 [scrollbar-width:none]">
          {tabs.map((g) => {
            const on = g === cur, n = g === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[g]
            return (
              <button key={g} id={`${listId}-tab-${g}`} role="tab" type="button" aria-selected={on} aria-controls={listId} tabIndex={on ? 0 : -1} onClick={() => setCur(g)}
                className={cx('relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-extrabold transition', on ? 'text-night' : 'text-lav hover:text-cream')}>
                {on && <motion.span layoutId="pair-tab" className="absolute inset-0 rounded-full bg-gradient-to-b from-[#FF8CCB] to-pink shadow-glowp" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{g === 'all' ? 'All results' : GROUP_LABEL[g]}</span>
                {status === 'ready' && <span className={cx('relative ml-1.5 font-num text-[11px] tnum', on ? 'text-night/70' : 'text-lav/50')}>{n}</span>}
              </button>
            )
          })}
        </div>
      )}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mintMode ? 'mint' : `${cur}-${status}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {mintMode ? <MintResult lookup={lookup} value={value} pick={pick} solUsd={solUsd} T={T} loading={status === 'loading' && !quotes.length} />
              : status === 'error' && !quotes.length ? <StateCard img="sleepy" title="Couldn’t load quote pairs" body={error || 'The quote list is unavailable.'} action={<button type="button" onClick={retry} className="btn-ghost !py-2 text-sm">Try again</button>} note="SOL stays selected, so you can keep going." />
              : status === 'loading' && !quotes.length ? <Skeleton />
              : (
                <>
                  {!searching && <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[11px] font-bold text-lav/70"><span>{GROUP_HINT[tab]}</span></div>}
                  {!searching && tab === 'custom' && <PasteMint quotes={quotes} value={value} pick={pick} solUsd={solUsd} T={T} />}
                  {results.length === 0
                    ? (quotes.length === 0 ? <StateCard img="sleepy" title="No quote pairs yet" body="The quote list came back empty. SOL is still available." />
                      : <StateCard img="idle" title={`No pairs match “${query.trim()}”`} body="Try a ticker like USDC or NVDAX, or paste the token’s mint address." />)
                    : <VirtualList id={listId} items={results} active={active} setActive={setActive} value={value} pick={pick} solUsd={solUsd} showGroup={searching} scrollRef={scrollRef} onKeyDown={onListKey} />}
                </>
              )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function VirtualList({ id, items, active, setActive, value, pick, solUsd, showGroup, scrollRef, onKeyDown }: {
  id: string; items: QuoteToken[]; active: number; setActive: (i: number) => void; value: string; pick: (t: QuoteToken) => void; solUsd: number | null; showGroup: boolean
  scrollRef: React.RefObject<HTMLDivElement>; onKeyDown: (e: KeyboardEvent) => void
}) {
  const [top, setTop] = useState(0), [h, setH] = useState(384)
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return
    setH(el.clientHeight || 384)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setH(el.clientHeight || 384)) : null
    ro?.observe(el); return () => ro?.disconnect()
  }, [scrollRef])
  useEffect(() => { // keep the keyboard-active row in view
    const el = scrollRef.current; if (!el) return
    const y = active * ROW
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW - el.clientHeight
  }, [active, scrollRef])
  const start = Math.max(0, Math.floor(top / ROW) - 6), end = Math.min(items.length, Math.ceil((top + h) / ROW) + 6)
  return (
    <div ref={scrollRef} onScroll={(e) => setTop(e.currentTarget.scrollTop)} style={{ height: Math.min(384, items.length * ROW + 16) }} className="relative max-h-[56vh] overflow-y-auto overscroll-contain px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink/60"
      id={id} role="listbox" aria-label="Quote tokens" tabIndex={0} onKeyDown={onKeyDown} aria-activedescendant={items[active] ? `${id}-opt-${items[active].mint}` : undefined}>
      <div style={{ height: items.length * ROW, position: 'relative' }}>
        {items.slice(start, end).map((t, k) => {
          const i = start + k
          return <Row key={t.mint} id={`${id}-opt-${t.mint}`} t={t} top={i * ROW} active={i === active} selected={t.mint === value} solUsd={solUsd} showGroup={showGroup}
            onHover={() => setActive(i)} onPick={() => pick(t)} pos={i + 1} size={items.length} />
        })}
      </div>
    </div>
  )
}

const Row = memo(function Row({ id, t, top, active, selected, solUsd, showGroup, onHover, onPick, pos, size }: {
  id: string; t: QuoteToken; top: number; active: boolean; selected: boolean; solUsd: number | null; showGroup: boolean; onHover: () => void; onPick: () => void; pos: number; size: number
}) {
  const target = migrationTarget(t, solUsd), market = !!t.configId
  return (
    <div id={id} role="option" aria-selected={selected} aria-disabled={!market} aria-posinset={pos} aria-setsize={size} onPointerMove={onHover} onClick={onPick}
      style={{ position: 'absolute', top, left: 0, right: 0, height: ROW - 4 }}
      className={cx('group flex cursor-pointer items-center gap-3 rounded-2xl px-3 transition-colors', selected ? 'bg-pink/15 ring-1 ring-pink/50' : active ? 'bg-lav/10' : 'hover:bg-lav/5', !market && 'cursor-not-allowed opacity-60')}>
      <QuoteLogo t={t} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-[17px] font-extrabold leading-tight">{t.symbol}</span>
          {t.token2022 && <T22Badge />}
          {showGroup && <span className="hidden rounded-full bg-lav/10 px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-lav/80 sm:inline">{GROUP_LABEL[t.group]}</span>}
        </div>
        <div className="truncate text-[12px] font-bold text-lav/80">{t.name} <span className="font-num text-lav/45">· {short(t.mint, 4)}</span></div>
      </div>
      <div className="shrink-0 text-right">
        {market ? <>
          <div className="font-num text-[13px] font-semibold tnum text-cream">{target.ok ? `${fmtQuoteAmount(target.ui, t.decimals)}` : '—'} <span className="hidden max-w-[72px] truncate align-bottom text-lav/70 sm:inline-block">{t.symbol}</span></div>
          <div className="text-[11px] font-bold text-lav/60">{target.ok ? (target.basis === 'min-migration' ? 'Raydium min.' : <><span className="sm:hidden">target</span><span className="hidden sm:inline">migration target</span></>) : target.reason === 'no-price' ? 'no price feed yet' : 'target too large'}</div>
        </> : <div className="rounded-full bg-peach/10 px-2 py-0.5 text-[10px] font-black uppercase text-peach ring-1 ring-peach/30">No LaunchLab market</div>}
      </div>
      <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 transition', selected ? 'bg-pink text-night ring-pink' : 'ring-lav/25 text-transparent')}><ICheck s={12} /></span>
    </div>
  )
})

/* ---------------- pasted mint ---------------- */
function PasteMint({ quotes, value, pick, solUsd, T }: { quotes: QuoteToken[]; value: string; pick: (t: QuoteToken) => void; solUsd: number | null; T: string }) {
  const [v, setV] = useState('')
  const lookup = useMemo(() => lookupMint(v, quotes), [v, quotes])
  const id = useId()
  return (
    <div className="mx-3 mt-3 rounded-2xl bg-gradient-to-br from-blue/10 to-pink/5 p-3 ring-1 ring-blue/20">
      <label htmlFor={id} className="label !text-blue/90">Paste a mint</label>
      <input id={id} className="input mt-1.5 !py-2.5 font-num text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" spellCheck={false} autoComplete="off"
        aria-invalid={lookup?.kind === 'invalid'} aria-describedby={`${id}-r`} />
      <div id={`${id}-r`} aria-live="polite">{lookup && <MintResult lookup={lookup} value={value} pick={pick} solUsd={solUsd} T={T} compact />}</div>
    </div>
  )
}
function MintResult({ lookup, value, pick, solUsd, T, compact, loading }: { lookup: MintLookup | null; value: string; pick: (t: QuoteToken) => void; solUsd: number | null; T: string; compact?: boolean; loading?: boolean }) {
  if (loading) return <Skeleton rows={1} />
  if (!lookup) return null
  if (lookup.kind === 'invalid') return <div className={cx('flex items-center gap-2 text-xs font-extrabold text-danger', compact ? 'mt-2' : 'p-5')} role="alert"><IX s={14} />That isn’t a valid Solana address{lookup.reason === 'charset' ? ' (base58 only: no 0, O, I or l)' : ' (a mint is 32–44 base58 characters)'}.</div>
  if (lookup.kind === 'no-market') return (
    <div className={cx('flex items-center gap-4', compact ? 'mt-3' : 'p-5')}>
      <img src="./mochi/sleepy-512.webp" alt="" className={cx('shrink-0 drop-shadow-[0_8px_20px_rgba(182,156,255,.35)]', compact ? 'h-14 w-14' : 'h-20 w-20')} />
      <div className="min-w-0">
        <div className="font-display text-lg font-extrabold leading-tight text-cream">No LaunchLab market for this token yet</div>
        <div className="mt-1 text-xs font-bold text-lav">{lookup.quote ? <><span className="text-cream">{lookup.quote.symbol}</span> · {lookup.quote.name} is known, but </> : <span className="font-num">{short(lookup.mint, 6)} · </span>}Raydium hasn’t created a LaunchLab config for this mint, and only Raydium can add one. Pick a listed pair instead.</div>
      </div>
    </div>
  )
  const t = lookup.quote, target = migrationTarget(t, solUsd), on = value === t.mint
  return (
    <div className={cx('flex flex-wrap items-center gap-3', compact ? 'mt-3' : 'p-4')}>
      <QuoteLogo t={t} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5"><span className="font-display text-lg font-extrabold">${T}/{t.symbol}</span>{t.token2022 && <T22Badge />}<span className="rounded-full bg-mint/15 px-1.5 py-px text-[10px] font-black uppercase text-mint">LaunchLab ready</span></div>
        <div className="text-xs font-bold text-lav">{t.name} · {GROUP_LABEL[t.group]} · migrates at {target.ok ? `${fmtQuoteAmount(target.ui, t.decimals)} ${t.symbol}` : '—'}</div>
      </div>
      <button type="button" onClick={() => pick(t)} className={cx(on ? 'btn-ghost' : 'btn-candy', '!px-4 !py-2 text-sm')} aria-pressed={on}>{on ? <><ICheck s={14} /> Selected</> : 'Use this pair'}</button>
    </div>
  )
}

/* ---------------- selected pair summary ---------------- */
function PairSummary({ quote, ticker, solUsd, raiseSol, devBuySol, launchable, coin, loading }: { quote: QuoteToken | null; ticker: string; solUsd: number | null; raiseSol: number; devBuySol: number; launchable: boolean; coin: Props['coin']; loading: boolean }) {
  const reduced = useReducedMotion()
  if (!quote) return null
  const target: MigrationTarget = migrationTarget(quote, solUsd)
  const n: QuoteNumbers | null = quoteNumbers(quote, solUsd, raiseSol, devBuySol)
  const sym = quote.symbol, d = quote.decimals
  const amt = (v: number) => `${fmtQuoteAmount(v, d)} ${sym}`
  const usd = (v: number) => { const u = n?.usd(v); return u == null ? null : fmtUsdAmount(u) }
  return (
    <motion.div layout={!reduced} className="neon-p relative overflow-hidden rounded-3xl bg-gradient-to-br from-plum2/90 via-plum/90 to-night/90 p-4 md:p-5" aria-live="polite">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-pink/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-blue/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="relative h-14 w-[86px] shrink-0">
          <div className="absolute left-0 top-0 rounded-[30%] ring-2 ring-night"><CoinAvatar image={coin.image || undefined} hue={coin.hue} accessory={coin.acc} size={56} mood="happy" /></div>
          <motion.div key={quote.mint} initial={reduced ? false : { scale: 0.4, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className="absolute left-[34px] top-1 rounded-full ring-[3px] ring-plum">
            <QuoteLogo t={quote} size={50} />
          </motion.div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="label !text-pink/90">selected pair</div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={quote.mint} initial={reduced ? false : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.2 }} className="break-all font-display text-[24px] font-extrabold leading-tight sm:text-[28px] md:text-[32px]">
              ${ticker}<span className="text-lav/50">/</span><span className="text-candy">{sym}</span>
            </motion.div>
          </AnimatePresence>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-lav">
            <span className="rounded-full bg-lav/10 px-2 py-0.5">{GROUP_LABEL[quote.group]}</span>
            {quote.token2022 ? <T22Badge big /> : <span className="rounded-full bg-lav/10 px-2 py-0.5">SPL Token</span>}
            {quote.configId && <span className="rounded-full bg-mint/10 px-2 py-0.5 text-mint" title={`LaunchLab GlobalConfig ${quote.configId}`}>config {short(quote.configId, 4)}</span>}
            {quote.mint !== WSOL_MINT && quote.priceUsd != null && <span className="rounded-full bg-lav/10 px-2 py-0.5 font-num tnum">1 {sym} ≈ {fmtUsdAmount(quote.priceUsd)}</span>}
          </div>
        </div>
        <div className="w-full text-left sm:w-auto sm:text-right">
          <div className="label">migrates at</div>
          {loading && quote.mint !== WSOL_MINT ? <div className="mt-1 h-8 w-32 animate-pulse rounded-xl bg-lav/10" /> : target.ok ? <>
            <Num className="font-num text-[30px] font-semibold leading-none tnum text-ice" v={amt(target.ui)} />
            <div className="mt-1 text-[11px] font-bold text-lav">
              {usd(target.ui) && <span className="font-num tnum text-cream/90">≈ {usd(target.ui)} · </span>}
              {target.basis === 'standard' ? (quote.mint === WSOL_MINT ? 'standard 85 SOL raise' : '85 SOL in USD, converted') : <span className="text-peach">Raydium minimum applies</span>}
            </div>
          </> : <div className="mt-1 max-w-[220px] text-xs font-extrabold text-peach">{target.reason === 'no-price' ? 'No USD price for this token yet, so the 85 SOL target can’t be sized.' : target.reason === 'overflow' ? 'Target exceeds the u64 limit at this price.' : 'No LaunchLab market.'}</div>}
        </div>
      </div>

      {target.ok && target.basis === 'min-migration' && target.usdEquivalentRaw != null && (
        <div className="relative mt-3 rounded-2xl bg-peach/10 px-3 py-2 text-[11px] font-bold text-peach ring-1 ring-peach/25">85 SOL is worth {fmtQuoteAmount(Number(target.usdEquivalentRaw) / 10 ** d, d)} {sym} today, below this LaunchLab config’s minimum of {fmtQuoteAmount(Number(target.minRaw) / 10 ** d, d)} {sym}, so the minimum is used.</div>
      )}

      {n && (
        <div className="relative mt-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile k="Raise at full" v={amt(n.firstBuy)} sub={usd(n.firstBuy) ?? `${fmtQuoteAmount(raiseSol + devBuySol, 2)} SOL-sized`} accent="pink" icon={<IBolt s={13} />} />
            <Tile k="Supply share" v={`${n.pctOfSupply.toFixed(2)}%`} sub={`${fmtQuoteAmount(n.tokens / 1e6, 2)}M tokens`} accent="blue" icon={<ISparkle s={13} />} />
            <Tile k="Clearing mcap" v={amt(n.mcapAtClearing)} sub={usd(n.mcapAtClearing) ?? 'same price for all'} accent="lav" icon={<IShield s={13} />} />
            <Tile k="Left to migrate" v={n.completes ? 'Migrates now' : amt(n.remainingGross)} sub={n.completes ? 'first buy fills the curve' : `${usd(n.remainingGross) ? usd(n.remainingGross) + ' · ' : ''}incl. 1% fee`} accent="mint" icon={<ICheck s={13} />} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-lav/60"><span>first buy</span><span className="font-num normal-case tnum">{n.progressPct.toFixed(1)}% of migration target</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-lav/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-pink via-lav to-blue anim-gradient" initial={false} animate={{ width: `${Math.max(1.5, n.progressPct)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-lav/70">Same LaunchLab curve as SOL, sized to the target above: your {fmtQuoteAmount(raiseSol, 2)} SOL presale{devBuySol > 0 ? ` + ${fmtQuoteAmount(devBuySol, 2)} SOL dev buy` : ''} becomes {amt(n.firstBuy)} and buys the same share of supply.</p>
          </div>
        </div>
      )}
      {!launchable && (
        <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-blue/10 px-3 py-2.5 text-[12px] font-bold text-blue ring-1 ring-blue/25">
          <ISparkle s={15} className="mt-0.5 shrink-0" />
          <span><span className="text-cream">Preview only.</span> Floof’s fair-window escrow holds SOL today, so ${ticker}/{sym} can’t be created yet. The numbers show what it would look like once multi-quote escrow ships.</span>
        </div>
      )}
    </motion.div>
  )
}
const ACC = { pink: 'text-pink', blue: 'text-blue', lav: 'text-lav', mint: 'text-mint' } as const
function Tile({ k, v, sub, accent, icon }: { k: string; v: string; sub: string; accent: keyof typeof ACC; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-night/55 p-3 ring-1 ring-lav/10">
      <div className={cx('flex items-center gap-1 truncate whitespace-nowrap text-[10px] font-black uppercase tracking-wider', ACC[accent])}>{icon}{k}</div>
      <Num className="mt-1 block truncate font-num text-[17px] font-semibold tnum text-cream" v={v} />
      <div className="truncate text-[11px] font-bold text-lav/70">{sub}</div>
    </div>
  )
}
/** Value that softly rolls when it changes. */
function Num({ v, className }: { v: string; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <span className={cx('relative inline-block overflow-hidden align-bottom', className)} title={v}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={v} className="inline-block" initial={reduced ? false : { y: '60%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-60%', opacity: 0 }} transition={{ duration: 0.18 }}>{v}</motion.span>
      </AnimatePresence>
    </span>
  )
}

/* ---------------- small parts ---------------- */
const T22Badge = ({ big }: { big?: boolean }) => (
  <span title="Token-2022 mint: extensions such as transfer fees are checked before launch" aria-label="Token-2022" className={cx('shrink-0 rounded-full bg-lav/15 font-black uppercase tracking-wide text-lav ring-1 ring-lav/30', big ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-px text-[9px]')}>
    {big ? 'Token-2022' : <><span className="sm:hidden">T22</span><span className="hidden sm:inline">Token-2022</span></>}
  </span>
)
const hueOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
/** Token logo with a branded generated fallback when the URL is missing or fails. */
export const QuoteLogo = memo(function QuoteLogo({ t, size }: { t: Pick<QuoteToken, 'mint' | 'symbol' | 'logo'>; size: number }) {
  const [broken, setBroken] = useState<string | null>(null)
  const src = t.logo
  if (src && src !== broken) return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(src)} className="shrink-0 rounded-full bg-night object-cover" style={{ width: size, height: size }} />
  const h = hueOf(t.mint), letters = (t.symbol.replace(/[^A-Za-z0-9]/g, '') || '?').slice(0, t.symbol.length > 4 ? 2 : 3).toUpperCase()
  return (
    <span aria-hidden className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-extrabold text-night"
      style={{ width: size, height: size, fontSize: size * (letters.length > 2 ? 0.3 : 0.36), background: `radial-gradient(circle at 32% 28%, hsl(${h} 100% 94%), hsl(${h} 95% 74%) 55%, hsl(${(h + 40) % 360} 85% 62%))`, boxShadow: 'inset 0 -3px 6px rgba(255,95,184,.35)' }}>
      <span className="absolute left-[18%] top-[14%] h-[22%] w-[38%] rounded-full bg-white/60 blur-[1px]" />
      <span className="relative">{letters}</span>
    </span>
  )
})
function StateCard({ img, title, body, action, note }: { img: 'sleepy' | 'idle'; title: string; body: string; action?: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center" role="status">
      <img src={`./mochi/${img}-512.webp`} alt="" className="h-20 w-20 anim-floaty drop-shadow-[0_10px_24px_rgba(182,156,255,.35)]" />
      <div className="font-display text-lg font-extrabold">{title}</div>
      <div className="max-w-sm text-xs font-bold text-lav">{body}</div>
      {action}{note && <div className="text-[11px] font-bold text-lav/60">{note}</div>}
    </div>
  )
}
function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 px-2 py-2" role="status" aria-label="Loading quote pairs">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[60px] items-center gap-3 rounded-2xl px-3" style={{ opacity: 1 - i * 0.12 }}>
          <span className="h-9 w-9 animate-pulse rounded-full bg-lav/15" />
          <div className="flex-1 space-y-1.5"><span className="block h-3.5 w-20 animate-pulse rounded bg-lav/15" /><span className="block h-2.5 w-36 animate-pulse rounded bg-lav/10" /></div>
          <span className="h-3.5 w-20 animate-pulse rounded bg-lav/10" />
        </div>
      ))}
    </div>
  )
}
