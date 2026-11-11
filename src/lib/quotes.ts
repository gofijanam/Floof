// Pure logic for the quote-pair picker: mint validation, search/filter, migration-target sizing
// and the first-buy numbers expressed in the chosen quote. No React, no fetch: unit-tested
// directly by tests/quotes.test.mjs (Node strips the types).
import type { QuoteGroup, QuoteToken, QuotesResponse } from '../types/quotes'
import { standardCurve, buyExactIn, GRADUATION_QUOTE, FEE_DENOMINATOR, FEE_RATE, SUPPLY } from '../../server/launchlab-curve.mjs'

export const WSOL_MINT = 'So11111111111111111111111111111111111111112'
export const QUOTE_GROUPS: readonly QuoteGroup[] = ['solana', 'stocks', 'currencies', 'leverage', 'baskets', 'collectibles', 'custom']
export const GROUP_LABEL: Record<QuoteGroup, string> = { solana: 'Solana', stocks: 'Stocks', currencies: 'Currencies', leverage: 'Leverage', baskets: 'Baskets', collectibles: 'Collectibles', custom: 'Custom' }
/** Standard LaunchLab raise that every quote's target is sized against (85 SOL, in lamports). */
export const STANDARD_TARGET_LAMPORTS: bigint = GRADUATION_QUOTE
const U64_MAX = 18_446_744_073_709_551_615n
const TOKEN_DECIMALS = 6

/* ---------------- mint validation ---------------- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B58_MAP: Record<string, number> = Object.fromEntries([...B58].map((c, i) => [c, i]))
/** Decodes base58; returns null on any non-alphabet character. */
export function base58Decode(s: string): Uint8Array | null {
  let n = 0n
  for (const c of s) { const v = B58_MAP[c]; if (v === undefined) return null; n = n * 58n + BigInt(v) }
  const bytes: number[] = []
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n }
  for (const c of s) { if (c !== '1') break; bytes.unshift(0) }
  return Uint8Array.from(bytes)
}
export type MintCheck = { ok: true; mint: string } | { ok: false; reason: 'empty' | 'charset' | 'length' }
/** A Solana public key: base58, decodes to exactly 32 bytes. (Mints may be off-curve, so no curve check.) */
export function checkMint(input: string): MintCheck {
  const s = input.trim()
  if (!s) return { ok: false, reason: 'empty' }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return { ok: false, reason: 'charset' }
  if (s.length < 32 || s.length > 44) return { ok: false, reason: 'length' }
  const b = base58Decode(s)
  return b && b.length === 32 ? { ok: true, mint: s } : { ok: false, reason: 'length' }
}
export const isMintLike = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())

export type MintLookup =
  | { kind: 'invalid'; reason: 'charset' | 'length' }
  | { kind: 'ready'; quote: QuoteToken }
  | { kind: 'no-market'; mint: string; quote?: QuoteToken }
/** Resolves a pasted mint against the quote list. Anything without a LaunchLab config is "no market". */
export function lookupMint(input: string, quotes: QuoteToken[]): MintLookup | null {
  const c = checkMint(input)
  if (!c.ok) return c.reason === 'empty' ? null : { kind: 'invalid', reason: c.reason }
  const quote = quotes.find((q) => q.mint === c.mint)
  if (quote && quote.configId) return { kind: 'ready', quote }
  return { kind: 'no-market', mint: c.mint, quote }
}

/* ---------------- search / filter ---------------- */
export interface QuoteFilter { group: QuoteGroup; query: string }
/**
 * Empty query: the tab's quotes, launchable first, original (curated) order otherwise.
 * Non-empty query: searches every group (results are labelled with their group) and ranks
 * exact ticker > ticker prefix > name prefix > word prefix > substring > mint prefix.
 */
