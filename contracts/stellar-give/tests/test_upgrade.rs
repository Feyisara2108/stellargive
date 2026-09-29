#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, MockAuth, MockAuthInvoke}, Address, BytesN, IntoVal, symbol_short, String, Vec};
use stellar_give::ContractError;

mod helpers;
use helpers::register_and_setup_without_auth_mock;

#[test]
fn test_upgrade_success_and_preserves_state() {
    let (env, client, creator, beneficiary, _donor, admin, token_client, _) = register_and_setup_without_auth_mock();
    
    // Create some state
    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));
    let campaign_id = client.mock_all_auths().create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Url"),
        &symbol_short!("relief"),
        &1_000,
        &2000,
        &token_client.address,
        &None,
    );

    let new_wasm_hash = BytesN::from_array(&env, &[1; 32]);
    
    client.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "upgrade",
            args: (new_wasm_hash.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]).upgrade(&new_wasm_hash);

    // Ensure state persists
    assert_eq!(client.get_owner(), admin);
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.id, campaign_id);
}

#[test]
fn test_upgrade_reverts_non_owner() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    let attacker = Address::generate(&env);
    let new_wasm_hash = BytesN::from_array(&env, &[1; 32]);
    
    let result = client.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "upgrade",
            args: (new_wasm_hash.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]).try_upgrade(&new_wasm_hash);

    assert!(result.is_err());
}
