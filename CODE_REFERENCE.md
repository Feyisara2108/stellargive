# Auto-Claim Feature - Code Reference

## 1. AutoClaimedEvent Structure

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct AutoClaimedEvent {
    pub campaign_id: u64,
    pub total_raised: i128,
    pub beneficiary: Address,
}
```

**Location:** [src/lib.rs](contracts/stellar-give/src/lib.rs) lines ~63-69

**Purpose:** Event published when a donation automatically triggers fund distribution

---

## 2. distribute_funds() Helper Function

```rust
/// Distributes raised funds to beneficiaries after deducting the platform fee.
/// 
/// Net proceeds (after 1% platform fee) are split proportionally among
/// beneficiaries according to their basis-point shares. The first beneficiary
/// absorbs any rounding dust so that `fee + Σpayouts == amount` exactly.
fn distribute_funds(
    env: &Env,
    admin: &Address,
    campaign: &Campaign,
    amount: i128,
) -> Result<(), ContractError> {
    let fee = calculate_platform_fee(amount)?;
    let net = amount
        .checked_sub(fee)
        .ok_or(ContractError::InvalidAmount)?;

    let token = token::Client::new(env, &campaign.accepted_token);

    // Fee leg: skipped when rounding produces zero to avoid no-op transfers.
    if fee > 0 {
        token.transfer(&env.current_contract_address(), admin, &fee);
    }

    // Distribute net proportionally among beneficiaries (basis points over 10_000).
    // Beneficiaries at index 1..n each receive floor(net * share / 10_000).
    // The first beneficiary (index 0) receives the remainder so that
    // fee + Σpayouts == amount exactly, absorbing any rounding dust.
    let n = campaign.beneficiaries.len();
    let mut distributed: i128 = 0;
    for i in 1..n {
        let (addr, share) = campaign.beneficiaries.get(i).unwrap();
        let payout = net
            .checked_mul(i128::from(share))
            .ok_or(ContractError::InvalidAmount)?
            / 10_000;
        token.transfer(&env.current_contract_address(), &addr, &payout);
        distributed = distributed
            .checked_add(payout)
            .ok_or(ContractError::InvalidAmount)?;
    }
    let (first_addr, _) = campaign.beneficiaries.get(0).unwrap();
    let remainder = net
        .checked_sub(distributed)
        .ok_or(ContractError::InvalidAmount)?;
    token.transfer(&env.current_contract_address(), &first_addr, &remainder);

    Ok(())
}
```

**Location:** [src/lib.rs](contracts/stellar-give/src/lib.rs) lines ~458-508

**Parameters:**
- `env`: Soroban environment
- `admin`: Platform admin address (receives fee)
- `campaign`: Campaign struct containing beneficiaries and token
- `amount`: Total amount to distribute

**Returns:** Result with no error details (fee calculation/transfer errors bubble up)

---

## 3. Enhanced donate() Function - Auto-Claim Logic

```rust
if goal_reached {
    env.events().publish(
        (goal_reached_topic(&env),),
        GoalReachedEvent {
            campaign_id: campaign.id,
            total_raised: campaign.raised_amount,
        },
    );

    // Auto-claim: immediately transfer funds to beneficiaries
    let admin = read_admin(&env)?;
    let total_raised = campaign.raised_amount;
    
    // Distribute funds to beneficiaries
    distribute_funds(&env, &admin, &campaign, total_raised)?;

    // Update campaign status and clear raised amount
    campaign.raised_amount = 0;
    campaign.status = CampaignStatus::Claimed;
    write_campaign(&env, &campaign);

    // Emit AutoClaimed event for the first beneficiary
    let (first_beneficiary, _) = campaign.beneficiaries.get(0).unwrap();
    env.events().publish(
        (symbol_short!("autoclaimed"),),
        AutoClaimedEvent {
            campaign_id: campaign.id,
            total_raised,
            beneficiary: first_beneficiary.clone(),
        },
    );
}
```

**Location:** [src/lib.rs](contracts/stellar-give/src/lib.rs) lines ~725-764

**Flow:**
1. Check `goal_reached` (target met on this donation)
2. Emit `GoalReachedEvent` for indexers
3. Get admin and retrieve total raised amount
4. Call `distribute_funds()` to handle all transfers
5. Update campaign status to `Claimed` and clear `raised_amount`
6. Emit `AutoClaimedEvent` with first beneficiary
7. Continue to emit standard `DonationEvent`

---

## 4. Refactored claim_funds()

```rust
enter_lock(&env)?;
let result = (|| {
    let admin = read_admin(&env)?;
    let amount = campaign.raised_amount;

    // Distribute funds to beneficiaries (including platform fee calculation)
    distribute_funds(&env, &admin, &campaign, amount)?;

    campaign.raised_amount = 0;
    campaign.status = CampaignStatus::Claimed;
    write_campaign(&env, &campaign);

    // Gross amount in event preserves the original raised amount for indexers.
    env.events().publish(
        (symbol_short!("funds"), symbol_short!("claimed")),
        (campaign.id, caller, amount, campaign.accepted_token),
    );

    Ok(amount)
})();

