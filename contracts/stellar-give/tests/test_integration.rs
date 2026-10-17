use soroban_sdk::testutils::{Address as _, Events as _, Ledger};
use soroban_sdk::{
    symbol_short, token, Address, BytesN, Env, IntoVal, String, Symbol, TryFromVal, Vec,
};

mod helpers;
use helpers::{
    create_default_campaign, register_and_setup, register_and_setup_without_auth_mock,
    set_timestamp, single_ben,
};
use stellar_give::{
    CampaignStatus, ContractError, DonationEvent, GoalReachedEvent, RefundEvent,
    StellarGiveContractClient,
};

fn get_events(
    env: &soroban_sdk::Env,
) -> std::vec::Vec<(
    soroban_sdk::Address,
    soroban_sdk::Vec<soroban_sdk::Val>,
    soroban_sdk::Val,
)> {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::xdr;
    let mut result = std::vec::Vec::new();
    for event in env.events().all().events() {
        let contract_id = event.contract_id.clone().unwrap();
        let sc_address = xdr::ScAddress::Contract(contract_id);
        let addr = soroban_sdk::Address::try_from_val(env, &sc_address).unwrap();
        if let xdr::ContractEventBody::V0(event_body) = &event.body {
            let topics = soroban_sdk::Vec::try_from_val(env, &event_body.topics).unwrap();
            let data = soroban_sdk::Val::try_from_val(env, &event_body.data).unwrap();
            result.push((addr, topics, data));
        }
    }
    result
}

// =============================================================================
// claim_refund on cancelled campaigns / refund on expired campaigns
// =============================================================================

#[test]
fn test_claim_refund_exact_contribution_donor_made_whole() {
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

    let donor_before = token_client.balance(&donor);
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    client.cancel_campaign(&campaign_id);

    let refunded = client.claim_refund(&donor, &campaign_id);
    assert_eq!(refunded, 5_000_000);
    assert_eq!(token_client.balance(&donor), donor_before);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.raised_amount, 0);
}

#[test]
fn test_claim_refund_rejects_active_campaign() {
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

    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(result, Err(Ok(ContractError::CampaignNotCancelled)));
}

#[test]
fn test_claim_refund_rejects_nothing_to_refund() {
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
    client.cancel_campaign(&campaign_id);

    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(result, Err(Ok(ContractError::NothingToRefund)));
}

#[test]
fn test_claim_refund_emits_event() {
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
    client.donate(&donor, &campaign_id, &3_000_000, &false, &None);
    client.cancel_campaign(&campaign_id);
    client.claim_refund(&donor, &campaign_id);

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("refund"))
        })
        .expect("RefundEvent must be emitted");

    let payload =
        RefundEvent::try_from_val(&env, &event.2).expect("event data must decode as RefundEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, 3_000_000);
}

#[test]
fn test_refund_on_expired_campaign_releases_funds() {
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
    let donor_before = token_client.balance(&donor);
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

    set_timestamp(&env, 3_000);

    client.refund(&campaign_id, &donor);
    assert_eq!(token_client.balance(&donor), donor_before);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.raised_amount, 0);
}

#[test]
fn test_refund_rejects_nothing_to_claim() {
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
    set_timestamp(&env, 3_000);

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(result, Err(Ok(ContractError::NothingToClaim)));
}

#[test]
fn test_refund_rejects_active_campaign() {
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

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(result, Err(Ok(ContractError::RefundNotAllowed)));
}

// =============================================================================
// add_update and get_updates
// =============================================================================

#[test]
fn test_add_update_and_get_updates_roundtrip() {
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

    let content = String::from_str(&env, "First update");
    client.add_update(&campaign_id, &content);

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 1);
    assert_eq!(updates.get(0).unwrap().content, content);
    assert_eq!(updates.get(0).unwrap().timestamp, 1_000);
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
        2_000,
    );

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 0);
}

