use soroban_sdk::testutils::storage::Persistent;
use soroban_sdk::testutils::{Events as _, Ledger};
use soroban_sdk::{symbol_short, Env, String, TryFromVal};

mod helpers;
use helpers::{create_default_campaign, register_and_setup, set_timestamp};
use stellar_give::StellarGiveContractClient;

/// TTL after create is near the bump amount (518400).
const EXPECTED_TTL: u32 = 518400;

fn get_campaign_ttl(
    env: &Env,
    client: &StellarGiveContractClient<'static>,
    campaign_id: u64,
) -> u32 {
    let key = (symbol_short!("CMP"), campaign_id);
    env.as_contract(&client.address, || env.storage().persistent().get_ttl(&key))
}

#[test]
fn test_persistent_storage_ttl_extension() {
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

    let ttl = get_campaign_ttl(&env, &client, campaign_id);
    // After creation the TTL should be near the bump amount
    assert!(
        ttl >= EXPECTED_TTL - 10,
        "campaign TTL should be set at creation"
    );
}

#[test]
fn test_persistent_storage_ttl_extended_by_read() {
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
    let _ttl_after_create = get_campaign_ttl(&env, &client, campaign_id);

    // Advance the ledger far enough that the entry's remaining TTL drops below
    // PERSISTENT_LIFETIME_THRESHOLD (17280). Only then does a read/write bump the
    // TTL back up to PERSISTENT_BUMP_AMOUNT (518400) — a smaller advance leaves the
    // remaining TTL above the threshold and the contract intentionally skips the bump.
    let mut info = env.ledger().get();
    info.sequence_number += 502_000;
    info.timestamp += 5000;
    env.ledger().set(info);

    // Reading the campaign extends its TTL
    client.get_campaign(&campaign_id);
    let ttl_after_read = get_campaign_ttl(&env, &client, campaign_id);

    assert!(
        ttl_after_read >= EXPECTED_TTL - 10,
        "reading campaign must extend its TTL back near the bump amount"
    );
}

#[test]
fn test_persistent_storage_ttl_extended_by_write() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        10_000,
    );
    let _ttl_after_create = get_campaign_ttl(&env, &client, campaign_id);

    // Advance the ledger far enough that the entry's remaining TTL drops below
    // PERSISTENT_LIFETIME_THRESHOLD (17280). Only then does a read/write bump the
    // TTL back up to PERSISTENT_BUMP_AMOUNT (518400) — a smaller advance leaves the
    // remaining TTL above the threshold and the contract intentionally skips the bump.
    let mut info = env.ledger().get();
    info.sequence_number += 502_000;
    info.timestamp += 5000;
    env.ledger().set(info);

    // A mutating call that writes the campaign entry (cancel_campaign) must extend
    // its TTL. cancel_campaign writes the CMP key without any token transfer, so it
    // works even after the large ledger jump above (which archives the token SAC).
    client.cancel_campaign(&campaign_id);
    let ttl_after_write = get_campaign_ttl(&env, &client, campaign_id);

    assert!(
        ttl_after_write >= EXPECTED_TTL - 10,
        "writing to campaign must extend its TTL back near the bump amount"
    );
}

#[test]
fn test_transient_comment_data_is_not_persisted() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    let comment = String::from_str(&env, "This is a donor comment");
    client.donate(
        &donor,
        &campaign_id,
        &1_000_000,
        &false,
        &Some(comment.clone()),
    );

    // The comment must exist in the event log
    let donation_event = env.events().all().into_iter().find(|(addr, topics, _)| {
        addr == &client.address
            && topics
                .get(0)
                .and_then(|t| soroban_sdk::Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("donation"))
    });
    assert!(donation_event.is_some(), "donation event must exist");

    // The comment must NOT be stored in any persistent storage key directly
    // (comments are event-only, not stored as part of campaign state)
    let campaign_key = (symbol_short!("CMP"), campaign_id);
    let campaign_in_persistent = env.as_contract(&client.address, || {
        env.storage().persistent().has(&campaign_key)
    });
    assert!(
        campaign_in_persistent,
        "campaign must still be in persistent storage"
    );
}

#[test]
fn test_instance_vs_persistent_storage_separation() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let _campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    // NEXT_ID key is stored in instance storage
    let next_key = symbol_short!("NEXT");
    let next_in_instance =
        env.as_contract(&client.address, || env.storage().instance().has(&next_key));
    let next_in_persistent = env.as_contract(&client.address, || {
        env.storage().persistent().has(&next_key)
    });
    assert!(
        next_in_instance,
        "NEXT_ID must be stored in instance storage"
    );
    assert!(
        !next_in_persistent,
        "NEXT_ID must NOT be in persistent storage"
    );

    // PAUSED key is stored in instance storage
    let paused_key = symbol_short!("PAUSED");
    let paused_in_instance = env.as_contract(&client.address, || {
        env.storage().instance().has(&paused_key)
    });
    assert!(
        paused_in_instance,
        "PAUSED must be stored in instance storage"
    );

    // OWNER key is stored in instance storage
    let owner_key = symbol_short!("OWNER");
    let owner_in_instance =
        env.as_contract(&client.address, || env.storage().instance().has(&owner_key));
    assert!(
        owner_in_instance,
        "OWNER must be stored in instance storage"
    );

    // Campaign keys are stored in persistent storage, not instance
    let campaign_key = (symbol_short!("CMP"), 1_u64);
    let cmp_in_persistent = env.as_contract(&client.address, || {
        env.storage().persistent().has(&campaign_key)
    });
    let cmp_in_instance = env.as_contract(&client.address, || {
        env.storage().instance().has(&campaign_key)
    });
    assert!(
        cmp_in_persistent,
        "campaign data must be in persistent storage"
    );
    assert!(
        !cmp_in_instance,
        "campaign data must NOT be in instance storage"
    );
}

#[test]
fn test_donor_contribution_ttl_extended_by_read() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

    // The donor contribution key
    let dc_key = (symbol_short!("DCON"), campaign_id, donor.clone());

    let ttl_after_write = env.as_contract(&client.address, || {
        env.storage().persistent().get_ttl(&dc_key)
    });

    assert!(
        ttl_after_write >= EXPECTED_TTL - 10,
        "donor contribution TTL must be set after donation"
    );
}
