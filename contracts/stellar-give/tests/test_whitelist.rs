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