#[test]
fn test_add_update_multiple_increments_count() {
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

    for i in 0..5 {
        let content = String::from_str(&env, &format!("Update {}", i));
        client.add_update(&campaign_id, &content);
    }

    let updates = client.get_updates(&campaign_id);
    assert_eq!(updates.len(), 5);
    for i in 0..5 {
        let expected = String::from_str(&env, &format!("Update {}", i));
        assert_eq!(updates.get(i).unwrap().content, expected);
    }
}

#[test]
fn test_add_update_rejects_non_creator() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    let attacker = Address::generate(&env);
    let content = String::from_str(&env, "Hacked update");
    let result = client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "add_update",
                args: (campaign_id, content.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_update(&campaign_id, &content);
    assert!(result.is_err());
}

// =============================================================================
// pause / unpause circuit breaker
// =============================================================================

#[test]
fn test_pause_then_unpause_restores_functionality() {
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

    client.pause();
    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    client.unpause();
    let result = client.try_donate(&donor, &campaign_id, &1_000_000, &false, &None);
    assert!(result.is_ok());
}

#[test]
fn test_pause_blocks_claim_funds() {
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
    set_timestamp(&env, 3_000);

    client.pause();
    let result = client.try_claim_funds(&beneficiary, &campaign_id);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_emits_event() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    client.pause();

    let has_paused = get_events(&env).into_iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("paused"))
    });
    assert!(has_paused);
}

#[test]
fn test_unpause_emits_event() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    client.pause();
    client.unpause();

    let has_unpaused = get_events(&env).into_iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("unpaused"))
    });
    assert!(has_unpaused);
}

// =============================================================================
// Whitelist management and private campaign access control
// =============================================================================

#[test]
fn test_add_to_whitelist_allows_private_campaign_donation() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, token_admin) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Private Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    env.as_contract(&client.address, || {
        let key = (symbol_short!("CMP"), campaign_id);
        let mut campaign: stellar_give::Campaign = env.storage().persistent().get(&key).unwrap();
        campaign.is_private = true;
        env.storage().persistent().set(&key, &campaign);
    });

    let unwhitelisted = Address::generate(&env);
    token_admin.mint(&unwhitelisted, &10_000_000);

    let result = client.try_donate(&unwhitelisted, &campaign_id, &1_000_000, &false, &None);
    assert_eq!(result, Err(Ok(ContractError::NotWhitelisted)));

    let mut addrs = Vec::new(&env);
    addrs.push_back(unwhitelisted.clone());
    client.add_to_whitelist(&campaign_id, &addrs);

    let result = client.try_donate(&unwhitelisted, &campaign_id, &1_000_000, &false, &None);
    assert!(result.is_ok());
}

#[test]
fn test_add_to_whitelist_rejects_non_creator() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client.mock_all_auths(),
        &creator,
        &beneficiary,
        &token_client.address,
        2_000,
    );

    let attacker = Address::generate(&env);
    let mut addrs = Vec::new(&env);
    addrs.push_back(attacker.clone());

    let result = client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "add_to_whitelist",
                args: (campaign_id, addrs.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_add_to_whitelist(&campaign_id, &addrs);
    assert!(result.is_err());
}

// =============================================================================
// upgrade
// =============================================================================

#[test]
fn test_upgrade_rejects_non_owner() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let attacker = Address::generate(&env);
    let hash = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let result = client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "upgrade",
                args: (hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&hash);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_rejects_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, stellar_give::StellarGiveContract);
    let client = stellar_give::StellarGiveContractClient::new(&env, &contract_id);

    let hash = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let result = client.try_upgrade(&hash);
    assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
}

// =============================================================================
// Admin/ownership functions (set_owner, get_owner)
// =============================================================================

#[test]
fn test_get_owner_returns_admin_after_initialize() {
    let (_env, client, _creator, _beneficiary, _donor, admin, _token_client, _) =
        register_and_setup();

    let owner = client.get_owner();
    assert_eq!(owner, admin);
}

#[test]
fn test_get_owner_fails_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, stellar_give::StellarGiveContract);
    let client = stellar_give::StellarGiveContractClient::new(&env, &contract_id);

    let result = client.try_get_owner();
    assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
}

