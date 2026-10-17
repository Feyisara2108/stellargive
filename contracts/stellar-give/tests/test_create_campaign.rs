//! `create_campaign` input validation, storage and id assignment (#1152).
//!
//! Moved out of the inline `#[cfg(test)]` module in `src/lib.rs`, where the
//! same ground was covered twice: once by loose top-level tests and once by a
//! `create_campaign_tests` submodule. The two overlapping copies of
//! `create_campaign_rejects_contract_address_as_beneficiary` were identical,
//! so only one survives here.

mod helpers;

use helpers::{get_events, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, token, Address, String, Symbol, TryFromVal, Vec};
use stellar_give::{
    CampaignStatus, ContractError, CreatedEvent, StellarGiveContractClient,
    MAX_CAMPAIGNS_PER_CREATOR, MAX_DURATION, MIN_TARGET,
};

// ── happy path and stored state ────────────────────────────────────────────

/// Helper: create a campaign with standard valid parameters.
fn create_standard_campaign(
    client: &StellarGiveContractClient<'static>,
    creator: &Address,
    bens: &Vec<(Address, u32)>,
    token_address: &Address,
) -> u64 {
    client.create_campaign(
        creator,
        bens,
        &String::from_str(&client.env, "Test Campaign"),
        &String::from_str(&client.env, "A sample campaign description."),
        &String::from_str(&client.env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        token_address,
        &None,
    )
}

#[test]
fn create_and_get_campaign() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Flood Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let campaign = client.get_campaign(&id);
    assert_eq!(campaign.id, 1);
    assert_eq!(campaign.status, CampaignStatus::Active);
    assert_eq!(campaign.creator, creator);
    assert_eq!(campaign.beneficiaries, bens);
    assert_eq!(campaign.target_amount, 10_000_000);
    assert_eq!(campaign.raised_amount, 0);
    assert_eq!(campaign.category, symbol_short!("relief"));
    assert_eq!(
        campaign.metadata_uri,
        String::from_str(&env, "https://example.com/meta")
    );
    assert_eq!(campaign.max_per_donor, None);
    assert_eq!(campaign.website, None);
    assert_eq!(campaign.twitter, None);
}

#[test]
fn create_campaign_with_valid_parameters_succeeds() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Medical Aid Fund"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://ipfs.io/ipfs/QmTest123"),
        &symbol_short!("medical"),
        &50_000_000,
        &5_000,
        &token_client.address,
        &Some(25_000_000),
    );

    let campaign = client.get_campaign(&id);
    assert_eq!(campaign.id, id);
    assert_eq!(campaign.creator, creator);
    assert_eq!(campaign.beneficiaries, bens);
    assert_eq!(campaign.title, String::from_str(&env, "Medical Aid Fund"));
    assert_eq!(
        campaign.metadata_uri,
        String::from_str(&env, "https://ipfs.io/ipfs/QmTest123")
    );
    assert_eq!(campaign.category, symbol_short!("medical"));
    assert_eq!(campaign.target_amount, 50_000_000);
    assert_eq!(campaign.raised_amount, 0);
    assert_eq!(campaign.deadline, 5_000);
    assert_eq!(campaign.accepted_token, token_client.address);
    assert_eq!(campaign.status, CampaignStatus::Active);
    assert_eq!(campaign.max_per_donor, Some(25_000_000));
}

#[test]
fn create_campaign_with_ipfs_metadata_uri_succeeds() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "IPFS Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "ipfs://QmYwAPJzv5CZsnN625s3XfREM3zN1Bv2e7v6b1ALg"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let campaign = client.get_campaign(&id);
    assert_eq!(
        campaign.metadata_uri,
        String::from_str(&env, "ipfs://QmYwAPJzv5CZsnN625s3XfREM3zN1Bv2e7v6b1ALg")
    );
}

