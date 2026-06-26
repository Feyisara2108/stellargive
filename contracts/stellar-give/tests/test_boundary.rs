use soroban_sdk::{symbol_short, String};

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};
use stellar_give::ContractError;

#[test]
fn test_long_title_rejected() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    // Create a title with 10,000 characters
    extern crate std;
    let mut long_title_raw = std::string::String::new();
    for _ in 0..10_000 {
        long_title_raw.push('A');
    }
    let long_title = String::from_str(&env, &long_title_raw);

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &long_title,
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
}

#[test]
fn test_gas_cost_max_title() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    // Max allowed title length is 50
    let title_50 = String::from_str(&env, "12345678901234567890123456789012345678901234567890");

    env.budget().reset_default();
    let before_cpu = env.budget().cpu_instruction_cost();
    let before_mem = env.budget().memory_bytes_cost();

    let result = client.try_create_campaign(
        &creator,
        &bens,
        &title_50,
        &String::from_str(&env, "A test campaign description."),
        &String::from_str(&env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &10_000_000_i128,
        &2_000_u64,
        &token_client.address,
        &None,
    );

    let after_cpu = env.budget().cpu_instruction_cost();
    let after_mem = env.budget().memory_bytes_cost();

    assert!(result.is_ok());

    // Print results for documentation (will be visible in test output with --nocapture)
    extern crate std;
    std::println!(
        "Gas for max title (50 chars): CPU: {}, MEM: {}",
        after_cpu - before_cpu,
        after_mem - before_mem
    );
}

#[test]
fn test_unicode_title_edge_cases() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    let test_cases = [
        ("🎉 Campaign 🚀", "Emoji title"),
        ("مهمة إغاثة", "Arabic (RTL) title"),
        ("Camp\u{200B}aign", "Zero-width space"),
        ("汉语 Campaign", "Chinese and Latin"),
    ];

    for (raw_title, description) in test_cases {
        let title = String::from_str(&env, raw_title);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &title,
            &String::from_str(&env, "A test campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000_i128,
            &2_000_u64,
            &token_client.address,
            &None,
        );

        assert!(result.is_ok(), "Failed for {}: {}", description, raw_title);
    }
}

#[test]
fn test_get_campaigns_paged_boundaries() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);
    let bens = single_ben(&env, &beneficiary);

    // Create 5 campaigns to test boundary offsets and limits
    for i in 1..=5 {
        extern crate std;
        let title_raw = std::format!("Campaign {}", i);
        let title = String::from_str(&env, &title_raw);
        client.create_campaign(
            &creator,
            &bens,
            &title,
            &String::from_str(&env, "A test campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000_i128,
            &2_000_u64,
            &token_client.address,
            &None,
        );
    }

    // 1. Test offset 0, limit 2 (first page, in-range)
    let page_1 = client.get_campaigns_paged(&0_u64, &2_u32);
    assert_eq!(page_1.len(), 2);
    assert_eq!(page_1.get(0).unwrap().id, 1);
    assert_eq!(page_1.get(0).unwrap().title, String::from_str(&env, "Campaign 1"));
    assert_eq!(page_1.get(1).unwrap().id, 2);
    assert_eq!(page_1.get(1).unwrap().title, String::from_str(&env, "Campaign 2"));

    // 2. Test in-range page (offset 2, limit 2)
    let page_2 = client.get_campaigns_paged(&2_u64, &2_u32);
    assert_eq!(page_2.len(), 2);
    assert_eq!(page_2.get(0).unwrap().id, 3);
    assert_eq!(page_2.get(0).unwrap().title, String::from_str(&env, "Campaign 3"));
    assert_eq!(page_2.get(1).unwrap().id, 4);
    assert_eq!(page_2.get(1).unwrap().title, String::from_str(&env, "Campaign 4"));

    // 3. Test partial final page (offset 4, limit 2)
    let page_3 = client.get_campaigns_paged(&4_u64, &2_u32);
    assert_eq!(page_3.len(), 1);
    assert_eq!(page_3.get(0).unwrap().id, 5);
    assert_eq!(page_3.get(0).unwrap().title, String::from_str(&env, "Campaign 5"));

    // 4. Test offset past the end (offset 5, limit 2) -> empty result, not an error
    let page_past = client.get_campaigns_paged(&5_u64, &2_u32);
    assert_eq!(page_past.len(), 0);

    // 5. Test offset way past the end (offset 100, limit 2) -> empty result, not an error
    let page_way_past = client.get_campaigns_paged(&100_u64, &2_u32);
    assert_eq!(page_way_past.len(), 0);

    // 6. Test limit edge value: 1 (offset 0, limit 1)
    let page_limit_1 = client.get_campaigns_paged(&0_u64, &1_u32);
    assert_eq!(page_limit_1.len(), 1);
    assert_eq!(page_limit_1.get(0).unwrap().id, 1);

    // 7. Test limit edge value: large limit (offset 0, limit 50) -> clamps to 20, returns all 5
    let page_large_limit = client.get_campaigns_paged(&0_u64, &50_u32);
    assert_eq!(page_large_limit.len(), 5);
    for i in 0..5 {
        assert_eq!(page_large_limit.get(i).unwrap().id, (i as u64) + 1);
    }

    // 8. Assert stable ordering: ascending by ID
    let all_campaigns = client.get_campaigns_paged(&0_u64, &20_u32);
    assert_eq!(all_campaigns.len(), 5);
    for i in 0..4 {
        assert!(all_campaigns.get(i).unwrap().id < all_campaigns.get(i + 1).unwrap().id);
    }
}

