// Client for GET /api/quotes. Two interchangeable implementations behind one interface:
//   - httpQuotesClient: the real endpoint (MAMAD's server).
//   - mockQuotesClient: an offline snapshot built by scripts/snapshot-quotes.mjs.
// Swap: VITE_QUOTES_SOURCE=mock at build time uses the snapshot (default is the API). The UI only
// imports `quotesClient` and the `QuotesClient` type, so nothing else changes.
import type { QuotesResponse } from '../types/quotes'
import { parseQuotesResponse } from './quotes.ts'

export interface QuotesClient { list(opts?: { signal?: AbortSignal }): Promise<QuotesResponse> }

export const httpQuotesClient: QuotesClient = {
  async list({ signal } = {}) {
    const r = await fetch('/api/quotes', { signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`Quote list unavailable (HTTP ${r.status})`)
    return parseQuotesResponse(await r.json())
  },
}

export type MockScenario = 'ok' | 'slow' | 'empty' | 'error'
const scenarioFromUrl = (): MockScenario => {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quotes') : null
  return v === 'slow' || v === 'empty' || v === 'error' ? v : 'ok'
}
/** Mock only: `?quotes=slow|empty|error` in the page URL previews the loading, empty and error states. */
export type MockListOptions = { signal?: AbortSignal; delayMs?: number; scenario?: MockScenario; load?: () => Promise<unknown> }
/** Lazy so the ~200 KB snapshot is its own chunk and only loads on the Create page. */
const loadSnapshot = async (): Promise<unknown> => (await import('../mocks/quotes.snapshot.json')).default
export const mockQuotesClient: { list(opts?: MockListOptions): Promise<QuotesResponse> } = {
  async list({ signal, delayMs, scenario = scenarioFromUrl(), load = loadSnapshot }: MockListOptions = {}) {
    const wait = delayMs ?? (scenario === 'slow' ? 60_000 : 280)
    if (wait > 0) await new Promise<void>((res, rej) => { const t = setTimeout(res, wait); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')) }, { once: true }) })
    if (scenario === 'error') throw new Error('Quote list unavailable (mock error)')
    const parsed = parseQuotesResponse(await load())
    return scenario === 'empty' ? { ...parsed, quotes: [] } : parsed
  },
}

const source = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_QUOTES_SOURCE
// Default: the real endpoint (it marks only quotes Floof can launch on this deployment). VITE_QUOTES_SOURCE=mock for offline UI work.
export const quotesClient: QuotesClient = source === 'mock' ? mockQuotesClient : httpQuotesClient
