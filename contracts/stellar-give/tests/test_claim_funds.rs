//! `claim_funds` payouts, beneficiary splits and the platform fee (#1152).
//!
//! Moved out of the inline `#[cfg(test)]` module in `src/lib.rs`. Stroop-exact
//! split arithmetic lives in `test_claim_accuracy.rs`; this file covers the
//! basic payout paths and authorization.

mod helpers;

use helpers::{expected_platform_fee, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, token, Address, Env, String, Vec};
use stellar_give::{CampaignStatus, ContractError, StellarGiveContract, StellarGiveContractClient};

// ── payout paths ──────────────────────────────────────────────────────────

#[test]
fn claim_when_target_met_transfers_to_beneficiary() {
    let (env, client, creator, beneficiary, donor, admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 10_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "School Rebuild"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &12_000_000,
        &20_000,
        &token_client.address,
        &None,
    );

    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Meeting the target auto-claims, distributing funds within donate().
    client.donate(&donor, &campaign_id, &12_000_000, &false, &None);

    let ben_after = token_client.balance(&beneficiary);
    let admin_after = token_client.balance(&admin);
    let campaign = client.get_campaign(&campaign_id);

    assert_eq!(ben_after - ben_before, 11_880_000);
    assert_eq!(admin_after - admin_before, 120_000);
    assert_eq!(campaign.status, CampaignStatus::Claimed);
    assert_eq!(campaign.raised_amount, 0);
}

#[test]
fn claim_after_deadline_when_target_not_met() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 100);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Emergency Shelter"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &50_000_000,
        &500,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    set_timestamp(&env, 600);

    let claimed = client.claim_funds(&beneficiary, &campaign_id);
    let campaign = client.get_campaign(&campaign_id);

    assert_eq!(claimed, 5_000_000);
    assert_eq!(campaign.status, CampaignStatus::Claimed);
}

#[test]
fn unauthorized_claim_fails() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 200);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Food Support"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &1_000,
        &token_client.address,
        &None,
    );
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);
    set_timestamp(&env, 1_100);

    let attacker = Address::generate(&env);
    let result = client.try_claim_funds(&attacker, &campaign_id);
    assert!(result.is_err());
}

// ── multi-beneficiary splits ──────────────────────────────────────────────

#[test]
fn split_50_50_distributes_evenly() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    let beneficiary2 = Address::generate(&env);
    set_timestamp(&env, 1_000);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 5_000_u32));
    bens.push_back((beneficiary2.clone(), 5_000_u32));

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Dual Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &20_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let b1_before = token_client.balance(&beneficiary);
    let b2_before = token_client.balance(&beneficiary2);

    // Meeting the target auto-claims and splits funds within donate().
    client.donate(&donor, &campaign_id, &20_000_000, &false, &None);

    let b1_after = token_client.balance(&beneficiary);
    let b2_after = token_client.balance(&beneficiary2);

    assert_eq!(b2_after - b2_before, 9_900_000);
    assert_eq!(b1_after - b1_before, 9_900_000);
    assert_eq!((b1_after - b1_before) + (b2_after - b2_before), 19_800_000);
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );
}

#[test]
fn split_uneven_three_way_with_rounding() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    let beneficiary2 = Address::generate(&env);
    let beneficiary3 = Address::generate(&env);
    set_timestamp(&env, 1_000);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 3_334_u32));
    bens.push_back((beneficiary2.clone(), 3_333_u32));
    bens.push_back((beneficiary3.clone(), 3_333_u32));

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Three Way"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let b1_before = token_client.balance(&beneficiary);
    let b2_before = token_client.balance(&beneficiary2);
    let b3_before = token_client.balance(&beneficiary3);

    // Meeting the target auto-claims and splits funds within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let b1_after = token_client.balance(&beneficiary);
    let b2_after = token_client.balance(&beneficiary2);
    let b3_after = token_client.balance(&beneficiary3);

    let b2_delta = b2_after - b2_before;
    let b3_delta = b3_after - b3_before;
    let b1_delta = b1_after - b1_before;
    assert_eq!(b2_delta, 3_299_670);
    assert_eq!(b3_delta, 3_299_670);
    assert_eq!(b1_delta, 3_300_660);
    assert_eq!(b1_delta + b2_delta + b3_delta, 9_900_000);
}

// ── platform fee ──────────────────────────────────────────────────────────

#[test]
fn claim_funds_fee_deducted_from_beneficiary_payout() {
    let (env, client, creator, beneficiary, donor, admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 10_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Fee Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &20_000,
        &token_client.address,
        &None,
    );
    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Meeting the target auto-claims, deducting the fee within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    assert_eq!(token_client.balance(&admin) - admin_before, 100_000);
    assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
}

#[test]
fn claim_funds_fee_plus_net_equals_gross() {
    let (env, client, creator, beneficiary, donor, admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 10_000);

    let gross: i128 = 33_333_300;
    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Property"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &gross,
        &20_000,
        &token_client.address,
        &None,
    );
    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Meeting the target auto-claims within donate().
    client.donate(&donor, &campaign_id, &gross, &false, &None);

    let fee_delta = token_client.balance(&admin) - admin_before;
    let net_delta = token_client.balance(&beneficiary) - ben_before;
    assert_eq!(fee_delta + net_delta, gross);
}

#[test]
fn claim_funds_fails_when_admin_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    set_timestamp(&env, 1_000);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let donor = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());
    token_admin_client.mint(&donor, &100_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Uninit"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );
    // Donate below target so auto-claim does not fire (a target-meeting
    // donation would itself fail here, since auto-claim reads the admin).
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    set_timestamp(&env, 6_000); // past the deadline so a manual claim is allowed

    let result = client.try_claim_funds(&creator, &campaign_id);
    assert!(
        result.is_err(),
        "claim must fail when platform admin is not initialized"
    );
}
