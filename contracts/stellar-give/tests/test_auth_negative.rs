//! Negative auth tests: each entry point must reject invocation from
//! an unauthorized address.

use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{symbol_short, Address, BytesN, IntoVal, String, Vec};

mod helpers;
use helpers::{create_default_campaign, register_and_setup_without_auth_mock, set_timestamp};

// =============================================================================
// cancel_campaign — creator auth required
// =============================================================================

#[test]
fn test_cancel_campaign_requires_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

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

// =============================================================================
// add_update — creator auth required
// =============================================================================

#[test]
fn test_add_update_requires_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

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
    assert!(
        result.is_err(),
        "non-creator must be rejected by add_update"
    );
}

// =============================================================================
// add_to_whitelist — creator auth required
// =============================================================================

#[test]
fn test_add_to_whitelist_requires_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    let attacker = Address::generate(&env);
    let mut addrs = Vec::new(&env);
    addrs.push_back(attacker.clone());

    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "add_to_whitelist",
                args: (campaign_id, addrs.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_to_whitelist(&campaign_id, &addrs);
    assert!(result.is_err(), "non-creator must be rejected by whitelist");
}

// =============================================================================
// pause — admin auth required
// =============================================================================

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

// =============================================================================
// unpause — admin auth required
// =============================================================================

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

// =============================================================================
// set_owner — owner auth required (owner is platform_admin)
// =============================================================================

#[test]
fn test_set_owner_rejects_non_owner() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let attacker = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "set_owner",
                args: (new_owner.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_owner(&new_owner);
    assert!(result.is_err());
}

// =============================================================================
// upgrade — owner auth required (owner is platform_admin)
// =============================================================================

#[test]
fn test_upgrade_rejects_non_owner() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let attacker = Address::generate(&env);
    let hash = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&hash);
    assert!(result.is_err());
}

// #1149 — assert Unauthorized and AlreadyInitialized errors explicitly

#[test]
fn test_unauthorized_error_asserted() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

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

    assert_eq!(result, Err(Ok(stellar_give::ContractError::Unauthorized)));
}

#[test]
fn test_already_initialized_error_asserted() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();

    // Initialize once
    client.mock_all_auths().initialize(&creator);

    // Initialize again should fail
    let result = client.try_initialize(&creator);
    assert_eq!(
        result,
        Err(Ok(stellar_give::ContractError::AlreadyInitialized))
    );
}
