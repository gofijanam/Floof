/**
 * Contract for `GET /api/quotes`: the quote tokens a Floof launch can be paired with.
 *
 * One entry per quote mint. An entry is launchable on Raydium LaunchLab only when `configId`
 * is set (Raydium has created the GlobalConfig for that mint; Floof cannot create one).
 * Entries with `configId: null` may still be returned so a pasted/searched mint can explain
 * "No LaunchLab market for this token yet" instead of looking unknown.
 */
export type QuoteGroup = 'solana' | 'stocks' | 'currencies' | 'leverage' | 'baskets' | 'collectibles' | 'custom'

export interface QuoteToken {
  /** Quote mint address (base58). */
  mint: string
  /** Display ticker. Not unique: two mints can share a symbol, always key by `mint`. */
  symbol: string
  name: string
  /** Absolute https URL of the token icon, or null. The UI falls back to a generated avatar. */
  logo: string | null
  /** Mint decimals (0–18). All raw amounts below are in these units. */
  decimals: number
  group: QuoteGroup
  /** Mint owned by the Token-2022 program (transfer-fee/extension caveats apply). */
  token2022: boolean
  /** Raydium LaunchLab GlobalConfig address for this quote mint; null = no LaunchLab market. */
  configId: string | null
  /**
   * LaunchLab `minFundRaisingB` of that config: the smallest migration target (`total_quote_fund_raising`)
   * the config accepts, as a raw u64 integer string in the quote's own decimals. null when `configId` is null.
   */
  minMigration: string | null
  /** USD price of one whole quote token at `observedAt`; null when no price source has it. */
  priceUsd: number | null
}

export interface QuotesResponse {
  /** ISO-8601 time the prices were observed. */
  observedAt: string
  /** Free-text provenance, e.g. "LaunchLab mainnet configs + Jupiter price/v3". */
  source?: string
  quotes: QuoteToken[]
}
