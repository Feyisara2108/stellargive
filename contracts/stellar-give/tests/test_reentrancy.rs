//! Reentrancy guard behaviour observable through the public interface (#1152).
//!
//! Moved out of the inline `reentrancy_security_tests` module in `src/lib.rs`.
//! The three tests that poke the lock's temporary-storage key directly stay
//! inline, since `lock_key`, `enter_lock` and `exit_lock` are private.

mod helpers;

use helpers::{get_events, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, String, Symbol, TryFromVal};
use stellar_give::{CampaignStatus, ClaimedEvent, ContractError};

#[test]
fn claim_funds_lock_prevents_direct_reentry() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Reentrancy Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let ben_before = token_client.balance(&beneficiary);

    // Meeting the target auto-claims to the beneficiary within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
    let c = client.get_campaign(&campaign_id);
    assert_eq!(c.status, CampaignStatus::Claimed);
    assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);

    // A subsequent explicit claim must be rejected (already claimed).
    let result = client.try_claim_funds(&creator, &campaign_id);
    assert!(result.is_err(), "double-claim must fail");
}

#[test]
fn reentrancy_lock_survives_concurrent_campaign_claims() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let c1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign A"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/a"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );
    let c2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign B"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/b"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    // Each target-meeting donation auto-claims; the second succeeding
    // proves the reentrancy lock is released after the first auto-claim.
    client.donate(&donor, &c1, &10_000_000, &false, &None);
    client.donate(&donor, &c2, &10_000_000, &false, &None);

    assert_eq!(client.get_campaign(&c1).status, CampaignStatus::Claimed);
    assert_eq!(client.get_campaign(&c2).status, CampaignStatus::Claimed);
}

#[test]
fn donate_cannot_be_reentered_via_donation_event() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Donate Lock"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &100_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &30_000_000, &false, &None);
    client.donate(&donor, &campaign_id, &30_000_000, &false, &None);
    client.donate(&donor, &campaign_id, &40_000_000, &false, &None);

    // The final donation meets the target and auto-claims, so the
    // sequential donations all succeed and the campaign ends Claimed.
    let c = client.get_campaign(&campaign_id);
    assert_eq!(c.raised_amount, 0);
    assert_eq!(c.status, CampaignStatus::Claimed);
}

#[test]
fn claim_fails_when_campaign_already_claimed_no_double_transfer() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "No Double"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let ben_before = token_client.balance(&beneficiary);

    // Meeting the target auto-claims to the beneficiary within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
    let ben_after_first = token_client.balance(&beneficiary);
    assert_eq!(ben_after_first - ben_before, 9_900_000);

    let result = client.try_claim_funds(&creator, &campaign_id);
    assert!(result.is_err(), "double-claim must be rejected");

    let ben_after_second = token_client.balance(&beneficiary);
    assert_eq!(ben_after_second, ben_after_first);
}

#[test]
fn claim_funds_emits_audit_event_and_is_idempotent() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Claimed Event Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    // Donate below target and claim after the deadline so the manual
    // claim_funds path runs (a target-meeting donation would auto-claim
    // instead, emitting an "autoclaimed" event rather than "claimed").
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    set_timestamp(&env, 10_001);

    let claimed = client.claim_funds(&creator, &campaign_id);
    assert_eq!(claimed, 5_000_000);

    let events = get_events(&env);
    let claimed_event_exists = events.iter().any(|event| {
        event
            .1
            .get(0)
            .and_then(|t| Symbol::try_from_val(&env, &t).ok())
            == Some(symbol_short!("claimed"))
    });
    assert!(
        claimed_event_exists,
        "Audit event Claimed must be published"
    );
}

#[test]
fn unauthorized_user_cannot_trigger_reentrancy() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auth Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let attacker = Address::generate(&env);
    let result = client.try_claim_funds(&attacker, &campaign_id);
    assert!(result.is_err(), "unauthorized claim must fail");
}

#[test]
fn lock_state_is_clean_after_failed_claim() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Clean Lock"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let attacker = Address::generate(&env);
    let _ = client.try_claim_funds(&attacker, &campaign_id);

    // After the failed claim the lock is clean, so a target-meeting
    // donation can still auto-claim successfully.
    let ben_before = token_client.balance(&beneficiary);
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );
    assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
}
