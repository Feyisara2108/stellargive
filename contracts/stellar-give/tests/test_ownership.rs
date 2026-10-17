//! Admin and ownership: `initialize`, `get_owner`, `set_owner` and `upgrade`.
//!
//! Consolidated from the inline `admin_auth_tests` module in `src/lib.rs`
//! (#1152). The three thinner tests this file used to hold —
//! `test_get_owner_returns_correct_address`, `test_set_owner_success` and
//! `test_set_owner_reverts_non_owner` — are each subsumed by a case below and
//! were dropped rather than duplicated.

use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{symbol_short, Address, BytesN, Env, IntoVal, String, Symbol, TryFromVal};
use stellar_give::{ContractError, StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{get_events, register_and_setup, register_and_setup_without_auth_mock};

/// A 32-byte zero WASM hash: `upgrade` must reject the caller before it ever
/// looks at the hash, so the value itself does not matter.
fn zero_hash(env: &Env) -> BytesN<32> {
    BytesN::<32>::from_array(env, &[0u8; 32])
}

/// Build a `MockAuth` for a single contract function call.
macro_rules! mock_auth {
    ($addr:expr, $client:expr, $fn:expr, $args:expr) => {
        MockAuth {
            address: $addr,
            invoke: &MockAuthInvoke {
                contract: &$client.address,
                fn_name: $fn,
                args: $args,
                sub_invokes: &[],
            },
        }
    };
}

// ── initialize ────────────────────────────────────────────────────────────

#[test]
fn initialize_rejects_second_call() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    let other_admin = Address::generate(&env);
    let result = client.try_initialize(&other_admin);
    assert!(
        result.is_err(),
        "initialize must reject a second call once admin is set"
    );
}

// ── get_owner ─────────────────────────────────────────────────────────────

#[test]
fn get_owner_returns_admin_set_by_initialize() {
    let (_, client, _, _, _, admin, _, _) = register_and_setup();
    assert_eq!(client.get_owner(), admin);
}

#[test]
fn get_owner_fails_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &id);
    assert_eq!(
        client.try_get_owner(),
        Err(Ok(ContractError::NotInitialized))
    );
}

// ── upgrade ───────────────────────────────────────────────────────────────

#[test]
fn upgrade_returns_not_initialized_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &id);
    let result = client.try_upgrade(&zero_hash(&env));
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "upgrade must return NotInitialized when contract is not yet initialized"
    );
}

#[test]
fn upgrade_rejects_non_owner_caller() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    let attacker = Address::generate(&env);
    let dummy = zero_hash(&env);
    let result = client
        .mock_auths(&[mock_auth!(
            &attacker,
            client,
            "upgrade",
            (dummy.clone(),).into_val(&env)
        )])
        .try_upgrade(&dummy);
    assert!(
        result.is_err(),
        "upgrade must reject a caller that is not the owner"
    );
}

#[test]
fn upgrade_rejects_random_third_party() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    // Use several distinct addresses to confirm no hardcoded bypass
    for _ in 0..3 {
        let stranger = Address::generate(&env);
        let dummy = zero_hash(&env);
        let result = client
            .mock_auths(&[mock_auth!(
                &stranger,
                client,
                "upgrade",
                (dummy.clone(),).into_val(&env)
            )])
            .try_upgrade(&dummy);
        assert!(result.is_err(), "stranger must be rejected by upgrade");
    }
}

// ── set_owner ─────────────────────────────────────────────────────────────

#[test]
fn set_owner_returns_not_initialized_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &id);
    let result = client.try_set_owner(&Address::generate(&env));
    assert_eq!(
        result,
        Err(Ok(ContractError::NotInitialized)),
        "set_owner must return NotInitialized when contract is not yet initialized"
    );
}

