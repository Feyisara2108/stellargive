# stellarGive (Soroban Contract)

`stellarGive` is a Soroban smart contract for transparent token-based relief campaigns on Stellar.

## Architecture Overview

- **Campaign lifecycle**: `Active -> Claimed` when a donation reaches the target (the contract auto-claims and distributes in the same call); `Active -> Expired -> Claimed` when funds are claimed after the deadline; `Active -> Cancelled` when the creator cancels, after which donors use `claim_refund`. `Funded` remains in `CampaignStatus` for reads between the target being reached and settlement.
- **Storage**:
  - `NEXT` (instance) for campaign ID sequencing
  - `CMP`, `campaign_id` (persistent) for campaign records
  - `DCON`, `campaign_id`, `donor` (persistent) for donor contributions
  - `TDON`, `campaign_id` (persistent) for top donors
  - `CCNT`, `creator` (persistent) for per-creator campaign counts
  - `WLST`, `campaign_id`, `address` (persistent) for private-campaign whitelists
  - `UPCT` / `UPDT` (persistent) for campaign updates
  - `ADMIN` (persistent) for the platform fee recipient; `OWNER`, `PAUSED` (instance) for administration
  - `LOCK` (temporary) for the reentrancy guard
- **Core methods**:
  - `initialize`: one-shot admin setup
  - `create_campaign`: creates campaign metadata, validates shares, token, metadata URI, category, deadline and per-donor cap
  - `donate`: transfers tokens from donor to contract, records the contribution and auto-claims on reaching the target
  - `claim_funds`: distributes raised funds to beneficiaries after the target or deadline
  - `cancel_campaign` / `claim_refund`: creator cancellation and donor refunds for cancelled campaigns
  - `refund`: donor refunds for expired, unfunded campaigns
  - `pause` / `unpause`: admin switch for state-mutating methods
  - `add_to_whitelist`: creator-managed allowlist for private campaigns
  - `add_update` / `get_updates`: campaign updates (maximum 10)
  - `get_campaign`, `get_campaigns`, `get_campaigns_paged`, `get_campaigns_by_creator`, `get_total_campaigns`, `get_top_donors`, `get_time_left`, `get_owner`: read methods

## Security Notes

- `#![no_std]` and Soroban `#[contract]`/`#[contractimpl]` patterns.
- All state-changing methods enforce caller auth with `require_auth()`.
- Input validation for amount/deadline/title/description/metadata URI/category/token interface checks.
- Explicit `ContractError` enum for predictable error handling.
- Reentrancy guard via temporary lock storage key (`symbol_short!("LOCK")`).
- Overflow-safe arithmetic with `checked_add` and `overflow-checks = true`.
- Structured events emitted for:
  - `("created",)`
  - `("goal_reached",)`
  - `("donation", "received")`
  - `("autoclaimed",)`
  - `("cancel",)`
  - `("refund", campaign_id)` and `("refund",)`
  - `("funds", "claimed")` and `("claimed", campaign_id)`
  - `("paused",)` and `("unpaused",)`
  - `("update",)`
  - `("Upgraded",)` and `("OwnerSet",)`

## Build & Test

```bash
cd contracts/stellar-give
make test
make wasm
```

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
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- create_campaign \
  --creator <CREATOR_ADDRESS> \
  --beneficiaries '[["<BENEFICIARY_ADDRESS>", 10000]]' \
  --title "Stellar Relief Campaign" \
  --description "Emergency relief for affected families." \
  --metadata_uri "ipfs://<CID>" \
  --category relief \
  --target_amount 5000000 \
  --deadline 2000000000 \
  --accepted_token <TOKEN_CONTRACT_ADDRESS>
```

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <DONOR_IDENTITY> \
  --network testnet \
  -- donate \
  --donor <DONOR_ADDRESS> \
  --campaign_id 1 \
  --amount 1000000 \
  --is_anonymous false
```

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <BENEFICIARY_IDENTITY> \
  --network testnet \
  -- claim_funds \
  --beneficiary <BENEFICIARY_ADDRESS> \
  --campaign_id 1
```