#[test]
fn create_campaign_stores_all_input_parameters_correctly() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Shelter Build"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/shelter"),
        &symbol_short!("shelter"),
        &100_000_000,
        &50_000,
        &token_client.address,
        &Some(50_000_000),
    );

    let c = client.get_campaign(&id);
    assert_eq!(c.id, id);
    assert_eq!(c.creator, creator);
    assert_eq!(c.beneficiaries.len(), 1);
    assert_eq!(c.beneficiaries.get(0).unwrap().0, beneficiary);
    assert_eq!(c.beneficiaries.get(0).unwrap().1, 10_000_u32);
    assert_eq!(c.title, String::from_str(&env, "Shelter Build"));
    assert_eq!(
        c.metadata_uri,
        String::from_str(&env, "https://example.com/shelter")
    );
    assert_eq!(c.category, symbol_short!("shelter"));
    assert_eq!(c.target_amount, 100_000_000);
    assert_eq!(c.raised_amount, 0);
    assert_eq!(c.deadline, 50_000);
    assert_eq!(c.accepted_token, token_client.address);
    assert_eq!(c.status, CampaignStatus::Active);
    assert_eq!(c.max_per_donor, Some(50_000_000));
    assert_eq!(c.website, None);
    assert_eq!(c.twitter, None);
}

#[test]
fn create_campaign_stores_optional_website_and_twitter() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Social Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("other"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let c = client.get_campaign(&id);
    assert_eq!(c.website, None);
    assert_eq!(c.twitter, None);
}

#[test]
fn stored_campaign_data_matches_input_exactly() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Exact Match"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/exact"),
        &symbol_short!("food"),
        &77_777_777,
        &12_345,
        &token_client.address,
        &Some(10_000_000),
    );

    let c = client.get_campaign(&id);
    assert_eq!(c.id, id);
    assert_eq!(c.creator, creator);
    assert_eq!(c.beneficiaries.get(0).unwrap().0, beneficiary);
    assert_eq!(c.beneficiaries.get(0).unwrap().1, 10_000_u32);
    assert_eq!(c.title, String::from_str(&env, "Exact Match"));
    assert_eq!(
        c.metadata_uri,
        String::from_str(&env, "https://example.com/exact")
    );
    assert_eq!(c.category, symbol_short!("food"));
    assert_eq!(c.target_amount, 77_777_777);
    assert_eq!(c.raised_amount, 0);
    assert_eq!(c.deadline, 12_345);
    assert_eq!(c.accepted_token, token_client.address);
    assert_eq!(c.status, CampaignStatus::Active);
    assert_eq!(c.max_per_donor, Some(10_000_000));
}

#[test]
fn create_campaign_with_description_persists_field() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Described Campaign"),
        &String::from_str(&env, "This is a detailed description for donor context."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );

    let campaign = client.get_campaign(&id);
    assert_eq!(
        campaign.description,
        String::from_str(&env, "This is a detailed description for donor context.")
    );
}

#[test]
fn create_campaign_accepts_empty_description() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "No Desc"),
        &String::from_str(&env, ""),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );

    let campaign = client.get_campaign(&id);
    assert_eq!(campaign.description, String::from_str(&env, ""));
}

// ── id assignment ─────────────────────────────────────────────────────────

#[test]
fn first_campaign_gets_id_1() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = create_standard_campaign(&client, &creator, &bens, &token_client.address);
    assert_eq!(id, 1);
}

#[test]
fn second_campaign_gets_id_2() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id1 = create_standard_campaign(&client, &creator, &bens, &token_client.address);
    let id2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Second Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta2"),
        &symbol_short!("education"),
        &20_000_000,
        &3_000,
        &token_client.address,
        &None,
    );
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn id_increments_across_multiple_creators() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let creator2 = Address::generate(&env);
    token_admin_client.mint(&creator2, &1_000_000_000_000);

    let bens = single_ben(&env, &beneficiary);
    let id1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Creator 1 Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    let id2 = client.create_campaign(
        &creator2,
        &bens,
        &String::from_str(&env, "Creator 2 Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &3_000,
        &token_client.address,
        &None,
    );
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn id_generation_is_sequential_and_collision_free() {
    let (env, client, creator, beneficiary, _, _admin, token_client, _) = register_and_setup();
    env.budget().reset_unlimited();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    for expected_id in 1_u64..=u64::from(MAX_CAMPAIGNS_PER_CREATOR) {
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Bench"),
            &String::from_str(&env, "A sample campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(id, expected_id);
    }
}

// ── title ─────────────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_empty_title() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, ""),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::EmptyTitle)));
}

#[test]
fn create_campaign_rejects_title_at_51_chars() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let title_51 = String::from_str(&env, "123456789012345678901234567890123456789012345678901");
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &title_51,
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
}

