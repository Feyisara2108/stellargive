# StellarGive Contract API

This document describes the `stellar-give` Soroban contract public API, error variants, storage layout, and example payloads for integrators.

## Overview

The contract exposes many public methods, including campaign creation and browsing, donations and claims, refund and whitelist operations, updates, and read helpers.

## Method Reference

### create_campaign

```rust
pub fn create_campaign(
    env: Env,
    creator: Address,
    beneficiaries: Vec<(Address, u32)>,
    title: String,
    description: String,
    metadata_uri: String,
    category: Symbol,
    target_amount: i128,
    deadline: u64,
    accepted_token: Address,
    max_per_donor: Option<i128>,
) -> Result<u64, ContractError>
```

Arguments

- `env` - Contract environment.
- `creator` - Authorized address creating the campaign. Must call `require_auth()`.
- `beneficiaries` - Vector of `(Address, u32)` share recipients. Must contain at least one entry and sum to `10_000` basis points.
- `title` - Campaign title. Must be non-empty and at most `MAX_TITLE_LEN` (50 characters).
- `description` - Optional campaign description text. At most `MAX_DESCRIPTION_LENGTH` (500 characters); Soroban `String` length is measured in bytes.
- `metadata_uri` - Campaign metadata URI. At most `MAX_METADATA_URI_LEN` (256 characters) and must begin with `https://` or `ipfs://`.
- `category` - Browsing category Symbol. Must be one of `medical`, `food`, `shelter`, `education`, `relief`, or `other`.
- `target_amount` - Funding goal in stroops. Must be at least `MIN_TARGET` (10,000,000 stroops).
- `deadline` - Unix timestamp after which donations are no longer accepted. It must be strictly future and at most `MAX_DURATION` (31,536,000 seconds / one year) from the ledger timestamp.
- `accepted_token` - Address of a Soroban token contract that implements the token interface.
- `max_per_donor` - Optional maximum total contribution per donor, in stroops. `None` means no donor cap.

> [!WARNING]
> **No ownership verification:** The contract only validates metadata/social URL prefixes and shape. There is no on-chain cryptographic verification of ownership. These links are informational only.

Returns

- `Ok(campaign_id)` on success.

Errors

- `ContractPaused` while the contract is paused.
- `Unauthorized` if `creator` is not authenticated.
- `EmptyTitle` if the title is empty.
- `InvalidTitle` if the title exceeds 50 characters.
- `DescriptionTooLong` if the description exceeds 500 characters.
- `MetadataUriTooLong` if the metadata URI exceeds 256 characters.
- `InvalidMetadataUri` if the metadata URI is neither `https://` nor `ipfs://`.
- `InvalidCategory` if `category` is not one of the six allowed symbols.
- `TargetTooLow` if `target_amount` is below 10,000,000 stroops.
- `InvalidDeadline` if the deadline is not strictly in the future.
- `InvalidDuration` if the deadline is more than one year away.
- `InvalidToken` if the accepted token contract is not compatible.
- `LimitExceeded` if the creator already has 10 campaigns or another documented limit is exceeded.
- `CreationFeeTransferFailed` if the 100,000-stroop creation fee cannot be transferred.
- `InvalidShares` if beneficiaries are empty or shares do not sum to `10_000`.
- `InvalidBeneficiary` if the contract address is included as a beneficiary.

Example illustrative invocation (not executed):

```json
{
  "method": "create_campaign",
  "params": [
    "GC...CREATOR_ADDRESS...",
    [["GB...BENEFICIARY_ADDRESS...", 10000]],
    "My Campaign",
    "Funds essential community support.",
    "ipfs://bafy-example",
    "medical",
    "100000000",
    1717000000,
    "GC...TOKEN_CONTRACT_ADDRESS...",
    null
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
    comment: Option<String>,
) -> Result<(), ContractError>
```

Arguments

