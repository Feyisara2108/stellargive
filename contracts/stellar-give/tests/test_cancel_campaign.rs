//! `cancel_campaign` authorization, allowed states and emitted event (#1152).
//!
//! Moved out of the inline `#[cfg(test)]` module in `src/lib.rs`. Refund
//! behaviour after a cancellation lives in `test_refund.rs`.

mod helpers;

use helpers::{
    get_events, register_and_setup, register_and_setup_without_auth_mock, set_timestamp, single_ben,
};
use soroban_sdk::testutils::{
    Address as _, AuthorizedFunction, AuthorizedInvocation, MockAuth, MockAuthInvoke,
};
use soroban_sdk::{symbol_short, Address, IntoVal, String, Symbol, TryFromVal};
use stellar_give::{CampaignStatus, CancelledEvent, ContractError, MIN_DONATION};

#[test]
fn cancel_campaign_requires_creator_auth_and_emits_event() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.mock_all_auths().create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Cancelable Relief"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    client.mock_all_auths().cancel_campaign(&campaign_id);

    assert_eq!(
        env.auths(),
        std::vec![(
            creator.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "cancel_campaign"),
                    (campaign_id,).into_val(&env)
                )),
                sub_invocations: std::vec![]
            }
        )]
    );

    let event = get_events(&env)
        .into_iter()
        .find(|(addr, topics, _)| {
            addr == &client.address
                && topics
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("cancel"))
        })
        .expect("CancelledEvent was not emitted by cancel_campaign");

    let payload = CancelledEvent::try_from_val(&env, &event.2)
        .expect("event data did not decode as CancelledEvent");
    assert_eq!(payload.id, campaign_id);
    assert_eq!(payload.creator, creator);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Cancelled);
}

#[test]
fn cancel_campaign_rejects_non_creator_auth() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
        register_and_setup_without_auth_mock();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.mock_all_auths().create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Creator Only"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    // cancel_campaign authorizes the stored creator via require_auth(). Supplying
    // only the attacker's auth leaves the creator's required auth unmet, so the
    // host rejects the invocation before any contract logic runs.
    let attacker = Address::generate(&env);
    let invoke = MockAuthInvoke {
        contract: &client.address,
        fn_name: "cancel_campaign",
        args: (campaign_id,).into_val(&env),
        sub_invokes: &[],
    };
    let auths = [MockAuth {
        address: &attacker,
        invoke: &invoke,
    }];

    let result = client.mock_auths(&auths).try_cancel_campaign(&campaign_id);
    assert!(result.is_err());
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Active
    );
}

#[test]
fn cancel_campaign_allows_cancellation_with_donations() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Already Fundraising"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );
    client.donate(&donor, &campaign_id, &MIN_DONATION, &false, &None);

    client.cancel_campaign(&campaign_id);
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Cancelled
    );
}

#[test]
fn cancel_campaign_rejects_after_claim() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Funded And Claimed"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &2_000,
        &token_client.address,
        &None,
    );

    // Donating the full target auto-claims, moving the campaign to Claimed.
    client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
    assert_eq!(
        client.get_campaign(&campaign_id).status,
        CampaignStatus::Claimed
    );

    let result = client.try_cancel_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
}
