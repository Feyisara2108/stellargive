//! Tests for `get_campaigns_by_creator`: empty, single, and multi-creator isolation.

use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

mod helpers;
use helpers::{create_default_campaign, register_and_setup, set_timestamp};

#[test]
fn test_get_campaigns_by_creator_zero() {
    let (_env, client, creator, ..) = register_and_setup();

    assert_eq!(client.get_campaigns_by_creator(&creator).len(), 0);
}

#[test]
fn test_get_campaigns_by_creator_one() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    let campaigns = client.get_campaigns_by_creator(&creator);
    assert_eq!(campaigns.len(), 1);
    assert_eq!(campaigns.get(0).unwrap().id, campaign_id);
}

#[test]
fn test_get_campaigns_by_creator_many_and_isolation() {
    let (env, client, creator1, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    let creator2 = Address::generate(&env);
    // Every creator pays the creation fee, so creator2 needs a balance too.
    token_admin_client.mint(&creator2, &1_000_000_000_000);
    let token = token_client.address.clone();
    set_timestamp(&env, 1_000);

    // Interleave creators so isolation and ID ordering are both exercised.
    let c1_1 = create_default_campaign(&env, &client, &creator1, &beneficiary, &token, 2_000);
    let c1_2 = create_default_campaign(&env, &client, &creator1, &beneficiary, &token, 3_000);
    let c2_1 = create_default_campaign(&env, &client, &creator2, &beneficiary, &token, 4_000);
    let c1_3 = create_default_campaign(&env, &client, &creator1, &beneficiary, &token, 5_000);

    let campaigns1 = client.get_campaigns_by_creator(&creator1);
    assert_eq!(campaigns1.len(), 3);
    assert_eq!(campaigns1.get(0).unwrap().id, c1_1);
    assert_eq!(campaigns1.get(1).unwrap().id, c1_2);
    assert_eq!(campaigns1.get(2).unwrap().id, c1_3);

    let campaigns2 = client.get_campaigns_by_creator(&creator2);
    assert_eq!(campaigns2.len(), 1);
    assert_eq!(campaigns2.get(0).unwrap().id, c2_1);
}
