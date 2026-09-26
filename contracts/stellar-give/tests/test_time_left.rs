#![cfg(test)]

use soroban_sdk::{testutils::Ledger, Env, String, Symbol};
use stellar_give::{StellarGiveClient, ContractError};

mod helpers;
use helpers::{setup_env_and_contract, generate_address};

#[test]
fn test_get_time_left_boundaries() {
    let env = Env::default();
    let (contract_id, client) = setup_env_and_contract(&env);
    let creator = generate_address(&env);
    let token = generate_address(&env);
    
    // Set current time to a known value
    env.ledger().with_mut(|li| li.timestamp = 1000);
    
    // Create a campaign with a deadline at 2000
    let deadline = 2000;
    let campaign_id = client.create_campaign(
        &creator,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "uri"),
        &Symbol::new(&env, "relief"),
        &1000i128,
        &deadline,
        &token,
        &None,
        &None,
    );

    // Test: Just before expiry
    env.ledger().with_mut(|li| li.timestamp = 1999);
    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, 1);
    
    // Test: Exactly at expiry
    env.ledger().with_mut(|li| li.timestamp = 2000);
    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, 0);

    // Test: Just after expiry
    env.ledger().with_mut(|li| li.timestamp = 2001);
    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, 0); // Contract semantic is to return 0 when now >= deadline
}

#[test]
fn test_get_time_left_far_future() {
    let env = Env::default();
    let (_, client) = setup_env_and_contract(&env);
    let creator = generate_address(&env);
    let token = generate_address(&env);
    
    env.ledger().with_mut(|li| li.timestamp = 1000);
    
    // Far-future deadline
    let deadline = u64::MAX;
    let campaign_id = client.create_campaign(
        &creator,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "uri"),
        &Symbol::new(&env, "relief"),
        &1000i128,
        &deadline,
        &token,
        &None,
        &None,
    );

    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, u64::MAX - 1000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")] // CampaignNotFound is usually #1, let's just use generic test pattern if we can't catch precise. Wait, try catch can be done with client.try_get_time_left
fn test_get_time_left_nonexistent() {
    let env = Env::default();
    let (_, client) = setup_env_and_contract(&env);
    
    let res = client.try_get_time_left(&999);
    assert_eq!(res.unwrap_err().unwrap(), ContractError::CampaignNotFound);
}
