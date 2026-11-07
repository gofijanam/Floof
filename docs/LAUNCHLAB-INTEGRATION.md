# LaunchLab integration: verified interfaces and implementation plan

Research date: 7 November 2026. This document records read-only checks of official Raydium sources and Solana Devnet. **It does not certify a Floof deployment or a working settlement adapter.** No transactions were submitted and no keys or funding were created during this research.

## Current incompatibility

Floof's experimental `create_coin` currently initializes the mint, creates its token vault, mints the entire supply and revokes mint authority. Official LaunchLab `InitializeV2` initializes the base mint itself (`init`, writable signer), as well as its pool and vaults. Consequently, the current Floof mint cannot be passed to that instruction as an already initialized mint. This is a concrete interface mismatch, not a missing API key.

The existing `settle` therefore correctly fails closed for successful windows. Removing that guard without changing the mint lifecycle and checking the actual CPI result would expose escrow to incorrect accounting.

## Sources and version caveats

Primary sources inspected:

- [Official CPI context](https://github.com/raydium-io/raydium-cpi/blob/master/programs/launch-cpi/src/context.rs)
- [Official CPI state and argument definitions](https://github.com/raydium-io/raydium-cpi/blob/master/programs/launch-cpi/src/states.rs)
- [Official program identifiers and CPI entry points](https://github.com/raydium-io/raydium-cpi/blob/master/programs/launch-cpi/src/lib.rs)
- [CPI Cargo manifest](https://github.com/raydium-io/raydium-cpi/blob/master/programs/launch-cpi/Cargo.toml)
- [Official LaunchLab IDL](https://github.com/raydium-io/raydium-idl/blob/master/raydium_launchpad/raydium_launchpad.json), metadata version `0.2.0`
- [Current SDK instruction construction](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/instrument.ts)
- [Current SDK layouts](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/layout.ts)
- [Current SDK PDA derivations](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/pda.ts)
- [Constant-product implementation](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/curve/constantProductCurve.ts)
- [Official launch example](https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/launchpad/createMint.ts)
- [Official platform creation example](https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/launchpad/createPlatform.ts)
- [Platform configuration documentation](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/platform-config.mdx)
- [LaunchLab overview and upgrade notes](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/overview.mdx)

These are moving upstream branches, not a version lock. Pin reviewed commits and IDL bytes before production integration. The public CPI crate contains interface stubs whose bodies return success; it is **not** a local implementation of the real Raydium program.

There is visible drift between upstream artifacts:

- The current CPI Cargo manifest pins Anchor `=1.0.2`; Floof's current contract uses Anchor `0.32.x`. Adding that crate directly is not a compatible dependency change without a deliberate toolchain migration. An alternative is a narrowly scoped instruction encoder using the verified ABI, with serialization parity tests.
- Current SDK swaps append the system program and two fee vaults. These are only documented as remaining accounts in the CPI interface and are absent from the IDL's primary account list.
- The CPI `PlatformConfig` still shows the older trailing curve-parameter vector. The current SDK uses fixed fields for platform vesting, creator identity and rule restrictions, with a separate rule account.
- Official examples retain legacy `migrateType: 'amm'` and nonzero creator LP share examples. Current documentation says new launches are CPMM-only, legacy `Initialize` fails, and newly configured creator LP scale must be zero. Do not copy those examples blindly; simulate against the deployed program.

## Devnet observations

Read through `https://api.devnet.solana.com` on the research date:

| Item | Observed value |
| --- | --- |
| LaunchLab program | `DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6` |
| Program executable | `true`, observed at slot `519707297` |
| Program owner | `BPFLoaderUpgradeab1e11111111111111111111111` |
| CPMM program, official Devnet constant | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` |
| Quote mint | `So11111111111111111111111111111111111111112` (wrapped SOL) |
| Constant-product global config, index 0 | `7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt` |
| Config owner | LaunchLab program above |
| Config data length | 371 bytes |
| Config discriminator | `[149, 8, 156, 202, 160, 252, 176, 217]` |
| Protocol trade fee | `2500 / 1_000_000` = 0.25% |
| Maximum referral/share fee | `10000 / 1_000_000` = 1% |
| Migration fee | 0 |
| Minimum base supply, whole tokens | 10,000,000 |
| Maximum lock rate | `999999 / 1_000_000` |
| Minimum base sell / migration rates | Both `1 / 1_000_000` |
| Minimum quote fundraising | 1 lamport |

The corresponding SOL fixed-price and linear-price config PDAs at index 0 were absent when queried. This is not a claim that no other config indices exist.

The 0.25% protocol rate means the handoff's total 1% fee is potentially expressible on this observed Devnet config by adding a 0.25% creator fee and 0.5% platform fee. It is **not** a universal Raydium fee split. Re-read the chosen global and platform accounts before preparing a launch. Do not assume mainnet has the same values.

A Floof-owned platform config has not been identified or created. Existing arbitrary platform accounts are not a substitute: their administrators and fee destinations belong to other parties.

## Canonical PDAs

All listed PDAs use the selected LaunchLab program ID. Seed values are raw public-key bytes, not Base58 text.

| Account | Seeds |
| --- | --- |
| Authority | `['vault_auth_seed']` |
| Global config | `['global_config', quoteMint, curveType:u8, index:u16]` — use the SDK's canonical index serialization |
| Pool | `['pool', baseMint, quoteMint]` |
| Pool token vault | `['pool_vault', pool, mint]` |
| Event authority | `['__event_authority']` |
| Platform config | `['platform_config', platformAdmin]` |
| Platform fee vault | `[platformConfig, quoteMint]` |
| Creator fee vault | `[poolCreator, quoteMint]` |
| Vesting record | `['pool_vesting', pool, beneficiary]` |
| Platform allow config | `['platform_allow_config', platformConfig, globalConfig]` |
| Platform curve rule | `['platform_curve_rule', platformConfig, globalConfig]` |

Index 0 is zero in either endianness; the live observation above does not independently validate nonzero index serialization. Reuse or parity-test the SDK helper for other indices.

## InitializeV2 ABI

Discriminator: `[67, 153, 175, 39, 218, 16, 38, 32]`.

Ordered accounts:

| Index | Account | Writable | Signer |
| --- | --- | --- | --- |
| 0 | payer | yes | yes |
| 1 | creator | no | no |
| 2 | global_config | no | no |
| 3 | platform_config | no | no |
| 4 | authority | no | no |
| 5 | pool_state | yes | no |
| 6 | base_mint | yes | yes |
| 7 | quote_mint | no | no |
| 8 | base_vault | yes | no |
| 9 | quote_vault | yes | no |
| 10 | metadata_account | yes | no |
| 11 | base_token_program | no | no |
| 12 | quote_token_program | no | no |
| 13 | metadata_program | no | no |
| 14 | system_program | no | no |
| 15 | rent_program | no | no |
| 16 | event_authority | no | no |
| 17 | LaunchLab program | no | no |

Where the platform enables restrictions, the current SDK appends the relevant platform allow-config and curve-rule accounts. These must be derived and checked; never accept arbitrary accounts as evidence of authorization.

Arguments use Anchor/Borsh ordering:

1. Mint params: `decimals:u8`, `name:String`, `symbol:String`, `uri:String`.
2. Curve enum. Constant-product variant tag `0`, then `supply:u64`, `total_base_sell:u64`, `total_quote_fund_raising:u64`, `migrate_type:u8`. Use CPMM `migrate_type=1` for the intended integration.
3. Vesting params: `total_locked_amount:u64`, `cliff_period:u64`, `unlock_period:u64`.
4. AMM creator-fee enum: `0` quote-token only, `1` both tokens.

Strings are UTF-8 with a little-endian u32 byte-length prefix. Numeric Borsh fields are little-endian. Bound metadata lengths by bytes in the contract. Validate token program IDs, Metaplex program ID, config owners, quote mint, every derived address and configured platform identity.

## BuyExactOut ABI

Discriminator: `[24, 211, 116, 40, 105, 3, 153, 56]`.

Arguments: `amount_out:u64`, `maximum_amount_in:u64`, `share_fee_rate:u64`. Floof should use `share_fee_rate=0` unless a separately specified referral policy is implemented.

Ordered primary accounts: payer (writable signer), authority, global config, platform config, pool (writable), user base-token account (writable), user quote-token account (writable), pool base vault (writable), pool quote vault (writable), base mint, quote mint, base-token program, quote-token program, event authority, LaunchLab program.

The **current SDK then appends** system program, platform fee vault (writable), and creator fee vault (writable). When a referral receiver is present, it is inserted before those three; Floof's zero-referral path should omit it.

The buyer token authority must be a Floof-controlled signer/PDA. Measure actual base output and quote debit after CPI; do not trust caller-provided accounting or an off-chain quote as settlement evidence.

## Required mint and escrow lifecycle

Recommended implementation design, subject to integration tests:

1. At `create_coin`, reserve a deterministic mint PDA derived from creator plus a unique launch nonce. Store the intended metadata, supply, curve policy, platform/config identities and maximum spend in the Window account. **Do not initialize or mint the SPL token yet.** This allows permissionless settlement without retaining a secret mint keypair.
2. Keep pledges and bond accounting isolated. Reserve creator-funded initialization/rent costs separately from buyer principal. Do not silently pay operational costs from pledge refunds or the slashable bond.
3. Use a separate zero-data, system-owned Floof PDA for LaunchLab creator/buyer authority if it must pay rent internally. A data-bearing, program-owned Window account cannot fund a SystemProgram transfer. A keeper can pay initialization rent, but native vesting creation requires the pool creator as its payer/signer.
4. In one Floof settlement instruction, CPI into `InitializeV2`, initialize the claim-token vault after the mint exists, wrap only the permitted quote budget, and CPI into `BuyExactOut`. Sign using the mint and authority PDA seeds. Every step must remain in one Solana transaction so no external buyer can trade between initialization and Floof's first purchase.
5. Verify exact purchased tokens, measured spending, expected mint/pool/config/authority identities and solvency before marking LIVE. If any check fails, the entire transaction must revert, leaving pledges refundable. Unwrap and return unspent WSOL to the refund escrow.
6. Preserve permissionless full refunds for underfunded and stalled windows. Refunding must not require an initialized mint or token account: separate SOL-only refund accounts/instruction from live token claims, since failed windows now have no mint.

The standard SDK example returns a `transactions` array and executes sequentially. That is insufficient evidence of atomic initialize-and-first-buy. Build the single CPI flow explicitly, then test serialized transaction size, compute consumption and invocation depth with the real program.

## Economics that must be reconciled

For a chosen LaunchLab curve, buying a fixed number of tokens has a determined cost. The handoff simultaneously assumes an arbitrary pledge-derived raise, a fixed window-token allocation and a fixed graduation threshold. Those cannot generally all hold on an unchanged constant-product curve.

From the official SDK, let `S` be supply, `B` total tokens eventually sold on the curve, `L` locked tokens, `R` fundraising target and `M` migration fee, in base units. Its initialization computes:

```text
remaining = S - B - L
D = floor((R - M) * B / remaining) - R
virtualBase = floor(floor((R - M) * B * B / remaining) / D)
virtualQuote = floor(R * R / D)
```

For the first exact-out purchase of `W` base units, the curve cost before fees is `ceil(virtualQuote * W / (virtualBase - W))`. Gross spending additionally includes the selected protocol, platform and creator fees with the program's exact rounding.

Two valid directions exist:

- Pin valid curve parameters before accepting pledges; buy the advertised window allocation with a bounded exact-out instruction and charge users only the measured cost. Refund unused funds proportionally. The actual clearing price is measured cost divided by distributed tokens.
- Derive a configurable graduation target from the pledged budget and fixed allocation, subject to global/platform constraints, and prove its integer rounding. This changes the prototype's fixed graduation-threshold assumption and must be visible in launch terms.

Do not simply debit the whole `min(pledged,max_raise)` while the actual swap spends less. Do not silently donate the difference to the platform, creator or pool. Use u128/checked arithmetic throughout and account explicitly for claim-rounding dust.

## Creator allocation and fees

LaunchLab native vesting is funded by the supply reserved during initialization. Its cliff is measured from fundraising completion; this differs from Floof's current vesting timestamp measured from launch creation. The UI, stored terms, claims and tests must agree on the chosen clock.

Creating a native vesting record requires a signature from `pool.creator`. If Floof needs permissionless settlement, a system-owned Floof authority PDA can be the creator of record and create the vesting record for the actual human beneficiary. In that arrangement creator trading fees accrue to the PDA, so implement an authenticated, deterministic forwarding instruction to the immutable human creator. Do not strand or reassign that revenue. Confirm fee rights after migration separately: current documentation says old creator LP-share fields no longer create separate new creator Fee Keys.

A Floof platform config must be created with explicit platform admin, fee recipient, locked-LP recipient, vesting recipient and CPMM config. Its protocol, platform and creator fee rates are additive. Validate the deployed config and simulate its initialization; current example values are not proof that every current program accepts them.

## Acceptance criteria before enabling chain execution

- A pinned ABI/toolchain builds to SBF; host-only Rust tests are insufficient.
- Program initialization checks deployment authority so an unrelated first caller cannot take the config PDA.
- Floof program ID, Devnet genesis/network checks, Raydium executable ID, selected global config and Floof platform config are verified on-chain.
- A successful end-to-end test confirms one transaction initializes the mint/pool and performs the first buy, with no earlier pool trading opportunity.
- Exact account constraints and measured balances reject substituted pools, mints, vaults, metadata programs, quote mints, fee recipients and malicious remaining accounts.
- Underfilled, oversubscribed and stale-config cases preserve SOL; deliberately failed CPIs roll back all mint/pool/escrow changes.
- SOL-only failed/stalled refunds work before any mint exists, and repeated claims cannot pay twice.
- Creator vesting, creator-fee forwarding, bond return and any graduation checks use verified actual chain state and immutable launch terms.
- Buyer-history attestations are signed over program, wallet, window, stable cluster and short expiry; unknown or incomplete history never passes as verified evidence.
- Finalized indexed events reconcile transaction signatures, token/lamport balances, claim status and pool state; raw ingestion alone is not complete indexing.
- Tests run against the deployed Devnet LaunchLab binary or a verified captured binary, not the public CPI crate's no-op stubs.
- The browser signs the actual Devnet transaction, observes confirmation/failure, and displays network, real balances, receipts and retry behavior accurately.

Remaining operational inputs include a funded Devnet deployer, a Floof platform configuration with controlled authorities, reliable RPC/indexing access and functioning attestor/oracle operations. These are in addition to the code changes above, not substitutes for them.