- `env` - Contract environment.
- `donor` - Authorized donor address. Must call `require_auth()`.
- `campaign_id` - ID of the campaign to donate to.
- `amount` - Donation amount in stroops.
- `is_anonymous` - If `true`, masks the donor address in emitted events and top donor listings with the zero address (`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`).
- `comment` - Optional donation comment. Maximum `MAX_COMMENT_LEN` (250 characters).

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
- `ExceedsDonorCap` if the total donation would exceed `max_per_donor`.
- `CommentTooLong` if a comment exceeds `MAX_COMMENT_LEN` (250 characters).

Example JSON-RPC payload

```json
{
  "method": "donate",
  "params": [
    "GD...DONOR_ADDRESS...",
    1,
    "1000000",
    false,
    null
  ]
}
```

### claim_funds

```rust
pub fn claim_funds(
    env: Env,
    beneficiary: Address,
    campaign_id: u64,
) -> Result<i128, ContractError>
```

Arguments

- `env` - Contract environment.
- `beneficiary` - Authorized beneficiary or campaign creator requesting the payout. Must call `require_auth()`.
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

### get_campaigns_by_creator

```rust
pub fn get_campaigns_by_creator(env: Env, creator: Address) -> Vec<Campaign>
```

- Arguments: `creator`, the creator address to match.
- Returns: all campaigns created by `creator`, with status derived for the current ledger time.
- Limit: none beyond the contract's existing campaign set; iteration spans campaign IDs from 1 to `NEXT - 1`.
- Errors: this function returns no `Result`/error; missing campaign slots are skipped.

### get_campaigns_paged

```rust
pub fn get_campaigns_paged(env: Env, offset: u64, limit: u32) -> Vec<Campaign>
```

- Arguments: `offset` is the number of campaign IDs to skip, and `limit` is the requested page size.
- Returns: matching campaigns with status derived for the current ledger time.
- Limit: `limit` is capped at 20; missing campaign IDs are skipped.
- Errors: this function returns no `Result`/error.

### get_campaigns

```rust
pub fn get_campaigns(env: Env, ids: Vec<u64>) -> Result<Vec<Option<Campaign>>, ContractError>
```

- Arguments: `ids`, a vector of campaign IDs.
- Returns: a vector in the same order as `ids`; an existing campaign is `Some(Campaign)`, and a missing campaign is `None`. Status is derived for the current ledger time.
- Limit: at most 50 IDs per call.
- Errors: `LimitExceeded` if more than 50 IDs are supplied.

### get_total_campaigns

```rust
pub fn get_total_campaigns(env: Env) -> u64
```

- Arguments: none.
- Returns: the total number of campaigns ever created (`NEXT_ID - 1`), including expired and cancelled campaigns.
- Limit/errors: no limit or contract error.

### get_time_left

```rust
pub fn get_time_left(env: Env, campaign_id: u64) -> Result<u64, ContractError>
```

- Arguments: `campaign_id`, the campaign to inspect.
- Returns: seconds remaining until the deadline, or `0` if the deadline has passed.
- Limit/errors: `CampaignNotFound` if the campaign does not exist.

### add_to_whitelist

```rust
pub fn add_to_whitelist(env: Env, id: u64, addresses: Vec<Address>) -> Result<(), ContractError>
```

- Arguments: `id`, the campaign ID; `addresses`, the addresses to allow.
- Returns: `Ok(())` after writing whitelist entries.
- Limit: no fixed batch-size limit is implemented.
- Errors: `CampaignNotFound` if the campaign does not exist; `Unauthorized` if the caller is not the campaign creator.

### add_update

```rust
pub fn add_update(env: Env, id: u64, content: String) -> Result<(), ContractError>
```

- Arguments: `id`, the campaign ID; `content`, the update text. The creator must authenticate.
- Returns: `Ok(())` after storing the update and publishing the update event.
- Limit: at most 10 updates per campaign; content must be non-empty.
- Errors: `ContractPaused` while paused; `CampaignNotFound` if the campaign does not exist; `Unauthorized` if the caller is not the creator; `InvalidUpdateContent` for empty content; `TooManyUpdates` after 10 updates.