#[test]
fn test_set_owner_transfers_ownership() {
    let (env, client, _creator, _beneficiary, _donor, admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let new_owner = Address::generate(&env);
    client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "set_owner",
                args: (new_owner.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_owner(&new_owner);

    assert_eq!(client.get_owner(), new_owner);
}

#[test]
fn test_set_owner_rejects_non_owner() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let attacker = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let result = client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "set_owner",
                args: (new_owner.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_owner(&new_owner);
    assert!(result.is_err());
}

#[test]
fn test_set_owner_emits_event() {
    let (env, client, _creator, _beneficiary, _donor, admin, _token_client, _) =
        register_and_setup_without_auth_mock();

    let new_owner = Address::generate(&env);
    client
        .mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &admin,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "set_owner",
                args: (new_owner.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_owner(&new_owner);

    let has_event = get_events(&env).into_iter().any(|(addr, topics, _)| {
        addr == client.address
            && topics
                .get(0)
                .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                == Some(symbol_short!("OwnerSet"))
    });
    assert!(has_event);
}

// =============================================================================
// Campaign queries
// =============================================================================

#[test]
fn test_get_total_campaigns_counts_all() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    assert_eq!(client.get_total_campaigns(), 0);

    let bens = single_ben(&env, &beneficiary);
    for i in 0..3 {
        let title = String::from_str(&env, &format!("Campaign {}", i + 1));
        client.create_campaign(
            &creator,
            &bens,
            &title,
            &String::from_str(&env, "A test campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &(2_000 + i as u64),
            &token_client.address,
            &None,
        );
    }

    assert_eq!(client.get_total_campaigns(), 3);
}

#[test]
fn test_get_total_campaigns_includes_cancelled() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 1"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    let _id2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 2"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &3_000,
        &token_client.address,
        &None,
    );

    client.cancel_campaign(&id1);
    assert_eq!(client.get_total_campaigns(), 2);
}

#[test]
fn test_get_time_left_before_deadline() {
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

    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, 4_000);
}

#[test]
fn test_get_time_left_at_deadline_returns_zero() {
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

    set_timestamp(&env, 2_000);
    let time_left = client.get_time_left(&campaign_id);
    assert_eq!(time_left, 0);
}

#[test]
fn test_get_time_left_rejects_nonexistent() {
    let (_env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    let result = client.try_get_time_left(&9_999);
    assert_eq!(result, Err(Ok(ContractError::CampaignNotFound)));
}

#[test]
fn test_get_campaigns_by_creator_returns_own_campaigns() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Creator Campaign 1"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta1"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    let id2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Creator Campaign 2"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta2"),
        &symbol_short!("medical"),
        &20_000_000,
        &3_000,
        &token_client.address,
        &None,
    );

    let campaigns = client.get_campaigns_by_creator(&creator);
    assert_eq!(campaigns.len(), 2);

    let ids: std::vec::Vec<u64> = campaigns.iter().map(|c| c.id).collect();
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id2));
}

#[test]
fn test_get_campaigns_by_creator_empty_for_unknown() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let _id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    let other = Address::generate(&env);
    let campaigns = client.get_campaigns_by_creator(&other);
    assert_eq!(campaigns.len(), 0);
}

#[test]
fn test_get_campaigns_batch_returns_multiple() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let id1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Batch 1"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta1"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    let id2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Batch 2"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta2"),
        &symbol_short!("medical"),
        &20_000_000,
        &3_000,
        &token_client.address,
        &None,
    );

    let mut ids = Vec::new(&env);
    ids.push_back(id1);
    ids.push_back(id2);

    let results = client.get_campaigns(&ids);
    assert_eq!(results.len(), 2);
    assert!(results.get(0).unwrap().is_some());
    assert!(results.get(1).unwrap().is_some());
    assert_eq!(results.get(0).unwrap().as_ref().unwrap().id, id1);
    assert_eq!(results.get(1).unwrap().as_ref().unwrap().id, id2);
}

