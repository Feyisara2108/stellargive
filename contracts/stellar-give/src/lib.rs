#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Symbol, Vec,
};

#[contract]
pub struct StellarGiveContract;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum CampaignStatus {
    Active,
    Funded,
    Claimed,
    Expired,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct CreatedEvent {
    pub id: u64,
    pub creator: Address,
    pub target_amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub beneficiaries: Vec<(Address, u32)>,
    pub title: String,
    pub target_amount: i128,
    pub raised_amount: i128,
    pub deadline: u64,
    pub accepted_token: Address,
    pub status: CampaignStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracterror]
#[repr(u32)]
pub enum ContractError {
    Unauthorized = 1,
    InvalidDeadline = 2,
    InvalidAmount = 3,
    CampaignNotFound = 4,
    InvalidToken = 5,
    CampaignNotActive = 6,
    ClaimNotAllowed = 7,
    AlreadyClaimed = 8,
    ReentrancyDetected = 9,
    EmptyTitle = 10,
    NothingToClaim = 11,
    InvalidShares = 12,
}

fn next_id_key() -> Symbol {
    symbol_short!("NEXT")
}

fn lock_key() -> Symbol {
    symbol_short!("LOCK")
}

fn campaign_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("CMP"), id)
}

fn read_next_id(env: &Env) -> u64 {
    // Instance storage is cheaper per access than Persistent and its lifetime
    // is managed with the contract instance, so no manual TTL extension needed.
    env.storage()
        .instance()
        .get(&next_id_key())
        .unwrap_or(1_u64)
}

fn write_next_id(env: &Env, next_id: u64) {
    env.storage().instance().set(&next_id_key(), &next_id);
}

fn read_campaign(env: &Env, id: u64) -> Result<Campaign, ContractError> {
    env.storage()
        .persistent()
        .get(&campaign_key(id))
        .ok_or(ContractError::CampaignNotFound)
}

fn write_campaign(env: &Env, campaign: &Campaign) {
    env.storage()
        .persistent()
        .set(&campaign_key(campaign.id), campaign);
}

fn top_donors_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("TDON"), id)
}

fn read_top_donors(env: &Env, id: u64) -> Vec<(Address, i128)> {
    env.storage()
        .persistent()
        .get(&top_donors_key(id))
        .unwrap_or_else(|| Vec::new(env))
}

fn write_top_donors(env: &Env, id: u64, donors: &Vec<(Address, i128)>) {
    env.storage()
        .persistent()
        .set(&top_donors_key(id), donors);
}

fn update_top_donors(env: &Env, campaign_id: u64, donor: &Address, amount: i128) {
    let old = read_top_donors(env, campaign_id);
    let mut new_donors: Vec<(Address, i128)> = Vec::new(env);

    // Carry over all existing entries except the current donor; accumulate their total.
    let mut cumulative = amount;
    for (addr, prev) in old.iter() {
        if addr == *donor {
            cumulative = prev.saturating_add(amount);
        } else {
            new_donors.push_back((addr, prev));
        }
    }

    // Find sorted insertion position (descending). Insertion sort is O(5) — constant cost.
    let mut pos = new_donors.len();
    for i in 0..new_donors.len() {
        if new_donors.get(i).unwrap().1 < cumulative {
            pos = i;
            break;
        }
    }

    // Only write when donor enters the top-5 window.
    if pos < 5 {
        new_donors.insert(pos, (donor.clone(), cumulative));
        while new_donors.len() > 5 {
            new_donors.pop_back();
        }
        write_top_donors(env, campaign_id, &new_donors);
    }
}

fn enter_lock(env: &Env) -> Result<(), ContractError> {
    let key = lock_key();
    if env.storage().temporary().get::<_, bool>(&key).unwrap_or(false) {
        return Err(ContractError::ReentrancyDetected);
    }
    env.storage().temporary().set(&key, &true);
    Ok(())
}