### get_updates

```rust
pub fn get_updates(env: Env, id: u64) -> Vec<Update>
```

- Arguments: `id`, the campaign ID.
- Returns: updates in chronological storage order. Each `Update` contains `content: String` and `timestamp: u64`.
- Limit: at most 10 updates per campaign.
- Errors: this function returns no `Result`/error. Unknown campaign IDs return an empty vector.

## Status derivation

Read functions derive `Campaign.status` at read time through `derive_status(now, campaign)`:

1. Terminal statuses `Claimed` and `Cancelled` are preserved and never downgraded.
2. If `raised_amount >= target_amount`, the status is `Funded`.
3. Otherwise, if `now > deadline`, the status is `Expired`.
4. Otherwise, the status is `Active`.

This read-time value is not always written back to persistent storage. Stored `status` can lag behind the ledger timestamp until a mutation or status-sync path updates it.

## Public limit constants

| Constant | Value | Purpose |
|---|---:|---|
| `FEE_BPS` | `100` | Platform fee: 1% |
| `FEE_DENOMINATOR` | `10_000` | Basis-point denominator |
| `MIN_DONATION` | `1_000_000` | Minimum donation, in stroops |
| `MIN_TARGET` | `10_000_000` | Minimum target, in stroops |
| `MAX_DURATION` | `31_536_000` | Maximum campaign duration, in seconds |
| `MAX_CAMPAIGNS_PER_CREATOR` | `10` | Maximum campaigns owned by one creator |
| `MAX_TITLE_LEN` | `50` | Maximum title length |
| `MAX_DESCRIPTION_LENGTH` | `500` | Maximum description length |
| `MAX_METADATA_URI_LEN` | `256` | Maximum metadata URI length |
| `MAX_COMMENT_LEN` | `250` | Maximum donation comment length |
| `CREATION_FEE_STROOPS` | `100_000` | Campaign creation fee, in stroops |

Additional public API limits not backed by named constants: a paged read returns at most 20 campaigns, a batch read accepts at most 50 IDs, and a campaign can contain at most 10 updates.

## ContractError Reference

The table contains all 37 `ContractError` variants. Numeric codes are the contract ABI values and are also used by `frontend/src/lib/contractErrors.ts`.

