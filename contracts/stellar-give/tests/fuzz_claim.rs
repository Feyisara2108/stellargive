#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, String};
use stellar_give::{ContractError, StellarGiveContractClient};

mod helpers;
use helpers::{register_and_setup_without_auth_mock, set_timestamp, single_ben};

fn calculate_platform_fee(amount: i128) -> i128 {
    let fee_bps: i128 = 100;
    let fee_denominator: i128 = 10000;
    let scaled = amount.checked_mul(fee_bps).unwrap();
    let biased = scaled.checked_add(fee_denominator / 2).unwrap();
    biased / fee_denominator
}

proptest! {
    #[test]
    fn test_fuzz_claim_funds(
        donations in prop::collection::vec(1_000_000i128..10_000_000_000i128, 1..20),
    ) {
        let (
            env,
            client,
            creator,
            beneficiary,
            _donor,
            platform_admin,
            token_client,
            token_admin_client,
        ) = register_and_setup_without_auth_mock();

        let deadline = 2000;
        let target_amount = 10_000_000_000_i128; // High enough or not, we will pass deadline

        set_timestamp(&env, 1000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.mock_all_auths().create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &String::from_str(&env, "U"),
            &soroban_sdk::symbol_short!("relief"),
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
            &None,
        );

        let mut total_donated: i128 = 0;
        
        // Donate
        for amount in donations {
            let donor = Address::generate(&env);
            token_admin_client.mock_all_auths().mint(&donor, &amount);
            
            client.mock_all_auths().donate(&donor, &campaign_id, &amount, &false);
            total_donated += amount;
        }

        // Pass deadline
        set_timestamp(&env, 2001);

        let pre_platform_balance = token_client.balance(&platform_admin);
        let pre_ben_balance = token_client.balance(&beneficiary);
        
        let expected_fee = calculate_platform_fee(total_donated);
        let expected_net = total_donated - expected_fee;

        // Claim
        let claimed = client.mock_all_auths().claim_funds(&beneficiary, &campaign_id);
        
        assert_eq!(claimed, total_donated);
        assert!(expected_net <= total_donated - expected_fee);
        
        let post_platform_balance = token_client.balance(&platform_admin);
        let post_ben_balance = token_client.balance(&beneficiary);

        // Value conservation
        assert_eq!(post_platform_balance - pre_platform_balance, expected_fee);
        assert_eq!(post_ben_balance - pre_ben_balance, expected_net);

        // Claim again
        let res = client.mock_all_auths().try_claim_funds(&beneficiary, &campaign_id);
        assert_eq!(res.unwrap_err().unwrap(), ContractError::AlreadyClaimed);
    }
}
