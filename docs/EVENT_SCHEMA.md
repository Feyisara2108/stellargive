# Event Schema

This document is the authoritative reference for every contract event the
`stellar-give` Soroban contract emits. It is intended for indexers, analytics
pipelines, and any off-chain consumer that needs to decode events without
reading the Rust source.

Each section below describes one event. The Rust source of truth is
[`contracts/stellar-give/src/lib.rs`](../contracts/stellar-give/src/lib.rs);
this file mirrors that source and must be updated when the contract changes.

## Soroban event model — quick refresher

A Soroban event has three components:

1. **Contract address** — the address of the contract that called
   `env.events().publish(...)`.
2. **Topics** — an ordered list of `ScVal`s. Indexers filter on topics, so
   put high-cardinality, query-friendly identifiers here when possible.
3. **Data** — a single `ScVal` carrying the event payload. For structured
   events the payload is an `ScMap` (one entry per field) produced by a
   `#[contracttype]` struct; for tuple events it is an `ScVec`.

`symbol_short!("foo")` produces a Soroban `Symbol` (up to 9 chars,
`ScVal::Symbol(ScSymbol)`); it is the canonical topic discriminator.

## Index of events

| Event | Topics (ScSymbol literals) | Emitted by | Data shape |
| --- | --- | --- | --- |
| Campaign created | `["created"]` | `create_campaign` | `CreatedEvent` (ScMap) |
| Goal reached | `["goal_reached"]` | `donate` | `GoalReachedEvent` (ScMap) |
| Auto-claimed | `["autoclaimed"]` | `donate` | `AutoClaimedEvent` (ScMap) |
| Donation received | `["donation", "received"]` | `donate` | `DonationEvent` (ScMap) |
| Campaign cancelled | `["cancel"]` | `cancel_campaign` | `CancelledEvent` (ScMap) |
| Refund (cancelled campaign) | `["refund", campaign_id]` | `claim_refund` | `RefundEvent` (ScMap) |
| Funds claimed | `["funds", "claimed"]` | `claim_funds` | 4-element `ScVec` |
| Funds claimed (by campaign ID) | `["claimed", campaign_id]` | `claim_funds` | `ClaimedEvent` (ScMap) |
| Refund (expired campaign) | `["refund"]` | `refund` | `RefundEvent` (ScMap) |
| Contract upgraded | `["Upgraded"]` | `upgrade` | `BytesN<32>` (`ScVal::Bytes`) |
| Owner set | `["OwnerSet"]` | `set_owner` | `Address` (`ScVal::Address`) |
| Campaign paused | `["paused"]` | `pause` | `PausedEvent` (ScMap) |
| Campaign unpaused | `["unpaused"]` | `unpause` | `UnpausedEvent` (ScMap) |
| Campaign update added | `["update"]` | `add_update` | `CampaignUpdateEvent` (ScMap) |

---

