#![cfg(test)]

use soroban_sdk::{testutils::Ledger, Env, String, Symbol};
use stellar_give::StellarGiveClient;

mod helpers;
use helpers::{setup_env_and_contract, generate_address};

#[test]
fn test_get_campaigns_by_creator_zero() {
    let env = Env::default();
    let (_, client) = setup_env_and_contract(&env);
    let creator = generate_address(&env);
    
    let campaigns = client.get_campaigns_by_creator(&creator);
    assert_eq!(campaigns.len(), 0);
}

#[test]
fn test_get_campaigns_by_creator_one() {
    let env = Env::default();
    let (_, client) = setup_env_and_contract(&env);
    let creator = generate_address(&env);
    let token = generate_address(&env);
    
    env.ledger().with_mut(|li| li.timestamp = 1000);
    
    let campaign_id = client.create_campaign(
        &creator,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "uri"),
        &Symbol::new(&env, "relief"),
        &1000i128,
        &2000u64,
        &token,
        &None,
        &None,
    );

    let campaigns = client.get_campaigns_by_creator(&creator);
    assert_eq!(campaigns.len(), 1);
    assert_eq!(campaigns.get(0).unwrap().id, campaign_id);
}

#[test]
fn test_get_campaigns_by_creator_many_and_isolation() {
    let env = Env::default();
    let (_, client) = setup_env_and_contract(&env);
    
    let creator1 = generate_address(&env);
    let creator2 = generate_address(&env);
    let token = generate_address(&env);
    
    env.ledger().with_mut(|li| li.timestamp = 1000);
    
    // Creator 1 creates 3 campaigns
    let c1_1 = client.create_campaign(
        &creator1,
        &String::from_str(&env, "T1"),
        &String::from_str(&env, "D1"),
        &String::from_str(&env, "U1"),
        &Symbol::new(&env, "relief"),
        &1000i128,
        &2000u64,
        &token,
        &None,
        &None,
    );
    let c1_2 = client.create_campaign(
        &creator1,
        &String::from_str(&env, "T2"),
        &String::from_str(&env, "D2"),
        &String::from_str(&env, "U2"),
        &Symbol::new(&env, "relief"),
        &2000i128,
        &3000u64,
        &token,
        &None,
        &None,
    );
    
    // Creator 2 creates 1 campaign
    let c2_1 = client.create_campaign(
        &creator2,
        &String::from_str(&env, "T3"),
        &String::from_str(&env, "D3"),
        &String::from_str(&env, "U3"),
        &Symbol::new(&env, "relief"),
        &3000i128,
        &4000u64,
        &token,
        &None,
        &None,
    );

    let c1_3 = client.create_campaign(
        &creator1,
        &String::from_str(&env, "T4"),
        &String::from_str(&env, "D4"),
        &String::from_str(&env, "U4"),
        &Symbol::new(&env, "relief"),
        &4000i128,
        &5000u64,
        &token,
        &None,
        &None,
    );

    // Verify isolation and ordering (insertion order / ID order)
    let campaigns1 = client.get_campaigns_by_creator(&creator1);
    assert_eq!(campaigns1.len(), 3);
    
    // The implementation iterates from 1..next_id, so it's strictly ordered by ID (insertion order).
    assert_eq!(campaigns1.get(0).unwrap().id, c1_1);
    assert_eq!(campaigns1.get(1).unwrap().id, c1_2);
    assert_eq!(campaigns1.get(2).unwrap().id, c1_3);

    let campaigns2 = client.get_campaigns_by_creator(&creator2);
    assert_eq!(campaigns2.len(), 1);
    assert_eq!(campaigns2.get(0).unwrap().id, c2_1);
}