| Code | Variant | Trigger condition |
|---:|---|---|
| 1 | `Unauthorized` | Caller is not authorized for the requested operation. |
| 2 | `InvalidDeadline` | Campaign deadline is not strictly in the future. |
| 3 | `InvalidAmount` | Amount is non-positive or arithmetic/ID arithmetic overflow occurs. |
| 4 | `CampaignNotFound` | No campaign exists for the requested ID. |
| 5 | `InvalidToken` | Accepted token contract does not expose the required interface. |
| 6 | `CampaignNotActive` | Donation or cancellation is attempted when the campaign is not active. |
| 7 | `ClaimNotAllowed` | Claim is attempted before the campaign is eligible. |
| 8 | `AlreadyClaimed` | Campaign funds have already been claimed. |
| 9 | `ReentrancyDetected` | A temporary reentrancy lock is already held. |
| 10 | `EmptyTitle` | Campaign title is empty. |
| 11 | `NothingToClaim` | Claim is attempted with no raised amount. |
| 12 | `InvalidShares` | Beneficiary list is empty or shares do not sum to 10,000. |
| 13 | `TokenTransferFailed` | Donation or claim token transfer fails. |
| 14 | `NotInitialized` | Required initialized owner/admin state is absent. |
| 15 | `AlreadyInitialized` | Persistent admin state exists before initialization. |
| 16 | `InvalidDuration` | Campaign deadline is more than `MAX_DURATION` seconds away. |
| 17 | `TargetTooLow` | Target is below `MIN_TARGET`. |
| 18 | `ExceedsDonorCap` | Donation would exceed `max_per_donor`. |
| 19 | `InvalidMetadataUri` | Metadata URI does not use an accepted `https://` or `ipfs://` prefix. |
| 20 | `MetadataUriTooLong` | Metadata URI exceeds `MAX_METADATA_URI_LEN`. |
| 21 | `InvalidUrl` | URL validation fails; currently never returned by the current contract call paths. |
| 22 | `ArithmeticError` | Checked arithmetic fails during settlement or accounting. |
| 23 | `LimitExceeded` | Creator or batch/API limit is exceeded. |
| 24 | `InvalidTitle` | Title exceeds `MAX_TITLE_LEN`. |
| 25 | `CreationFeeTransferFailed` | The campaign creation fee transfer fails. |
| 26 | `InvalidUpdateContent` | Campaign update content is empty. |
| 27 | `TooManyUpdates` | A campaign already has 10 updates. |
| 28 | `InvalidBeneficiary` | The contract address is named as a beneficiary. |
| 29 | `CommentTooLong` | Donation comment exceeds `MAX_COMMENT_LEN`. |
| 30 | `InvalidCategory` | Category is not `medical`, `food`, `shelter`, `education`, `relief`, or `other`. |
| 31 | `NotWhitelisted` | The donor is not in a private campaign's whitelist. |
| 32 | `DescriptionTooLong` | Description exceeds `MAX_DESCRIPTION_LENGTH`. |
| 33 | `ContractPaused` | A state-changing call is made while the contract is paused. |
| 34 | `RefundNotAllowed` | Refund is requested before expiry or for a funded campaign. |
| 35 | `CampaignNotCancelled` | Refund is requested but the campaign is not cancelled. |
| 36 | `NothingToRefund` | The donor has no contribution left to refund. |
| 37 | `RefundTransferFailed` | The token transfer for a refund fails. |

> [!NOTE]
> Codes 29 and 30 are declared out of order in the Rust enum (`InvalidCategory` is declared before `CommentTooLong`), but the numeric ABI codes are what integrators must use.

## Storage Key Patterns

| Key | Storage type | Value type |
|---|---|---|
| `NEXT` | Instance | `u64` next campaign ID; persistent fallback is migrated to instance storage during reads |
| `LOCK` | Temporary | `bool` reentrancy lock |
| `ADMIN` | Persistent | `Address` platform administrator |
| `OWNER` | Instance | `Address` upgrade owner |
| `PAUSED` | Instance | `bool` pause state |
| `(CMP, campaign_id)` | Persistent | `Campaign` |
| `(TDON, campaign_id)` | Persistent | `Vec<(Address, i128)>` top donors |
| `(CCNT, creator)` | Persistent | `u32` creator campaign count |
| `(DCON, campaign_id, donor)` | Persistent | `i128` donor contribution total |
| `(WLST, campaign_id, address)` | Persistent | `bool` whitelist entry |
| `(UPCT, campaign_id)` | Persistent | `u32` update count |
| `(UPDT, campaign_id, index)` | Persistent | `Update` |

### Campaign Struct Fields

- `id` - campaign ID
- `creator` - address of campaign creator
- `beneficiaries` - share recipients and basis points
- `title` - campaign title
- `description` - optional long-form campaign description
- `metadata_uri` - metadata resource URI
- `category` - browsing category Symbol
- `target_amount` - funding goal in stroops
- `raised_amount` - current donated total in stroops
- `deadline` - Unix timestamp when donations end
- `accepted_token` - token contract address for donations
- `status` - campaign lifecycle state, derived at read time
- `max_per_donor` - optional maximum contribution per donor
- `website` - optional website URL
- `twitter` - optional Twitter URL
- `is_private` - whether the campaign requires whitelist membership
- `was_extended` - whether the campaign deadline was extended
