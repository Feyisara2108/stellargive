//! Auto-claim: a donation that meets or passes the target settles inside
//! `donate` rather than waiting for an explicit `claim_funds` (#1152).
//!
//! Moved out of the inline `reentrancy_security_tests` module in `src/lib.rs`,
//! where auto-claim coverage had drifted in alongside the lock tests.

mod helpers;

use helpers::{expected_platform_fee, get_events, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, String, Symbol, TryFromVal, Vec};
use stellar_give::{AutoClaimedEvent, CampaignStatus, ContractError};

#[test]
fn donate_at_target_triggers_auto_claim() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claim Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let beneficiary_balance_before = token_client.balance(&beneficiary);

    // Donate exactly the target amount
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Check that campaign is now Claimed
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);
    assert_eq!(campaign.raised_amount, 0);

    // Check that beneficiary received funds (net of 1% fee)
    let beneficiary_balance_after = token_client.balance(&beneficiary);
    let net_amount = 10_000_000 - expected_platform_fee(10_000_000);
    assert_eq!(
        beneficiary_balance_after - beneficiary_balance_before,
        net_amount
    );
}

#[test]
fn donate_over_target_triggers_auto_claim() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Over Target Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let beneficiary_balance_before = token_client.balance(&beneficiary);

    // Donate more than the target amount
    client.donate(&donor, &campaign_id, &15_000_000, &false, &None);

    // Check that campaign is now Claimed
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);
    assert_eq!(campaign.raised_amount, 0);

    // Check that beneficiary received funds based on the total raised (15M, not the target 10M)
    let beneficiary_balance_after = token_client.balance(&beneficiary);
    let net_amount = 15_000_000 - expected_platform_fee(15_000_000);
    assert_eq!(
        beneficiary_balance_after - beneficiary_balance_before,
        net_amount
    );
}

#[test]
fn donate_after_auto_claim_is_rejected() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claim Reject Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    // First donation hits the target and triggers auto-claim
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Verify campaign is Claimed
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);

    // Try to donate again - should fail because campaign is not Active
    let second_donor = Address::generate(&env);
    let result = client.try_donate(&second_donor, &campaign_id, &1_000_000, &false, &None);
    assert!(
        result.is_err(),
        "donation after auto-claim must be rejected"
    );
    assert_eq!(
        result.unwrap_err().unwrap(),
        ContractError::CampaignNotActive
    );
}

#[test]
fn donate_auto_claim_emits_auto_claimed_event() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Auto Claimed Event Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    // Check for AutoClaimed event
    let auto_claimed_event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(Symbol::new(&env, "autoclaimed"))
        })
        .expect("AutoClaimedEvent was not emitted");

    let payload = AutoClaimedEvent::try_from_val(&env, &auto_claimed_event.2)
        .expect("Failed to parse AutoClaimedEvent");
    assert_eq!(payload.campaign_id, campaign_id);
    assert_eq!(payload.total_raised, 10_000_000);
    assert_eq!(payload.beneficiary, beneficiary);
}

#[test]
fn auto_claim_with_multiple_beneficiaries() {
    let (env, client, creator, _beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let ben1 = Address::generate(&env);
    let ben2 = Address::generate(&env);
    let ben3 = Address::generate(&env);

    let mut bens = Vec::new(&env);
    bens.push_back((ben1.clone(), 5_000_u32)); // 50%
    bens.push_back((ben2.clone(), 3_000_u32)); // 30%
    bens.push_back((ben3.clone(), 2_000_u32)); // 20%

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Multi Ben Test"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );

    let ben1_before = token_client.balance(&ben1);
    let ben2_before = token_client.balance(&ben2);
    let ben3_before = token_client.balance(&ben3);

    // Donate to hit target
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);

    // Calculate expected payouts (net of 1% fee)
    let total_raised = 10_000_000;
    let fee = expected_platform_fee(total_raised);
    let net = total_raised - fee;

    let ben1_payout = net * 5_000 / 10_000;
    let ben2_payout = net * 3_000 / 10_000;
    let ben3_payout = net - ben1_payout - ben2_payout; // Takes remainder

    let ben1_after = token_client.balance(&ben1);
    let ben2_after = token_client.balance(&ben2);
    let ben3_after = token_client.balance(&ben3);

    assert_eq!(ben1_after - ben1_before, ben1_payout);
    assert_eq!(ben2_after - ben2_before, ben2_payout);
    assert_eq!(ben3_after - ben3_before, ben3_payout);
}
