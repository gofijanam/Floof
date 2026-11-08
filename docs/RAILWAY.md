# Floof on Railway

The web service runs the unchanged React design and API on Node 24. railway.json builds Dockerfile and starts scripts/service.mjs (web by default). A single persistent volume at /data holds floof.sqlite (WAL), wallet sessions, migration ledger and uploaded images/metadata. Keep one replica; scaling requires a database migration. The existing Sites sandbox remains separate and is not silently overwritten.

APP_ORIGIN must be the exact HTTPS origin; PORT=3000, DATA_DIR=/data. CHAIN_EXECUTION=devnet activates the deployed Devnet program. Set FLOOF_PROGRAM_ID, SOLANA_DEVNET_RPC_URL, ATTESTOR_PKCS8_BASE64, INDEXER_SECRET and ADMIN_SECRET as service variables. Never put signer secrets in client builds or Git.

Railway uses wallet-signature login with one-use, expiring, origin-bound challenges and revocable opaque HttpOnly/Secure/SameSite cookies. Client identity headers are discarded. The former Sites identity header is populated only after the server validates its own session. No local-preview identity or QA signer is shipped.

The jobs service sets FLOOF_ROLE=jobs with the same source/image and one always-on replica. Set FLOOF_API_ORIGIN to the Railway web origin, matching INDEXER_SECRET, SOLANA_DEVNET_RPC_URL, KEEPER_KEYPAIR_JSON and DISTRIBUTOR_KEYPAIR_JSON. It performs permissionless settlement, finalized transaction indexing, market history scans and fee-funded Scout processing. It independently reports each task's state. /health requires recent indexing success; market/scout errors are separately visible and do not prevent indexing progress. Durable cursors and reward manifests use authenticated web API endpoints.

All execution is Devnet-only. Mainnet deployment, independent contract audit and real Raydium migration validation are separate release gates. A successful host healthcheck alone does not establish these gates or prove all market history is complete.

## Data recovery

Stop jobs and the web writer before copying /data. Preserve SQLite together with any WAL file or use SQLite's backup API. Restore into a fresh volume before starting the web process. Migrations are recorded transactionally and are not reapplied on restart. Preserve the attestor configuration and associated Devnet program. Keep API credentials private. The previous Paperhands/Quiver recovery archive is separate from Floof source.
