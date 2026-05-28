# StellarGive Contract API

This document describes the `stellar-give` Soroban contract public API, error variants, storage layout, and example payloads for integrators.

## Overview

The contract exposes five public methods:

- `create_campaign` – create a new campaign with a target, deadline, beneficiaries, and accepted token.
- `donate` – transfer tokens from a donor to a campaign.
- `claim_funds` – release raised funds to beneficiaries once the campaign is funded or expired.
- `get_campaign` – read campaign state.
- `get_top_donors` – read the top five donors for a campaign.

All state-changing methods require caller authentication via `require_auth()`.

## Method Reference

### create_campaign

```rust
pub fn create_campaign(
    env: Env,
    creator: Address,
    beneficiaries: Vec<(Address, u32)>,
    title: String,
    target_amount: i128,
    deadline: u64,
    accepted_token: Address,
    website: Option<String>,
    twitter: Option<String>,
) -> Result<u64, ContractError>
```

Arguments

- `env` - Contract environment.
- `creator` - Authorized address creating the campaign. Must call `require_auth()`.
- `beneficiaries` - Vector of `(Address, u32)` share recipients. Must contain at least one entry and sum to `10_000` basis points.
- `title` - Campaign title. Must be non-empty.
- `target_amount` - Funding goal in stroops.
- `deadline` - Unix timestamp after which new donations are no longer accepted.
- `accepted_token` - Address of a Soroban token contract that must implement the token interface.
- `website` - Optional website URL. If provided, must start with `https://`.
- `twitter` - Optional Twitter link. If provided, must start with `https://`.

> [!WARNING]
> **No ownership verification:** The contract only validates that the URLs start with `https://` to encourage secure links. There is no on-chain cryptographic verification of ownership. These links are informational only.

Returns

- `Ok(campaign_id)` on success.

Errors

- `Unauthorized` if `creator` is not authenticated.
- `EmptyTitle` if the title is empty.
- `InvalidAmount` if `target_amount <= 0` or if the auto-increment ID overflows.
- `InvalidDeadline` if the deadline is not strictly in the future.
- `InvalidToken` if the accepted token contract does not implement the expected token interface.
- `InvalidShares` if `beneficiaries` is empty or if shares do not sum to `10_000`.

Example JSON-RPC payload

```json
{
  "method": "create_campaign",
  "params": [
    "GC...CREATOR_ADDRESS...",
    [["GB...BENEFICIARY_ADDRESS...", 10000]],
    "My Campaign",
    "100000000",
    1717000000,
    "GC...TOKEN_CONTRACT_ADDRESS..."
  ]
}
```

### donate

```rust
pub fn donate(
    env: Env,
    donor: Address,
    campaign_id: u64,
    amount: i128,
    is_anonymous: bool,
) -> Result<(), ContractError>
```

Arguments

- `env` - Contract environment.
- `donor` - Authorized donor address. Must call `require_auth()`.
- `campaign_id` - ID of the campaign to donate to.
- `amount` - Donation amount in stroops.
- `is_anonymous` - If `true`, masks the donor address in emitted events and top donor listings with the zero address (`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`).

> [!NOTE]
> **Privacy Trade-offs:** On-chain ledger transfers remain public. The underlying token contract still records a transfer originating from the donor's address. `is_anonymous` only masks application-level events and dashboard displays.

Returns

- `Ok(())` on success.

Errors

- `Unauthorized` if `donor` is not authenticated.
- `InvalidAmount` if `amount <= 0`.
- `CampaignNotFound` if the campaign ID does not exist.
- `CampaignNotActive` if the campaign is not currently active.
- `TokenTransferFailed` if the token transfer from donor to contract fails.

Example JSON-RPC payload

```json
{
  "method": "donate",
  "params": [
    "GD...DONOR_ADDRESS...",
    1,
    "1000000"
  ]
}
```

### claim_funds

```rust
pub fn claim_funds(
    env: Env,
    caller: Address,
    campaign_id: u64,
) -> Result<i128, ContractError>
```

Arguments

- `env` - Contract environment.
- `caller` - Authorized address requesting the payout. Must call `require_auth()`.
- `campaign_id` - Campaign ID to claim.

Returns

- `Ok(total)` where `total` is the amount distributed in stroops.

Errors