export function filterQuotes(quotes: QuoteToken[], { group, query }: QuoteFilter): QuoteToken[] {
  const q = query.trim().toLowerCase().replace(/^\$/, '')
  if (!q) return quotes.filter((t) => t.group === group).map((t, i) => [t, i] as const).sort((a, b) => (b[0].configId ? 1 : 0) - (a[0].configId ? 1 : 0) || a[1] - b[1]).map(([t]) => t)
  const scored: [QuoteToken, number, number][] = []
  quotes.forEach((t, i) => { const s = matchScore(t, q); if (s > 0) scored.push([t, s, i]) })
  return scored.sort((a, b) => b[1] - a[1] || (b[0].configId ? 1 : 0) - (a[0].configId ? 1 : 0) || a[2] - b[2]).map(([t]) => t)
}
export function matchScore(t: QuoteToken, q: string): number {
  const sym = t.symbol.toLowerCase(), name = t.name.toLowerCase()
  if (t.mint === q || t.mint.toLowerCase() === q) return 100
  if (sym === q) return 90
  if (sym.startsWith(q)) return 70
  if (name.startsWith(q)) return 60
  if (name.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 50
  if (sym.includes(q) || name.includes(q)) return 30
  if (q.length >= 4 && t.mint.toLowerCase().startsWith(q)) return 20
  return 0
}
export function countByGroup(list: QuoteToken[]): Record<QuoteGroup, number> {
  const out = Object.fromEntries(QUOTE_GROUPS.map((g) => [g, 0])) as Record<QuoteGroup, number>
  for (const t of list) out[t.group]++
  return out
}

/* ---------------- units ---------------- */
/** Exact raw → decimal string (no float rounding). */
export function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n, v = neg ? -raw : raw, base = 10n ** BigInt(decimals)
  const whole = v / base, frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '')
}
/** Decimal number → raw units, rounded half-up. Returns null when not finite/negative. */
export function toRaw(amount: number, decimals: number): bigint | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  const [m, e] = amount.toExponential(15).split('e')
  const exp = Number(e) + decimals, digits = m.replace('.', '').replace('-', '')
  const shift = exp - 15
  if (shift >= 0) return BigInt(digits) * 10n ** BigInt(shift)
  const div = 10n ** BigInt(-shift), n = BigInt(digits)
  return (n + div / 2n) / div
}
/**
 * Readable amount for a quote token: compact above 1M, grouped with ≤2 dp above 1k, 4 significant
 * digits for small values, never more fraction digits than the mint has.
 */
export function fmtQuoteAmount(v: number, decimals = 9): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  const maxFd = Math.min(decimals, a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : Math.max(2, 3 - Math.floor(Math.log10(a))))
  const s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: maxFd })
  return s === '0' || s === '-0' ? `<${(10 ** -decimals).toFixed(decimals)}` : s
}
export function fmtUsdAmount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1) return '$' + v.toFixed(2)
  if (v <= 0) return '$0'
  return '$' + v.toPrecision(3)
}

/* ---------------- migration target ---------------- */
export type TargetBasis = 'standard' | 'min-migration'
export type MigrationTarget =
  | { ok: true; raw: bigint; ui: number; basis: TargetBasis; usdEquivalentRaw: bigint | null; minRaw: bigint; usd: number | null; solUsd: number | null }
  | { ok: false; reason: 'no-market' | 'no-price' | 'overflow' }
/** SOL/USD from the quote list (the WSOL entry), the single price source both sides use. */
export function solUsdFrom(quotes: QuoteToken[]): number | null {
  const p = quotes.find((q) => q.mint === WSOL_MINT)?.priceUsd
  return p != null && Number.isFinite(p) && p > 0 ? p : null
}
/**
 * Migration target in raw quote units = USD value of 85 SOL converted into the quote
 * (85 × solUsd / quoteUsd), or the config's minMigration when that is larger. SOL is exactly 85 SOL.
 */
export function migrationTarget(q: QuoteToken, solUsd: number | null): MigrationTarget {
  if (!q.configId) return { ok: false, reason: 'no-market' }
  const minRaw = BigInt(q.minMigration ?? '0'), base = 10 ** q.decimals
  let usdRaw: bigint | null = null
  if (q.mint === WSOL_MINT) usdRaw = STANDARD_TARGET_LAMPORTS
  else if (solUsd != null && q.priceUsd != null && q.priceUsd > 0) usdRaw = toRaw(Number(STANDARD_TARGET_LAMPORTS) / 1e9 * solUsd / q.priceUsd, q.decimals)
  if (usdRaw == null) return { ok: false, reason: 'no-price' }
  const basis: TargetBasis = minRaw > usdRaw ? 'min-migration' : 'standard'
  const raw = basis === 'min-migration' ? minRaw : usdRaw
  if (raw > U64_MAX || raw <= 0n) return { ok: false, reason: 'overflow' }
  const ui = Number(raw) / base
  const px = q.mint === WSOL_MINT ? solUsd : q.priceUsd
  return { ok: true, raw, ui, basis, usdEquivalentRaw: usdRaw, minRaw, usd: px != null ? ui * px : null, solUsd }
}

