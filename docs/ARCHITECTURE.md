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
| `create_campaign(creator, beneficiary, title, target_amount, deadline, accepted_token)` | Create campaign | Campaign create form | Returns `campaign_id` shown in dashboard |
| `donate(donor, campaign_id, amount)` | Donate funds | Donation flow on campaign detail | Tx hash + event feed update |
| `claim_funds(caller, campaign_id)` | Beneficiary claim | Beneficiary action panel | Claimed amount + claimed status |
| `get_campaign(campaign_id)` | Read campaign state | Campaign list/detail loaders | Maps to UI card/detail model |

## 3. Storage Layout (Soroban)

Expected key spaces:
- `CampaignById(campaign_id)` → campaign struct (core campaign state)
- `CampaignCounter` → monotonic counter for campaign IDs
- `ReentrancyLock` (temporary storage) → one-call execution lock

Expected campaign struct fields:
- `id`, `creator`, `beneficiary`
- `title`
- `target_amount`
- `raised_amount`
- `deadline`
- `accepted_token`
- `claimed`

## 4. Event Schema

Recommended event topics + data:

| Topic | Data | Consumer |
|---|---|---|
| `("campaign", "created")` | `(campaign_id, creator, beneficiary, target_amount, deadline, accepted_token)` | Campaign feed |
| `("donation", "received")` | `(campaign_id, donor, amount, token)` | Donation timeline / analytics |
| `("funds", "claimed")` | `(campaign_id, caller, beneficiary, amount, token)` | Settlement and payout history |

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
