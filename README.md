# Floof

A fair-window token launchpad with a persistent development sandbox and an experimental Solana escrow program.

**Current hosted mode is sandbox. No real SOL is moved and no on-chain token is created.** The successful LaunchLab settlement adapter is not connected. See [delivery status](docs/DELIVERY.md) and the verified [LaunchLab integration requirements](docs/LAUNCHLAB-INTEGRATION.md).

## Run

Node 24+:

```sh
npm ci
npm run dev
npm test
npm run build
```

The development server runs a single-user SQLite test harness. Never expose that server as production; only the built Worker uses authenticated platform identity. The hosted Worker uses D1 and R2, with append-only migrations in `drizzle/`.

Rust host validation:

```sh
cargo test --locked
```

These are not SBF/local-validator tests or an audit. Do not deploy the build-only program ID.

## Backend operations

- `scripts/indexer-runner.mjs`: finalized Devnet backfill/polling, replay-safe event ingestion, atomic cursor checkpoint. Requires `FLOOF_PROGRAM_ID`, `SOLANA_DEVNET_RPC_URL`, `FLOOF_API_ORIGIN`, and `INDEXER_SECRET`. Private Sites may also require an authorized `SITES_SERVICE_TOKEN`. Secrets belong in the runtime environment, never in Git. The runner has not been provisioned as a hosted service.
- `scripts/scout-manifest.mjs input.json output.json`: creates program/epoch-bound Merkle proofs from `{program, epoch, leaves: [{wallet, amount}]}`. Amounts are decimal lamport strings. The matching contract funds immutable epochs atomically before any claim; a manifest alone is not a funded distribution.
- `GET/POST /api/drafts/launch`: private, revision-controlled launch drafts.
- `GET /api/coins/:id/metadata`: saved sandbox metadata, explicitly non-permanent.
- `GET /api/chain/windows/:address`: decoded finalized events, separate from the sandbox ledger.

The original prototype screenshots are reference material, not current QA evidence. GitHub source export excludes that old screenshot archive; all runtime assets are included.