/// Releases the reentrancy lock unconditionally.  Called on every exit path
/// (success and failure) to guarantee the lock is not left held.
fn exit_lock(env: &Env) {
    env.storage().temporary().remove(&lock_key());
}

fn derive_status(now: u64, campaign: &Campaign) -> CampaignStatus {
    // Claimed is terminal and must not be downgraded by timestamp checks.
    if campaign.status == CampaignStatus::Claimed {
        return CampaignStatus::Claimed;
    }

    if campaign.raised_amount >= campaign.target_amount {
        return CampaignStatus::Funded;
    }

    if now > campaign.deadline {
        return CampaignStatus::Expired;
    }

    CampaignStatus::Active
}

fn sync_status(env: &Env, campaign: &mut Campaign) {
    let updated = derive_status(env.ledger().timestamp(), campaign);
    if updated != campaign.status {
        campaign.status = updated;
        write_campaign(env, campaign);
    }
}

/// Validates that `token_address` implements the Soroban Asset Contract (SEP-41)
/// interface by calling two lightweight read methods.  Returns `InvalidToken`
/// if either call fails, preventing campaigns from being created with
/// non-compliant or malicious token contracts.
fn validate_token_contract(env: &Env, token_address: &Address) -> Result<(), ContractError> {
    let client = token::TokenClient::new(env, token_address);
    // Both calls must succeed — a malicious contract that panics on either
    // will cause this to return InvalidToken.
    if client.try_decimals().is_err() {
        return Err(ContractError::InvalidToken);
    }
    if client.try_symbol().is_err() {
        return Err(ContractError::InvalidToken);
    }
    Ok(())
}

#[contractimpl]
impl StellarGiveContract {
    pub fn create_campaign(
        env: Env,
        creator: Address,
        beneficiaries: Vec<(Address, u32)>,
        title: String,
        target_amount: i128,
        deadline: u64,
        accepted_token: Address,
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if title.len() == 0 {
            return Err(ContractError::EmptyTitle);
        }
        if target_amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(ContractError::InvalidDeadline);
        }
        validate_token_contract(&env, &accepted_token)?;

        if beneficiaries.len() == 0 {
            return Err(ContractError::InvalidShares);
        }
        let mut total_bps: u64 = 0;
        for (_, share) in beneficiaries.iter() {
            total_bps += u64::from(share);
        }
        if total_bps != 10_000 {
            return Err(ContractError::InvalidShares);
        }

        let id = read_next_id(&env);
        let next_id = id.checked_add(1).ok_or(ContractError::InvalidAmount)?;
        write_next_id(&env, next_id);

        let campaign = Campaign {
            id,
            creator: creator.clone(),
            beneficiaries: beneficiaries.clone(),
            title,
            target_amount,
            raised_amount: 0,
            deadline,
            accepted_token: accepted_token.clone(),
            status: CampaignStatus::Active,
        };

