# stellarGive Architecture

## 1. System Overview

```text
┌──────────────────────────┐
│        Web Client        │
│  Next.js 14 App Router   │
└─────────────┬────────────┘
              │ Freighter / SDK signing
              ▼
┌──────────────────────────┐
│  Stellar JS Integration  │
│  (@stellar/stellar-sdk)  │
└─────────────┬────────────┘
              │ invokeHostFunction / simulateTransaction
              ▼
┌──────────────────────────┐
│  Soroban RPC (Testnet)   │
│ soroban-testnet.stellar  │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────┐
│  stellar-give Contract   │
│   (Rust + soroban-sdk)   │
└─────────────┬────────────┘
              │ emits events / stores state
              ▼
┌──────────────────────────┐
│   Frontend Polling Loop  │
│ query campaign + events  │
└──────────────────────────┘
```

## 2. Contract ↔ Frontend Data Mapping

| Contract Function | Purpose | Frontend Caller | Output Mapping |
|---|---|---|---|
| `initialize(admin)` | One-shot platform admin setup | Ops / deployment scripts | — |
| `pause()` | Pause state-mutating methods | Admin toggle in `useSoroban.ts` | Tx hash |
| `unpause()` | Resume state-mutating methods | Admin toggle in `useSoroban.ts` | Tx hash |
| `create_campaign(creator, beneficiaries, title, description, metadata_uri, category, target_amount, deadline, accepted_token, max_per_donor)` | Create campaign | Create-campaign flow (`campaignMutations.ts`) | Returns `campaign_id` |
| `donate(donor, campaign_id, amount, is_anonymous, comment)` | Donate funds | Donation flow on campaign detail | Tx hash + event feed update |
| `cancel_campaign(id)` | Creator cancels an active campaign | Refund flow (`useSoroban.ts`) | Tx hash |
| `claim_refund(donor, campaign_id)` | Refund a donation to a cancelled campaign | `RefundButton` / refund flow | Tx hash |
| `claim_funds(beneficiary, campaign_id)` | Claim and distribute raised funds | Beneficiary action panel | Gross amount + `Claimed` status |
| `refund(campaign_id, donor)` | Refund a donation to an expired, unfunded campaign | Refund flow (`useSoroban.ts`) | Tx hash |
| `upgrade(new_wasm_hash)` | Replace the contract WASM (owner only) | Admin ops | Tx hash |
| `get_owner()` | Read the contract owner | `getOwner()` in `soroban.ts` | Owner address |
| `set_owner(new_owner)` | Transfer contract ownership | Admin UI | Tx hash |
| `get_campaign(campaign_id)` | Read campaign state | `getCampaign()` in `soroban.ts` | Maps to UI card/detail model |
| `get_campaigns(ids)` | Read up to 50 campaigns by ID | Batch reads (SDK callers) | `Vec<Option<Campaign>>` |
| `get_campaigns_paged(offset, limit)` | Read campaigns in ID order | `getRecentCampaigns()` in `soroban.ts` | Campaign list |
| `get_campaigns_by_creator(creator)` | Read campaigns for a creator | `getCampaignsByCreator()` in `soroban.ts` | Profile campaign list |
| `get_total_campaigns()` | Count all campaigns | `getTotalCampaigns()` in `soroban.ts` | Homepage stats |
| `get_top_donors(campaign_id)` | Top five `(address, amount)` pairs | `getTopDonors()` in `soroban.ts` | Leaderboard |
| `get_time_left(campaign_id)` | Seconds until the deadline | Countdowns are derived locally in `useCountdown.ts` | Countdown label |
| `add_to_whitelist(id, addresses)` | Allow addresses to donate to a private campaign | Whitelist UI (`useSoroban.ts`) | Tx hash |
| `add_update(id, content)` | Post a campaign update (max 10) | `PostUpdateForm` via `hooks/events.ts` | Tx hash + update feed |
| `get_updates(id)` | Read campaign updates | `getUpdates()` in `soroban.ts` | Update timeline |

## 3. Storage Layout (Soroban)

Keys and the storage type each uses are defined in
[`contracts/stellar-give/src/lib.rs`](../contracts/stellar-give/src/lib.rs).

| Key | Storage | Value |
|---|---|---|
| `NEXT` | Instance | `u64` next campaign ID (legacy values migrate from Persistent on first read) |
| `OWNER` | Instance | `Address` contract owner |
| `PAUSED` | Instance | `bool` paused flag |
| `ADMIN` | Persistent | `Address` platform fee recipient |
| `CMP`, `campaign_id` | Persistent | `Campaign` |
| `TDON`, `campaign_id` | Persistent | `Vec<(Address, i128)>` top five donors |
| `CCNT`, `creator` | Persistent | `u32` campaigns created by an address |
| `DCON`, `campaign_id`, `donor` | Persistent | `i128` donor contribution |
| `WLST`, `campaign_id`, `address` | Persistent | `bool` private-campaign whitelist entry |
| `UPCT`, `campaign_id` | Persistent | `u32` update count |
| `UPDT`, `campaign_id`, `index` | Persistent | `Update { content, timestamp }` |
| `LOCK` | Temporary | `bool` reentrancy lock |

