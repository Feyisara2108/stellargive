use proptest::collection::vec as proptest_vec;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, String};

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};

fn to_stroops(amount: &str) -> i128 {
    let parts: Vec<&str> = amount.split('.').collect();
    let whole = parts[0].parse::<i128>().unwrap_or(0);
    let frac = if parts.len() > 1 {
        parts[1].parse::<i128>().unwrap_or(0)
    } else {
        0
    };

    (whole * 10_000_000) + (frac * 100_000)
}

fn normalized_shares(raw_shares: Vec<u32>) -> Vec<u32> {
    let sum: u32 = raw_shares.iter().sum();
    let mut scaled: Vec<u32> = raw_shares
        .into_iter()
        .map(|share| {
            let scaled_share = (share as u64 * 10_000 / sum as u64) as u32;
            std::cmp::max(1, scaled_share)
        })
        .collect();
    let mut current_sum: i32 = scaled.iter().map(|&share| share as i32).sum();
    let mut index = 0;
    while current_sum < 10_000 {
        scaled[index] += 1;
        current_sum += 1;
        index = (index + 1) % scaled.len();
    }
    while current_sum > 10_000 {
        if scaled[index] > 1 {
            scaled[index] -= 1;
            current_sum -= 1;
        }
        index = (index + 1) % scaled.len();
    }
    scaled
}

fn build_beneficiaries(
    env: &soroban_sdk::Env,
    shares: &[u32],
) -> (
    soroban_sdk::Vec<(soroban_sdk::Address, u32)>,
    Vec<soroban_sdk::Address>,
) {
    let mut beneficiaries = soroban_sdk::Vec::new(env);
    let mut addresses = Vec::new();
    for &share in shares {
        let address = soroban_sdk::Address::generate(env);
        beneficiaries.push_back((address.clone(), share));
        addresses.push(address);
    }
    (beneficiaries, addresses)
}

fn valid_split_shares() -> impl Strategy<Value = Vec<u32>> {
    (1usize..=5).prop_flat_map(|len| {
        proptest_vec(1u32..10_000, len).prop_map(|raw_shares| normalized_shares(raw_shares))
    })
}

proptest! {
    #[test]
    fn test_multi_beneficiary_split_rounding(
        total in 1_000_000_i128..=100_000_000_i128,
        shares in valid_split_shares()
    ) {
        let (env, client, creator, _beneficiary, donor, _admin, token_client, _token_admin_client) =
            register_and_setup();
        set_timestamp(&env, 1_000);

        let (bens, beneficiary_addresses) = build_beneficiaries(&env, &shares);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Split Rounding Campaign"),
            &String::from_str(&env, "Property test for split rounding."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &to_stroops("1"),
            &2_000_u64,
            &token_client.address,
            &None,
        );

        let initial_balances: Vec<i128> = beneficiary_addresses
            .iter()
            .map(|address| token_client.balance(address))
            .collect();

        client.donate(&donor, &campaign_id, &total, &false, &None);

        let final_balances: Vec<i128> = beneficiary_addresses
            .iter()
            .map(|address| token_client.balance(address))
            .collect();

        let payouts: Vec<i128> = initial_balances
            .iter()
            .zip(final_balances.iter())
            .map(|(initial, final_balance)| final_balance - initial)
            .collect();

        let fee = (total * 100 + 5_000) / 10_000;
        let net = total - fee;
        let expected_other_sum: i128 = shares
            .iter()
            .skip(1)
            .map(|&share| net * (share as i128) / 10_000)
            .sum();
        let expected_first = net - expected_other_sum;

        assert_eq!(payouts[0], expected_first, "First beneficiary absorbs rounding dust");
        for (paid, &share) in payouts.iter().skip(1).zip(shares.iter().skip(1)) {
            assert_eq!(*paid, net * (share as i128) / 10_000);
        }

        assert_eq!(
            payouts.iter().sum::<i128>() + fee,
            total,
            "Sum of beneficiary payouts plus fee must equal donated total"
        );
    }
}

#[test]
fn test_claim_single_donation_exact_amount() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let donation_amount = to_stroops("10.5");
    let platform_fee_bps = 100;

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Test Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("5"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

    // The donation exceeds the target, so funds auto-claim within donate().
    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let expected_fee = (donation_amount * platform_fee_bps) / 10_000;
    let expected_beneficiary_amount = donation_amount - expected_fee;

    assert_eq!(
        balance_increase, expected_beneficiary_amount,
        "Beneficiary should receive exact amount after fee"
    );
}

#[test]
fn test_claim_multiple_donations_exact_total() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Multi Donation Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("20"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    let donations = vec![to_stroops("10.5"), to_stroops("5"), to_stroops("2.25")];
    let mut total_donated = 0i128;

    for donation in &donations {
        client.donate(&donor, &campaign_id, donation, &false, &None);
        total_donated += donation;
    }

    set_timestamp(&env, 2_001);

    client.claim_funds(&beneficiary, &campaign_id);

    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let expected_fee = (total_donated * 100) / 10_000;
    let expected_beneficiary_amount = total_donated - expected_fee;

    assert_eq!(
        balance_increase, expected_beneficiary_amount,
        "Beneficiary should receive exact total after fee deduction"
    );

    assert_eq!(
        total_donated,
        balance_increase + expected_fee,
        "Total donated should equal beneficiary amount plus fee"
    );
}

