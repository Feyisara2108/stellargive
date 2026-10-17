//! Boundary tests for `get_time_left`.
//!
//! The four single-point cases that used to live in the inline `#[cfg(test)]`
//! module in `src/lib.rs` (positive delta, exact deadline, past deadline,
//! unknown campaign) are already covered by `test_get_time_left_boundaries`
//! and `test_get_time_left_nonexistent` below, so only the time-progression
//! case moved across (#1152).

mod helpers;
use helpers::{create_default_campaign, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::{symbol_short, String};
use stellar_give::{ContractError, MAX_DURATION};

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

// ── moved from lib.rs (#1152) ─────────────────────────────────────────────

#[test]
fn get_time_left_updates_as_time_progresses() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let deadline = 10_000u64;
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Progressive Time"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &deadline,
        &token_client.address,
        &None,
    );

    // Check time at start
    let time_left_1 = client.get_time_left(&campaign_id);
    assert_eq!(time_left_1, 9_000);

    // Move forward
    set_timestamp(&env, 5_000);
    let time_left_2 = client.get_time_left(&campaign_id);
    assert_eq!(time_left_2, 5_000);

    // Move closer
    set_timestamp(&env, 9_000);
    let time_left_3 = client.get_time_left(&campaign_id);
    assert_eq!(time_left_3, 1_000);

    // Pass deadline
    set_timestamp(&env, 15_000);
    let time_left_4 = client.get_time_left(&campaign_id);
    assert_eq!(time_left_4, 0);
}
