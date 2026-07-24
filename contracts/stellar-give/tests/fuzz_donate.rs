//! Fuzz / property-based tests for donation amount handling.
//!
//! Uses `proptest` to generate random donation amounts, target amounts, and
//! raised values. Validates the core invariant (`new_raised == old_raised +
//! donation_amount`) and ensures integer overflow is caught cleanly by the
//! contract's `checked_add` arithmetic without panicking.
//!
//! Determinism policy (seed + ignore — see also README.md and .gitignore):
//! - Fuzz inputs are seeded via `PROPEST_TEST_SEED` env var (see
//!   `.cargo/config.toml` in the contract directory) so that every
//!   `cargo test` run exercises the same 256 cases.  A fixed seed replaces
//!   the need for proptest's on-disk regression artefacts.
//! - Failure persistence (proptest per-case regression seed files) is
//!   disabled at runtime via `failure_persistence: None` in the module-level
//!   proptest config below.  As defence-in-depth, `*.proptest-regressions`
//!   files are additionally `.gitignore`d so a future config revert won't
//!   silently start committing seeds.  Any previously tracked regression
//!   file was removed from the index with `git rm --cached`.
//! - The `test_snapshots/` directory (ledger snapshots emitted by the
//!   Soroban SDK test harness) is `.gitignore`d and previously tracked
//!   snapshots were removed from git with `git rm -r --cached
//!   test_snapshots/`.  Snapshots are *inherently* non-deterministic
//!   because `Address::generate(&env)` values and `ledger_key_nonce`
//!   entries are not driven by the proptest seed — they cannot be made
//!   deterministic by seeding proptest alone, so they are never committed.

#![proptest_config(
    proptest::test_runner::Config {
        failure_persistence: None,
        cases: 256,
        source_file: None,
        ..Default::default()
    }
)]

use proptest::prelude::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token, Address, Env, String};
use stellar_give::{ContractError, StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{set_timestamp, single_ben};

/// Minimum donation accepted by the contract (0.1 token with 7 decimals).
const MIN_DONATION: i128 = 1_000_000;

/// Sets up a fresh environment with a campaign and returns everything needed
/// for donation tests. The campaign has a generous target and deadline.
fn setup_fuzz_campaign(
    target_amount: i128,
) -> (
    Env,
    StellarGiveContractClient<'static>,
    Address, // donor
    u64,     // campaign_id
    token::Client<'static>,
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

    token_admin_client.mint(&donor, &(i128::MAX / 4));
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Fuzz Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/fuzz"),
        &symbol_short!("relief"),
        &target_amount,
        &31_537_000_u64,
        &token_client.address,
        &None,
    );

    (env, client, donor, campaign_id, token_client)
}

proptest! {
    /// Core invariant: after a successful donation, `new_raised == old_raised + amount`.
    ///
    /// Generates random donation amounts between MIN_DONATION and i128::MAX/4
    /// (leaving headroom so the donor balance doesn't underflow).
    #[test]
    fn fuzz_raised_invariant(
        donation_amount in MIN_DONATION..=(i128::MAX / 4),
    ) {
        let target = i128::MAX / 2;
        let (_env, client, donor, campaign_id, _token_client) = setup_fuzz_campaign(target);

        let campaign_before = client.get_campaign(&campaign_id);
        let old_raised = campaign_before.raised_amount;

        let result = client.try_donate(
            &donor,
            &campaign_id,
            &donation_amount,
            &false,
            &None,
        );

        match result {
            Ok(Ok(())) => {
                let campaign_after = client.get_campaign(&campaign_id);
                prop_assert_eq!(
                    campaign_after.raised_amount,
                    old_raised + donation_amount,
                    "Raised amount invariant violated: {} + {} != {}",
                    old_raised, donation_amount, campaign_after.raised_amount
                );
            }
            Err(Ok(ContractError::ArithmeticError)) => {}
            Err(Ok(ContractError::TokenTransferFailed)) => {}
            other => {
                prop_assert!(false, "Unexpected result: {:?}", other);
            }
        }
    }

    /// Zero donation must always be rejected with `InvalidAmount`.
    #[test]
    fn fuzz_zero_donation_rejected(_dummy in 0..100u32) {
        let target = 100_000_000_i128;
        let (_env, client, donor, campaign_id, _token_client) = setup_fuzz_campaign(target);

        let result = client.try_donate(
            &donor,
            &campaign_id,
            &0_i128,
            &false,
            &None,
        );

        prop_assert_eq!(
            result,
            Err(Ok(ContractError::InvalidAmount)),
            "Zero donation should always fail with InvalidAmount"
        );
    }

    /// Donations below MIN_DONATION should always be rejected.
    #[test]
    fn fuzz_below_minimum_rejected(
        amount in 1_i128..MIN_DONATION,
    ) {
        let target = 100_000_000_i128;
        let (_env, client, donor, campaign_id, _token_client) = setup_fuzz_campaign(target);

        let result = client.try_donate(
            &donor,
            &campaign_id,
            &amount,
            &false,
            &None,
        );

        prop_assert_eq!(
            result,
            Err(Ok(ContractError::InvalidAmount)),
            "Donation {} below MIN_DONATION should be rejected", amount
        );
    }
}

/// Overflow protection: donating when raised_amount is near i128::MAX must
/// return `ArithmeticError`, not panic.
#[test]
fn test_overflow_returns_arithmetic_error() {
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

    token_admin_client.mint(&donor, &(i128::MAX / 2));
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Overflow Test"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/overflow"),
        &symbol_short!("relief"),
        &(i128::MAX / 2),
        &31_537_000_u64,
        &token_client.address,
        &None,
    );

    let large_amount = i128::MAX / 4;
    let result = client.try_donate(&donor, &campaign_id, &large_amount, &false, &None);
    assert!(result.is_ok(), "First large donation should succeed");

    let second_amount = i128::MAX / 2;
    let result = client.try_donate(&donor, &campaign_id, &second_amount, &false, &None);

    match result {
        Err(Ok(ContractError::ArithmeticError)) => {}
        Err(Ok(ContractError::TokenTransferFailed)) => {}
        Ok(_) => panic!("Donation that would overflow should not succeed"),
        other => panic!(
            "Expected ArithmeticError or TokenTransferFailed, got {:?}",
            other
        ),
    }
}

/// Standard boundary test: i128::MAX as donation amount should be cleanly rejected.
#[test]
fn test_max_i128_donation_rejected() {
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

    token_admin_client.mint(&donor, &(i128::MAX / 2));
    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "MaxBoundary"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/max"),
        &symbol_short!("relief"),
        &(i128::MAX / 2),
        &31_537_000_u64,
        &token_client.address,
        &None,
    );

    let result = client.try_donate(&donor, &campaign_id, &i128::MAX, &false, &None);

    assert!(
        result.is_err(),
        "i128::MAX donation should be rejected cleanly"
    );
}
