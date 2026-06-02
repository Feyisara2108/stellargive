use soroban_sdk::symbol_short;
use soroban_sdk::String;

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};

#[test]
fn bench_get_campaigns_paged_100_campaigns() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target_amount = 1_000_000_i128;
    let deadline = 2_000_u64;

    env.budget().reset_default();

    for i in 0..100 {
        let title = String::from_str(&env, &format!("Campaign {}", i));
        let metadata = String::from_str(&env, &format!("https://example.com/meta/{}", i));

        client.create_campaign(
            &creator,
            &bens,
            &title,
            &metadata,
            &symbol_short!("relief"),
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
        );
    }

    let budget_before = env.budget().clone();

    let campaigns = client.get_campaigns_paged(&0, &10);

    let budget_after = env.budget().clone();

    let cpu_used = budget_after
        .cpu_instruction_cost()
        .saturating_sub(budget_before.cpu_instruction_cost());
    let mem_used = budget_after
        .memory_bytes_used()
        .saturating_sub(budget_before.memory_bytes_used());

    println!("CPU instructions used: {}", cpu_used);
    println!("Memory bytes used: {}", mem_used);
    println!("Campaigns returned: {}", campaigns.len());

    assert_eq!(campaigns.len(), 10);
    assert!(cpu_used < 5_000_000, "CPU usage exceeded limit: {}", cpu_used);
}

#[test]
fn bench_get_campaigns_paged_with_limit_20() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target_amount = 1_000_000_i128;
    let deadline = 2_000_u64;

    for i in 0..100 {
        let title = String::from_str(&env, &format!("Campaign {}", i));
        let metadata = String::from_str(&env, &format!("https://example.com/meta/{}", i));

        client.create_campaign(
            &creator,
            &bens,
            &title,
            &metadata,
            &symbol_short!("relief"),
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
        );
    }

    env.budget().reset_default();
    let budget_before = env.budget().clone();

    let campaigns = client.get_campaigns_paged(&0, &20);

    let budget_after = env.budget().clone();

    let cpu_used = budget_after
        .cpu_instruction_cost()
        .saturating_sub(budget_before.cpu_instruction_cost());
    let mem_used = budget_after
        .memory_bytes_used()
        .saturating_sub(budget_before.memory_bytes_used());

    println!(
        "CPU instructions for 20-item query: {}",
        cpu_used
    );
    println!("Memory bytes used: {}", mem_used);
    println!("Campaigns returned: {}", campaigns.len());

    assert_eq!(campaigns.len(), 20);
    assert!(
        cpu_used < 8_000_000,
        "CPU usage exceeded limit for 20-item query: {}",
        cpu_used
    );
}

#[test]
fn bench_get_campaigns_by_id_batch() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target_amount = 1_000_000_i128;
    let deadline = 2_000_u64;

    let mut campaign_ids = Vec::new(&env);

    for i in 0..50 {
        let title = String::from_str(&env, &format!("Campaign {}", i));
        let metadata = String::from_str(&env, &format!("https://example.com/meta/{}", i));

        let id = client.create_campaign(
            &creator,
            &bens,
            &title,
            &metadata,
            &symbol_short!("relief"),
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
        );

        campaign_ids.push_back(id);
    }

    env.budget().reset_default();
    let budget_before = env.budget().clone();

    let campaigns = client.get_campaigns(&campaign_ids);

    let budget_after = env.budget().clone();

    let cpu_used = budget_after
        .cpu_instruction_cost()
        .saturating_sub(budget_before.cpu_instruction_cost());
    let mem_used = budget_after
        .memory_bytes_used()
        .saturating_sub(budget_before.memory_bytes_used());

    println!("CPU instructions for batch query of 50 campaigns: {}", cpu_used);
    println!("Memory bytes used: {}", mem_used);

    assert!(campaigns.is_ok());
    assert_eq!(campaigns.unwrap().len(), 50);
    assert!(
        cpu_used < 10_000_000,
        "CPU usage exceeded limit for batch query: {}",
        cpu_used
    );
}

#[test]
fn bench_get_campaigns_by_creator() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let bens = single_ben(&env, &beneficiary);
    let target_amount = 1_000_000_i128;
    let deadline = 2_000_u64;

    for i in 0..50 {
        let title = String::from_str(&env, &format!("Campaign {}", i));
        let metadata = String::from_str(&env, &format!("https://example.com/meta/{}", i));

        client.create_campaign(
            &creator,
            &bens,
            &title,
            &metadata,
            &symbol_short!("relief"),
            &target_amount,
            &deadline,
            &token_client.address,
            &None,
        );
    }

    env.budget().reset_default();
    let budget_before = env.budget().clone();

    let campaigns = client.get_campaigns_by_creator(&creator);

    let budget_after = env.budget().clone();

    let cpu_used = budget_after
        .cpu_instruction_cost()
        .saturating_sub(budget_before.cpu_instruction_cost());
    let mem_used = budget_after
        .memory_bytes_used()
        .saturating_sub(budget_before.memory_bytes_used());

    println!(
        "CPU instructions for get_campaigns_by_creator (50 campaigns): {}",
        cpu_used
    );
    println!("Memory bytes used: {}", mem_used);
    println!("Campaigns returned: {}", campaigns.len());

    assert_eq!(campaigns.len(), 50);
    assert!(
        cpu_used < 15_000_000,
        "CPU usage exceeded limit for creator query: {}",
        cpu_used
    );
}
