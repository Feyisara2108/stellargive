//! Fuzz / property-based tests for `create_campaign` validation invariants.
//!
//! Uses `proptest` to verify that valid inputs across accepted ranges always
//! succeed with `Ok(id)`, and that mutating one dimension at a time outside
//! valid ranges maps precisely to its corresponding `ContractError`.

use proptest::prelude::*;
use soroban_sdk::{
    symbol_short, testutils::Address as _, token, Address, Env, String, Symbol, Vec,
};
use stellar_give::{ContractError, StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{set_timestamp, single_ben};

/// Minimum target amount accepted by the contract (10 XLM equivalent with 7 decimals).
const MIN_TARGET: i128 = 10_000_000;

/// Maximum campaign duration in seconds (365 days).
const MAX_DURATION: u64 = 31_536_000;

/// Sets up a fresh environment with token balances and initialized contract.
fn setup_fuzz_env() -> (
    Env,
    StellarGiveContractClient<'static>,
    Address, // creator
    Address, // beneficiary
    token::Client<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let platform_admin = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

    token_admin_client.mint(&creator, &1_000_000_000_000);

    let contract_id = env.register_contract(None, StellarGiveContract);
    let client = StellarGiveContractClient::new(&env, &contract_id);
    client.initialize(&platform_admin);

    set_timestamp(&env, 1_000);

    (env, client, creator, beneficiary, token_client)
}

/// Maps an integer index to one of the 6 allowed category symbols.
fn get_valid_category(idx: u32) -> Symbol {
    match idx % 6 {
        0 => symbol_short!("medical"),
        1 => symbol_short!("food"),
        2 => symbol_short!("shelter"),
        3 => symbol_short!("education"),
        4 => symbol_short!("relief"),
        _ => symbol_short!("other"),
    }
}

/// Maps an integer index to a disallowed category symbol.
fn get_disallowed_category(idx: u32) -> Symbol {
    match idx % 5 {
        0 => symbol_short!("invalid"),
        1 => symbol_short!("crypto"),
        2 => symbol_short!("gaming"),
        3 => symbol_short!("test"),
        _ => symbol_short!("random"),
    }
}

proptest! {
    /// 1. Valid inputs across accepted ranges must always succeed with `Ok(id)`.
    #[test]
    fn fuzz_create_campaign_valid_inputs(
        target_amount in MIN_TARGET..=1_000_000_000_000i128,
        deadline_offset in 1..=MAX_DURATION,
        title_str in "[a-zA-Z0-9 ]{1,50}",
        desc_str in "[a-zA-Z0-9 .]{0,500}",
        uri_suffix in "[a-zA-Z0-9/]{1,100}",
        category_idx in 0..6u32,
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let title = String::from_str(&env, &title_str);
        let description = String::from_str(&env, &desc_str);
        let metadata_uri = String::from_str(&env, &format!("https://{}", uri_suffix));
        let category = get_valid_category(category_idx);
        let deadline = 1_000 + deadline_offset;

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &title,
            &description,
            &metadata_uri,
            &category,
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
        );

        prop_assert!(result.is_ok(), "Valid inputs should succeed, got {:?}", result);
        let id = result.unwrap().unwrap();
        prop_assert!(id > 0, "Campaign ID should be greater than 0");
    }

    /// 2. Mutating title length (> 50) must return `InvalidTitle`.
    #[test]
    fn fuzz_title_too_long(
        title_str in "[a-zA-Z0-9]{51,100}",
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, &title_str),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
    }

    /// 3. Mutating title to be empty must return `EmptyTitle`.
    #[test]
    fn fuzz_empty_title(_dummy in 0..10u32) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, ""),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::EmptyTitle)));
    }

    /// 4. Mutating description length (> 500) must return `DescriptionTooLong`.
    #[test]
    fn fuzz_description_too_long(
        desc_str in "[a-zA-Z0-9]{501,600}",
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, &desc_str),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::DescriptionTooLong)));
    }

    /// 5. Mutating target amount (< MIN_TARGET) must return `TargetTooLow`.
    #[test]
    fn fuzz_target_too_low(
        target_amount in -10_000_000i128..MIN_TARGET,
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &target_amount,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
    }

    /// 6. Mutating deadline to be in the past or present (<= now) must return `InvalidDeadline`.
    #[test]
    fn fuzz_deadline_in_past(
        deadline in 0..=1_000u64,
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &deadline,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
    }

    /// 7. Mutating deadline duration (> MAX_DURATION) must return `InvalidDuration`.
    #[test]
    fn fuzz_deadline_too_far(
        offset in (MAX_DURATION + 1)..=(MAX_DURATION * 2),
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let deadline = 1_000 + offset;
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &deadline,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidDuration)));
    }

    /// 8a. Mutating metadata URI scheme (not https:// or ipfs://) must return `InvalidMetadataUri`.
    #[test]
    fn fuzz_bad_metadata_scheme(
        scheme in "(http|ftp|s3|invalid)",
        suffix in "[a-zA-Z0-9/]{1,50}",
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let uri = format!("{}://{}", scheme, suffix);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, &uri),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidMetadataUri)));
    }

    /// 8b. Mutating metadata URI length (> 256) must return `MetadataUriTooLong`.
    #[test]
    fn fuzz_metadata_uri_too_long(
        suffix in "[a-zA-Z0-9]{250,300}",
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);

        let uri = format!("https://{}", suffix);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, &uri),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::MetadataUriTooLong)));
    }

    /// 9. Mutating category symbol to an unallowlisted value must return `InvalidCategory`.
    #[test]
    fn fuzz_disallowed_category(
        cat_idx in 0..5u32,
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let bens = single_ben(&env, &beneficiary);
        let category = get_disallowed_category(cat_idx);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &category,
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidCategory)));
    }

    /// 10. Mutating beneficiary shares sum (not equal to 10000 bps) must return `InvalidShares`.
    #[test]
    fn fuzz_invalid_shares(
        share in prop_oneof![0..9_999u32, 10_001..20_000u32],
    ) {
        let (env, client, creator, beneficiary, token_client) = setup_fuzz_env();
        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), share));

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Valid title"),
            &String::from_str(&env, "Valid description"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &31_537_000_u64,
            &token_client.address,
            &None,
        );

        prop_assert_eq!(result, Err(Ok(ContractError::InvalidShares)));
    }
}
