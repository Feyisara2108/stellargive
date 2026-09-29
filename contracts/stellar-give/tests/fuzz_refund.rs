//! Property-based / fuzz tests for refund accounting invariants (#899).
//!
//! Uses `proptest` to generate randomized donation+refund sequences and
//! verify three core invariants:
//!
//! 1. **Balance conservation**: total refunded never exceeds total donated
//!    per donor, and the contract's `raised_amount` stays consistent.
//! 2. **Per-donor cap**: a donor can never refund more than they personally
//!    donated (the contract returns exactly the recorded contribution).
//! 3. **Double-refund protection**: a second refund on the same campaign by
//!    the same donor reverts with `NothingToClaim` rather than succeeding
//!    or double-paying.

use proptest::prelude::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token, Address, Env, String};
use stellar_give::{ContractError, StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{set_timestamp, single_ben};

/// Minimum donation accepted by the contract (0.1 token with 7 decimals).
const MIN_DONATION: i128 = 1_000_000;

/// Sets up a fresh environment with an expired campaign suitable for refund
/// testing. The campaign has a target high enough that donations won't trigger
/// auto-claim, and the deadline is set so that advancing time past it allows
/// refunds.
fn setup_refund_campaign(
    target_amount: i128,
    deadline: u64,
) -> (
    Env,
    StellarGiveContractClient<'static>,
    Address, // creator
    Address, // donor
    u64,     // campaign_id
    token::Client<'static>,
    token::StellarAssetClient<'static>,
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

    // Mint generous balance for the donor.
    token_admin_client.mint(&donor, &(i128::MAX / 4));
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Refund Fuzz Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/fuzz"),
        &symbol_short!("relief"),
        &target_amount,
        &deadline,
        &token_client.address,
        &None,
    );

    (
        env,
        client,
        creator,
        donor,
        campaign_id,
        token_client,
        token_admin_client,
    )
}

