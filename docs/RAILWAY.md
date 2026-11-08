# Floof Devnet jobs on Railway

The repository's railway.json builds dependencies with npm ci --omit=dev and starts node scripts/jobs-service.mjs. Use one always-on replica. Health endpoint: /health; PORT is provided by Railway. This service performs jobs only; the existing Sites Worker owns the web/API and durable D1 data.

Required variables:

| Name | Value / handling |
| --- | --- |
| FLOOF_API_ORIGIN | https://floof-fair-launch.gofivahootan.chatgpt.site |
| SOLANA_DEVNET_RPC_URL | A working HTTPS Solana Devnet RPC endpoint; protect any API key |
| INDEXER_SECRET | Must match the existing Sites secret; set only as a secret variable |
| KEEPER_KEYPAIR_JSON | Disposable funded keeper JSON array from the private handoff |
| DISTRIBUTOR_KEYPAIR_JSON | Devnet platform-fee owner JSON array; private handoff only |
| RAILPACK_NODE_VERSION | 24 |

Runtime signers are written to ignored .secrets files. Scan cursors and pending reward manifests use authenticated Worker endpoints backed by D1. Keep one replica to prevent competing jobs. The HTTP health endpoint is healthy only after a successful cycle; do not disable it merely to hide RPC/indexing failures.

Provisioning attempted on 2026-11-08 was rejected by Railway's free-plan resource limit. A config file is not evidence of a running service. Before deployment, verify account capacity and that the hosted Worker can query Devnet. Attach the GitHub main branch, set the variables, deploy, and verify both health and advancing durable cursors. Never expose an administrative signer in the browser.
