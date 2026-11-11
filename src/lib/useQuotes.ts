import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuotesResponse } from '../types/quotes'
import { quotesClient, type QuotesClient } from './quotesClient.ts'

export type QuotesState =
  | { status: 'loading'; data: QuotesResponse | null; error: null }
  | { status: 'ready'; data: QuotesResponse; error: null }
  | { status: 'error'; data: QuotesResponse | null; error: string }

/** Loads GET /api/quotes once, then refreshes prices quietly every `refreshMs` (keeps the last good list on failure). */
export function useQuotes(client: QuotesClient = quotesClient, refreshMs = 60_000) {
  const [state, setState] = useState<QuotesState>({ status: 'loading', data: null, error: null })
  const last = useRef<QuotesResponse | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = (quiet: boolean) => {
      if (!quiet) setState({ status: 'loading', data: last.current, error: null })
      client.list({ signal: ctrl.signal })
        .then((data) => { last.current = data; setState({ status: 'ready', data, error: null }) })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return
          const msg = e instanceof Error ? e.message : 'Quote list unavailable'
          setState(last.current && quiet ? { status: 'ready', data: last.current, error: null } : { status: 'error', data: last.current, error: msg })
        })
        .finally(() => { if (!ctrl.signal.aborted) timer = setTimeout(() => load(true), refreshMs) })
    }
    load(false)
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [client, refreshMs, nonce])
  const retry = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, retry }
}