/* ---------------- first buy in the chosen quote ---------------- */
export interface QuoteNumbers {
  target: Extract<MigrationTarget, { ok: true }>
  /** Presale raise + dev buy, converted into the quote (same share of the curve as in SOL). */
  raise: number; devBuy: number; firstBuy: number
  pctOfSupply: number; tokens: number
  /** Clearing price (quote per token) and the implied market caps, in the quote. */
  avgPrice: number; mcapAtClearing: number; mcapAfter: number
  /** Net quote still needed on the curve to migrate, and the gross a buyer pays incl. the 1% fee. */
  remainingNet: number; remainingGross: number; progressPct: number
  completes: boolean
  usd: (quoteAmount: number) => number | null
}
/**
 * The Create form sizes the raise in SOL against the standard 85-SOL curve. A quote-denominated
 * launch runs the same constant-product curve with `target` = the quote's migration target, so
 * a raise of R SOL maps to R/85 × target quote units and buys the same share of supply.
 * Everything is computed with the program's integer math in raw quote units.
 */
export function quoteNumbers(q: QuoteToken, solUsd: number | null, raiseSol: number, devBuySol: number): QuoteNumbers | null {
  const target = migrationTarget(q, solUsd)
  if (!target.ok) return null
  const lam = (s: number) => BigInt(Math.round((Number.isFinite(s) && s > 0 ? s : 0) * 1e9))
  const scale = (l: bigint) => l * target.raw / STANDARD_TARGET_LAMPORTS
  const raiseRaw = scale(lam(raiseSol)), devRaw = scale(lam(devBuySol)), budget = raiseRaw + devRaw
  let curve
  try { curve = standardCurve({ target: target.raw }) } catch { return null }
  const buy = buyExactIn(curve, budget)
  const base = 10 ** q.decimals, tok = 10 ** TOKEN_DECIMALS, supply = Number(SUPPLY) / tok
  const startPrice = Number(curve.virtualQuote) / base / (Number(curve.virtualBase) / tok)
  const avgPrice = buy.tokens > 0n ? Number(buy.spent) / base / (Number(buy.tokens) / tok) : startPrice
  const realQuote = buy.net, spotAfter = Number(curve.virtualQuote + realQuote) / base / (Number(curve.virtualBase - buy.tokens) / tok)
  const remaining = curve.target > realQuote ? curve.target - realQuote : 0n
  const gross = (remaining * FEE_DENOMINATOR + (FEE_DENOMINATOR - FEE_RATE) - 1n) / (FEE_DENOMINATOR - FEE_RATE)
  const px = q.mint === WSOL_MINT ? solUsd : q.priceUsd
  return {
    target, raise: Number(raiseRaw) / base, devBuy: Number(devRaw) / base, firstBuy: Number(budget) / base,
    pctOfSupply: Number(buy.tokens) / Number(SUPPLY) * 100, tokens: Number(buy.tokens) / tok,
    avgPrice, mcapAtClearing: avgPrice * supply, mcapAfter: spotAfter * supply,
    remainingNet: Number(remaining) / base, remainingGross: Number(gross) / base,
    progressPct: Math.min(100, Number(realQuote * 10000n / curve.target) / 100), completes: buy.completes,
    usd: (a: number) => (px != null ? a * px : null),
  }
}

/* ---------------- response validation ---------------- */
/** Defensive parse of GET /api/quotes: drops malformed rows instead of crashing the picker. */
export function parseQuotesResponse(body: unknown): QuotesResponse {
  const b = body as Partial<QuotesResponse> | null
  if (!b || !Array.isArray(b.quotes)) throw new Error('Unexpected /api/quotes response')
  const quotes = b.quotes.filter((t): t is QuoteToken => !!t && typeof t === 'object'
    && checkMint(String((t as QuoteToken).mint)).ok && typeof t.symbol === 'string' && typeof t.name === 'string'
    && Number.isInteger(t.decimals) && t.decimals >= 0 && t.decimals <= 18 && (QUOTE_GROUPS as string[]).includes(t.group)
    && (t.configId === null || checkMint(String(t.configId)).ok) && (t.minMigration === null || /^\d+$/.test(String(t.minMigration)))
    && (t.priceUsd === null || (typeof t.priceUsd === 'number' && Number.isFinite(t.priceUsd))))
    .map((t) => ({ ...t, logo: typeof t.logo === 'string' && /^https:\/\//.test(t.logo) ? t.logo : null, token2022: !!t.token2022 }))
  return { observedAt: typeof b.observedAt === 'string' ? b.observedAt : new Date(0).toISOString(), source: b.source, quotes }
}