- `Unauthorized` if `caller` is neither the campaign creator nor a beneficiary.
- `CampaignNotFound` if the campaign ID does not exist.
- `AlreadyClaimed` if funds have already been claimed.
- `ClaimNotAllowed` if the campaign is still active and not eligible for payout.
- `NothingToClaim` if there is no raised amount to distribute.
- `TokenTransferFailed` if a payout transfer fails during distribution.

Example JSON-RPC payload

```json
{
  "method": "claim_funds",
  "params": [
    "GB...CALLER_ADDRESS...",
    1
  ]
}
```

### get_campaign

```rust
pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, ContractError>
```

Arguments

- `env` - Contract environment.
- `campaign_id` - Campaign ID to retrieve.

Returns

- `Ok(Campaign)` with full campaign state.

Errors

- `CampaignNotFound` if the campaign ID does not exist.

Example JSON-RPC payload

```json
{
  "method": "get_campaign",
  "params": [1]
}
```

### get_top_donors

```rust
pub fn get_top_donors(env: Env, campaign_id: u64) -> Result<Vec<(Address, i128)>, ContractError>
```

Arguments

- `env` - Contract environment.
- `campaign_id` - Campaign ID.

Returns

- `Ok(Vec<(Address, i128)>)` with the top five donors sorted by amount.

Errors

- `CampaignNotFound` if the campaign ID does not exist.

Example JSON-RPC payload

```json
{
  "method": "get_top_donors",
  "params": [1]
}
```

## ContractError Reference

| Variant | Trigger Condition |
|---|---|
| `Unauthorized` | Caller is not authorized for a state-changing request. |
| `InvalidDeadline` | Deadline is not strictly in the future. |
| `InvalidAmount` | Amount is zero/negative or arithmetic overflow occurs. |
| `CampaignNotFound` | No campaign exists for the requested ID. |
| `InvalidToken` | Accepted token contract does not implement the required interface. |
| `CampaignNotActive` | Donation attempted for non-active campaign. |
| `ClaimNotAllowed` | Claim attempted before campaign is funded or expired. |
| `AlreadyClaimed` | Campaign funds have already been claimed. |
| `ReentrancyDetected` | Reentrant call detected by temporary lock. |
| `EmptyTitle` | Campaign title is empty on creation. |
| `NothingToClaim` | Claim attempted but raised amount is zero. |
| `InvalidShares` | Beneficiary shares missing or do not sum to `10_000`. |
| `TokenTransferFailed` | Token transfer failed during donate or claim. |

## Storage Key Patterns

- `symbol_short!("NEXT")` (instance storage) -> `u64` next campaign ID.
- `(symbol_short!("CMP"), campaign_id)` (persistent storage) -> `Campaign` struct.
- `(symbol_short!("TDON"), campaign_id)` (persistent storage) -> `Vec<(Address, i128)>` top donors.
- `symbol_short!("LOCK")` (temporary storage) -> `bool` reentrancy lock flag.

### Campaign Struct Fields

- `id` - campaign ID
- `creator` - address of campaign creator
- `beneficiaries` - share recipients and basis points
- `title` - campaign title
- `target_amount` - funding goal in stroops
- `raised_amount` - current donated total in stroops
- `deadline` - Unix timestamp when donations end
- `accepted_token` - token contract address for donations
- `status` - campaign lifecycle state

## Example Contract Invocation Notes

The contract is deployed as a Soroban contract and is invoked through reflected method calls.

### JSON-RPC guidance

External integrators may use generic JSON-RPC bodies that map function names to parameter arrays. Example payloads above use the method name and parameter order expected by the contract.

### XDR / Transaction envelopes

A real invocation must be wrapped in a signed transaction envelope and submitted via Soroban RPC. The action uses the contract ID and a host function call to the named contract method.

#### Example high-level XDR flow

1. Build a transaction with a `invokeHostFunction` op.
2. Set the contract ID and method name.
3. Append arguments in Soroban Value form.
4. Sign the transaction with the caller's Stellar key.
5. Submit via RPC `send_transaction`.

## CLI Example

```bash
soroban contract invoke --id <CONTRACT_ID> --fn create_campaign --arg <CREATOR_ADDRESS> --arg <BENEFICIARY_ADDRESS> --arg 10000 --arg "My Campaign" --arg 100000000 --arg 1717000000 --arg <TOKEN_ADDRESS>
```

> Replace `<CONTRACT_ID>` with the deployed contract ID and use the proper Soroban CLI syntax for your environment.
