//! Tests for `add_update` cap, empty-content guard, and event emission (#529).

mod helpers;

use helpers::{create_default_campaign, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Events;
use soroban_sdk::{symbol_short, String, TryFromVal};
use stellar_give::{CampaignUpdateEvent, ContractError};

#[test]
fn test_add_update_empty_content_rejected() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    let result = client.try_add_update(&campaign_id, &String::from_str(&env, ""));
    assert_eq!(result, Err(Ok(ContractError::InvalidUpdateContent)));
}

#[test]
fn test_add_update_10_succeeds_11th_rejected() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    // Add 10 updates — all should succeed
    for i in 0..10 {
        set_timestamp(&env, 1_000 + i);
        let content = String::from_str(&env, &format!("Update {}", i));
        client.add_update(&campaign_id, &content);
    }

    // 11th must be rejected
    set_timestamp(&env, 1_010);
    let result = client.try_add_update(&campaign_id, &String::from_str(&env, "Too many"));
    assert_eq!(result, Err(Ok(ContractError::TooManyUpdates)));
}

#[test]
fn test_get_updates_returns_insertion_order() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    let contents = ["First", "Second", "Third"];
    for (i, content) in contents.iter().enumerate() {
        set_timestamp(&env, 1_000 + i as u64);
        client.add_update(&campaign_id, &String::from_str(&env, content));
    }

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 3);

    for (i, expected) in contents.iter().enumerate() {
        let update = updates.get(i as u32).unwrap();
        assert_eq!(
            update.content,
            String::from_str(&env, expected),
            "update {} should match insertion order",
            i
        );
    }
}

#[test]
fn test_add_update_emits_campaign_update_event() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    let content = String::from_str(&env, "Event test update");
    set_timestamp(&env, 1_500);
    client.add_update(&campaign_id, &content);

    let events = env.events().all();
    let has_update_event = events.iter().any(|(addr, topics, data)| {
        if addr != client.address {
            return false;
        }
        let topic_match = topics
            .get(0)
            .and_then(|t| soroban_sdk::Symbol::try_from_val(&env, &t).ok())
            == Some(symbol_short!("update"));
        if !topic_match {
            return false;
        }
        // Decode the event data as CampaignUpdateEvent
        if let Ok(event) = CampaignUpdateEvent::try_from_val(&env, &data) {
            event.campaign_id == campaign_id
                && event.content == String::from_str(&env, "Event test update")
                && event.timestamp == 1_500
        } else {
            false
        }
    });
    assert!(has_update_event, "add_update must emit CampaignUpdateEvent");
}

#[test]
fn test_add_update_event_has_correct_timestamp_and_content() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    let updates_data = [
        (2_000_u64, "Alpha"),
        (3_000_u64, "Beta"),
        (4_000_u64, "Gamma"),
    ];

    for (ts, text) in &updates_data {
        set_timestamp(&env, *ts);
        client.add_update(&campaign_id, &String::from_str(&env, text));
    }

    // Verify via get_updates that timestamps and content match
    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 3);

    for (i, (ts, text)) in updates_data.iter().enumerate() {
        let update = updates.get(i as u32).unwrap();
        assert_eq!(update.timestamp, *ts);
        assert_eq!(update.content, String::from_str(&env, text));
    }
}

#[test]
fn test_get_updates_empty_for_new_campaign() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 0);
}

#[test]
fn test_add_update_9th_succeeds_10th_is_boundary() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );

    // Add 9 updates
    for i in 0..9 {
        set_timestamp(&env, 1_000 + i);
        client.add_update(&campaign_id, &String::from_str(&env, &format!("Update {}", i)));
    }

    // 10th should succeed (cap is 10)
    set_timestamp(&env, 1_009);
    client.add_update(&campaign_id, &String::from_str(&env, "Update 9"));

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 10);
}