The `Campaign` struct stores `id`, `creator`, `beneficiaries: Vec<(Address, u32)>`,
`title`, `description`, `metadata_uri`, `category`, `target_amount`,
`raised_amount`, `deadline`, `accepted_token`, `status: CampaignStatus`,
`max_per_donor: Option<i128>`, `website: Option<String>`,
`twitter: Option<String>`, `is_private`, and `was_extended`. `CampaignStatus`
is `Active`, `Funded`, `Claimed`, `Expired`, or `Cancelled`.

## 4. Event Schema

See [`EVENT_SCHEMA.md`](./EVENT_SCHEMA.md) for the Soroban event model, ScVal
types, and per-event indexing notes. The payload shapes below are taken from
[`contracts/stellar-give/src/lib.rs`](../contracts/stellar-give/src/lib.rs).

| Topics | Data | Consumer |
|---|---|---|
| `("created",)` | `CreatedEvent { id, creator, target_amount }` | Campaign feed |
| `("goal_reached",)` | `GoalReachedEvent { campaign_id, total_raised }` | Instant milestone notifications |
| `("donation", "received")` | `DonationEvent { campaign_id, donor, amount, total_raised, accepted_token, comment }` | Donation timeline / analytics |
| `("autoclaimed",)` | `AutoClaimedEvent { campaign_id, total_raised, beneficiary }` | Automatic payout feed |
| `("cancel",)` | `CancelledEvent { id, creator }` | Cancellation feed |
| `("refund", campaign_id)` / `("refund",)` | `RefundEvent { campaign_id, donor, amount }` | Refund history |
| `("funds", "claimed")` | `(campaign_id, beneficiary, amount, accepted_token)` | Settlement and payout history |
| `("claimed", campaign_id)` | `ClaimedEvent { campaign_id, amount, beneficiary }` | Claim confirmation |
| `("paused",)` / `("unpaused",)` | `PausedEvent { admin }` / `UnpausedEvent { admin }` | Operations monitoring |
| `("update",)` | `CampaignUpdateEvent { campaign_id, content, timestamp }` | Campaign update timeline |
| `("Upgraded",)` | `BytesN<32>` new WASM hash | Deployment monitoring |
| `("OwnerSet",)` | `Address` new owner | Ownership monitoring |

## 5. RPC Polling Strategy

1. Query campaign list on page load, then poll every 15-30s for active campaigns.
2. Re-fetch immediately after a confirmed transaction (optimistic UI + authoritative refresh).
3. Poll contract events in descending ledger order and deduplicate by `(ledger, topic, data-hash)`.
4. Backoff on RPC failures (e.g., 1s → 2s → 4s, cap at 30s) to avoid provider overload.
5. For critical balances/claim status, always confirm via latest ledger read before showing success state.

## 6. Reliability Notes

- Use simulation before submission to catch auth/footprint failures early.
- Never trust client-side campaign deadline checks alone; enforce in contract.
- Keep RPC URL + network passphrase aligned to prevent wrong-network signing.

## 💰 Token Math and Stroop Handling

Stellar tokens use 7 decimal places. All amounts in the contract are in **stroops** (1 stroop = 0.0000001 tokens).

### Critical Rules
1. **Never use floating-point math** for amounts. Use `i128` with `checked_add`, `checked_mul` in Rust, and `BigInt` in TypeScript.
2. **Always convert at boundaries**: frontend displays tokens; contract stores stroops.
3. **Round consistently**: prefer rounding toward platform on fee splits to avoid deficit.

### Examples
| Token Amount | Stroops |
|--------------|---------|
| 1.0 XLM | 10,000,000 |
| 0.0000001 XLM | 1 |
| 1,000,000.5 XLM | 10,000,000,500,000 |

### Utilities
- **Frontend**: 
  - `src/lib/soroban.ts` provides `toStroops(amount: string | number): bigint` and `fromStroops(stroops: bigint | string | number): string`.
  - `src/utils/format.ts` provides `formatStroop(stroop: bigint): string`.
- **Contract**: All function arguments/returns use `i128` for stroop amounts.

### Common Pitfalls
❌ `let amount = 0.1 * 10_000_000; // 999999.9999999 due to float error`  
✅ `let amount = 1_000_000n; // 0.1 XLM as bigint stroops`
