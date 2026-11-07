# Delivery status — 7 November 2026

## What this build is

Floof is a fair-window Solana launchpad concept: pledges are collected before launch, filled proportionally at one clearing price, and unused SOL is claimable. Creator bonds, vesting, buyer-history checks, transparency reports and Scout rewards support that model.

The provided handoff explicitly calls for Devnet and flags its LaunchLab assumptions as unverified. The uploaded app is an attractive UI prototype, not a chain implementation. This delivery adds a working durable sandbox backend and an experimental Anchor foundation while preserving the visual design.

## Verified locally

- TypeScript build passes.
- 25 backend/API/frontend tests pass, covering authorization, persistence, idempotency, concurrent pledge caps, exact arithmetic, fee conservation, quote replay/theft/expiry, slippage, creator bonds, refunds, claims and evidence-based risk output.
- Anchor host compilation and 11 Rust unit tests pass, including arithmetic overflow boundaries and attestation message parsing/domain binding.
- Global CSS is unchanged. Create retains the existing theme but replaces mascot customization with token artwork, fixed supply/decimals, supply distribution, validated links, explicit review and persistent revision-controlled drafts.
- These Rust tests are host tests, not an SBF build, local-validator integration test, security audit or Devnet transaction confirmation.

## Added in version 0.3

- Create page: mascot color/accessory picker removed; token artwork upload, saved drafts with stale-tab conflict detection, supply distribution, accessible labels, explicit review and correct test-balance requirements.
- Token settings: stricter numeric and social-link validation; normalized saved metadata endpoint.
- Chain indexer: authenticated finalized-transaction ingestion now decodes Floof events, rejects foreign nested logs and malformed traces, and commits raw evidence and events atomically. Window projections are replay-safe and preserve u64 values as strings. The polling runner validates the Devnet genesis hash and checkpoints only after ingestion succeeds.
- Scout contract: immutable funded epochs, program/epoch/wallet/amount-bound Merkle proofs and single-use claim receipts. Matching JS proof generator tested against a Rust vector. This code is not deployed.
- Escrow: failed-window refunds can be claimed without creating an associated token account. Refund debits round upward so aggregate promises never exceed escrow remaining after a swap. Tests cover this insolvency edge case; residual rounding dust stays in escrow.
- GitHub CI definition checks JS/API, build and Rust host tests. No deployment secrets are committed.

## Verification

The updated Create form was rendered in the browser; saving a draft and reloading restored the entered token data. A full sandbox launch reached the scheduled success screen and deducted exactly 5.02 test SOL; the repeat-create flow was checked and its modal state corrected. Host tests are separate from real Devnet integration tests. Current publication and GitHub upload results are reported in the delivery response, not inferred from this source file.

## Explicit blockers to full Devnet completion

1. **LaunchLab settlement adapter is not implemented or verified.** Official source and a live Devnet read confirm that LaunchLab must initialize the mint. Floof must reserve a mint PDA instead of pre-minting; curve cost and raised amounts also require reconciliation. The complete account/fee/vesting findings are in LAUNCHLAB-INTEGRATION.md. Successful settlement in the experimental Anchor program intentionally returns `LaunchAdapterUnavailable`; it never spends escrow pretending the swap occurred. Failed windows refund, and stalled windows can be aborted permissionlessly after one hour.
2. **No program deployment or funding authority exists for this project.** The contract ID is a build-only placeholder. A fresh deployment keypair, SBF build, local-validator tests, a funded Devnet deployer and verified program address are required before activation.
3. **Production fee economics differ from the prototype assumptions.** Official Raydium documentation describes the platform fee and creator fee as additions to the global protocol fee; the prototype's 0.25/0.25/0.5 split must not be presented as a universal supported configuration. The 85 SOL target is not universal either.
4. **No full chain indexer / Sybil service is provisioned.** Verified Floof event ingestion, projections and a polling/backfill runner are implemented. No continuously running indexer has been provisioned, and funding-graph analysis, history coverage, attestor operation and anti-Sybil calibration remain incomplete. Linking a Phantom wallet proves key ownership only.
5. **Oracle governance and holder compensation policy need implementation.** The experimental contract requires two configured oracle signers for slashing and distributes slashed bonds to original pledgers. That is explicitly narrower than the handoff's current-holder claim pool; it must be resolved before deployment. No heuristic TRUTH score automatically slashes funds.
6. **No on-chain Scout distributor or fee collection crank is deployed.** Funded sandbox claims and Merkle proofs work off-chain. A funded on-chain claim program and matching Merkle generator are now implemented with host tests. SBF/validator verification, deployment, real fee collection and a weekly funded distribution service remain required.
7. **Uploads are R2-hosted.** IPFS/Arweave permanence is not configured or claimed.
8. **Availability / scale.** Hosting runs the web/API; no always-running external indexer or cranker was provisioned. The bounded aggregate D1 model is for development, not production trading throughput.

## Technical sources checked

- Raydium PlatformConfig: https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/platform-config.mdx
- Launch creation / configurable thresholds: https://github.com/raydium-io/raydium-docs-v1/blob/main/user-flows/creating-a-launchlab-token.mdx
- Official Raydium CPI interfaces: https://github.com/raydium-io/raydium-cpi/tree/master/programs/launch-cpi
- Anchor CPI account/signing constraints: https://www.anchor-lang.com/docs/basics/cpi

Do not label this project “fully completed”, “live trading”, “audited”, or “Devnet deployed” based only on this sandbox delivery.