## Event: Campaign created

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("created"),)` |
| Data Rust type | `CreatedEvent` (`#[contracttype]` struct) |
| Emission point | After the campaign is written to persistent storage in `create_campaign` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `id` | `u64` | `ScVal::U64(u64)` | Monotonic campaign id, starts at `1`. |
| `creator` | `Address` | `ScVal::Address(ScAddress)` | `ScAddress::Account` or `::Contract`. |
| `target_amount` | `i128` | `ScVal::I128(Int128Parts { hi, lo })` | In the token's smallest unit (stroops for SAC tokens). |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["created"],
  "data": {
    "id": "1",
    "creator": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    "target_amount": "5000000000"
  }
}
```

(`id` and `target_amount` are stringified because JSON cannot represent
`u64`/`i128` without precision loss — match what `stellar-sdk`'s
`scValToNative` returns.)

### Example payload — typed XDR

```text
topics: ScVec([
  ScSymbol("created"),
])
data:   ScMap([
  { key: ScSymbol("id"),            val: ScU64(1) },
  { key: ScSymbol("creator"),       val: ScAddress(Account(GA7Q...VSGZ)) },
  { key: ScSymbol("target_amount"), val: ScI128(Int128Parts { hi: 0, lo: 5000000000 }) },
])
```

### Indexing notes

- The only topic is the discriminator. **There is no campaign-id topic**,
  so indexers cannot filter per-campaign at the RPC layer — fetch all
  `created` events and partition by `data.id` downstream.
- `data.id` is dense and monotonically increasing — safe as a primary key.
- `data.creator` is high cardinality (unbounded, one entry per unique
  Stellar account that has ever created a campaign).
- `data.target_amount` is denominated in the token's smallest unit;
  cross-reference with the campaign's `accepted_token` (read via
  `get_campaign`, not in this event) before display.

---

## Event: Goal reached

| Property | Value |
| --- | --- |
| Topics | `(Symbol::new(env, "goal_reached"),)` |
| Data Rust type | `GoalReachedEvent` (`#[contracttype]` struct) |
| Emission point | Immediately after a donation crosses from below target to target or above in `donate` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | Campaign whose target was reached. |
| `total_raised` | `i128` | `ScVal::I128(Int128Parts)` | New cumulative raised amount after donation. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["goal_reached"],
  "data": {
    "campaign_id": "1",
    "total_raised": "10000000"
  }
}
```

### Indexing notes

- This event is emitted only once, on the threshold-crossing donation.
- Emitted right before `AutoClaimedEvent` when auto-claim executes.
- Soroban short symbols are limited to 9 characters, so the implementation
  uses a regular `Symbol` with the text `goal_reached` rather than
  `symbol_short!`.
- Use it as the real-time trigger for notifications, then fetch campaign
  state with `get_campaign` if you need the full canonical record.

---

## Event: Auto-claimed

| Property | Value |
| --- | --- |
| Topics | `(Symbol::new(env, "autoclaimed"),)` |
| Data Rust type | `AutoClaimedEvent` (`#[contracttype]` struct) |
| Emission point | Immediately after `GoalReachedEvent` in `donate` when auto-claim transfers funds |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | ID of the campaign whose goal was reached. |
| `total_raised` | `i128` | `ScVal::I128(Int128Parts)` | Total amount collected and distributed. |
| `beneficiary` | `Address` | `ScVal::Address(ScAddress)` | Primary (first) beneficiary in the campaign recipient list. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["autoclaimed"],
  "data": {
    "campaign_id": "1",
    "total_raised": "10000000",
    "beneficiary": "GBENEFICIARY..."
  }
}
```

### Indexing notes

- An auto-claim triggered during `donate` emits three events in sequence:
  `goal_reached`, `autoclaimed`, and `("donation", "received")`.
- `beneficiary` indicates the first beneficiary from `campaign.beneficiaries`.
- The campaign status transitions to `Claimed` and `raised_amount` is zeroed.

---

## Event: Donation received

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("donation"), symbol_short!("received"))` |
| Data Rust type | `DonationEvent` (`#[contracttype]` struct) |
| Emission point | After token transfer succeeds and campaign state is updated in `donate` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | Matches `CreatedEvent.id`. |
| `donor` | `Address` | `ScVal::Address(ScAddress)` | Account or contract that funded the donation. If `is_anonymous` was `true`, this is masked with the anonymous sentinel address (`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`). |
| `amount` | `i128` | `ScVal::I128(Int128Parts)` | Token amount donated in this call. |
| `total_raised` | `i128` | `ScVal::I128(Int128Parts)` | Cumulative total raised after this donation. |
| `accepted_token` | `Address` | `ScVal::Address(ScAddress)` | SAC contract ID of the accepted donation token. |
| `comment` | `Option<String>` | `Option<String>` (`ScVal::Vec` / `ScVal::Void`) | Optional comment string, up to 250 characters. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["donation", "received"],
  "data": {
    "campaign_id": "1",
    "donor": "GDONORACCOUNT...",
    "amount": "1000000000",
    "total_raised": "3500000000",
    "accepted_token": "CUSDC_CONTRACT_ID...",
    "comment": "keep up the great work"
  }
}
```

### Example payload — typed XDR

```text
topics: ScVec([
  ScSymbol("donation"),
  ScSymbol("received"),
])
data:   ScMap([
  { key: ScSymbol("campaign_id"),   val: ScU64(1) },
  { key: ScSymbol("donor"),         val: ScAddress(Account(GDONOR...)) },
  { key: ScSymbol("amount"),        val: ScI128(Int128Parts { hi: 0, lo: 1000000000 }) },
  { key: ScSymbol("total_raised"),  val: ScI128(Int128Parts { hi: 0, lo: 3500000000 }) },
  { key: ScSymbol("accepted_token"), val: ScAddress(Contract(0x…USDC…)) },
  { key: ScSymbol("comment"),       val: ScVec([ScString("keep up the great work")]) },
])
```

### Indexing notes

- Two-symbol topic pair: `topics[0] == "donation" && topics[1] == "received"`.
- `campaign_id` is inside `data`, not in the topics.
- When `is_anonymous` is set, `donor` is replaced with `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`.
- If a donation reaches the goal, `goal_reached`, `autoclaimed`, and `("donation", "received")` are all emitted during the single transaction.

---

## Event: Campaign cancelled

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("cancel"),)` |
| Data Rust type | `CancelledEvent` (`#[contracttype]` struct) |
| Emission point | After campaign status transitions to `Cancelled` in `cancel_campaign` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `id` | `u64` | `ScVal::U64(u64)` | ID of the cancelled campaign. |
| `creator` | `Address` | `ScVal::Address(ScAddress)` | Creator address that authorized the cancellation. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["cancel"],
  "data": {
    "id": "1",
    "creator": "GCREATOR..."
  }
}
```

### Indexing notes

- Signals that the campaign has been cancelled by its creator.
- Once cancelled, donors can reclaim their contributions via `claim_refund`.

---

## Event: Refund (cancelled campaign)

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("refund"), campaign_id)` |
| Data Rust type | `RefundEvent` (`#[contracttype]` struct) |
| Emission point | After token transfer succeeds and donor contribution is zeroed in `claim_refund` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | ID of the cancelled campaign. |
| `donor` | `Address` | `ScVal::Address(ScAddress)` | Donor address receiving the refund. |
| `amount` | `i128` | `ScVal::I128(Int128Parts)` | Amount refunded in stroops. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["refund", "1"],
  "data": {
    "campaign_id": "1",
    "donor": "GDONOR...",
    "amount": "1000000"
  }
}
```

### Indexing notes

- Note the topic structure: `topics[0] == "refund"` and `topics[1] == campaign_id`. This allows RPC queries to filter refunds by campaign ID directly.
- Differs from the expired campaign `refund` event, which carries only a single topic `["refund"]`.

---

## Event: Funds claimed

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("funds"), symbol_short!("claimed"))` |
| Data Rust type | 4-tuple — emitted as an `ScVec` |
| Emission point | After payout distribution and status flip to `Claimed` in `claim_funds` |