#[test]
fn test_claim_with_rounding_dust_handling() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Rounding Test Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("1"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    let donation_amount = to_stroops("3.33");
    // The donation exceeds the target, so funds auto-claim within donate().
    client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let expected_fee = (donation_amount * 100) / 10_000;
    let expected_beneficiary_amount = donation_amount - expected_fee;

    assert_eq!(
        balance_increase, expected_beneficiary_amount,
        "Rounding dust should be absorbed by beneficiary correctly"
    );
}

#[test]
fn test_claim_fee_accuracy_at_minimum_donation() {
    // The smallest donation the contract accepts is MIN_DONATION (1 token).
    // Sub-minimum "small amounts" are rejected outright, so this verifies the
    // fee is computed exactly at that lower bound.
    let (env, client, creator, beneficiary, donor, admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Minimum Donation Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("5"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);
    let initial_admin_balance = token_client.balance(&admin);

    // MIN_DONATION = 1 token, below the 5-token target so the campaign stays
    // Active and is settled by an explicit claim after the deadline.
    let min_donation = 1_000_000i128;
    client.donate(&donor, &campaign_id, &min_donation, &false, &None);

    set_timestamp(&env, 2_001);
    client.claim_funds(&beneficiary, &campaign_id);

    let beneficiary_increase = token_client.balance(&beneficiary) - initial_beneficiary_balance;
    let admin_increase = token_client.balance(&admin) - initial_admin_balance;

    // Fee uses round-half-up: (amount * 100 + 5000) / 10_000.
    let expected_fee = (min_donation * 100 + 5_000) / 10_000;
    assert_eq!(admin_increase, expected_fee, "fee must match round-half-up");
    assert_eq!(
        beneficiary_increase,
        min_donation - expected_fee,
        "beneficiary receives the donation net of the exact fee"
    );
    assert_eq!(
        beneficiary_increase + admin_increase,
        min_donation,
        "no stroops are lost: net + fee equals gross"
    );
}

#[test]
fn test_claim_with_multiple_beneficiaries_exact_split() {
    let (env, client, creator, beneficiary1, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let beneficiary2 = soroban_sdk::Address::generate(&env);

    let mut bens = soroban_sdk::Vec::new(&env);
    bens.push_back((beneficiary1.clone(), 5_000_u32));
    bens.push_back((beneficiary2.clone(), 5_000_u32));

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Multi Beneficiary Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("10"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_b1_balance = token_client.balance(&beneficiary1);
    let initial_b2_balance = token_client.balance(&beneficiary2);

    let donation_amount = to_stroops("20");
    // The donation exceeds the target, so funds auto-claim within donate().
    client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

    let final_b1_balance = token_client.balance(&beneficiary1);
    let final_b2_balance = token_client.balance(&beneficiary2);

    let b1_increase = final_b1_balance - initial_b1_balance;
    let b2_increase = final_b2_balance - initial_b2_balance;

    let platform_fee = (donation_amount * 100) / 10_000;
    let net_proceeds = donation_amount - platform_fee;

    let expected_per_beneficiary = net_proceeds / 2;

    assert_eq!(
        b1_increase + b2_increase,
        net_proceeds,
        "Sum of beneficiary payouts should equal net proceeds"
    );

    assert_eq!(
        b1_increase, expected_per_beneficiary,
        "First beneficiary should receive exact 50% split"
    );
    assert_eq!(
        b2_increase, expected_per_beneficiary,
        "Second beneficiary should receive exact 50% split"
    );
}

#[test]
fn test_claim_preserves_every_stroop_across_fee() {
    // The 1-stroop scenario this once exercised is impossible now (MIN_DONATION
    // and MIN_TARGET forbid sub-minimum values), so this instead verifies that
    // an awkward, valid amount is split between beneficiary and fee with no
    // stroop lost to rounding.
    let (env, client, creator, beneficiary, donor, admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Precision Test Campaign"),
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("5"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);
    let initial_admin_balance = token_client.balance(&admin);

    // An amount that does not divide evenly by the fee basis, kept below target.
    let donation = 1_234_567i128;
    client.donate(&donor, &campaign_id, &donation, &false, &None);

    set_timestamp(&env, 2_001);
    client.claim_funds(&beneficiary, &campaign_id);

    let beneficiary_increase = token_client.balance(&beneficiary) - initial_beneficiary_balance;
    let admin_increase = token_client.balance(&admin) - initial_admin_balance;

    assert_eq!(
        beneficiary_increase + admin_increase,
        donation,
        "every stroop is accounted for: net + fee equals gross"
    );
}