#[test]
fn test_get_campaigns_batch_returns_none_for_missing() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    let mut ids = Vec::new(&env);
    ids.push_back(999_u64);

    let results = client.get_campaigns(&ids);
    assert_eq!(results.len(), 1);
    assert!(results.get(0).unwrap().is_none());
}

#[test]
fn test_get_campaigns_batch_rejects_over_limit() {
    let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) =
        register_and_setup();

    let mut ids = Vec::new(&env);
    for i in 0..51 {
        ids.push_back(i as u64);
    }

    let result = client.try_get_campaigns(&ids);
    assert_eq!(result, Err(Ok(ContractError::LimitExceeded)));
}

// ── end-to-end create → donate → claim flows (moved from lib.rs, #1152) ───

/// Helper: create a campaign, donate to meet target, and return (env, client, ids, addresses).
fn setup_funded_campaign() -> (
    Env,
    StellarGiveContractClient<'static>,
    u64,
    Address,
    Address,
    Address,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let (env, client, creator, beneficiary, donor, admin, token_client, token_admin) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Integration Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    (
        env,
        client,
        campaign_id,
        creator,
        beneficiary,
        donor,
        admin,
        token_client,
        token_admin,
    )
}

#[test]
fn full_flow_create_donate_target_met_claim_verify_balances() {
    let (_env, client, campaign_id, _creator, beneficiary, donor, admin, token_client, _) =
        setup_funded_campaign();

    let initial = client.get_campaign(&campaign_id);
    assert_eq!(initial.status, CampaignStatus::Active);
    assert_eq!(initial.raised_amount, 0);

    let donor_before = token_client.balance(&donor);
    let contract_before = token_client.balance(&client.address);
    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Meeting the target auto-claims: funds are distributed within
    // donate(), so the campaign ends Claimed with raised_amount zeroed
    // and the contract never retains a balance.
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let after_donate = client.get_campaign(&campaign_id);
    assert_eq!(after_donate.raised_amount, 0);
    assert_eq!(after_donate.status, CampaignStatus::Claimed);

    let donor_after_donate = token_client.balance(&donor);
    assert_eq!(donor_before - donor_after_donate, 10_000_000);

    let ben_after = token_client.balance(&beneficiary);
    assert_eq!(ben_after - ben_before, 9_900_000);

    let admin_after = token_client.balance(&admin);
    assert_eq!(admin_after - admin_before, 100_000);

    let contract_after = token_client.balance(&client.address);
    assert_eq!(contract_after, contract_before);
}

#[test]
fn full_flow_emits_donation_event() {
    let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, token_client, _) =
        setup_funded_campaign();

    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

    let donation_event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let payload = DonationEvent::try_from_val(&env, &donation_event.2)
        .expect("event data did not decode as DonationEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.donor, donor);
    assert_eq!(payload.amount, 5_000_000);
    assert_eq!(payload.total_raised, 5_000_000);
    assert_eq!(payload.accepted_token, token_client.address);
}

#[test]
fn full_flow_emits_goal_reached_event_when_target_met() {
    let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, _token_client, _) =
        setup_funded_campaign();

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
        .expect("GoalReachedEvent was not emitted");

    let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
        .expect("event data did not decode as GoalReachedEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.total_raised, 10_000_000);
}

#[test]
fn full_flow_with_overshoot_donation() {
    let (_env, client, campaign_id, _creator, beneficiary, donor, admin, token_client, _) =
        setup_funded_campaign();

    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Overshooting the target auto-claims the full raised amount.
    client.donate(&donor, &campaign_id, &15_000_000, &false, &None);

    assert_eq!(token_client.balance(&beneficiary) - ben_before, 14_850_000);
    assert_eq!(token_client.balance(&admin) - admin_before, 150_000);

    let after_donate = client.get_campaign(&campaign_id);
    assert_eq!(after_donate.status, CampaignStatus::Claimed);
    assert_eq!(after_donate.raised_amount, 0);
}

