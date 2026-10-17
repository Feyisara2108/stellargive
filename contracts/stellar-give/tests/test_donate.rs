//! `donate` accounting, guards and emitted events (#1152).
//!
//! Moved out of the inline `#[cfg(test)]` module in `src/lib.rs`. The overflow
//! case stays inline because it has to write a doctored campaign through the
//! private storage helpers.

mod helpers;

use helpers::{get_events, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, String, Symbol, TryFromVal, Vec};
use stellar_give::{CampaignStatus, ContractError, DonationEvent, GoalReachedEvent, MIN_DONATION};

// ── accounting ────────────────────────────────────────────────────────────

#[test]
fn donate_updates_raised_and_status() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Medical Aid"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &3_000_000, &false, &None);
    let after_first = client.get_campaign(&campaign_id);
    assert_eq!(after_first.raised_amount, 3_000_000);
    assert_eq!(after_first.status, CampaignStatus::Active);

    client.donate(&donor, &campaign_id, &7_000_000, &false, &None);
    // The second donation meets the target, which auto-claims: funds are
    // distributed immediately, raised_amount is zeroed and status is Claimed.
    let after_second = client.get_campaign(&campaign_id);
    assert_eq!(after_second.raised_amount, 0);
    assert_eq!(after_second.status, CampaignStatus::Claimed);
}

// ── amount and cap guards ─────────────────────────────────────────────────

#[test]
fn donate_rejects_sub_minimum_amount() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Seed Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let result = client.try_donate(&donor, &campaign_id, &(MIN_DONATION - 1), &false, &None);
    assert!(result.is_err());
}

#[test]
fn donate_enforces_donor_cap() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));

    let cap = 50_000_000;
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Capped"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &100_000_000,
        &2_000,
        &token_client.address,
        &Some(cap),
    );

    // First donation within cap
    client.donate(&donor, &campaign_id, &30_000_000, &false, &None);

    // Second donation exceeding cap
    let result = client.try_donate(&donor, &campaign_id, &30_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::ExceedsDonorCap)));

    // Second donation exactly at cap
    client.donate(&donor, &campaign_id, &20_000_000, &false, &None);
}

// ── donor anonymity ───────────────────────────────────────────────────────

#[test]
fn donate_anonymous_emits_masked_event_and_transfers_funds() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Medical Aid"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let before_bal = token_client.balance(&donor);
    client.donate(&donor, &campaign_id, &1_000_000, &true, &None);

    // Verify the emitted event uses the masked address.
    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let after_bal = token_client.balance(&donor);

    // Funds must be debited correctly from the donor's address.
    assert_eq!(before_bal - after_bal, 1_000_000);

    let after_donate = client.get_campaign(&campaign_id);
    assert_eq!(after_donate.raised_amount, 1_000_000);

    let payload = DonationEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as DonationEvent");

    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(
        payload.donor,
        Address::from_string(&String::from_str(
            &env,
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        ))
    );
    assert_eq!(payload.amount, 1_000_000);
    assert_eq!(payload.total_raised, 1_000_000);
    assert_eq!(payload.accepted_token, token_client.address);

    // Top donors should also show the masked zero address instead of real donor.
    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 1);
    assert_eq!(
        top.get(0).unwrap().0,
        Address::from_string(&String::from_str(
            &env,
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        ))
    );
}

#[test]
fn donate_non_anonymous_emits_real_address() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Medical Aid"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let payload = DonationEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as DonationEvent");

    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, 1_000_000);

    // Top donors should show the real address.
    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 1);
    assert_eq!(top.get(0).unwrap().0, donor);
}

// ── goal_reached event ────────────────────────────────────────────────────

#[test]
fn donate_emits_goal_reached_event_on_exact_target_hit() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Goal Hit"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let goal_event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(Symbol::new(&env, "goal_reached"))
        })
        .expect("GoalReachedEvent was not emitted when the target was hit");

    let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
        .expect("event data did not decode as GoalReachedEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.total_raised, 10_000_000);
    // Hitting the exact target auto-claims, so the campaign ends Claimed.
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );
}

#[test]
fn donate_emits_goal_reached_event_on_overshoot() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Goal Overshoot"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &11_000_000, &false, &None);

    let goal_event_count = get_events(&env)
        .into_iter()
        .filter(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(Symbol::new(&env, "goal_reached"))
        })
        .count();

    assert_eq!(goal_event_count, 1);

    let goal_event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(Symbol::new(&env, "goal_reached"))
        })
        .expect("GoalReachedEvent was not emitted when the target was overshot");

    let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
        .expect("event data did not decode as GoalReachedEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.total_raised, 11_000_000);
    // Overshooting the target auto-claims, so the campaign ends Claimed.
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );
}

// ── donor comments ────────────────────────────────────────────────────────

#[test]
fn test_donation_with_comment_emits_event() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let comment_str = String::from_str(&env, "Great project!");
    client.donate(
        &donor,
        &campaign_id,
        &1_000_000,
        &false,
        &Some(comment_str.clone()),
    );

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let payload = DonationEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as DonationEvent");

    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, 1_000_000);
    assert_eq!(payload.comment, Some(comment_str));
}

#[test]
fn test_donation_without_comment_emits_event() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let payload = DonationEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as DonationEvent");

    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, 1_000_000);
    assert_eq!(payload.comment, None);
}
