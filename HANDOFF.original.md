# floof.fun — backend handoff (lean)

Prototype = static UI only (`/workspace/floof/web`, Vite + React + Tailwind + Framer Motion + Three.js). All data is mocked in `src/lib/mock.ts`, live behaviour is simulated in `src/lib/store.ts` (1 s tick). Shapes below match those mocks, so swapping the store for API calls is mechanical. **Devnet only.**

## 1. On-chain programs

### Escrow / fair-window program (new, Anchor)
- `create_coin(params)` → creates Mint (1B supply, 6 dp), `Window` PDA, `Bond` PDA; transfers creator bond into the bond vault; creator allocation into a vesting PDA.
- `pledge(window, amount)` → SOL into `window_vault`; `Pledge` PDA per (window, wallet). Enforces `amount_total ≤ 1% × max_raise`, `now < window_end`. Anti-sybil: pledge must carry an attestation (ed25519 sig from the floof sybil service over `wallet || window || expiry`), verified via the ed25519 sysvar.
- `settle(window)` (permissionless crank at `window_end`):
  - `pledged < min_target` → state `Refunding`.
  - else `raised = min(pledged, max_raise)`; `clearing_price = raised / window_tokens`; `fill = raised / pledged`.
  - CPI into LaunchLab to create the pool and buy `window_tokens` with `raised` **in the same tx**, so every pledger enters at one price in one block and no one can trade before it.
- `claim(pledge)` → tokens `pledge.amount × fill / clearing_price` + refund `pledge.amount × (1 − fill)` (or the full refund when `Refunding`). Pull-based, so settle has no compute blow-up.
- `release_bond / slash_bond` → returned on graduation or after 30 days clean; slashed to a holder-claim pool on an early creator dump (vesting breach) or a TRUTH fraud proof signed by the oracle multisig.
- Max raise = `price_ceiling × window_tokens` (UI: Create step 2).

### Raydium LaunchLab → CPMM
- After settle, trading runs on the LaunchLab bonding curve. Graduation migrates to Raydium CPMM (`GRADUATE_SOL = 85` in mocks).
- Fees, 1% total: 0.25% Raydium, 0.25% creator, 0.5% platform. The platform share funds Scout rewards.

## 2. Off-chain services
- **Indexer** (Helius/Yellowstone gRPC): Window/Pledge/Trade events → Postgres; websocket fan-out for the live escrow meter, pledge feed, trades and toasts.
- **Sybil service**: funding-graph clustering plus wallet age and history. It issues pledge attestations, and linked wallets share one cap.
- **TRUTH indexer**: per-mint real vs sybil buys, wash volume (self-trades, circular flows) and sybil clusters, graded A+…D (`truth` object below). It works for any CA; external tokens are graded from chain history.
- **Scout rewards**: points = early pledge (first 3 min ×2) × hold time, plus a graduation bonus. Weekly merkle distributor funded by the platform fee.
- **Reputation**: deterministic from bond outcomes, vesting kept, TRUTH grades and graduations.

## 3. APIs per screen (JSON shapes = mocks)
```ts
Coin = { id, ticker, name, tagline, hue, accessory, creator, status: 'open'|'upcoming'|'curve'|'graduated', ca,
  windowStart, windowEnd, durationMs, priceCeiling, windowTokens, minTarget, pledged, pledgers, bondSol, lockDays,
  clearingPrice, price, change24h, volume24h, curveSol, holders, snipersBlocked,
  truth: { grade, score, realPct, sybilClusters, washPct }, createdAgo, tags }
Creator = { handle, name, rep, tier, bondsPosted, bondsReturned, launches, graduated, rugs, joined, followers, bio, hue, accessory, wallet }
FeedItem = { id, coin, ticker, wallet, amount, t, kind: 'pledge'|'blocked'|'buy'|'sell' }
```
| Screen | Endpoints |
|---|---|
| Landing | `GET /stats` → `{launched, snipersBlocked, refunded, pledged24h}` · `GET /coins?status=open&limit=3` · WS `feed` |
| Explore | `GET /coins?status&q&minGrade&minRep&sort&cursor` → `Coin[]` |
| Create | `POST /coins/prepare` (validates ticker uniqueness, returns unsigned `create_coin` tx) · `POST /uploads/image` (≤4 MB → IPFS/Arweave URI) |
| Coin live | `GET /coins/:id` · WS `coin:<id>` (pledged, pledgers, snipersBlocked, feed) · `POST /pledge/attest {wallet, coin}` → `{sig, expiry}` · client builds `pledge` tx |
| POOF result | `GET /coins/:id/settlement?wallet=` → `{price, fill, oversub, slot, myFilled, myRefund, myTokens, ticketNo}` · `claim` tx |
| Trade | `GET /coins/:id/candles?tf=5m|1h|4h|1d` → `[t,o,h,l,c,v][]` · `GET /coins/:id/trades` · `GET /coins/:id/holders` → `{wallet,pct,tag}[]` · `POST /quote {side, amount, unit, slippageBps}` → `{sol, tokens, fee, impact, avg, minOut, tx}` |
| Portfolio | `GET /wallets/:w/positions` → `{coin, tokens, cost}[]` (PnL client-side) · `/pledges` · `/tickets` → `Ticket[]` · `/claims` → `{id, kind:'refund'|'scout', coin, amount, note, claimed}[]` |
| Creator | `GET /creators/:handle` → `Creator` + `history[]` + `coins` |
| TRUTH | `GET /truth/:ca` → `truth` + `{clusters: {nodes, edges}, checks: {id, ok, label}[]}` |
| Scouts | `GET /scouts?season=` → `{rank, wallet, points, windows, hold, earned}[]` |

## 4. Unverified assumptions (verify before building)
- LaunchLab supports CPI pool creation plus an initial buy in one tx from our program, and permits a custom fee split (0.25/0.25/0.5). The 85 SOL graduation threshold and auto-migration to CPMM are assumed defaults.
- A single settle tx can fit (CPI create + buy); otherwise a 2-tx flow needs a lock that blocks trading until our buy lands.
- The ed25519 attestation scheme is enough for anti-sybil without hurting UX.
- Compute limits for the TRUTH clustering on large mints; indexer provider choice.
- Wallet adapter, priority fees and Jito bundles are not modelled. The wallet in the UI is a mock button.

## Brand kit (final Mochi) — wiring
- `public/floof-mochi.glb` drives the landing/POOF hero (`src/three/MochiScene.ts → loadGlb`): RoomEnvironment PMREM env map, ACES, pink+blue rim lights; `idle_breathe` loops, `puff` plays once at zero; body morphs `puff`/`squash` are driven by the spring physics (pokes, jelly); eye/shine nodes are offset for mouse-follow + blink. If the GLB fails to load, the procedural shader mochi is used; if WebGL is unavailable, `public/mochi/idle.webp` is shown.
- Pose renders (`public/mochi/*.webp`, downscaled from the 2048 PNGs): idle = default/explore, countdown = preloader + live window, puffed = preloader end/story beat 3, happy = create success/finale/portfolio, sleepy = refunds, empty states, disconnected wallet.
- Head: favicon.ico, icon-flat.svg, 16/32 PNGs, apple-touch-icon, `site.webmanifest` (icon paths made relative), og:image `og-1200x630.png` (use an absolute URL once a domain exists).
