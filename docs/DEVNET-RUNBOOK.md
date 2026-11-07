# Floof Devnet deployment and verification

The deployed website remains a sandbox until `CHAIN_EXECUTION=devnet` is explicitly set. A valid executable program, initialized config, matching program ID, and the Devnet genesis hash are checked before transaction preparation. Never set this flag to hide incomplete deployment.

## Program and costs

Reserved program: `7hhrC7N6FRQyQLUbr4q9q5Dgqgj8zoDtDCiCd8m1XX3N`.
Deployment wallet: `3p2JxyqhPgFTGfdK2dAsKofX7bsp4PK2mSJy5YuSzLG1`.

On 2026-11-07 the public Devnet RPC returned HTTP 410: its airdrop faucet is closed. The deployment wallet has zero lamports. `node scripts/devnet-deploy.mjs --check` calculates the current required rent; the observed recommendation was about 6.53 test SOL including program, temporary upload buffer and setup. Fund with **Devnet SOL only**, then run the script without `--check`. Real SOL is neither needed nor supported.

Key files are ignored in `.secrets/`; never commit or print them. Program/deployer keypairs must be retained before funding. Oracle keys generated for development are not independent production governance; replace/configure separate signers before an actual public-money launch.

## Checks before activation

1. `npm ci && npm test && npm run build`.
2. `cargo test --manifest-path programs/floof-escrow/Cargo.toml --locked`.
3. `cargo build-sbf --manifest-path programs/floof-escrow/Cargo.toml`.
4. `node scripts/sbf-integration.mjs`: downloads/caches actual finalized Devnet LaunchLab and Metaplex program bytes, records SHA256, and runs real CPIs in LiteSVM. It does not mock Raydium. The local validator is an alternative on hosts that support Agave's required io_uring; the current host does not.
5. `node scripts/devnet-deploy.mjs --check`, fund, then `node scripts/devnet-deploy.mjs`.
6. Verify the deployed ELF, platform fees, initialized attestor/oracles and public-Devnet create→pledge→settle→claim/refund flow. Set runtime secrets and only then activate `CHAIN_EXECUTION=devnet`.
7. Run `scripts/settlement-keeper.mjs` and `scripts/indexer-runner.mjs` as supervised persistent services. They guard the network, retry failures, and never represent submission as finalization. Current Sites request hosting does not itself run these Node processes continuously.

## Economics and lifecycle

- 1B tokens, six decimals. Sell curve reserves 800M; fair window buys 20%, 30% or 40% of full supply. Creator native vesting reserves up to 5%.
- The selected Devnet configuration is 0.25% Raydium + 0.5% platform + 0.25% creator. Global/platform bytes are captured at creation and must match settlement. No assumptions about a universal Raydium fee configuration.
- Creator pays a 0.02 SOL creation fee and separate 0.1 SOL setup reserve, plus transaction/account rent. Bond and buyer principal are separate. Remaining setup reserve is reclaimable after settlement or refunding.
- Off-chain binary search chooses a graduation target whose first-buy gross cost fits the pledge budget. The program verifies the actual token/SOL balance changes and rejects cost differences over 1,000 lamports. It never trusts the quote to account for funds.
- All settlement steps roll back together. Failed minimum targets permit full SOL-only claims without requiring a mint/ATA. Stalled successful windows can be aborted after one hour.
- Native LaunchLab creator vesting also requires graduation. Floof additionally enforces the creator's selected 30–180-day lock.
- Raydium migration requires its configured migration wallet. Pool status 1 is **awaiting Raydium migration**, not graduated. CPMM trading requires a verified migrated pool; the route supports LaunchLab and a verified CPMM account layout. CPMM quote math is parity-tested across both directions and all creator-fee modes; execution after a real Raydium migration still needs public-Devnet verification.
- Creator fees forward from the immutable launcher PDA to the immutable human creator. Sale proceeds remain in the user's WSOL ATA; existing WSOL accounts are never silently closed.
- Slashing requires both configured oracle signatures and an immutable holder root/snapshot slot. Holder claims use one-use receipts and can include holders who never pledged. The root's eligibility is the oracles' responsibility; a TRUTH heuristic never automatically slashes a bond.
- Scout epochs must be funded atomically when publishing the root; claims bind program, epoch, wallet and amount. `scripts/scout-distributor.mjs` atomically collects real platform fees and funds a reviewed complete-history points snapshot. Automated earned-point selection and scheduled distribution are not activated.

## API and evidence limits

`POST /chain/prepare` supports create, pledge, settle, abort, claim, reserve, bond, vested, creator-fees, buy and sell. It simulates before returning an unsigned transaction. `/chain/confirm` verifies the exact prepared message, payer and finalized successful signature before indexing. Browser submissions are persisted while pending; retries confirm the same transaction instead of sending another transfer.

Wallet eligibility requires complete signature-history coverage (under 1,000 transactions), an unambiguous first funder, configured age/history checks, and persistent funding/account cluster assignments. Ambiguous or overlapping already-issued clusters fail closed. This is a bounded anti-Sybil heuristic, not proof of unique humanity.

`GET /chain/truth/:mint` reports actual mint/freeze controls and largest token-account concentration. It explicitly withholds a grade without classified trade-history coverage. Token accounts can include pool vaults; they are not mislabeled as independent holders. Arbitrary external-token wash detection and full historical grading still require archival indexing.

The active inline Devnet read adapter is limited to 100 windows; larger deployments require indexed pagination. Trade history currently records transactions confirmed through this app, not every external wallet's swap. PnL/cost basis and cross-venue historical metrics are not complete.

## Outstanding operational work

Public Devnet funding/deployment and end-to-end browser signing; persistent worker hosting; complete external-trade backfill; weekly earned-point calculation and fee-funded Scout automation; public-Devnet verification of the implemented migration observation and CPMM trade routing. The website is not a completed mainnet product. No mainnet deployment is authorized or attempted.
