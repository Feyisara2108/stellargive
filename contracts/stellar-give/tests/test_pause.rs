#![cfg(test)]

use soroban_sdk::{symbol_short, testutils::Address as _, Address, String, Vec};
use stellar_give::ContractError;

mod helpers;
use helpers::{register_and_setup_without_auth_mock, set_timestamp};

#[test]
fn test_pause_gating() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1000);

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

    client.mock_all_auths().pause();

    let result = client.mock_all_auths().try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Title 2"),
        &String::from_str(&env, "Desc 2"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    let result_donate =
        client
            .mock_all_auths()
            .try_donate(&donor, &campaign_id, &500, &false, &None);
    assert_eq!(result_donate, Err(Ok(ContractError::ContractPaused)));

    set_timestamp(&env, 3000);
    let result_claim = client
        .mock_all_auths()
        .try_claim_funds(&beneficiary, &campaign_id);
    assert_eq!(result_claim, Err(Ok(ContractError::ContractPaused)));

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.id, campaign_id);

    let mut addrs = Vec::new(&env);
    addrs.push_back(Address::generate(&env));
    let result_whitelist = client
        .mock_all_auths()
        .try_add_to_whitelist(&campaign_id, &addrs);
    assert_eq!(
        result_whitelist,
        Err(Ok(ContractError::ContractPaused)),
        "add_to_whitelist while paused must fail with ContractPaused"
    );

    client.mock_all_auths().unpause();

    let claim_res = client
        .mock_all_auths()
        .try_claim_funds(&beneficiary, &campaign_id);
    assert_ne!(claim_res, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_add_to_whitelist_while_paused() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1000);

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

    client.mock_all_auths().pause();

    let mut addrs = Vec::new(&env);
    addrs.push_back(Address::generate(&env));

    let result = client
        .mock_all_auths()
        .try_add_to_whitelist(&campaign_id, &addrs);
    assert_eq!(
        result,
        Err(Ok(ContractError::ContractPaused)),
        "add_to_whitelist while paused must return ContractPaused"
    );
}
