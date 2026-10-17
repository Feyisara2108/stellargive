#![cfg(test)]

//! Property-based coverage for the auto-claim path in `donate`.
//!
//! `fuzz_claim` deliberately keeps totals below the target to exercise the
//! after-deadline claim path. Here the donations *cross* the target, so the
//! contract distributes funds inside `donate` and emits `autoclaimed`.

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, String, Symbol, TryFromVal};
use stellar_give::{AutoClaimedEvent, ContractError, StellarGiveContractClient};

mod helpers;
use helpers::{get_events, register_and_setup_without_auth_mock, set_timestamp, single_ben};

const MIN_DONATION: i128 = 1_000_000;

fn calculate_platform_fee(amount: i128) -> i128 {
    let fee_bps: i128 = 100;
    let fee_denominator: i128 = 10000;
    let scaled = amount.checked_mul(fee_bps).unwrap();
    let biased = scaled.checked_add(fee_denominator / 2).unwrap();
    biased / fee_denominator
}

fn donate_from_new_donor(
    env: &Env,
    client: &StellarGiveContractClient<'_>,
    token_admin_client: &token::StellarAssetClient<'_>,
    campaign_id: u64,
    amount: i128,
) {
    let donor = Address::generate(env);
    token_admin_client.mock_all_auths().mint(&donor, &amount);
    client
        .mock_all_auths()
        .donate(&donor, &campaign_id, &amount, &false, &None);
}

proptest! {
    #[test]
    fn test_fuzz_auto_claim_on_crossing_donation(
        target_amount in 10_000_000i128..1_000_000_000i128,
        pre_donations in prop::collection::vec(MIN_DONATION..1_000_000_000i128, 0..10),
        overshoot in 0i128..1_000_000_000i128,
    ) {
        let (
            env,
            client,
            creator,
            beneficiary,
            _donor,
            platform_admin,
            token_client,
            token_admin_client,
        ) = register_and_setup_without_auth_mock();

        set_timestamp(&env, 1000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.mock_all_auths().create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &String::from_str(&env, "https://example.com/meta"),
            &soroban_sdk::symbol_short!("relief"),
            &target_amount,
            &2000,
            &token_client.address,
            &None,
        );

        let pre_platform_balance = token_client.balance(&platform_admin);
        let pre_ben_balance = token_client.balance(&beneficiary);

        // Donate until just below the target; any pre-donation that would reach it
        // is skipped so the final donation below is the one that crosses the goal.
        let mut total_donated: i128 = 0;
        for amount in pre_donations {
            if total_donated + amount >= target_amount {
                continue;
            }
            donate_from_new_donor(&env, &client, &token_admin_client, campaign_id, amount);
            total_donated += amount;
        }

        // Crossing donation: covers the remaining deficit plus a random overshoot.
        let crossing = (target_amount - total_donated).max(MIN_DONATION) + overshoot;
        let crossing_donor = Address::generate(&env);
        token_admin_client.mock_all_auths().mint(&crossing_donor, &crossing);
        client
            .mock_all_auths()
            .donate(&crossing_donor, &campaign_id, &crossing, &false, &None);
        total_donated += crossing;
        prop_assert!(total_donated >= target_amount);

        // Events from the crossing donation must be read before any further contract call.
        let autoclaim_event = get_events(&env)
            .into_iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(Symbol::new(&env, "autoclaimed"))
            });
        prop_assert!(autoclaim_event.is_some(), "autoclaimed event was not emitted");
        let payload = AutoClaimedEvent::try_from_val(&env, &autoclaim_event.unwrap().2).unwrap();
        prop_assert_eq!(payload.campaign_id, campaign_id);
        prop_assert_eq!(payload.total_raised, total_donated);
        prop_assert_eq!(payload.beneficiary, beneficiary.clone());

        // Value conservation: beneficiary + platform fee == total, nothing left in escrow.
        let expected_fee = calculate_platform_fee(total_donated);
        let expected_net = total_donated - expected_fee;
        let platform_delta = token_client.balance(&platform_admin) - pre_platform_balance;
        let ben_delta = token_client.balance(&beneficiary) - pre_ben_balance;

        prop_assert_eq!(platform_delta, expected_fee);
        prop_assert_eq!(ben_delta, expected_net);
        prop_assert_eq!(platform_delta + ben_delta, total_donated);
        prop_assert_eq!(token_client.balance(&client.address), 0);

        // The funds are already paid out, so a later claim must be rejected.
        let res = client
            .mock_all_auths()
            .try_claim_funds(&beneficiary, &campaign_id);
        prop_assert_eq!(res.unwrap_err().unwrap(), ContractError::AlreadyClaimed);
    }
}
