#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, BytesN, IntoVal, String, Symbol, Vec,
};
use stellar_give::ContractError;

mod helpers;
use helpers::register_and_setup_without_auth_mock;

/// Minimal upgrade-target contract, built from `contracts/upgrade-fixture`.
/// Rebuild with `make fixture` (CI does this before running the tests).
const UPGRADE_FIXTURE_WASM: &[u8] = include_bytes!("fixtures/upgrade_fixture.wasm");

#[test]
fn test_upgrade_success_and_preserves_state() {
    let (env, client, creator, beneficiary, _donor, admin, token_client, _) =
        register_and_setup_without_auth_mock();

    // Create some state
    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));
    let campaign_id = client.mock_all_auths().create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2000,
        &token_client.address,
        &None,
    );

    // Upload a real WASM so the host can find it by hash (a made-up hash fails
    // with Storage::MissingValue).
    let new_wasm_hash = env.deployer().upload_contract_wasm(UPGRADE_FIXTURE_WASM);

    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (new_wasm_hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .upgrade(&new_wasm_hash);

    // The new code is now the one executing...
    let version: u32 = env.invoke_contract(
        &client.address,
        &Symbol::new(&env, "version"),
        Vec::new(&env),
    );
    assert_eq!(version, 2);

    // ...and state written by the old code (owner, campaigns) survived.
    let owner: Address = env.invoke_contract(
        &client.address,
        &Symbol::new(&env, "get_owner"),
        Vec::new(&env),
    );
    assert_eq!(owner, admin);
    let has_campaign: bool = env.invoke_contract(
        &client.address,
        &Symbol::new(&env, "has_campaign"),
        (campaign_id,).into_val(&env),
    );
    assert!(has_campaign);
}

#[test]
fn test_upgrade_reverts_non_owner() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    let attacker = Address::generate(&env);
    let new_wasm_hash = BytesN::from_array(&env, &[1; 32]);

    let result = client
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (new_wasm_hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&new_wasm_hash);

    assert!(result.is_err());
}
