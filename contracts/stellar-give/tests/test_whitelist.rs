use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{symbol_short, Address, IntoVal, String, Vec};

mod helpers;
use helpers::{
    create_default_campaign, register_and_setup, register_and_setup_without_auth_mock,
    set_timestamp, single_ben,
};
use stellar_give::ContractError;

#[test]
fn test_non_whitelisted_donor_rejected() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Private Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let key = (symbol_short!("CMP"), campaign_id);
    env.as_contract(&client.address, || {
        let mut campaign: stellar_give::Campaign = env.storage().persistent().get(&key).unwrap();
        campaign.is_private = true;
        env.storage().persistent().set(&key, &campaign);
    });

    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::NotWhitelisted)));
}

#[test]
fn test_whitelisted_donor_can_donate() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Private Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let key = (symbol_short!("CMP"), campaign_id);
    env.as_contract(&client.address, || {
        let mut campaign: stellar_give::Campaign = env.storage().persistent().get(&key).unwrap();
        campaign.is_private = true;
        env.storage().persistent().set(&key, &campaign);
    });

    let another = Address::generate(&env);
    let mut addrs = Vec::new(&env);
    addrs.push_back(donor.clone());
    addrs.push_back(another);
    client.add_to_whitelist(&campaign_id, &addrs);

    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);
    assert!(result.is_ok());
}

#[test]
fn test_add_to_whitelist_rejects_non_creator() {
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
    assert!(result.is_err());
}

#[test]
fn test_whitelisted_donor_subject_to_cap() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let cap = 5_000_000_i128;
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Private Capped Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &50_000_000,
        &2_000,
        &token_client.address,
        &Some(cap),
    );

    let key = (symbol_short!("CMP"), campaign_id);
    env.as_contract(&client.address, || {
        let mut campaign: stellar_give::Campaign = env.storage().persistent().get(&key).unwrap();
        campaign.is_private = true;
        env.storage().persistent().set(&key, &campaign);
    });

    let mut addrs = Vec::new(&env);
    addrs.push_back(donor.clone());
    client.add_to_whitelist(&campaign_id, &addrs);

    // Should succeed up to cap
    let result = client.try_donate(&donor, &campaign_id, &cap, &false, &None);
    assert!(result.is_ok());

    // Should fail if exceeding cap, despite being whitelisted
    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::ExceedsDonorCap)));
}

#[test]
fn test_non_whitelisted_donor_rejected_with_cap_configured() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let cap = 5_000_000_i128;
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Private Capped Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &50_000_000,
        &2_000,
        &token_client.address,
        &Some(cap),
    );

    let key = (symbol_short!("CMP"), campaign_id);
    env.as_contract(&client.address, || {
        let mut campaign: stellar_give::Campaign = env.storage().persistent().get(&key).unwrap();
        campaign.is_private = true;
        env.storage().persistent().set(&key, &campaign);
    });

    // Donor is not whitelisted, and tries to donate amount under cap
    let result = client.try_donate(&donor, &campaign_id, &(cap - 1_000_000), &false, &None);
    assert_eq!(result, Err(Ok(ContractError::NotWhitelisted)));
}
