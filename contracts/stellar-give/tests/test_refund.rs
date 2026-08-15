//! Tests for refund vs claim_refund status guards and negative paths (#525).
//!
//! Covers:
//! - `refund` rejects Active/Funded/Cancelled campaigns with RefundNotAllowed
//! - `refund` succeeds only when expired below target
//! - `claim_refund` rejects non-cancelled campaign with CampaignNotCancelled
//! - `claim_refund` rejects zeroed donor with NothingToRefund
//! - Double-refund protection: calling either twice errors

mod helpers;

use helpers::{create_default_campaign, register_and_setup, set_timestamp, single_ben};
use soroban_sdk::{symbol_short, String};
use stellar_give::{CampaignStatus, ContractError};

// ── refund: status guards ──────────────────────────────────────────────────

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
        5_000,
    );
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(
        result,
        Err(Ok(ContractError::RefundNotAllowed)),
        "refund must reject Active campaign"
    );
}

#[test]
fn test_refund_rejects_funded_campaign() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    // Create campaign with high target that won't auto-claim
    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "High Target"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &100_000_000_i128,
        &5_000_u64,
        &token_client.address,
        &None,
    );
    // Donate enough to reach target
    client.donate(&donor, &campaign_id, &100_000_000, &false, &None);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Claimed);

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(
        result,
        Err(Ok(ContractError::RefundNotAllowed)),
        "refund must reject Claimed (auto-claimed) campaign"
    );
}

#[test]
fn test_refund_rejects_cancelled_campaign() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);
    client.cancel_campaign(&campaign_id);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Cancelled);

    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(
        result,
        Err(Ok(ContractError::RefundNotAllowed)),
        "refund must reject Cancelled campaign (use claim_refund instead)"
    );
}

#[test]
fn test_refund_succeeds_only_when_expired_below_target() {
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

    // Advance past deadline — campaign becomes Expired
    set_timestamp(&env, 3_000);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Expired);
    assert!(campaign.raised_amount < campaign.target_amount);

    let result = client.try_refund(&campaign_id, &donor);
    assert!(
        result.is_ok(),
        "refund must succeed for expired below-target campaign"
    );
}

// ── claim_refund: status guards ────────────────────────────────────────────

#[test]
fn test_claim_refund_rejects_non_cancelled_campaign() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id = create_default_campaign(
        &env,
        &client,
        &creator,
        &beneficiary,
        &token_client.address,
        5_000,
    );
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

    // Campaign is Active, not Cancelled
    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(
        result,
        Err(Ok(ContractError::CampaignNotCancelled)),
        "claim_refund must reject non-cancelled campaign"
    );
}

#[test]
fn test_claim_refund_rejects_expired_campaign() {
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
    client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

    // Advance past deadline — Expired, not Cancelled
    set_timestamp(&env, 3_000);

    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(
        result,
        Err(Ok(ContractError::CampaignNotCancelled)),
        "claim_refund must reject Expired campaign"
    );
}

#[test]
fn test_claim_refund_rejects_zeroed_donor() {
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

    // Cancel campaign without any donations
    client.cancel_campaign(&campaign_id);

    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(
        result,
        Err(Ok(ContractError::NothingToRefund)),
        "claim_refund must reject donor with zero contribution"
    );
}

// ── double-refund protection ───────────────────────────────────────────────

#[test]
fn test_refund_double_call_errors() {
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

    // First refund succeeds
    let result = client.try_refund(&campaign_id, &donor);
    assert!(result.is_ok(), "first refund must succeed");

    // Second refund fails — contribution is zeroed
    let result = client.try_refund(&campaign_id, &donor);
    assert_eq!(
        result,
        Err(Ok(ContractError::NothingToClaim)),
        "second refund must error (no double payout)"
    );
}

#[test]
fn test_claim_refund_double_call_errors() {
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
    client.cancel_campaign(&campaign_id);

    // First claim_refund succeeds
    let result = client.try_claim_refund(&donor, &campaign_id);
    assert!(result.is_ok(), "first claim_refund must succeed");

    // Second claim_refund fails — contribution is zeroed
    let result = client.try_claim_refund(&donor, &campaign_id);
    assert_eq!(
        result,
        Err(Ok(ContractError::NothingToRefund)),
        "second claim_refund must error (no double payout)"
    );
}

#[test]
fn test_refund_clears_raised_amount() {
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
    let donation = 5_000_000_i128;
    client.donate(&donor, &campaign_id, &donation, &false, &None);

    let c_before = client.get_campaign(&campaign_id);
    assert_eq!(c_before.raised_amount, donation);

    set_timestamp(&env, 3_000);
    client.refund(&campaign_id, &donor);

    let c_after = client.get_campaign(&campaign_id);
    assert_eq!(
        c_after.raised_amount, 0,
        "raised_amount must be zeroed after refund"
    );
}

#[test]
fn test_claim_refund_clears_raised_amount() {
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
    let donation = 5_000_000_i128;
    client.donate(&donor, &campaign_id, &donation, &false, &None);

    client.cancel_campaign(&campaign_id);

    let c_before = client.get_campaign(&campaign_id);
    assert_eq!(c_before.raised_amount, donation);

    client.claim_refund(&donor, &campaign_id);

    let c_after = client.get_campaign(&campaign_id);
    assert_eq!(
        c_after.raised_amount, 0,
        "raised_amount must be zeroed after claim_refund"
    );
}
