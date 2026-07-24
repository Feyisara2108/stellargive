# stellarGive (Soroban Contract)

`stellarGive` is a Soroban smart contract for transparent token-based relief campaigns on Stellar Testnet.

## Architecture Overview

- **Campaign lifecycle**: `Active -> Funded -> Claimed | Expired`
- **Persistent storage**:
  - `symbol_short!("NEXT")` for campaign ID sequencing
  - `(symbol_short!("CMP"), campaign_id)` for campaign records
- **Core methods**:
  - `create_campaign`: creates campaign metadata and validation gates
  - `donate`: transfers tokens from donor to contract and updates raised amount
  - `claim_funds`: allows creator/beneficiary to send all raised funds to beneficiary
  - `get_campaign`: view full campaign state with status derived from ledger time

## Security Notes

- `#![no_std]` and Soroban `#[contract]`/`#[contractimpl]` patterns.
- All state-changing methods enforce caller auth with `require_auth()`.
- Input validation for amount/deadline/title/token interface checks.
- Explicit `ContractError` enum for predictable error handling.
- Reentrancy guard via temporary lock storage key (`symbol_short!("LOCK")`).
- Overflow-safe arithmetic with `checked_add` and `overflow-checks = true`.
- Structured events emitted for:
  - `("campaign", "created")`
  - `("donation", "received")`
  - `("funds", "claimed")`

## Build & Test

```bash
cd contracts/stellar-give
make test
make wasm
```

### Test Snapshots & Fuzz Determinism

This contract runs both standard unit tests and property-based (`proptest`)
fuzz tests in `tests/fuzz_donate.rs`.  Two artifacts can cause noisy
working-tree diffs after `cargo test`:

1. **`test_snapshots/*.json`** — Soroban SDK ledger-environment captures
   written by the test harness.  Every run embeds new random
   `Address::generate(&env)` values and `ledger_key_nonce` entries, so the
   files cannot be meaningfully diffed or replayed.
2. **Proptest failure-regression files** — numbered artefacts proptest
   writes by default when a case shrinks.

**Policy (seed + ignore):**

| Concern | Handling |
| --- | --- |
| Fuzz input reproducibility | Fixed `PROPEST_TEST_SEED` set in `.cargo/config.toml` (hex-encoded 32-byte seed) so every `cargo test` run exercises the same 256 cases. |
| Proptest regression artefacts | Primary: `failure_persistence: None` via the `#![proptest_config(...)]` module attribute in `tests/fuzz_donate.rs` — no per-case files are written at runtime.  Defence-in-depth: `*.proptest-regressions` is `.gitignore`d so a future config revert won't accidentally commit regression seeds. |
| Soroban `test_snapshots/` | `.gitignore`d (see `.gitignore` in this directory).  Useful for local debugging, never committed.  Existing tracked snapshots were removed with `git rm -r --cached test_snapshots`.  Snapshots are inherently non-deterministic because `Address::generate(&env)` and `ledger_key_nonce` values are not driven by the proptest seed. |

After running `cargo test`, `git status` should show **no unexpected changes**
outside of the test/source files you actually edit.  If fuzz tests ever need
to exercise *new* inputs, change the seed in `.cargo/config.toml` (and
document the reason).

## Stellar Testnet Setup

1. Install Stellar CLI and configure testnet:
```bash
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

2. Create an identity (example: `alice`) and fund it:
```bash
stellar keys generate alice
curl "https://friendbot.stellar.org/?addr=$(stellar keys address alice)"
```

3. Build and deploy:
```bash
cd contracts/stellar-give
make deploy SOURCE=alice
```

## Invoke Examples

```bash
make invoke-create \
  SOURCE=alice \
  CONTRACT_ID=<CONTRACT_ID> \
  CREATOR=<CREATOR_ADDRESS> \
  BENEFICIARY=<BENEFICIARY_ADDRESS> \
  TOKEN=<TOKEN_CONTRACT_ADDRESS> \
  TARGET=5000000 \
  DEADLINE=2000000000
```

```bash
make invoke-donate \
  SOURCE=<DONOR_IDENTITY> \
  CONTRACT_ID=<CONTRACT_ID> \
  DONOR=<DONOR_ADDRESS> \
  CAMPAIGN_ID=1 \
  AMOUNT=1000000
```

```bash
make invoke-claim \
  SOURCE=<CREATOR_OR_BENEFICIARY_IDENTITY> \
  CONTRACT_ID=<CONTRACT_ID> \
  CAMPAIGN_ID=1
```
