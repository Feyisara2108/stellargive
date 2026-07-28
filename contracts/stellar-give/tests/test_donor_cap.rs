//! Donor-cap edge case coverage for `donate` (#523).
//!
//! `max_per_donor` enforces a per-donor cumulative cap by summing prior
//! contributions (`read_donor_contribution`) and rejecting any donation that
//! would push the cumulative total past the cap. These tests exercise the
//! exact-cap boundary, the cap+1 boundary, cumulative rejection across two
//! individually valid donations, and the unbounded (`max_per_donor: None`)
//! case.

use soroban_sdk::{symbol_short, Env, String};
use stellar_give::{ContractError, StellarGiveContractClient};

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};

const CAP: i128 = 5_000_000_i128;

fn create_capped_campaign(
    env: &Env,
    client: &StellarGiveContractClient<'static>,
    creator: &soroban_sdk::Address,
    beneficiary: &soroban_sdk::Address,
    token_address: &soroban_sdk::Address,
) -> u64 {
    let bens = single_ben(env, beneficiary);
    client.create_campaign(
        creator,
        &bens,
        &String::from_str(env, "Donor Cap Campaign"),
        &String::from_str(env, "A test campaign description."),
        &String::from_str(env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &50_000_000_i128, // target far above CAP so donations stay Active
        &2_000_u64,
        token_address,
        &Some(CAP),
    )
}

#[test]
fn test_donation_reaching_exact_cap_succeeds() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let campaign_id =
        create_capped_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    client.donate(&donor, &campaign_id, &4_000_000, &false, &None);
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None); // cumulative == CAP exactly

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(
        campaign.raised_amount, CAP,
        "cumulative total landing exactly on the cap must be accepted"
    );
}

#[test]
fn test_donation_one_stroop_over_cap_rejected() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let campaign_id =
        create_capped_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    client.donate(&donor, &campaign_id, &4_000_001, &false, &None);
    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);

    assert_eq!(
        result,
        Err(Ok(ContractError::ExceedsDonorCap)),
        "cumulative total landing one stroop over the cap must be rejected"
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(
        campaign.raised_amount, 4_000_001,
        "the rejected donation must not affect raised_amount"
    );
}

#[test]
fn test_two_individually_valid_donations_cumulatively_exceed_cap() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let campaign_id =
        create_capped_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    // Both donations are individually well under CAP, but their sum
    // (6_000_000) is not.
    client.donate(&donor, &campaign_id, &3_000_000, &false, &None);
    let result = client.try_donate(&donor, &campaign_id, &3_000_000, &false, &None);

    assert_eq!(
        result,
        Err(Ok(ContractError::ExceedsDonorCap)),
        "second donation must be rejected once the cumulative total would exceed the cap"
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(
        campaign.raised_amount, 3_000_000,
        "only the first, accepted donation should be reflected in raised_amount"
    );
}

#[test]
fn test_no_cap_accepts_arbitrarily_large_donation() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let huge_amount = i128::MAX / 4;
    token_admin_client.mint(&donor, &huge_amount);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "No Cap Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &(i128::MAX / 2),
        &2_000_u64,
        &token_client.address,
        &None, // no donor cap
    );

    client.donate(&donor, &campaign_id, &huge_amount, &false, &None);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(
        campaign.raised_amount, huge_amount,
        "campaigns without max_per_donor must accept arbitrarily large donations"
    );
}
