//! Property tests for the platform fee round-half-up invariant (#520).
//!
//! `calculate_platform_fee` in `src/lib.rs` computes
//! `(amount * FEE_BPS + FEE_DENOMINATOR / 2) / FEE_DENOMINATOR`. It is a
//! private helper, so these tests exercise it through the public contract
//! API: fund a campaign with an amount kept below target so the donation
//! stays `Active`, advance past the deadline, and observe the fee the
//! platform admin receives when `claim_funds` runs `distribute_funds`.

use proptest::prelude::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token, Address, Env, String};
use stellar_give::{ContractError, StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{set_timestamp, single_ben};

/// Mirrors the private `FEE_BPS` constant in `src/lib.rs`.
const FEE_BPS: i128 = 100;
/// Mirrors the private `FEE_DENOMINATOR` constant in `src/lib.rs`.
const FEE_DENOMINATOR: i128 = 10_000;
/// Mirrors the private `MIN_TARGET` constant in `src/lib.rs`.
const MIN_TARGET: i128 = 10_000_000;

fn round_half_up_fee(amount: i128) -> i128 {
    (amount * FEE_BPS + FEE_DENOMINATOR / 2) / FEE_DENOMINATOR
}

/// Funds a fresh campaign with exactly `amount`, keeping the campaign
/// `Active` (target is `amount + 1`) so settlement only happens through an
/// explicit `claim_funds` call after the deadline, directly exercising
/// `distribute_funds` -> `calculate_platform_fee`.
fn setup_and_fund(
    amount: i128,
) -> (
    Env,
    StellarGiveContractClient<'static>,
    Address, // beneficiary
    Address, // platform admin
    u64,     // campaign_id
    token::Client<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let donor = Address::generate(&env);
    let platform_admin = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

    token_admin_client.mint(&donor, &amount);
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target = amount.checked_add(1).unwrap_or(amount);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Fee Fuzz Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/fee-fuzz"),
        &symbol_short!("relief"),
        &target,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &amount, &false, &None);

    (
        env,
        client,
        beneficiary,
        platform_admin,
        campaign_id,
        token_client,
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    /// Core invariant: `0 <= fee <= amount` and `fee` matches the
    /// round-half-up formula, for every amount across the domain
    /// `[MIN_TARGET, i128::MAX / FEE_BPS]` (the largest amount that cannot
    /// overflow `amount.checked_mul(FEE_BPS)`).
    #[test]
    fn fee_matches_round_half_up_and_never_exceeds_amount(
        amount in MIN_TARGET..=(i128::MAX / FEE_BPS),
    ) {
        let (env, client, beneficiary, admin, campaign_id, token_client) = setup_and_fund(amount);
        set_timestamp(&env, 2_001);

        let admin_before = token_client.balance(&admin);
        let beneficiary_before = token_client.balance(&beneficiary);

        client.claim_funds(&beneficiary, &campaign_id);

        let fee = token_client.balance(&admin) - admin_before;
        let payout = token_client.balance(&beneficiary) - beneficiary_before;
        let expected_fee = round_half_up_fee(amount);

        prop_assert!(fee >= 0, "fee must be non-negative, got {}", fee);
        prop_assert!(fee <= amount, "fee {} exceeds amount {}", fee, amount);
        prop_assert_eq!(fee, expected_fee, "fee must match the round-half-up formula");
        prop_assert_eq!(fee + payout, amount, "fee + payout must equal amount exactly");
    }
}

/// Explicit boundary cases where the `+ FEE_DENOMINATOR / 2` bias flips the
/// floor-division result: amounts whose `amount * FEE_BPS` remainder against
/// `FEE_DENOMINATOR` is exactly half (5000), i.e. `amount % 100 == 50`.
#[test]
fn fee_half_up_boundary_flips_result() {
    let boundary_amounts = [
        10_000_050_i128, // smallest boundary case at/above MIN_TARGET
        10_000_150_i128,
        123_456_750_i128,
        999_999_950_i128,
    ];

    for &amount in boundary_amounts.iter() {
        assert_eq!(
            (amount * FEE_BPS) % FEE_DENOMINATOR,
            FEE_DENOMINATOR / 2,
            "fixture {} does not sit on the half-up boundary",
            amount
        );

        let without_bias = (amount * FEE_BPS) / FEE_DENOMINATOR;
        let expected_fee = round_half_up_fee(amount);
        assert_eq!(
            expected_fee,
            without_bias + 1,
            "bias must flip the floor result up by exactly one stroop at the boundary"
        );

        let (env, client, beneficiary, admin, campaign_id, token_client) = setup_and_fund(amount);
        set_timestamp(&env, 2_001);

        let admin_before = token_client.balance(&admin);
        let beneficiary_before = token_client.balance(&beneficiary);

        client.claim_funds(&beneficiary, &campaign_id);

        let fee = token_client.balance(&admin) - admin_before;
        let payout = token_client.balance(&beneficiary) - beneficiary_before;

        assert_eq!(
            fee, expected_fee,
            "on-chain fee must match the biased half-up formula for amount {}",
            amount
        );
        assert_eq!(fee + payout, amount, "no stroop lost across fee + payout");
    }
}

/// The `checked_mul` overflow guard: amounts just above `i128::MAX / FEE_BPS`
/// overflow `amount * FEE_BPS` inside `calculate_platform_fee` and must
/// surface as `InvalidAmount`, not panic.
#[test]
fn fee_overflow_path_returns_invalid_amount() {
    let amount = (i128::MAX / FEE_BPS) + 1_000;

    let (env, client, beneficiary, _admin, campaign_id, _token_client) = setup_and_fund(amount);
    set_timestamp(&env, 2_001);

    let result = client.try_claim_funds(&beneficiary, &campaign_id);

    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidAmount)),
        "fee overflow must be caught by checked_mul and surfaced as InvalidAmount"
    );
}
