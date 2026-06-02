//! Integration tests for event topic structure and payload encoding.
//!
//! Validates that events emitted by `create_campaign` and `donate` carry the
//! correct topic symbols, the right number of topics per event, accurate payload
//! fields, and are emitted in the expected order.

use soroban_sdk::{symbol_short, String, Symbol, TryFromVal};
use soroban_sdk::testutils::Events as _;

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};
use stellar_give::{CreatedEvent, DonationEvent};

/// `create_campaign` emits exactly one contract event whose single topic is
/// `symbol_short!("created")`.
#[test]
fn test_create_event_topic_is_created_symbol() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Flood Relief"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let all_events = env.events().all();
    let contract_event_count = all_events
        .iter()
        .filter(|(addr, _, _)| addr == &client.address)
        .count();
    assert_eq!(
        contract_event_count,
        1,
        "create_campaign must emit exactly one contract event"
    );

    let event = all_events
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("created"))
        })
        .expect("CreatedEvent must be emitted by create_campaign");

    let topics = &event.1;
    assert_eq!(topics.len(), 1, "created event must carry exactly one topic");

    let topic_sym = Symbol::try_from_val(&env, &topics.get(0).unwrap())
        .expect("topic[0] must decode as Symbol");
    assert_eq!(topic_sym, symbol_short!("created"));
}

/// The payload of the `created` event must match every field of the campaign
/// exactly: id, creator address, and target amount.
#[test]
fn test_create_event_payload_exact_match() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target_amount = 50_000_000_i128;

    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Medical Fund"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("medical"),
        &target_amount,
        &5_000_u64,
        &token_client.address,
        &None,
    );

    let event = env
        .events()
        .all()
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("created"))
        })
        .expect("CreatedEvent must be emitted by create_campaign");

    let payload = CreatedEvent::try_from_val(&env, &event.2)
        .expect("event data must decode as CreatedEvent");

    assert_eq!(payload.id, id);
    assert_eq!(payload.creator, creator);
    assert_eq!(payload.target_amount, target_amount);
}

/// `donate` emits an event whose topics are exactly
/// `[symbol_short!("donation"), symbol_short!("received")]` in that order.
#[test]
fn test_donation_event_has_two_ordered_topics() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Shelter Aid"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("shelter"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &id, &1_000_000_i128, &false, &None);

    let event = env
        .events()
        .all()
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("DonationEvent must be emitted by donate");

    let topics = &event.1;
    assert_eq!(topics.len(), 2, "donation event must carry exactly two topics");

    let t0 = Symbol::try_from_val(&env, &topics.get(0).unwrap())
        .expect("topic[0] must decode as Symbol");
    let t1 = Symbol::try_from_val(&env, &topics.get(1).unwrap())
        .expect("topic[1] must decode as Symbol");

    assert_eq!(t0, symbol_short!("donation"), "topic[0] must be 'donation'");
    assert_eq!(t1, symbol_short!("received"), "topic[1] must be 'received'");
}

/// The `DonationEvent` payload must match the donation inputs and resulting
/// state: campaign_id, donor, amount, total_raised, accepted_token, and comment.
#[test]
fn test_donation_event_payload_exact_match() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Education Fund"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("education"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let donation_amount = 3_000_000_i128;
    let comment = String::from_str(&env, "keep up the great work");

    client.donate(&donor, &id, &donation_amount, &false, &Some(comment.clone()));

    let event = env
        .events()
        .all()
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("DonationEvent must be emitted by donate");

    let payload = DonationEvent::try_from_val(&env, &event.2)
        .expect("event data must decode as DonationEvent");

    assert_eq!(payload.campaign_id, id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, donation_amount);
    assert_eq!(payload.total_raised, donation_amount); // first donation, starts from zero
    assert_eq!(payload.accepted_token, token_client.address);
    assert_eq!(payload.comment, Some(comment));
}

/// Calling `create_campaign` then `donate` within the same test produces both
/// a `created` event and a `donation`/`received` event in the contract log.
#[test]
fn test_create_and_donate_both_events_emitted() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Relief Drive"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &id, &1_000_000_i128, &false, &None);

    let all_events = env.events().all();

    let contract_event_count = all_events
        .iter()
        .filter(|(addr, _, _)| addr == &client.address)
        .count();
    assert_eq!(
        contract_event_count,
        2,
        "create + donate must produce exactly two contract events"
    );

    let has_created = all_events.iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("created"))
    });
    let has_donation = all_events.iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("donation"))
    });

    assert!(has_created, "created event must be present after create_campaign");
    assert!(has_donation, "donation event must be present after donate");
}

/// In the full event log, the `created` event must appear at a lower index than
/// the `donation`/`received` event when both operations run in the same test.
#[test]
fn test_events_ordered_create_before_donation() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Water Relief"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &id, &1_000_000_i128, &false, &None);

    let all_events = env.events().all();

    let created_idx = all_events.iter().position(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("created"))
    });
    let donation_idx = all_events.iter().position(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("donation"))
    });

    let ci = created_idx.expect("created event must be present in the log");
    let di = donation_idx.expect("donation event must be present in the log");
    assert!(
        ci < di,
        "created event (idx {}) must precede donation event (idx {})",
        ci,
        di
    );
}
