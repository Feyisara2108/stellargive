use soroban_sdk::{symbol_short, String};

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};
use stellar_give::CampaignStatus;

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

#[test]
fn test_claim_single_donation_exact_amount() {
    let (env, client, creator, beneficiary, donor, admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let donation_amount = to_stroops("10.5");
    let platform_fee_bps = 100;

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Test Campaign"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("5"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    client.donate(
        &donor,
        &campaign_id,
        &donation_amount,
        &false,
        &None,
    );

    set_timestamp(&env, 2_001);

    client.claim_funds(&campaign_id);

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
    let (env, client, creator, beneficiary, donor, admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Multi Donation Campaign"),
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

    client.claim_funds(&campaign_id);

    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let expected_fee = (total_donated * 100) / 10_000;
    let expected_beneficiary_amount = total_donated - expected_fee;

    assert_eq!(
        balance_increase, expected_beneficiary_amount,
        "Beneficiary should receive exact total after fee deduction"
    );

    assert_eq!(
        total_donated, balance_increase + expected_fee,
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
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("1"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    let donation_amount = to_stroops("3.33");
    client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

    set_timestamp(&env, 2_001);

    client.claim_funds(&campaign_id);

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
fn test_claim_zero_fee_for_small_amounts() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Small Amount Campaign"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &to_stroops("0.01"),
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    let small_donation = 100i128;
    client.donate(&donor, &campaign_id, &small_donation, &false, &None);

    set_timestamp(&env, 2_001);

    client.claim_funds(&campaign_id);

    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let fee = (small_donation * 100) / 10_000;
    assert_eq!(
        balance_increase,
        small_donation - fee,
        "Small amounts should still be distributed correctly"
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
    client.donate(&donor, &campaign_id, &donation_amount, &false, &None);

    set_timestamp(&env, 2_001);

    client.claim_funds(&campaign_id);

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
fn test_claim_stroop_level_precision() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);

    let campaign_id = client.create_campaign(
        &creator,
        &bens,
        &String::from_str(&env, "Precision Test Campaign"),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &1i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let initial_beneficiary_balance = token_client.balance(&beneficiary);

    let single_stroop = 1i128;
    client.donate(&donor, &campaign_id, &single_stroop, &false, &None);

    set_timestamp(&env, 2_001);

    client.claim_funds(&campaign_id);

    let final_beneficiary_balance = token_client.balance(&beneficiary);
    let balance_increase = final_beneficiary_balance - initial_beneficiary_balance;

    let fee = (single_stroop * 100) / 10_000;
    let expected = single_stroop - fee;

    assert_eq!(
        balance_increase, expected,
        "Single stroop donation should not be lost to rounding"
    );
}
