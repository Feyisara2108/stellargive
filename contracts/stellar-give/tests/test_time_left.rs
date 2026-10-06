//! Boundary tests for `get_time_left`.

mod helpers;
use helpers::{create_default_campaign, register_and_setup, set_timestamp};
use stellar_give::ContractError;

/// One year, mirroring `MAX_DURATION` in the contract.
const MAX_DURATION: u64 = 31_536_000;

#[test]
fn test_get_time_left_boundaries() {
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

    set_timestamp(&env, 1_999);
    assert_eq!(client.get_time_left(&campaign_id), 1);

    // At and after the deadline the contract reports zero rather than underflowing.
    set_timestamp(&env, 2_000);
    assert_eq!(client.get_time_left(&campaign_id), 0);

    set_timestamp(&env, 2_001);
    assert_eq!(client.get_time_left(&campaign_id), 0);
}

#[test]
fn test_get_time_left_max_duration() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        1_000 + MAX_DURATION,
    );

    assert_eq!(client.get_time_left(&campaign_id), MAX_DURATION);
}

#[test]
fn test_get_time_left_nonexistent() {
    let (_env, client, ..) = register_and_setup();

    let res = client.try_get_time_left(&999);
    assert_eq!(res.unwrap_err().unwrap(), ContractError::CampaignNotFound);
}