### Data fields (positional)

| Index | Name | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- | --- |
| `0` | `campaign_id` | `u64` | `ScVal::U64(u64)` | Matches `CreatedEvent.id`. |
| `1` | `beneficiary` | `Address` | `ScVal::Address(ScAddress)` | Payout beneficiary or invoking beneficiary address. |
| `2` | `amount` | `i128` | `ScVal::I128(Int128Parts)` | Gross amount distributed to beneficiaries. |
| `3` | `accepted_token` | `Address` | `ScVal::Address(ScAddress)` | SAC contract ID of payout token. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["funds", "claimed"],
  "data": [
    "1",
    "GBENEFICIARY...",
    "5000000000",
    "CUSDC_CONTRACT_ID..."
  ]
}
```

### Example payload — typed XDR

```text
topics: ScVec([
  ScSymbol("funds"),
  ScSymbol("claimed"),
])
data:   ScVec([
  ScU64(1),
  ScAddress(Account(GBENEFICIARY...)),
  ScI128(Int128Parts { hi: 0, lo: 5000000000 }),
  ScAddress(Contract(0x…USDC…)),
])
```

### Indexing notes

- A successful `claim_funds` call emits **two** events:
  1. `("funds", "claimed")` — 4-element positional tuple.
  2. `("claimed", campaign_id)` — `ClaimedEvent` struct with the campaign ID in topic 1.

---

## Event: Funds claimed (by campaign ID)

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("claimed"), campaign.id)` |
| Data Rust type | `ClaimedEvent` (`#[contracttype]` struct) |
| Emission point | Immediately after the `("funds", "claimed")` event in `claim_funds` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | ID of the claimed campaign. |
| `amount` | `i128` | `ScVal::I128(Int128Parts)` | Total amount claimed and distributed. |
| `beneficiary` | `Address` | `ScVal::Address(ScAddress)` | Beneficiary address associated with the claim. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["claimed", "1"],
  "data": {
    "campaign_id": "1",
    "amount": "5000000000",
    "beneficiary": "GBENEFICIARY..."
  }
}
```

### Indexing notes

- Carries `campaign_id` as `topics[1]`, enabling per-campaign RPC event filtering.

---

## Event: Refund (expired campaign)

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("refund"),)` |
| Data Rust type | `RefundEvent` (`#[contracttype]` struct) |
| Emission point | After token transfer succeeds and donor contribution is zeroed in `refund` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | ID of the expired campaign. |
| `donor` | `Address` | `ScVal::Address(ScAddress)` | Donor address receiving the refund. |
| `amount` | `i128` | `ScVal::I128(Int128Parts)` | Refunded amount in stroops. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["refund"],
  "data": {
    "campaign_id": "1",
    "donor": "GDONOR...",
    "amount": "1000000"
  }
}
```

### Indexing notes

- Carries a single topic `["refund"]` without a campaign ID topic.

---

## Event: Contract upgraded

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("Upgraded"),)` |
| Data Rust type | `BytesN<32>` (`ScVal::Bytes`) |
| Emission point | After `update_current_contract_wasm` succeeds in `upgrade` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `new_wasm_hash` | `BytesN<32>` | `ScVal::Bytes(ScBytes)` | 32-byte hash of the newly installed WASM code. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["Upgraded"],
  "data": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
}
```

### Indexing notes

- Critical for tracking contract upgrade lifecycle and verifying the running bytecode against audit hashes.
- Single topic `["Upgraded"]`.

---

## Event: Owner set

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("OwnerSet"),)` |
| Data Rust type | `Address` (`ScVal::Address`) |
| Emission point | After new owner address is stored in `set_owner` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `new_owner` | `Address` | `ScVal::Address(ScAddress)` | The new contract administrator / upgrade owner address. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["OwnerSet"],
  "data": "GNEWOWNER..."
}
```

### Indexing notes

- Emitted whenever the upgrade owner role is transferred.
- Single topic `["OwnerSet"]`.

---

## Event: Campaign paused

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("paused"),)` |
| Data Rust type | `PausedEvent` (`#[contracttype]` struct) |
| Emission point | After paused flag is set to `true` in `pause` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `admin` | `Address` | `ScVal::Address(ScAddress)` | Platform administrator who executed pause. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["paused"],
  "data": {
    "admin": "GADMIN..."
  }
}
```

### Indexing notes

- State mutations (`create_campaign`, `donate`, `cancel_campaign`, `claim_funds`, `refund`, `add_update`) are blocked while paused.

---

## Event: Campaign unpaused

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("unpaused"),)` |
| Data Rust type | `UnpausedEvent` (`#[contracttype]` struct) |
| Emission point | After paused flag is set to `false` in `unpause` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `admin` | `Address` | `ScVal::Address(ScAddress)` | Platform administrator who executed unpause. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["unpaused"],
  "data": {
    "admin": "GADMIN..."
  }
}
```

### Indexing notes

- Signals contract has returned to normal active operations.

---

## Event: Campaign update added

| Property | Value |
| --- | --- |
| Topics | `(symbol_short!("update"),)` |
| Data Rust type | `CampaignUpdateEvent` (`#[contracttype]` struct) |
| Emission point | After update text and timestamp are stored in `add_update` |

