use soroban_sdk::{symbol_short, Address, String, Vec};

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};
use stellar_give::{Campaign, ContractError};

#[test]
fn test_donation_overflow_raised_amount() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Overflow Raised"),
        &String::from_str(&env, "Testing overflow of raised_amount"),
        &String::from_str(&env, "https://example.com"),
        &symbol_short!("relief"),
        &i128::MAX,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    // Inflate raised_amount via storage to bypass token balance bounds
    env.as_contract(&client.address, || {
        let camp_key = (symbol_short!("CMP"), id);
        let mut campaign: Campaign = env.storage().persistent().get(&camp_key).unwrap();
        campaign.raised_amount = i128::MAX - 1_000_000;
        env.storage().persistent().set(&camp_key, &campaign);
    });

    token_admin_client.mint(&donor, &2_000_000);
    let result = client.try_donate(&donor, &id, &2_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::ArithmeticError)));
}

#[test]
fn test_update_top_donors_overflow() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Top Donors Overflow"),
        &String::from_str(&env, "Testing overflow in update_top_donors"),
        &String::from_str(&env, "https://example.com"),
        &symbol_short!("relief"),
        &i128::MAX,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &id, &5_000_000, &false, &None);

    env.as_contract(&client.address, || {
        let td_key = (symbol_short!("TDON"), id);
        let mut inflated: Vec<(Address, i128)> = Vec::new(&env);
        inflated.push_back((donor.clone(), i128::MAX - 1_000_000));
        env.storage().persistent().set(&td_key, &inflated);
    });

    token_admin_client.mint(&donor, &2_000_000);
    let result = client.try_donate(&donor, &id, &2_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::ArithmeticError)));
}

#[test]
fn test_refund_underflow_arithmetic_error() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Refund Underflow"),
        &String::from_str(&env, "Testing checked_sub underflow in refund"),
        &String::from_str(&env, "https://example.com"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &id, &5_000_000, &false, &None);
    client.cancel_campaign(&id);

    env.as_contract(&client.address, || {
        let camp_key = (symbol_short!("CMP"), id);
        let mut campaign: Campaign = env.storage().persistent().get(&camp_key).unwrap();
        campaign.raised_amount = i128::MIN;
        env.storage().persistent().set(&camp_key, &campaign);
    });

    let result = client.try_claim_refund(&donor, &id);
    assert_eq!(result, Err(Ok(ContractError::ArithmeticError)));
}
