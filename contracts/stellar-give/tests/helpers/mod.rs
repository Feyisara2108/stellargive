//! Shared test helpers for integration tests.
//!
//! Mirrors the `setup()` and `set_timestamp()` helpers from the inline
//! `#[cfg(test)]` module in `lib.rs`, exposed for use by external test files.

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    token, Address, Env, String, Vec,
};
use stellar_give::{StellarGiveContract, StellarGiveContractClient};

/// Set the ledger timestamp for time-dependent test scenarios.
pub fn set_timestamp(env: &Env, timestamp: u64) {
    let mut ledger = env.ledger().get();
    ledger.timestamp = timestamp;
    env.ledger().set(ledger);
}

/// Standard test setup: registers a token, mints balances, deploys the
/// contract, and initializes it. All auths are mocked.
#[allow(dead_code)] // shared helper; not used by every test binary
pub fn register_and_setup() -> (
    Env,
    StellarGiveContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let donor = Address::generate(&env);
    let platform_admin = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

    // Mint enough for all test scenarios (1_000 XLM equivalent).
    token_admin_client.mint(&donor, &1_000_000_000_000);
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    (
        env,
        client,
        creator,
        beneficiary,
        donor,
        platform_admin,
        token_client,
        token_admin_client,
    )
}

/// Creates a single-beneficiary vector with 100% share (10_000 bps).
pub fn single_ben(env: &Env, beneficiary: &Address) -> Vec<(Address, u32)> {
    let mut bens = Vec::new(env);
    bens.push_back((beneficiary.clone(), 10_000_u32));
    bens
}

/// Creates a campaign with default parameters for quick test setup.
pub fn create_default_campaign(
    env: &Env,
    client: &StellarGiveContractClient<'static>,
    creator: &Address,
    beneficiary: &Address,
    token_address: &Address,
    deadline: u64,
) -> u64 {
    let bens = single_ben(env, beneficiary);
    client.create_campaign(
        creator,
        &bens,
        &String::from_str(env, "Test Campaign"),
        &String::from_str(env, "A test campaign description."),
        &String::from_str(env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &deadline,
        token_address,
        &None,
    )
}

/// Test setup that mints tokens with mock auths but does NOT mock auths on
/// the contract, so individual calls can use mock_auths selectively.
#[allow(dead_code)]
pub fn register_and_setup_without_auth_mock() -> (
    Env,
    StellarGiveContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let donor = Address::generate(&env);
    let platform_admin = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

    token_admin_client
        .mock_all_auths()
        .mint(&donor, &1_000_000_000_000);
    token_admin_client
        .mock_all_auths()
        .mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.mock_all_auths().initialize(&platform_admin);

    (
        env,
        client,
        creator,
        beneficiary,
        donor,
        platform_admin,
        token_client,
        token_admin_client,
    )
}
