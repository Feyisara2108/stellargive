use soroban_sdk::{
    symbol_short, String, testutils::Ledger,
};
use soroban_sdk::testutils::storage::Persistent;

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};

#[test]
fn test_persistent_storage_ttl_extension() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "TTL Test"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    // Get the campaign key to check its TTL
    // In lib.rs: fn campaign_key(id: u64) -> (Symbol, u64) { (symbol_short!("CMP"), id) }
    let key = (symbol_short!("CMP"), campaign_id);

    let initial_ttl = env.as_contract(&client.address, || env.storage().persistent().get_ttl(&key));
    extern crate std;
    std::println!("Initial TTL for campaign {}: {}", campaign_id, initial_ttl);

    // Advance ledger sequence significantly
    // Default min persistent TTL is often 4096.
    let advance_by = 10_000;
    let mut ledger_info = env.ledger().get();
    ledger_info.sequence_number += advance_by;
    // Also advance timestamp to keep it consistent
    ledger_info.timestamp += (advance_by as u64) * 5; 
    env.ledger().set(ledger_info);

    // Try to read the campaign
    let result = client.try_get_campaign(&campaign_id);
    
    match result {
        Ok(_) => {
            let new_ttl = env.as_contract(&client.address, || env.storage().persistent().get_ttl(&key));
            std::println!("Campaign still exists. New TTL: {}", new_ttl);
        },
        Err(e) => {
            std::println!("Campaign expired or read failed: {:?}", e);
            panic!("Campaign should have persisted if TTL extension was working or if advance was small enough");
        }
    }
}
