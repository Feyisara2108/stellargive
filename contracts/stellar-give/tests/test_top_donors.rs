//! Tests for the top-5 donor leaderboard (#522): descending sort order,
//! eviction of the smallest entry, repeat-donor accumulation without
//! duplicate entries, promotion of a previously evicted donor back into the
//! window, and anonymous-donor sentinel attribution.

use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env, String};
use stellar_give::StellarGiveContractClient;

mod helpers;
use helpers::{register_and_setup, set_timestamp, single_ben};

/// Sentinel address anonymous donations are attributed to (see `donate` in
/// `src/lib.rs`).
const ANONYMOUS_SENTINEL: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/// Target far above any donation total used in these tests so donations
/// never trigger auto-claim settlement, keeping the campaign Active
/// throughout.
const HIGH_TARGET: i128 = 1_000_000_000_000;

fn create_leaderboard_campaign(
    env: &Env,
    client: &StellarGiveContractClient<'static>,
    creator: &Address,
    beneficiary: &Address,
    token_address: &Address,
) -> u64 {
    let bens = single_ben(env, beneficiary);
    client.create_campaign(
        creator,
        &bens,
        &String::from_str(env, "Leaderboard Campaign"),
        &String::from_str(env, "A test campaign description."),
        &String::from_str(env, "https://example.com/meta"),
        &symbol_short!("relief"),
        &HIGH_TARGET,
        &2_000_u64,
        token_address,
        &None,
    )
}

#[test]
fn test_top5_sorted_descending_and_evicts_smallest() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_leaderboard_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    let donors: Vec<Address> = (0..6).map(|_| Address::generate(&env)).collect();
    let amounts: [i128; 6] = [
        1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000,
    ];

    for (donor, &amount) in donors.iter().zip(amounts.iter()) {
        token_admin_client.mint(donor, &amount);
        client.donate(donor, &campaign_id, &amount, &false, &None);
    }

    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 5, "leaderboard must cap at exactly 5 entries");

    let expected_order = [
        (donors[5].clone(), 6_000_000_i128),
        (donors[4].clone(), 5_000_000_i128),
        (donors[3].clone(), 4_000_000_i128),
        (donors[2].clone(), 3_000_000_i128),
        (donors[1].clone(), 2_000_000_i128),
    ];
    for (i, expected) in expected_order.iter().enumerate() {
        assert_eq!(
            top.get(i as u32).unwrap(),
            *expected,
            "entry {} mismatch in descending order",
            i
        );
    }

    for i in 0..top.len() {
        assert_ne!(
            top.get(i).unwrap().0,
            donors[0],
            "smallest donor (1_000_000) must have been evicted"
        );
    }
}

#[test]
fn test_repeat_donor_accumulates_without_duplicate_entries() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_leaderboard_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    let donors: Vec<Address> = (0..6).map(|_| Address::generate(&env)).collect();
    let amounts: [i128; 6] = [
        1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000,
    ];
    for (donor, &amount) in donors.iter().zip(amounts.iter()) {
        token_admin_client.mint(donor, &(amount * 10));
        client.donate(donor, &campaign_id, &amount, &false, &None);
    }
    // Top5 (descending) is now: donors[5]=6M, donors[4]=5M, donors[3]=4M,
    // donors[2]=3M, donors[1]=2M. donors[0]=1M was evicted.

    // donors[2] (currently 3M, rank 4) donates again, pushing its cumulative
    // total to 13M and making it the new #1.
    let top_up = 10_000_000_i128;
    client.donate(&donors[2], &campaign_id, &top_up, &false, &None);

    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 5);

    let mut occurrences = 0u32;
    for i in 0..top.len() {
        if top.get(i).unwrap().0 == donors[2] {
            occurrences += 1;
        }
    }
    assert_eq!(
        occurrences, 1,
        "repeat donor must not produce duplicate leaderboard entries"
    );

    let (top_addr, top_amount) = top.get(0).unwrap();
    assert_eq!(top_addr, donors[2], "accumulated donor must move to rank 1");
    assert_eq!(
        top_amount,
        3_000_000 + top_up,
        "cumulative total must be prior contribution plus the new donation"
    );

    let expected_rest = [
        (donors[5].clone(), 6_000_000_i128),
        (donors[4].clone(), 5_000_000_i128),
        (donors[3].clone(), 4_000_000_i128),
        (donors[1].clone(), 2_000_000_i128),
    ];
    for (i, expected) in expected_rest.iter().enumerate() {
        assert_eq!(
            top.get((i + 1) as u32).unwrap(),
            *expected,
            "entry {} mismatch after reorder",
            i + 1
        );
    }
}

#[test]
fn test_evicted_donor_can_be_promoted_back_into_window() {
    let (env, client, creator, beneficiary, _donor, _admin, token_client, token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_leaderboard_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    let donors: Vec<Address> = (0..6).map(|_| Address::generate(&env)).collect();
    let amounts: [i128; 6] = [
        1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000,
    ];
    for (donor, &amount) in donors.iter().zip(amounts.iter()) {
        token_admin_client.mint(donor, &(amount * 10));
        client.donate(donor, &campaign_id, &amount, &false, &None);
    }

    let top_before = client.get_top_donors(&campaign_id);
    for i in 0..top_before.len() {
        assert_ne!(
            top_before.get(i).unwrap().0,
            donors[0],
            "donors[0] must have been evicted before the comeback donation"
        );
    }

    // donors[0] donates again with an amount large enough to re-enter the
    // window at rank 1, evicting the current smallest (donors[1] at 2M).
    let comeback_amount = 7_000_000_i128;
    client.donate(&donors[0], &campaign_id, &comeback_amount, &false, &None);

    let top_after = client.get_top_donors(&campaign_id);
    assert_eq!(top_after.len(), 5);

    let mut occurrences = 0u32;
    for i in 0..top_after.len() {
        if top_after.get(i).unwrap().0 == donors[0] {
            occurrences += 1;
        }
    }
    assert_eq!(
        occurrences, 1,
        "promoted donor must appear exactly once in the leaderboard"
    );

    let (top_addr, top_amount) = top_after.get(0).unwrap();
    assert_eq!(
        top_addr, donors[0],
        "donor with the largest new donation must take rank 1"
    );
    // donors[0]'s prior top-5 entry was evicted, so its leaderboard total is
    // only tracked from re-entry: the window does not retain history for
    // donors outside it.
    assert_eq!(top_amount, comeback_amount);

    for i in 0..top_after.len() {
        assert_ne!(
            top_after.get(i).unwrap().0,
            donors[1],
            "new smallest entry (donors[1] at 2M) must be evicted to make room"
        );
    }
}

#[test]
fn test_anonymous_donation_attributed_to_sentinel_not_real_donor() {
    let (env, client, creator, beneficiary, donor, _admin, token_client, _token_admin_client) =
        register_and_setup();
    set_timestamp(&env, 1_000);

    let campaign_id =
        create_leaderboard_campaign(&env, &client, &creator, &beneficiary, &token_client.address);

    let amount = 5_000_000_i128;
    client.donate(&donor, &campaign_id, &amount, &true, &None);

    let top = client.get_top_donors(&campaign_id);
    assert_eq!(top.len(), 1);

    let sentinel = Address::from_string(&String::from_str(&env, ANONYMOUS_SENTINEL));
    let (addr, recorded_amount) = top.get(0).unwrap();
    assert_eq!(
        addr, sentinel,
        "anonymous donation must be attributed to the sentinel address"
    );
    assert_eq!(recorded_amount, amount);
    assert_ne!(
        addr, donor,
        "the real donor address must not appear on the leaderboard"
    );
}