#[test]
fn full_flow_with_multiple_donors() {
    let (
        env,
        client,
        campaign_id,
        _creator,
        beneficiary,
        donor,
        _admin,
        token_client,
        token_admin_client,
    ) = setup_funded_campaign();

    let donor2 = Address::generate(&env);
    token_admin_client.mint(&donor2, &1_000_000_000_000);

    let ben_before = token_client.balance(&beneficiary);

    client.donate(&donor, &campaign_id, &6_000_000, &false, &None);
    // The second donation meets the target and auto-claims.
    client.donate(&donor2, &campaign_id, &4_000_000, &false, &None);

    let after_donate = client.get_campaign(&campaign_id);
    assert_eq!(after_donate.raised_amount, 0);
    assert_eq!(after_donate.status, CampaignStatus::Claimed);

    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 2);
    assert_eq!(top.get(0).unwrap().0, donor);
    assert_eq!(top.get(0).unwrap().1, 6_000_000);
    assert_eq!(top.get(1).unwrap().0, donor2);
    assert_eq!(top.get(1).unwrap().1, 4_000_000);

    assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
}

#[test]
fn full_flow_with_anonymous_donation() {
    let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, _token_client, _) =
        setup_funded_campaign();

    client.donate(&donor, &campaign_id, &10_000_000, &true, &None);

    let donation_event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("donation"))
        })
        .expect("Donation event was not emitted");

    let payload = DonationEvent::try_from_val(&env, &donation_event.2)
        .expect("event data did not decode as DonationEvent");

    let masked = Address::from_string(&String::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    ));
    assert_eq!(payload.donor, masked);

    // Meeting the target auto-claims, so the campaign ends Claimed.
    let c = client.get_campaign(&campaign_id);
    assert_eq!(c.status, CampaignStatus::Claimed);
    assert_eq!(c.raised_amount, 0);
}

#[test]
fn full_flow_claim_by_beneficiary() {
    let (_env, client, campaign_id, _creator, beneficiary, donor, _admin, token_client, _) =
        setup_funded_campaign();

    let ben_before = token_client.balance(&beneficiary);

    // Meeting the target auto-claims to the beneficiary within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );
}

#[test]
fn full_flow_contract_token_balance_decreases_after_claim() {
    let (env, client, campaign_id, creator, _beneficiary, donor, _admin, token_client, _) =
        setup_funded_campaign();

    // Donate below target so the contract actually holds the funds
    // (a target-meeting donation would auto-claim immediately).
    client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
    let contract_with_funds = token_client.balance(&client.address);

    // Claiming after the deadline drains the held balance.
    set_timestamp(&env, 10_001);
    client.claim_funds(&creator, &campaign_id);
    let contract_after_claim = token_client.balance(&client.address);

    assert_eq!(contract_with_funds - contract_after_claim, 5_000_000);
}

#[test]
fn full_flow_fee_plus_net_equals_gross() {
    let (_env, client, campaign_id, _creator, beneficiary, donor, admin, token_client, _) =
        setup_funded_campaign();

    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);

    // Meeting the target auto-claims within donate().
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let fee = token_client.balance(&admin) - admin_before;
    let net = token_client.balance(&beneficiary) - ben_before;
    assert_eq!(fee + net, 10_000_000);
}

#[test]
fn full_flow_claim_after_deadline_partial_funding() {
    let (env, client, creator, beneficiary, donor, admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 100);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Partial Fund"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &50_000_000,
        &500,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &20_000_000, &false, &None);

    let after_donate = client.get_campaign(&campaign_id);
    assert_eq!(after_donate.raised_amount, 20_000_000);
    assert_eq!(after_donate.status, CampaignStatus::Active);

    set_timestamp(&env, 600);

    let ben_before = token_client.balance(&beneficiary);
    let admin_before = token_client.balance(&admin);
    let claimed = client.claim_funds(&beneficiary, &campaign_id);

    assert_eq!(claimed, 20_000_000);
    assert_eq!(token_client.balance(&beneficiary) - ben_before, 19_800_000);
    assert_eq!(token_client.balance(&admin) - admin_before, 200_000);

    let after_claim = client.get_campaign(&campaign_id);
    assert_eq!(after_claim.status, CampaignStatus::Claimed);
    assert_eq!(after_claim.raised_amount, 0);
}
