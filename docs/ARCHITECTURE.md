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

For full contract method and error reference documentation, see [`docs/CONTRACT_API.md`](./docs/CONTRACT_API.md).

## 4. Event Schema

Authoritative event reference: [`EVENT_SCHEMA.md`](./EVENT_SCHEMA.md).

Summary of the events this contract publishes:

| Topics | Data | Consumer |
|---|---|---|
| `("created",)` | `CreatedEvent { id, creator, target_amount }` | Campaign feed |
| `("donation", "received")` | `(campaign_id, donor, amount, raised_amount, accepted_token)` | Donation timeline / analytics |
| `("funds", "claimed")` | `(campaign_id, caller, beneficiary, amount, accepted_token)` | Settlement and payout history |

See [`EVENT_SCHEMA.md`](./EVENT_SCHEMA.md) for ScVal types, JSON/XDR
payload examples, and per-event indexing notes.

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