#[test]
fn create_campaign_accepts_title_at_exactly_50_chars() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let title_50 = String::from_str(&env, "12345678901234567890123456789012345678901234567890");
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &title_50,
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert!(result.is_ok(), "50-char title should be accepted");
}

#[test]
fn create_campaign_enforces_title_length_limit() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let valid_title = String::from_str(&env, "12345678901234567890123456789012345678901234567890");
    let ok = client.try_create_campaign(
        &creator,
        &bens,
        &valid_title,
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert!(ok.is_ok(), "title of 50 chars should be accepted");

    let too_long_title =
        String::from_str(&env, "123456789012345678901234567890123456789012345678901");
    let err = client.try_create_campaign(
        &creator,
        &bens,
        &too_long_title,
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(err, Err(Ok(ContractError::InvalidTitle)));
}

// ── target amount ─────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_zero_target() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Zero Target"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &0,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
}

#[test]
fn create_campaign_rejects_target_below_minimum() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Low Target"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &(MIN_TARGET - 1),
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
}

#[test]
fn create_campaign_accepts_target_at_minimum() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Min Target"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(id, 1);
}

#[test]
fn create_campaign_rejects_sub_minimum_target() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Too Low"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &(MIN_TARGET - 1),
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
}

// ── deadline ──────────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_deadline_in_the_past() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Past Deadline"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &4_999,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
}

#[test]
fn create_campaign_rejects_deadline_equal_to_now() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Equal Deadline"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
}

#[test]
fn create_campaign_rejects_deadline_beyond_one_year() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Too Far"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &(1_000 + MAX_DURATION + 1),
        &token_client.address,
        &None,
    );
    assert!(result.is_err());
}

#[test]
fn create_campaign_accepts_deadline_at_exactly_one_year() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "One Year Max"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &(1_000 + MAX_DURATION),
        &token_client.address,
        &None,
    );
    assert_eq!(id, 1);
}

#[test]
fn create_campaign_rejects_past_deadline() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 5_000); // Mock current ledger time

    let bens = single_ben(&env, &beneficiary);

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Past Deadline"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &4_999, // Set deadline strictly in the past
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
}

#[test]
fn create_campaign_enforces_max_duration() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    // Exactly one year is accepted.
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "One Year Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &(1_000 + MAX_DURATION),
        &token_client.address,
        &None,
    );
    assert_eq!(id, 1);

    // One second over the limit is rejected.
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Too Long Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &(1_000 + MAX_DURATION + 1),
        &token_client.address,
        &None,
    );
    assert!(result.is_err());
}

// ── metadata URI ──────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_invalid_metadata_uri_prefix() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Bad URI"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "ftp://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidMetadataUri)));
}

#[test]
fn create_campaign_rejects_oversized_metadata_uri() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let mut long_uri = [b'a'; 260];
    long_uri[0..8].copy_from_slice(b"https://");
    let long_uri_str = core::str::from_utf8(&long_uri).unwrap();
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Long URI"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, long_uri_str),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::MetadataUriTooLong)));
}

#[test]
fn create_campaign_validates_metadata_uri() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);
    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 10_000_u32));

    // Invalid prefix
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Invalid Prefix"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "ftp://example.com"),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidMetadataUri)));

    // Too long
    let mut long_uri_bytes = [b'a'; 260];
    long_uri_bytes[0..8].copy_from_slice(b"https://");
    let long_uri_str = core::str::from_utf8(&long_uri_bytes).unwrap();
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Too Long"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, long_uri_str),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::MetadataUriTooLong)));
}

// ── category ──────────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_invalid_category() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Bad Category"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("sports"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidCategory)));
}

