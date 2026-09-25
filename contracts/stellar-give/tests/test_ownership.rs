#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, MockAuth, MockAuthInvoke}, Address, IntoVal};
use stellar_give::ContractError;

mod helpers;
use helpers::register_and_setup_without_auth_mock;

#[test]
fn test_get_owner_returns_correct_address() {
    let (_, client, _, _, _, platform_admin, _, _) = register_and_setup_without_auth_mock();
    assert_eq!(client.get_owner(), platform_admin);
}

#[test]
fn test_set_owner_success() {
    let (env, client, _, _, _, platform_admin, _, _) = register_and_setup_without_auth_mock();
    let new_owner = Address::generate(&env);
    
    client.mock_auths(&[MockAuth {
        address: &platform_admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_owner",
            args: (new_owner.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]).set_owner(&new_owner);

    assert_eq!(client.get_owner(), new_owner);
}

#[test]
fn test_set_owner_reverts_non_owner() {
    let (env, client, _, _, _, _, _, _) = register_and_setup_without_auth_mock();
    let attacker = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    let result = client.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_owner",
            args: (new_owner.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]).try_set_owner(&new_owner);

    assert!(result.is_err());
}