        write_campaign(&env, &campaign);
        env.events().publish(
            (symbol_short!("created"),),
            CreatedEvent {
                id,
                creator: creator.clone(),
                beneficiary: beneficiary.clone(),
                title,
                target_amount,
                raised_amount: 0,
                deadline,
                accepted_token: accepted_token.clone(),
                status: CampaignStatus::Active,
            };

            write_campaign(&env, &campaign);
            env.events().publish(
                (symbol_short!("created"),),
                CreatedEvent {
                    id,
                    creator,
                    target_amount: campaign.target_amount,
                },
            );

            Ok(id)
        })();

        exit_lock(&env);
        result
    }

    pub fn donate(
        env: Env,
        donor: Address,
        campaign_id: u64,
        amount: i128,
    ) -> Result<(), ContractError> {
        donor.require_auth();
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        enter_lock(&env)?;
        let result = (|| {
            let mut campaign = read_campaign(&env, campaign_id)?;
            sync_status(&env, &mut campaign);

            if campaign.status != CampaignStatus::Active {
                return Err(ContractError::CampaignNotActive);
            }

            // Use try_transfer so a failing token contract reverts the donation
            // cleanly instead of propagating a raw panic.
            if token::TokenClient::new(&env, &campaign.accepted_token)
                .try_transfer(&donor, &env.current_contract_address(), &amount)
                .is_err()
            {
                return Err(ContractError::TokenTransferFailed);
            }

            campaign.raised_amount = campaign
                .raised_amount
                .checked_add(amount)
                .ok_or(ContractError::InvalidAmount)?;

            campaign.status = if campaign.raised_amount >= campaign.target_amount {
                CampaignStatus::Funded
            } else {
                CampaignStatus::Active
            };

            write_campaign(&env, &campaign);
            update_top_donors(&env, campaign.id, &donor, amount);
            env.events().publish(
                (symbol_short!("donation"), symbol_short!("received")),
                (
                    campaign.id,
                    donor,
                    amount,
                    campaign.raised_amount,
                    campaign.accepted_token.clone(),
                ),
            );
            Ok(())
        })();

        exit_lock(&env);
        result
    }

    pub fn claim_funds(env: Env, caller: Address, campaign_id: u64) -> Result<i128, ContractError> {
        let mut campaign = read_campaign(&env, campaign_id)?;
        sync_status(&env, &mut campaign);

        if campaign.status == CampaignStatus::Claimed {
            return Err(ContractError::AlreadyClaimed);
        }

        let is_beneficiary = campaign.beneficiaries.iter().any(|(addr, _)| addr == caller);
        if caller != campaign.creator && !is_beneficiary {
            return Err(ContractError::Unauthorized);
        }
        caller.require_auth();

        let now = env.ledger().timestamp();
        let can_claim = campaign.raised_amount >= campaign.target_amount || now > campaign.deadline;
        if !can_claim {
            return Err(ContractError::ClaimNotAllowed);
        }
        if campaign.raised_amount <= 0 {
            return Err(ContractError::NothingToClaim);
        }

        enter_lock(&env)?;
        let result = (|| {
            let total = campaign.raised_amount;
            let n = campaign.beneficiaries.len();

            // Pay each non-first beneficiary their floor-division share.
            let mut remainder = total;
            for i in 1..n {
                let (addr, share_bps) = campaign.beneficiaries.get(i).unwrap();
                let payout = (total * i128::from(share_bps)) / 10_000_i128;
                token::TokenClient::new(&env, &campaign.accepted_token).transfer(
                    &env.current_contract_address(),
                    &addr,
                    &payout,
                );
                remainder -= payout;
            }

            // First beneficiary receives remainder, absorbing any rounding dust.
            let (first_addr, _) = campaign.beneficiaries.get(0).unwrap();
            token::TokenClient::new(&env, &campaign.accepted_token).transfer(
                &env.current_contract_address(),
                &first_addr,
                &remainder,
            );

            campaign.raised_amount = 0;
            campaign.status = CampaignStatus::Claimed;
            write_campaign(&env, &campaign);

            env.events().publish(
                (symbol_short!("funds"), symbol_short!("claimed")),
                (campaign.id, caller, total, campaign.accepted_token),
            );

            Ok(total)
        })();

        exit_lock(&env);
        result
    }

    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, ContractError> {
        let mut campaign = read_campaign(&env, campaign_id)?;
        campaign.status = derive_status(env.ledger().timestamp(), &campaign);
        Ok(campaign)
    }

    pub fn get_top_donors(
        env: Env,
        campaign_id: u64,
    ) -> Result<Vec<(Address, i128)>, ContractError> {
        read_campaign(&env, campaign_id)?;
        Ok(read_top_donors(&env, campaign_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events as _, Ledger};
    use soroban_sdk::{token, Address, Env, String, TryFromVal, Vec};

    fn set_timestamp(env: &Env, timestamp: u64) {
        let mut ledger = env.ledger().get();
        ledger.timestamp = timestamp;
        env.ledger().set(ledger);
    }

    fn setup() -> (
        Env,
        StellarGiveContractClient<'static>,
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
        let token_admin = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_client = token::Client::new(&env, &token_id.address());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

        token_admin_client.mint(&donor, &1_000_000);
        token_admin_client.mint(&creator, &1_000_000);

        let contract_id = env.register_contract(None, StellarGiveContract);
        let client = StellarGiveContractClient::new(&env, &contract_id);

        (env, client, creator, beneficiary, donor, token_client, token_admin_client)
    }

    #[test]
    fn create_and_get_campaign() {
        let (env, client, creator, beneficiary, _donor, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Flood Relief"),
            &500_000,
            &2_000,
            &token_client.address,
        );

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.id, 1);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.beneficiaries, bens);
        assert_eq!(campaign.target_amount, 500_000);
        assert_eq!(campaign.raised_amount, 0);
    }

    #[test]
    fn create_campaign_emits_created_event() {
        let (env, client, creator, beneficiary, _donor, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let target_amount: i128 = 500_000;
        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Flood Relief"),
            &target_amount,
            &2_000,
            &token_client.address,
        );

        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("created"))
            })
            .expect("CreatedEvent was not emitted by create_campaign");

        let payload = CreatedEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as CreatedEvent");
        assert_eq!(payload.id, id);
        assert_eq!(payload.creator, creator);
        assert_eq!(payload.target_amount, target_amount);
    }

    #[test]
    fn donate_updates_raised_and_status() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Medical Aid"),
            &100_000,
            &10_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &40_000);
        let campaign_after_first = client.get_campaign(&campaign_id);
        assert_eq!(campaign_after_first.raised_amount, 40_000);
        assert_eq!(campaign_after_first.status, CampaignStatus::Active);

        client.donate(&donor, &campaign_id, &60_000);
        let campaign_after_second = client.get_campaign(&campaign_id);
        assert_eq!(campaign_after_second.raised_amount, 100_000);
        assert_eq!(campaign_after_second.status, CampaignStatus::Funded);
    }

    #[test]
    fn claim_when_target_met_transfers_to_beneficiary() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "School Rebuild"),
            &120_000,
            &20_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &120_000);

        let beneficiary_before = token_client.balance(&beneficiary);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let beneficiary_after = token_client.balance(&beneficiary);
        let campaign = client.get_campaign(&campaign_id);

        assert_eq!(claimed, 120_000);
        assert_eq!(beneficiary_after - beneficiary_before, 120_000);
        assert_eq!(campaign.status, CampaignStatus::Claimed);
        assert_eq!(campaign.raised_amount, 0);
    }

    #[test]
    fn claim_after_deadline_when_target_not_met() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        set_timestamp(&env, 100);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Emergency Shelter"),
            &500_000,
            &500,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &50_000);
        set_timestamp(&env, 600);

        let claimed = client.claim_funds(&beneficiary, &campaign_id);
        let campaign = client.get_campaign(&campaign_id);

        assert_eq!(claimed, 50_000);
        assert_eq!(campaign.status, CampaignStatus::Claimed);
    }

    #[test]
    fn unauthorized_claim_fails() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        set_timestamp(&env, 200);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Food Support"),
            &100_000,
            &1_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &10_000);
        set_timestamp(&env, 1_100);

        let attacker = Address::generate(&env);
        let error = client.try_claim_funds(&attacker, &campaign_id);
        assert!(error.is_err());
    }

    #[test]
    fn split_50_50_distributes_evenly() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 5_000_u32));
        bens.push_back((beneficiary2.clone(), 5_000_u32));

        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Dual Relief"),
            &200_000,
            &2_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &200_000);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);

        assert_eq!(claimed, 200_000);
        assert_eq!(b1_after - b1_before, 100_000);
        assert_eq!(b2_after - b2_before, 100_000);
        assert_eq!(client.get_campaign(&campaign_id).status, CampaignStatus::Claimed);
    }

    #[test]
    fn split_uneven_three_way_with_rounding() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        let beneficiary3 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 3_334_u32));
        bens.push_back((beneficiary2.clone(), 3_333_u32));
        bens.push_back((beneficiary3.clone(), 3_333_u32));

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Three Way"),
            &10_000,
            &5_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &10_000);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let b3_before = token_client.balance(&beneficiary3);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);
        let b3_after = token_client.balance(&beneficiary3);

        // b2 and b3: floor(10_000 * 3_333 / 10_000) = 3_333 each
        // b1 (first): 10_000 - 3_333 - 3_333 = 3_334 (absorbs rounding dust)
        assert_eq!(claimed, 10_000);
        assert_eq!(b2_after - b2_before, 3_333);
        assert_eq!(b3_after - b3_before, 3_333);
        assert_eq!(b1_after - b1_before, 3_334);
        assert_eq!(
            (b1_after - b1_before) + (b2_after - b2_before) + (b3_after - b3_before),
            10_000
        );
    }

    #[test]
    fn invalid_shares_not_summing_to_10000_rejected() {
        let (env, client, creator, beneficiary, _donor, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 5_000_u32));
        bens.push_back((beneficiary2.clone(), 4_999_u32));

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Bad Shares"),
            &100_000,
            &2_000,
            &token_client.address,
        );
        assert!(result.is_err());
    }

    #[test]
    fn id_generation_is_sequential_and_collision_free() {
        let (env, client, creator, beneficiary, _, token_client, _) = setup();
        env.budget().reset_unlimited();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        for expected_id in 1_u64..=100_u64 {
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bench"),
                &1_000,
                &2_000,
                &token_client.address,
            );
            assert_eq!(id, expected_id);
        }
    }

    #[test]
    fn empty_beneficiaries_rejected() {
        let (env, client, creator, _beneficiary, _donor, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens: Vec<(Address, u32)> = Vec::new(&env);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "No Bens"),
            &100_000,
            &2_000,
            &token_client.address,
        );
        assert!(result.is_err());
    }

    #[test]
    fn reentrancy_lock_uses_temporary_storage_and_blocks_reentry() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarGiveContract);

        client.donate(&donor, &campaign_id, &10_000);
        client.donate(&donor2, &campaign_id, &50_000);
        assert_eq!(client.get_top_donors(&campaign_id).get(0).unwrap().0, donor2);

        client.donate(&donor, &campaign_id, &60_000); // donor total: 70_000 → now #1
        let top = client.get_top_donors(&campaign_id);
        assert_eq!(top.get(0).unwrap().0, donor);
        assert_eq!(top.get(0).unwrap().1, 70_000);
        assert_eq!(top.get(1).unwrap().0, donor2);
    }

    #[test]
    fn reentrancy_lock_uses_temporary_storage_and_blocks_reentry() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarGiveContract);

        env.as_contract(&contract_id, || {
            let key = super::lock_key();

            // Lock key must be absent before any entry.
            assert!(!env.storage().temporary().has(&key));
            assert!(!env.storage().persistent().has(&key));

            // First entry succeeds; key appears in temporary storage only.
            super::enter_lock(&env).unwrap();
            assert!(env.storage().temporary().has(&key));
            assert!(!env.storage().persistent().has(&key));

            // Re-entry from the same execution context is rejected.
            assert_eq!(super::enter_lock(&env), Err(ContractError::ReentrancyDetected));

            // Releasing the lock removes the key from temporary storage.
            super::exit_lock(&env);
            assert!(!env.storage().temporary().has(&key));

            // A fresh entry succeeds after release.
            super::enter_lock(&env).unwrap();
            super::exit_lock(&env);
        });
    }
}
