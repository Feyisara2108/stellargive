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

| Event           | Topics (ScSymbol literals)        | Emitted by         | Data shape                 |
| --------------- | --------------------------------- | ------------------ | -------------------------- |
| Campaign created | `["created"]`                    | `create_campaign`  | `CreatedEvent` (ScMap)     |
| Donation received | `["donation", "received"]`     | `donate`           | 5-element `ScVec`          |
| Funds claimed   | `["funds", "claimed"]`            | `claim_funds`      | 5-element `ScVec`          |

> Status note. There is **no** `goal_reached` event today. When a donation
> brings `raised_amount >= target_amount` the contract sets the campaign
> status to `Funded` in storage but does not emit a separate event. The
> `Donation received` event with `raised_amount >= target_amount` is the
> on-chain signal indexers should key off if they need a "goal reached"
> trigger. Adding a dedicated event is tracked separately.

---

## Event: Campaign created

| Property         | Value                                      |
| ---------------- | ------------------------------------------ |
| Topics           | `(symbol_short!("created"),)`              |
| Data Rust type   | `CreatedEvent` (`#[contracttype]` struct)  |
| Emission point   | After the campaign is written to persistent storage in `create_campaign` |

### Data fields

| Field          | Rust type | ScVal encoding                              | Notes                                  |
| -------------- | --------- | ------------------------------------------- | -------------------------------------- |
| `id`           | `u64`     | `ScVal::U64(u64)`                           | Monotonic campaign id, starts at `1`.  |
| `creator`      | `Address` | `ScVal::Address(ScAddress)`                 | `ScAddress::Account` or `::Contract`.  |
| `target_amount`| `i128`    | `ScVal::I128(Int128Parts { hi, lo })`       | In the token's smallest unit (stroops for SAC tokens). |

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

`ScVal` form (the shape your XDR decoder will hand back):

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

Base64 XDR strings vary per ledger and aren't reproducible here. To inspect
a real event run `stellar-xdr decode --type ContractEvent <base64>` against
an envelope pulled from `getEvents` on Soroban RPC.

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

## Event: Donation received

| Property         | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Topics           | `(symbol_short!("donation"), symbol_short!("received"))` |
| Data Rust type   | 5-tuple — emitted as an `ScVec`, not a struct        |
| Emission point   | After token transfer succeeds and campaign state is updated in `donate` |

### Data fields (positional)