#[test]
fn set_owner_rejects_non_owner_caller() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    let attacker = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let result = client
        .mock_auths(&[mock_auth!(
            &attacker,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .try_set_owner(&new_owner);
    assert!(
        result.is_err(),
        "set_owner must reject a caller that is not the current owner"
    );
}

#[test]
fn set_owner_rejects_beneficiary_acting_as_owner() {
    let (env, client, _, beneficiary, _, _, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);
    let result = client
        .mock_auths(&[mock_auth!(
            &beneficiary,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .try_set_owner(&new_owner);
    assert!(
        result.is_err(),
        "beneficiary address must not bypass set_owner auth"
    );
}

#[test]
fn set_owner_accepts_current_owner_and_persists_new_address() {
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);
    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .set_owner(&new_owner);
    assert_eq!(
        client.get_owner(),
        new_owner,
        "get_owner must return the address passed to set_owner"
    );
}

#[test]
fn set_owner_emits_owner_set_event() {
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);
    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .set_owner(&new_owner);
    let found = get_events(&env).into_iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("OwnerSet"))
    });
    assert!(found, "set_owner must emit an OwnerSet event");
}

// ── ownership transfer chain ──────────────────────────────────────────────

#[test]
fn old_owner_rejected_by_set_owner_after_transfer() {
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);

    // Transfer ownership admin → new_owner
    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .set_owner(&new_owner);

    // Old admin tries to transfer ownership again → must fail
    let another = Address::generate(&env);
    let result = client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (another.clone(),).into_val(&env)
        )])
        .try_set_owner(&another);
    assert!(
        result.is_err(),
        "old owner must be rejected by set_owner after ownership has been transferred"
    );
}

#[test]
fn new_owner_accepted_by_set_owner_after_transfer() {
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);

    // Transfer ownership admin → new_owner
    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .set_owner(&new_owner);

    // New owner transfers to a third address → must succeed
    let third_owner = Address::generate(&env);
    client
        .mock_auths(&[mock_auth!(
            &new_owner,
            client,
            "set_owner",
            (third_owner.clone(),).into_val(&env)
        )])
        .set_owner(&third_owner);
    assert_eq!(
        client.get_owner(),
        third_owner,
        "new owner must be able to exercise set_owner after transfer"
    );
}

#[test]
fn old_owner_rejected_by_upgrade_after_transfer() {
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);

    // Transfer ownership admin → new_owner
    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (new_owner.clone(),).into_val(&env)
        )])
        .set_owner(&new_owner);

    // Old admin now tries to call upgrade → must fail
    let dummy = zero_hash(&env);
    let result = client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "upgrade",
            (dummy.clone(),).into_val(&env)
        )])
        .try_upgrade(&dummy);
    assert!(
        result.is_err(),
        "old owner must be rejected by upgrade after ownership has been transferred"
    );
}

#[test]
fn ownership_chain_transfer_is_respected() {
    // A → B → C: each hand-off must revoke the previous owner
    let (env, client, _, _, _, admin, _, _) = register_and_setup_without_auth_mock();
    let owner_b = Address::generate(&env);
    let owner_c = Address::generate(&env);

    client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "set_owner",
            (owner_b.clone(),).into_val(&env)
        )])
        .set_owner(&owner_b);

    client
        .mock_auths(&[mock_auth!(
            &owner_b,
            client,
            "set_owner",
            (owner_c.clone(),).into_val(&env)
        )])
        .set_owner(&owner_c);

    assert_eq!(client.get_owner(), owner_c);

    // Original admin (A) must now be rejected
    let dummy = zero_hash(&env);
    let result_a = client
        .mock_auths(&[mock_auth!(
            &admin,
            client,
            "upgrade",
            (dummy.clone(),).into_val(&env)
        )])
        .try_upgrade(&dummy);
    assert!(
        result_a.is_err(),
        "original admin must be rejected after two-hop transfer"
    );

    // Owner B must now be rejected
    let result_b = client
        .mock_auths(&[mock_auth!(
            &owner_b,
            client,
            "upgrade",
            (dummy.clone(),).into_val(&env)
        )])
        .try_upgrade(&dummy);
    assert!(
        result_b.is_err(),
        "intermediate owner B must be rejected after transfer to C"
    );
}