#[test]
fn create_campaign_accepts_all_valid_categories() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let categories = ["medical", "food", "shelter", "education", "relief", "other"];

    for (i, cat) in categories.iter().enumerate() {
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Cat Test"),
            &String::from_str(&env, "A sample campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &Symbol::new(&env, cat),
            &10_000_000,
            &(3_000 + i as u64),
            &token_client.address,
            &None,
        );
        assert_eq!(id, (i + 1) as u64);
    }
}

#[test]
fn create_campaign_validates_category() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Invalid Category"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("sports"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidCategory)));
}

// ── description ───────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_description_over_500_chars() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    // Build a 501-character description
    let long_desc = String::from_str(&env, &"A".repeat(501));

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Long Desc"),
        &long_desc,
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &5_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::DescriptionTooLong)));
}

// ── beneficiaries ─────────────────────────────────────────────────────────

#[test]
fn create_campaign_rejects_contract_address_as_beneficiary() {
    let (env, client, creator, _beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let contract_beneficiary = env.as_contract(&client.address, || env.current_contract_address());
    let mut bens = Vec::new(&env);
    bens.push_back((contract_beneficiary, 10_000_u32));

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Locked Funds"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    assert_eq!(result, Err(Ok(ContractError::InvalidBeneficiary)));
}

#[test]
fn create_campaign_rejects_beneficiary_shares_not_summing_to_10000() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let beneficiary2 = Address::generate(&env);
    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 5_000_u32));
    bens.push_back((beneficiary2.clone(), 4_999_u32));

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Bad Shares"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidShares)));
}

#[test]
fn invalid_shares_not_summing_to_10000_rejected() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    let beneficiary2 = Address::generate(&env);
    set_timestamp(&env, 1_000);

    let mut bens = Vec::new(&env);
    bens.push_back((beneficiary.clone(), 5_000_u32));
    bens.push_back((beneficiary2.clone(), 4_999_u32));

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Bad Shares"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert!(result.is_err());
}

#[test]
fn empty_beneficiaries_rejected() {
    let (env, client, creator, _beneficiary, _donor, _admin, token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens: Vec<(Address, u32)> = Vec::new(&env);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "No Bens"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert!(result.is_err());
}

// ── accepted token ────────────────────────────────────────────────────────

#[test]
fn create_campaign_accepts_valid_sac_token() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "SAC Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    assert!(result.is_ok(), "valid SAC token must be accepted");
}

#[test]
fn create_campaign_rejects_non_token_contract() {
    let (env, client, creator, beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let not_a_token = client.address.clone();
    let bens = single_ben(&env, &beneficiary);

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Bad Token Campaign"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &not_a_token,
        &None,
    );
    assert!(
        result.is_err(),
        "non-token contract address must be rejected"
    );
}

// ── per-creator campaign cap ──────────────────────────────────────────────

#[test]
fn create_campaign_enforces_creator_campaign_limit() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    for _ in 0..MAX_CAMPAIGNS_PER_CREATOR {
        let _ = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Cap Test"),
            &String::from_str(&env, "A sample campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
    }

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Cap Test Overflow"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &MIN_TARGET,
        &2_000,
        &token_client.address,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::LimitExceeded)));
}

// ── created event ─────────────────────────────────────────────────────────

#[test]
fn create_campaign_emits_created_event() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let target_amount: i128 = 10_000_000;
    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Flood Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &target_amount,
        &2_000,
        &token_client.address,
        &None,
    );

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("created"))
        })
        .expect("CreatedEvent was not emitted by create_campaign");

    let payload = CreatedEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as CreatedEvent");
    assert_eq!(payload.id, id);
    assert_eq!(payload.creator, creator);
    assert_eq!(payload.target_amount, target_amount);
}

#[test]
fn create_campaign_emits_created_event_with_correct_payload() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Event Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &25_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("created"))
        })
        .expect("CreatedEvent was not emitted");

    let payload = CreatedEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as CreatedEvent");
    assert_eq!(payload.id, id);
    assert_eq!(payload.creator, creator);
    assert_eq!(payload.target_amount, 25_000_000);
}