### Data fields

| Field | Rust type | ScVal encoding | Notes |
| --- | --- | --- | --- |
| `campaign_id` | `u64` | `ScVal::U64(u64)` | ID of the campaign being updated. |
| `content` | `String` | `ScVal::String(ScString)` | Update announcement body. |
| `timestamp` | `u64` | `ScVal::U64(u64)` | Ledger timestamp of update publication. |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["update"],
  "data": {
    "campaign_id": "1",
    "content": "Progress update #1",
    "timestamp": "1717000000"
  }
}
```

### Indexing notes

- Each campaign supports up to 10 updates.

---

## Cross-cutting indexing considerations

- **Topic filtering vs data filtering.** Some events (`("claimed", campaign_id)`, `("refund", campaign_id)`) include `campaign_id` in topics, allowing direct per-campaign subscription at the RPC layer. Other events (`created`, `("donation", "received")`, `cancel`, `("refund",)`) store `campaign_id` in their data payload and require downstream partitioning.
- **Multi-event operations.** Integrators must handle multiple events emitted in a single transaction:
  - `claim_funds`: Emits both `("funds", "claimed")` (4-element tuple) and `("claimed", campaign_id)` (`ClaimedEvent`).
  - Auto-claim during `donate`: Emits `goal_reached` (`GoalReachedEvent`), `autoclaimed` (`AutoClaimedEvent`), and `("donation", "received")` (`DonationEvent`).
- **Topic-arity variation.** Topics range from 1 symbol (`["created"]`, `["cancel"]`, `["paused"]`, `["unpaused"]`, `["update"]`, `["Upgraded"]`, `["OwnerSet"]`, `["goal_reached"]`, `["autoclaimed"]`, `["refund"]`) to 2 elements (`["donation", "received"]`, `["funds", "claimed"]`, `["claimed", id]`, `["refund", id]`). Consumers must not assume fixed topic length.
- **Stroops vs. display units.** All `i128` amounts are in the token's smallest unit. For SAC-wrapped Stellar assets that means stroops (divide by `10^7`). For arbitrary token contracts call `decimals()` on the `accepted_token` and shift accordingly.
- **Decoding payloads.** Use `scValToNative` from `@stellar/stellar-sdk` for JSON-shaped consumption, or decode the raw XDR with `stellar-xdr` for byte-exact reproduction in tests.

## See also

- [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-event-schema) — high-level overview of where events fit in the data flow.
- Contract source: [`contracts/stellar-give/src/lib.rs`](../contracts/stellar-give/src/lib.rs).
