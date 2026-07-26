//! Tests for `get_campaigns_paged` limit clamping, offset boundaries (#527)
//! and `get_campaigns` batch limit and missing-id Nones (#528).

mod helpers;

use helpers::{register_and_setup, set_timestamp, single_ben};
use soroban_sdk::{symbol_short, String, Vec};
use stellar_give::{CampaignStatus, ContractError};

// =============================================================================
// Issue #527 — get_campaigns_paged
// =============================================================================

use soroban_sdk::testutils::Address as _;

/// Helper: create N campaigns using multiple creators (max 10 per creator).
/// Mints tokens for each new creator to cover the creation fee.
fn create_n_campaigns(
    env: &soroban_sdk::Env,
    client: &stellar_give::StellarGiveContractClient<'static>,
    beneficiary: &soroban_sdk::Address,
    token_address: &soroban_sdk::Address,
    token_admin_client: &soroban_sdk::token::StellarAssetClient<'static>,
    n: u64,
) {
    let bens = single_ben(env, beneficiary);
    let mut current_creator = soroban_sdk::Address::generate(env);
    token_admin_client.mint(&current_creator, &1_000_000_000_000);

    for i in 0..n {
        if i > 0 && i % 10 == 0 {
            current_creator = soroban_sdk::Address::generate(env);
            token_admin_client.mint(&current_creator, &1_000_000_000_000);
        }
        let deadline = env.ledger().timestamp() + 10_000;
        client.create_campaign(
            &current_creator,
            &bens,
            &String::from_str(env, &format!("Campaign {}", i)),
            &String::from_str(env, "Description"),
            &String::from_str(env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000_i128,
            &deadline,
            token_address,
            &None,
        );
    }
}

#[test]
fn test_paged_limit_clamped_to_20() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 25);

    // Request limit=50, should be clamped to 20
    let page = client.get_campaigns_paged(&0, &50);
    assert_eq!(page.len(), 20, "limit should be clamped to 20");
}

#[test]
fn test_paged_offset_returns_correct_page() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 10);

    // offset=0, limit=5 → ids 1..=5
    let page = client.get_campaigns_paged(&0, &5);
    assert_eq!(page.len(), 5);
    for i in 0..page.len() {
        assert_eq!(page.get(i).unwrap().id, (i + 1) as u64);
    }

    // offset=5, limit=5 → ids 6..=10
    let page = client.get_campaigns_paged(&5, &5);
    assert_eq!(page.len(), 5);
    for i in 0..page.len() {
        assert_eq!(page.get(i).unwrap().id, (i + 6) as u64);
    }
}

#[test]
fn test_paged_offset_at_last_id_returns_one() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 5);

    // offset=4 (last id is 5, so start_id=5) → returns 1 campaign
    let page = client.get_campaigns_paged(&4, &10);
    assert_eq!(page.len(), 1);
    assert_eq!(page.get(0).unwrap().id, 5);
}

#[test]
fn test_paged_offset_beyond_last_id_returns_empty() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 5);

    // offset=100 is way past the last id (5) → empty vec, no panic
    let page = client.get_campaigns_paged(&100, &10);
    assert_eq!(page.len(), 0);
}

#[test]
fn test_paged_empty_ledger_returns_empty() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    // No campaigns created — next_id == 1
    let page = client.get_campaigns_paged(&0, &10);
    assert_eq!(page.len(), 0);
}

#[test]
fn test_paged_returns_derived_status() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 3);

    // Advance past all deadlines
    set_timestamp(&env, 50_000);

    let page = client.get_campaigns_paged(&0, &10);
    assert_eq!(page.len(), 3);
    for i in 0..page.len() {
        assert_eq!(page.get(i).unwrap().status, CampaignStatus::Expired);
    }
}

#[test]
fn test_paged_ordering_is_ascending_by_id() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 10);

    let page = client.get_campaigns_paged(&0, &10);
    let len = page.len();
    for i in 0..len - 1 {
        assert!(page.get(i).unwrap().id < page.get(i + 1).unwrap().id, "ids must be ascending");
    }
}

// =============================================================================
// Issue #528 — get_campaigns batch limit and missing-id Nones
// =============================================================================

#[test]
fn test_get_campaigns_51_ids_returns_limit_exceeded() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let mut ids = Vec::new(&env);
    for i in 1..=51 {
        ids.push_back(i);
    }

    let result = client.try_get_campaigns(&ids);
    assert_eq!(result, Err(Ok(ContractError::LimitExceeded)));
}

#[test]
fn test_get_campaigns_50_ids_succeeds() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 50);

    let mut ids = Vec::new(&env);
    for i in 1..=50 {
        ids.push_back(i);
    }

    let result = client.get_campaigns(&ids);
    assert_eq!(result.len(), 50);
    for i in 0..result.len() {
        assert!(result.get(i).unwrap().is_some(), "all 50 campaigns should exist");
    }
}

#[test]
fn test_get_campaigns_missing_ids_return_none() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    // Create only 3 campaigns (ids 1, 2, 3)
    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 3);

    // Request ids including non-existent ones
    let mut ids = Vec::new(&env);
    ids.push_back(1_u64);
    ids.push_back(99_u64); // does not exist
    ids.push_back(2_u64);
    ids.push_back(100_u64); // does not exist
    ids.push_back(3_u64);

    let result = client.get_campaigns(&ids);
    assert_eq!(result.len(), 5);

    assert!(result.get(0).unwrap().is_some(), "id 1 should exist");
    assert!(result.get(1).unwrap().is_none(), "id 99 should be None");
    assert!(result.get(2).unwrap().is_some(), "id 2 should exist");
    assert!(result.get(3).unwrap().is_none(), "id 100 should be None");
    assert!(result.get(4).unwrap().is_some(), "id 3 should exist");
}

#[test]
fn test_get_campaigns_preserves_order_with_nones() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 2);

    let mut ids = Vec::new(&env);
    ids.push_back(50_u64); // missing
    ids.push_back(1_u64);  // exists
    ids.push_back(99_u64); // missing

    let result = client.get_campaigns(&ids);
    assert_eq!(result.len(), 3);
    assert!(result.get(0).unwrap().is_none());
    assert!(result.get(1).unwrap().is_some());
    assert_eq!(result.get(1).unwrap().unwrap().id, 1);
    assert!(result.get(2).unwrap().is_none());
}

#[test]
fn test_get_campaigns_derives_status_for_present_ids() {
    let (env, client, _creator, beneficiary, _donor, _admin, token_client, token_admin_client) = register_and_setup();
    set_timestamp(&env, 1_000);

    create_n_campaigns(&env, &client, &beneficiary, &token_client.address, &token_admin_client, 3);

    // Advance past deadlines
    set_timestamp(&env, 50_000);

    let mut ids = Vec::new(&env);
    ids.push_back(1_u64);
    ids.push_back(2_u64);
    ids.push_back(3_u64);

    let result = client.get_campaigns(&ids);
    for i in 0..result.len() {
        let campaign = result.get(i).unwrap().unwrap();
        assert_eq!(campaign.status, CampaignStatus::Expired);
    }
}

#[test]
fn test_get_campaigns_empty_ids_returns_empty() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let ids = Vec::new(&env);
    let result = client.get_campaigns(&ids);
    assert_eq!(result.len(), 0);
}