| Index | Name             | Rust type | ScVal encoding                              | Notes                                          |
| ----- | ---------------- | --------- | ------------------------------------------- | ---------------------------------------------- |
| `0`   | `campaign_id`    | `u64`     | `ScVal::U64(u64)`                           | Matches `CreatedEvent.id`.                     |
| `1`   | `donor`          | `Address` | `ScVal::Address(ScAddress)`                 | Account or contract that funded the donation.  |
| `2`   | `amount`         | `i128`    | `ScVal::I128(Int128Parts)`                  | Token amount donated in this call.             |
| `3`   | `raised_amount`  | `i128`    | `ScVal::I128(Int128Parts)`                  | New running total **after** this donation. Use this to detect "goal reached" when `raised_amount >= target_amount`. |
| `4`   | `accepted_token` | `Address` | `ScVal::Address(ScAddress)`                 | SAC contract id of the donation token.         |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["donation", "received"],
  "data": [
    "1",
    "GDONORACCOUNT...",
    "1000000000",
    "3500000000",
    "CUSDC_CONTRACT_ID..."
  ]
}
```

### Example payload — typed XDR

```text
topics: ScVec([
  ScSymbol("donation"),
  ScSymbol("received"),
])
data:   ScVec([
  ScU64(1),
  ScAddress(Account(GDONOR...)),
  ScI128(Int128Parts { hi: 0, lo: 1000000000 }),
  ScI128(Int128Parts { hi: 0, lo: 3500000000 }),
  ScAddress(Contract(0x…USDC…)),
])
```

### Indexing notes

- Two-symbol topic pair. Filter `topics[0] == "donation" && topics[1] == "received"`.
- `campaign_id` is **in the data, not the topics** — same caveat as
  `created`: indexers can't filter per-campaign at the RPC layer.
- `donor` cardinality scales with unique donors (potentially large for
  popular campaigns).
- `accepted_token` cardinality is very low in practice (one or a few token
  contracts per deployment); good candidate for a low-cost secondary index.
- Detect goal-reached transitions by comparing `data[3]` (`raised_amount`)
  against the campaign's `target_amount` from `get_campaign`. The first
  event where `raised_amount >= target_amount` is the funded transition.

---

## Event: Funds claimed

| Property         | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Topics           | `(symbol_short!("funds"), symbol_short!("claimed"))` |
| Data Rust type   | 5-tuple — emitted as an `ScVec`                      |
| Emission point   | After payout transfer and status flip to `Claimed` in `claim_funds` |

### Data fields (positional)

| Index | Name             | Rust type | ScVal encoding              | Notes                                                            |
| ----- | ---------------- | --------- | --------------------------- | ---------------------------------------------------------------- |
| `0`   | `campaign_id`    | `u64`     | `ScVal::U64(u64)`           | Matches `CreatedEvent.id`.                                        |
| `1`   | `caller`         | `Address` | `ScVal::Address(ScAddress)` | Whoever invoked `claim_funds`. Must equal `creator` or `beneficiary`. |
| `2`   | `beneficiary`    | `Address` | `ScVal::Address(ScAddress)` | Always the final payout recipient — independent of `caller`.     |
| `3`   | `amount`         | `i128`    | `ScVal::I128(Int128Parts)`  | Total amount transferred to `beneficiary`.                       |
| `4`   | `accepted_token` | `Address` | `ScVal::Address(ScAddress)` | SAC contract id of the payout token.                             |

### Example payload — JSON

```json
{
  "contract": "CABCDEFG...",
  "topics": ["funds", "claimed"],
  "data": [
    "1",
    "GCREATOR...",
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
  ScAddress(Account(GCREATOR...)),
  ScAddress(Account(GBENEFICIARY...)),
  ScI128(Int128Parts { hi: 0, lo: 5000000000 }),
  ScAddress(Contract(0x…USDC…)),
])
```

### Indexing notes

- `claim_funds` is one-shot per campaign (subsequent calls return
  `AlreadyClaimed`), so cardinality of `claimed` events is bounded above
  by the number of created campaigns.
- For a settlement ledger, key on `(campaign_id, beneficiary)` — `caller`
  is only relevant for audit / "who pressed claim?" views.

---

## Cross-cutting indexing considerations

- **No campaign-id in topics.** None of the three events put `campaign_id`
  in their topic array. The `getEvents` RPC can only filter on topics, so
  every consumer that needs per-campaign feeds will pull all events for the
  contract and partition by `data.id` / `data[0]` client-side. If this
  becomes a hot path, the right fix is a contract change to promote
  `campaign_id` to a topic — track that as a separate issue.
- **Topic-arity inconsistency.** `created` is a single-symbol topic;
  `donation.received` and `funds.claimed` are symbol pairs. Consumers
  must not assume a fixed topic length per contract.
- **Stroops vs. display units.** All `i128` amounts are in the token's
  smallest unit. For SAC-wrapped Stellar assets that means stroops
  (divide by `10^7`). For arbitrary token contracts call `decimals()` on
  the `accepted_token` and shift accordingly.
- **Decoding payloads.** Use `scValToNative` from `@stellar/stellar-sdk`
  for JSON-shaped consumption, or decode the raw XDR with `stellar-xdr`
  for byte-exact reproduction in tests.

## See also

- [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-event-schema) — high-level
  overview of where events fit in the data flow.
- Contract source: [`contracts/stellar-give/src/lib.rs`](../contracts/stellar-give/src/lib.rs).
