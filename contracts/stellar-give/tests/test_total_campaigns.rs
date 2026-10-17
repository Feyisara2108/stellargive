//! `get_total_campaigns` counting semantics (#1152).
//!
//! Moved out of the inline `reentrancy_security_tests` module in `src/lib.rs`.

mod helpers;

use helpers::{register_and_setup, set_timestamp, single_ben};
use soroban_sdk::{symbol_short, String};
use stellar_give::CampaignStatus;

#[test]
fn get_total_campaigns_counts_created_campaigns() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    assert_eq!(client.get_total_campaigns(), 0);

    let bens = single_ben(&env, &beneficiary);
    client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 1"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );
    client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 2"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &20_000,
        &token_client.address,
        &None,
    );
    client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 3"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &30_000,
        &token_client.address,
        &None,
    );

    assert_eq!(client.get_total_campaigns(), 3);
}

#[test]
fn get_total_campaigns_ignores_cancellations() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let _campaign_id_1 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 1"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &10_000,
        &token_client.address,
        &None,
    );
    let campaign_id_2 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 2"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &20_000,
        &token_client.address,
        &None,
    );
    let _campaign_id_3 = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Campaign 3"),
        &String::from_str(&env, "A sample campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000,
        &30_000,
        &token_client.address,
        &None,
    );

    client.cancel_campaign(&campaign_id_2);

    assert_eq!(client.get_total_campaigns(), 3);
}