exit_lock(&env);
result
```

**Location:** [src/lib.rs](contracts/stellar-give/src/lib.rs) lines ~870-883

**Changes:**
- Removed 60+ lines of distribution logic
- Replaced with single `distribute_funds()` call
- Maintains identical behavior and event emission
- Same error handling and security properties

---

## 5. Test Cases

### Test 1: Auto-Claim at Target
```rust
#[test]
fn donate_at_target_triggers_auto_claim() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claim Test"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let beneficiary_balance_before = token_client.balance(&beneficiary);

    // Donate exactly the target amount
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Check that campaign is now Claimed
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);
    assert_eq!(campaign.raised_amount, 0);

    // Check that beneficiary received funds (net of 1% fee)
    let beneficiary_balance_after = token_client.balance(&beneficiary);
    let net_amount = 10_000_000 - calculate_platform_fee(10_000_000).unwrap();
    assert_eq!(beneficiary_balance_after - beneficiary_balance_before, net_amount);
}
```

### Test 2: Reject Donations After Auto-Claim
```rust
#[test]
fn donate_after_auto_claim_is_rejected() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claim Reject Test"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    // First donation hits the target and triggers auto-claim
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Verify campaign is Claimed
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);

    // Try to donate again - should fail because campaign is not Active
    let second_donor = Address::generate(&env);
    let result = client.try_donate(&second_donor, &campaign_id, &1_000_000, &false, &None);
    assert!(result.is_err(), "donation after auto-claim must be rejected");
    assert_eq!(result.unwrap_err().unwrap(), ContractError::CampaignNotActive);
}
```

### Test 3: AutoClaimedEvent Emission
```rust
#[test]
fn donate_auto_claim_emits_auto_claimed_event() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claimed Event Test"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Check for AutoClaimed event
    let auto_claimed_event = env
        .events()
        .all()
        .iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("autoclaimed"))
        })
        .expect("AutoClaimedEvent was not emitted");

    let payload = AutoClaimedEvent::try_from_val(&env, &auto_claimed_event.2)
        .expect("Failed to parse AutoClaimedEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.total_raised, 10_000_000);
    assert_eq!(payload.beneficiary, beneficiary);
}
```

### Test 4: Over-Target Auto-Claim
```rust
#[test]
fn donate_over_target_triggers_auto_claim() {
    // Same as Test 1 but with 15M donation for 10M target
    // Verifies entire 15M is distributed (not just 10M)
}
```

### Test 5: Multiple Beneficiaries
```rust
#[test]
fn auto_claim_with_multiple_beneficiaries() {
    // Tests 50/30/20 split across 3 beneficiaries
    // Verifies proportional distribution with rounding
    // First beneficiary takes remainder for exact balance
}
```

**Location:** [src/lib.rs](contracts/stellar-give/src/lib.rs) lines ~3828-3992

---

## Event Topics

### GoalReachedEvent (Existing)
```rust
env.events().publish(
    (goal_reached_topic(&env),),  // symbol: "goal_reached"
    GoalReachedEvent {
        campaign_id: u64,
        total_raised: i128,
    },
);
```

### AutoClaimedEvent (New)
```rust
env.events().publish(
    (symbol_short!("autoclaimed"),),
    AutoClaimedEvent {
        campaign_id: u64,
        total_raised: i128,
        beneficiary: Address,
    },
);
```

### DonationEvent (Unchanged)
```rust
env.events().publish(
    (symbol_short!("donation"), symbol_short!("received")),
    DonationEvent {
        campaign_id: u64,
        donor: Address,
        amount: i128,
        total_raised: i128,
        accepted_token: Address,
        comment: Option<String>,
    },
);
```

Note: After auto-claim, `total_raised` in DonationEvent is 0 (because `campaign.raised_amount` was cleared)

---

## Constants & Helpers

```rust
const FEE_BPS: i128 = 100;              // 100 = 1.00%
const FEE_DENOMINATOR: i128 = 10_000;  // basis point denominator

fn calculate_platform_fee(amount: i128) -> Result<i128, ContractError> {
    let scaled = amount.checked_mul(FEE_BPS)?;
    let biased = scaled.checked_add(FEE_DENOMINATOR / 2)?;
    Ok(biased / FEE_DENOMINATOR)
}
```

Fee calculation uses round-half-up (rounding bias ensures platform receives at least 1% when applicable).

---

## Gas Considerations

### Before Auto-Claim Feature
- Single donation: 1 transaction
- Manual claim: 1 additional transaction
- **Total:** 2 transactions for funded campaign

### After Auto-Claim Feature  
- Donation hitting target: 1 transaction (includes auto-claim)
- No separate claim needed
- **Total:** 1 transaction for funded campaign

**Savings:** 50% fewer transactions for auto-claimed campaigns
