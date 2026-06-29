//! Integration tests for campaign expiration, time-based state transitions,
//! reentrancy/security coverage, and admin/auth negative cases.

use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{symbol_short, IntoVal, String};

mod helpers;
use helpers::{
    create_default_campaign, register_and_setup, register_and_setup_without_auth_mock,
    set_timestamp, single_ben,
};
use stellar_give::CampaignStatus;
use stellar_give::ContractError;

/// Donating after the deadline must fail with `CampaignNotActive`.
#[test]
fn test_donate_after_deadline() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let deadline = 1_100_u64; // 100 seconds in the future

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Short Relief"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &deadline,
        &token_client.address,
        &None,
    );

    // Advance time strictly past the deadline
    set_timestamp(&env, 1_101);

    let result = client.try_donate(&donor, &campaign_id, &1_000_000_i128, &false, &None);

    assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
}

/// Donating *exactly* at the deadline timestamp should still succeed.
///
/// The contract uses `now > campaign.deadline` (strict greater-than) for
/// expiry detection, so `now == deadline` keeps the campaign active.
#[test]
fn test_donate_exactly_at_deadline() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let deadline = 1_100_u64;

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Edge Relief"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &deadline,
        &token_client.address,
        &None,
    );

    // Set time to exactly the deadline
    set_timestamp(&env, 1_100);

    // Should succeed — contract uses strict `>` check
    let result = client.try_donate(&donor, &campaign_id, &1_000_000_i128, &false, &None);

    assert!(
        result.is_ok(),
        "Donation at exactly the deadline should succeed"
    );

    // Verify campaign is still active (not expired) with raised amount updated
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.raised_amount, 1_000_000);
    assert_eq!(campaign.status, CampaignStatus::Active);
}

/// `get_campaign` should derive `Expired` status once the ledger time passes
/// the deadline, even if the stored status is still `Active`.
#[test]
fn test_status_transitions_from_active_to_expired() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let deadline = 1_100_u64;

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Expiry Check"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &deadline,
        &token_client.address,
        &None,
    );

    // Before deadline: should be Active
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Active);

    // Exactly at deadline: still Active (strict >)
    set_timestamp(&env, 1_100);
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Active);

    // One second past deadline: Expired
    set_timestamp(&env, 1_101);
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Expired);
}

// =============================================================================
// Issue #280 — Reentrancy / Security Coverage
// =============================================================================

#[test]
fn test_refund_reentrancy_lock_prevents_concurrent() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

    set_timestamp(&env, 3_000);

    env.as_contract(&client.address, || {
        env.storage().temporary().set(&symbol_short!("LOCK"), &true);
    });

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(result, Err(Ok(ContractError::ReentrancyDetected)));

    env.as_contract(&client.address, || {
        env.storage().temporary().remove(&symbol_short!("LOCK"));
    });

    let result = client.try_refund(&campaign_id, &donor);
    assert!(result.is_ok());
}

#[test]
fn test_refund_lock_released_after_success() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    set_timestamp(&env, 3_000);

    env.as_contract(&client.address, || {
        assert!(!env.storage().temporary().has(&symbol_short!("LOCK")));
    });

    client.refund(&campaign_id, &donor);

    env.as_contract(&client.address, || {
        assert!(!env.storage().temporary().has(&symbol_short!("LOCK")));
    });
}

#[test]
fn test_refund_lock_released_after_internal_failure() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    env.as_contract(&client.address, || {
        assert!(!env.storage().temporary().has(&symbol_short!("LOCK")));
    });

    // Fail: refund on active campaign that isn't expired
    let result = client.try_refund(&campaign_id, &donor);
    assert!(result.is_err());

    env.as_contract(&client.address, || {
        assert!(!env.storage().temporary().has(&symbol_short!("LOCK")));
    });
}

#[test]
fn test_cancel_campaign_requires_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    let attacker = Address::generate(&env);
    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "cancel_campaign",
                args: (campaign_id,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_cancel_campaign(&campaign_id);
    assert!(result.is_err(), "non-creator must be rejected by cancel");
}

#[test]
fn test_cancel_campaign_rejects_double_cancel() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    client.cancel_campaign(&campaign_id);
    let result = client.try_cancel_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
}

#[test]
fn test_cancel_campaign_rejects_after_expiry() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    set_timestamp(&env, 3_000);

    let result = client.try_cancel_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
}

#[test]
fn test_add_update_requires_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    let attacker = Address::generate(&env);
    let content = String::from_str(&env, "Valid update");
    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "add_update",
                args: (campaign_id, content.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_update(&campaign_id, &content);
    assert!(result.is_err(), "non-creator must be rejected by add_update");
}

#[test]
fn test_add_update_rejects_empty_content() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    let result = client.try_add_update(&campaign_id, &String::from_str(&env, ""));
    assert_eq!(result, Err(Ok(ContractError::InvalidUpdateContent)));
}

#[test]
fn test_add_update_rejects_too_many_updates() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    for i in 0..10 {
        let content = String::from_str(&env, &format!("Update {}", i));
        client.add_update(&campaign_id, &content);
    }

    let result = client.try_add_update(&campaign_id, &String::from_str(&env, "Too many"));
    assert_eq!(result, Err(Ok(ContractError::TooManyUpdates)));
}

#[test]
fn test_add_update_paused_fails() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    client.pause();

    let result = client.try_add_update(&campaign_id, &String::from_str(&env, "Update while paused"));
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_requires_admin_auth() {
    let (env, client, _creator, _beneficiary, donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let result = client
        .mock_auths(&[MockAuth {
            address: &donor,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "pause",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_pause();
    assert!(result.is_err(), "non-admin must be rejected by pause");
}

#[test]
fn test_unpause_requires_admin_auth() {
    let (env, client, _creator, _beneficiary, donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    client.mock_all_auths().pause();

    let result = client
        .mock_auths(&[MockAuth {
            address: &donor,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "unpause",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_unpause();
    assert!(result.is_err(), "non-admin must be rejected by unpause");
}

#[test]
fn test_pause_blocks_create_campaign() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    client.pause();

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Blocked Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_cancel() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);

    client.pause();

    let result = client.try_cancel_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_refund() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_default_campaign(&env, &client, &creator, &beneficiary, &token_client.address, 2_000);
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    set_timestamp(&env, 3_000);

    client.pause();

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