proptest! {
    /// Invariant: after donate then refund, the donor gets back exactly what
    /// they donated, and the campaign's raised_amount returns to zero.
    #[test]
    fn fuzz_single_donate_refund_conservation(
        donation_amount in MIN_DONATION..=500_000_000_i128,
    ) {
        let target = i128::MAX / 2; // high target — won't auto-claim
        let deadline = 2_000_u64;
        let (env, client, _creator, donor, campaign_id, token_client, _) =
            setup_refund_campaign(target, deadline);

        let balance_before = token_client.balance(&donor);
        client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

        let campaign_after_donate = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign_after_donate.raised_amount,
            donation_amount,
            "raised_amount must equal the single donation"
        );

        // Advance past deadline to make campaign Expired
        set_timestamp(&env, 3_000);

        client.refund(&campaign_id, &donor);

        let balance_after = token_client.balance(&donor);
        prop_assert_eq!(
            balance_after, balance_before,
            "donor balance must be fully restored after refund"
        );

        let campaign_after_refund = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign_after_refund.raised_amount,
            0,
            "raised_amount must be zero after full refund"
        );
    }

    /// Invariant: with multiple donations from the same donor, the refund
    /// returns the cumulative total exactly once.
    #[test]
    fn fuzz_multi_donate_single_refund_conservation(
        d1 in MIN_DONATION..=100_000_000_i128,
        d2 in MIN_DONATION..=100_000_000_i128,
    ) {
        let target = i128::MAX / 2;
        let deadline = 2_000_u64;
        let (env, client, _creator, donor, campaign_id, token_client, _) =
            setup_refund_campaign(target, deadline);

        let balance_before = token_client.balance(&donor);
        client.donate(&donor, &campaign_id, &d1, &false, &None);
        client.donate(&donor, &campaign_id, &d2, &false, &None);

        let expected_raised = d1 + d2;
        let campaign = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign.raised_amount,
            expected_raised,
            "raised_amount must equal sum of all donations"
        );

        // Expire the campaign
        set_timestamp(&env, 3_000);

        client.refund(&campaign_id, &donor);

        let balance_after = token_client.balance(&donor);
        prop_assert_eq!(
            balance_after, balance_before,
            "donor balance must be fully restored after cumulative refund"
        );

        let campaign_after = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign_after.raised_amount,
            0,
            "raised_amount must be zero after full refund"
        );
    }

    /// Invariant: a second refund attempt by the same donor on the same
    /// campaign must revert with `NothingToClaim` (double-refund protection).
    #[test]
    fn fuzz_double_refund_reverts(
        donation_amount in MIN_DONATION..=500_000_000_i128,
    ) {
        let target = i128::MAX / 2;
        let deadline = 2_000_u64;
        let (env, client, _creator, donor, campaign_id, token_client, _) =
            setup_refund_campaign(target, deadline);

        let balance_before = token_client.balance(&donor);
        client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

        // Expire the campaign
        set_timestamp(&env, 3_000);

        // First refund succeeds
        let first_result = client.try_refund(&campaign_id, &donor);
        prop_assert!(first_result.is_ok(), "first refund must succeed");

        let balance_after_first = token_client.balance(&donor);
        prop_assert_eq!(
            balance_after_first, balance_before,
            "first refund must restore full balance"
        );

        // Second refund must fail — contribution is zeroed
        let second_result = client.try_refund(&campaign_id, &donor);
        prop_assert_eq!(
            second_result,
            Err(Ok(ContractError::NothingToClaim)),
            "second refund must revert with NothingToClaim"
        );

        // Balance must not change after failed second refund
        let balance_after_second = token_client.balance(&donor);
        prop_assert_eq!(
            balance_after_second, balance_before,
            "balance must not change after failed second refund"
        );
    }

    /// Invariant: with two independent donors, each gets back exactly their
    /// own contribution and neither can claim the other's funds.
    #[test]
    fn fuzz_two_donors_independent_refunds(
        d1 in MIN_DONATION..=100_000_000_i128,
        d2 in MIN_DONATION..=100_000_000_i128,
    ) {
        let target = i128::MAX / 2;
        let deadline = 2_000_u64;
        let (env, client, _creator, donor1, campaign_id, token_client, token_admin_client) =
            setup_refund_campaign(target, deadline);

        let donor2 = Address::generate(&env);
        token_admin_client.mint(&donor2, &(i128::MAX / 4));

        let bal1_before = token_client.balance(&donor1);
        let bal2_before = token_client.balance(&donor2);

        client.donate(&donor1, &campaign_id, &d1, &false, &None);
        client.donate(&donor2, &campaign_id, &d2, &false, &None);

        let campaign = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign.raised_amount,
            d1 + d2,
            "raised_amount must equal the sum of both donations"
        );

        // Expire the campaign
        set_timestamp(&env, 3_000);

        // Donor1 refunds
        client.refund(&campaign_id, &donor1);
        let bal1_after = token_client.balance(&donor1);
        prop_assert_eq!(
            bal1_after, bal1_before,
            "donor1 must receive back exactly their donation"
        );

        // Donor2 refunds
        client.refund(&campaign_id, &donor2);
        let bal2_after = token_client.balance(&donor2);
        prop_assert_eq!(
            bal2_after, bal2_before,
            "donor2 must receive back exactly their donation"
        );

        // Campaign raised_amount must be zero
        let campaign_after = client.get_campaign(&campaign_id);
        prop_assert_eq!(
            campaign_after.raised_amount,
            0,
            "raised_amount must be zero after all refunds"
        );
    }

    /// Invariant: a donor who never donated cannot refund at all.
    #[test]
    fn fuzz_non_donor_cannot_refund(
        donation_amount in MIN_DONATION..=500_000_000_i128,
    ) {
        let target = i128::MAX / 2;
        let deadline = 2_000_u64;
        let (env, client, _creator, donor, campaign_id, _token_client, _) =
            setup_refund_campaign(target, deadline);

        let non_donor = Address::generate(&env);

        client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

        // Expire the campaign
        set_timestamp(&env, 3_000);

        // Non-donor tries to refund — must fail
        let result = client.try_refund(&campaign_id, &non_donor);
        prop_assert_eq!(
            result,
            Err(Ok(ContractError::NothingToClaim)),
            "non-donor refund must revert with NothingToClaim"
        );
    }
}
