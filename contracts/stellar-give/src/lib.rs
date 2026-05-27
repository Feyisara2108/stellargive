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
    TokenTransferFailed = 13,
    NotInitialized = 14,
    AlreadyInitialized = 15,
    InvalidDuration = 16,
}

fn next_id_key() -> Symbol {
    symbol_short!("NEXT")
}

fn lock_key() -> Symbol {
    symbol_short!("LOCK")
}

fn admin_key() -> Symbol {
    symbol_short!("ADMIN")
}

/// Platform fee, in basis points. 100 = 1.00%.
const FEE_BPS: i128 = 100;
/// Basis-point denominator (10_000 = 100%).
const FEE_DENOMINATOR: i128 = 10_000;
/// Minimum permitted donation amount, in stroops (0.1 token with 7 decimals).
const MIN_DONATION: i128 = 1_000_000;
/// Maximum campaign lifetime: one year. This keeps campaign state timely and
/// avoids indefinite ledger growth from stale fundraising records.
const MAX_DURATION: u64 = 31_536_000;

fn read_admin(env: &Env) -> Result<Address, ContractError> {
    env.storage()
        .persistent()
        .get(&admin_key())
        .ok_or(ContractError::NotInitialized)
}

fn write_admin(env: &Env, admin: &Address) {
    env.storage().persistent().set(&admin_key(), admin);
}

/// Computes the platform fee for a settlement of `amount`. Uses round-half-up
/// against `FEE_DENOMINATOR` so a half-stroop remainder accrues to the
/// platform rather than the beneficiary.
fn calculate_platform_fee(amount: i128) -> Result<i128, ContractError> {
    let scaled = amount
        .checked_mul(FEE_BPS)
        .ok_or(ContractError::InvalidAmount)?;
    let biased = scaled
        .checked_add(FEE_DENOMINATOR / 2)
        .ok_or(ContractError::InvalidAmount)?;
    Ok(biased / FEE_DENOMINATOR)
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

/// Releases the reentrancy lock unconditionally. Called on every exit path
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

/// Validates that `token_address` implements the Soroban token interface (SEP-41)
/// by calling two lightweight read methods. Returns `InvalidToken` if either
/// call fails, preventing campaigns from being created with non-compliant or
/// malicious token contracts.
fn validate_token_contract(env: &Env, token_address: &Address) -> Result<(), ContractError> {
    let client = token::Client::new(env, token_address);
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
    /// One-shot initializer. Sets the platform admin address that receives
    /// the fee portion of every successful claim. Must be called before any
    /// `claim_funds` invocation.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError> {
        if env.storage().persistent().has(&admin_key()) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        write_admin(&env, &admin);
        Ok(())
    }

    /// Creates a new fundraising campaign.
    ///
    /// # Arguments
    /// * `creator` - Address creating the campaign. Must be authenticated.
    /// * `beneficiaries` - Vec of `(Address, u32)` share recipients summing to `10_000` basis points.
    /// * `title` - Campaign title. Must not be empty.
    /// * `target_amount` - Funding goal in stroops. Must be positive.
    /// * `deadline` - Unix timestamp after which donations are no longer accepted.
    /// * `accepted_token` - Token contract address. Must implement the Soroban token interface.
    ///
    /// # Errors
    /// * `InvalidToken` if `accepted_token` does not implement `decimals()` and `symbol()`.
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
        let now = env.ledger().timestamp();
        if deadline <= now {
            return Err(ContractError::InvalidDeadline);
        }
        // Campaigns longer than one year are rejected so stale campaigns do
        // not linger indefinitely and increase ledger storage pressure.
        if deadline - now > MAX_DURATION {
            return Err(ContractError::InvalidDuration);
        }

        // Validate that the token contract implements the Soroban token interface
        // before persisting it. A non-compliant contract would brick the campaign.
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
                creator,
                target_amount: campaign.target_amount,
            },
        );

        Ok(id)
    }

    /// Donates accepted tokens to an active campaign.
    ///
    /// # Arguments
    /// * `donor` - Address providing the donation. Must be authenticated.
    /// * `campaign_id` - ID of the campaign to donate to.
    /// * `amount` - Donation amount in stroops. Must be >= `MIN_DONATION`.
    pub fn donate(
        env: Env,
        donor: Address,
        campaign_id: u64,
        amount: i128,
    ) -> Result<(), ContractError> {
        donor.require_auth();
        if amount < MIN_DONATION {
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
            if token::Client::new(&env, &campaign.accepted_token)
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
            update_top_donors(&env, campaign_id, &donor, amount);
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

    /// Claims raised funds for a campaign and distributes them to beneficiaries.
    ///
    /// Net proceeds (after 1% platform fee) are split proportionally among
    /// beneficiaries according to their basis-point shares. The first beneficiary
    /// absorbs any rounding dust so that `fee + Σpayouts == raised_amount` exactly.
    ///
    /// # Arguments
    /// * `caller` - Address requesting payout. Must be the creator or a beneficiary.
    /// * `campaign_id` - ID of the campaign to claim.
    ///
    /// # Returns
    /// `Ok(gross_amount)` with the total settled amount in stroops.
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
            let admin = read_admin(&env)?;
            let amount = campaign.raised_amount;
            let fee = calculate_platform_fee(amount)?;
            let net = amount
                .checked_sub(fee)
                .ok_or(ContractError::InvalidAmount)?;

            let token = token::Client::new(&env, &campaign.accepted_token);

            // Fee leg: skipped when rounding produces zero to avoid no-op transfers.
            if fee > 0 {
                token.transfer(&env.current_contract_address(), &admin, &fee);
            }

            // Distribute net proportionally among beneficiaries (basis points over 10_000).
            // Beneficiaries at index 1..n each receive floor(net * share / 10_000).
            // The first beneficiary (index 0) receives the remainder so that
            // fee + Σpayouts == amount exactly, absorbing any rounding dust.
            let n = campaign.beneficiaries.len();
            let mut distributed: i128 = 0;
            for i in 1..n {
                let (addr, share) = campaign.beneficiaries.get(i).unwrap();
                let payout = net
                    .checked_mul(i128::from(share))
                    .ok_or(ContractError::InvalidAmount)?
                    / 10_000;
                token.transfer(&env.current_contract_address(), &addr, &payout);
                distributed = distributed
                    .checked_add(payout)
                    .ok_or(ContractError::InvalidAmount)?;
            }
            let (first_addr, _) = campaign.beneficiaries.get(0).unwrap();
            let remainder = net
                .checked_sub(distributed)
                .ok_or(ContractError::InvalidAmount)?;
            token.transfer(&env.current_contract_address(), &first_addr, &remainder);

            campaign.raised_amount = 0;
            campaign.status = CampaignStatus::Claimed;
            write_campaign(&env, &campaign);

            // Gross amount in event preserves the original raised amount for indexers.
            env.events().publish(
                (symbol_short!("funds"), symbol_short!("claimed")),
                (campaign.id, caller, amount, campaign.accepted_token),
            );

            Ok(amount)
        })();

        exit_lock(&env);
        result
    }

    /// Returns the current state of a campaign with a derived status.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, ContractError> {
        let mut campaign = read_campaign(&env, campaign_id)?;
        campaign.status = derive_status(env.ledger().timestamp(), &campaign);
        Ok(campaign)
    }

    /// Returns the top 5 donors for a campaign sorted by donated amount.
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

    fn single_ben(env: &Env, beneficiary: &Address) -> Vec<(Address, u32)> {
        let mut bens = Vec::new(env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        bens
    }

    // -----------------------------------------------------------------------
    // Campaign creation
    // -----------------------------------------------------------------------

    #[test]
    fn create_and_get_campaign() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Flood Relief"),
            &5_000_000,
            &2_000,
            &token_client.address,
        );

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.id, 1);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.beneficiaries, bens);
        assert_eq!(campaign.target_amount, 5_000_000);
        assert_eq!(campaign.raised_amount, 0);
    }

    #[test]
    fn create_campaign_emits_created_event() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let target_amount: i128 = 5_000_000;
        let bens = single_ben(&env, &beneficiary);
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
    fn create_campaign_enforces_max_duration() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);

        // Exactly one year is accepted.
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "One Year Relief"),
            &5_000_000,
            &(1_000 + MAX_DURATION),
            &token_client.address,
        );
        assert_eq!(id, 1);

        // One second over the limit is rejected.
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Too Long Relief"),
            &5_000_000,
            &(1_000 + MAX_DURATION + 1),
            &token_client.address,
        );
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Issue #10 — token interface validation
    // -----------------------------------------------------------------------

    #[test]
    fn create_campaign_accepts_valid_sac_token() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        // token_client.address is a registered SAC — validation must succeed.
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "SAC Campaign"),
            &5_000_000,
            &2_000,
            &token_client.address,
        );
        assert!(result.is_ok(), "valid SAC token must be accepted");
    }

    #[test]
    fn create_campaign_rejects_non_token_contract() {
        let (env, client, creator, beneficiary, _donor, _admin, _token_client, _) = setup();
        set_timestamp(&env, 1_000);

        // Use the campaign contract's own address as the token — it does not
        // implement decimals() or symbol(), so validation must return InvalidToken.
        let not_a_token = client.address.clone();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Bad Token Campaign"),
            &5_000_000,
            &2_000,
            &not_a_token,
        );
        assert!(result.is_err(), "non-token contract address must be rejected");
    }

    // -----------------------------------------------------------------------
    // Donation
    // -----------------------------------------------------------------------

    #[test]
    fn donate_updates_raised_and_status() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Medical Aid"),
            &3_000_000,
            &10_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &1_000_000);
        let after_first = client.get_campaign(&campaign_id);
        assert_eq!(after_first.raised_amount, 1_000_000);
        assert_eq!(after_first.status, CampaignStatus::Active);

        client.donate(&donor, &campaign_id, &2_000_000);
        let after_second = client.get_campaign(&campaign_id);
        assert_eq!(after_second.raised_amount, 3_000_000);
        assert_eq!(after_second.status, CampaignStatus::Funded);
    }

    #[test]
    fn donate_rejects_sub_minimum_amount() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Seed Relief"),
            &5_000_000,
            &10_000,
            &token_client.address,
        );

        let result = client.try_donate(&donor, &campaign_id, &999_999);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Claiming and fee distribution
    // -----------------------------------------------------------------------

    #[test]
    fn claim_when_target_met_transfers_to_beneficiary() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "School Rebuild"),
            &12_000_000,
            &20_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &12_000_000);

        let ben_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let ben_after = token_client.balance(&beneficiary);
        let admin_after = token_client.balance(&admin);
        let campaign = client.get_campaign(&campaign_id);

        // fee = round_half_up(12_000_000 * 100 / 10_000) = 120_000; net = 11_880_000
        assert_eq!(claimed, 12_000_000);
        assert_eq!(ben_after - ben_before, 11_880_000);
        assert_eq!(admin_after - admin_before, 120_000);
        assert_eq!(campaign.status, CampaignStatus::Claimed);
        assert_eq!(campaign.raised_amount, 0);
    }

    #[test]
    fn claim_after_deadline_when_target_not_met() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 100);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Emergency Shelter"),
            &50_000_000,
            &500,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &5_000_000);
        set_timestamp(&env, 600);

        let claimed = client.claim_funds(&beneficiary, &campaign_id);
        let campaign = client.get_campaign(&campaign_id);

        assert_eq!(claimed, 5_000_000);
        assert_eq!(campaign.status, CampaignStatus::Claimed);
    }

    #[test]
    fn unauthorized_claim_fails() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 200);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Food Support"),
            &5_000_000,
            &1_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &1_000_000);
        set_timestamp(&env, 1_100);

        let attacker = Address::generate(&env);
        let result = client.try_claim_funds(&attacker, &campaign_id);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Multi-beneficiary splits
    // -----------------------------------------------------------------------

    #[test]
    fn split_50_50_distributes_evenly() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 5_000_u32));
        bens.push_back((beneficiary2.clone(), 5_000_u32));

        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Dual Relief"),
            &20_000_000,
            &2_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &20_000_000);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);

        // gross=20_000_000; fee=200_000; net=19_800_000
        // b2 (5000bps): 19_800_000 * 5000 / 10_000 = 9_900_000
        // b1 (remainder): 19_800_000 - 9_900_000 = 9_900_000
        assert_eq!(claimed, 20_000_000);
        assert_eq!(b2_after - b2_before, 9_900_000);
        assert_eq!(b1_after - b1_before, 9_900_000);
        assert_eq!(
            (b1_after - b1_before) + (b2_after - b2_before),
            19_800_000
        );
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Claimed
        );
    }

    #[test]
    fn split_uneven_three_way_with_rounding() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        let beneficiary3 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 3_334_u32));
        bens.push_back((beneficiary2.clone(), 3_333_u32));
        bens.push_back((beneficiary3.clone(), 3_333_u32));

        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Three Way"),
            &10_000_000,
            &2_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &10_000_000);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let b3_before = token_client.balance(&beneficiary3);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);
        let b3_after = token_client.balance(&beneficiary3);

        // gross=10_000_000; fee=100_000; net=9_900_000
        // b2 (3333bps): floor(9_900_000 * 3333 / 10_000) = 3_299_670
        // b3 (3333bps): 3_299_670
        // b1 (3334bps, remainder): 9_900_000 - 3_299_670 - 3_299_670 = 3_300_660
        assert_eq!(claimed, 10_000_000);
        let b2_delta = b2_after - b2_before;
        let b3_delta = b3_after - b3_before;
        let b1_delta = b1_after - b1_before;
        assert_eq!(b2_delta, 3_299_670);
        assert_eq!(b3_delta, 3_299_670);
        assert_eq!(b1_delta, 3_300_660);
        assert_eq!(b1_delta + b2_delta + b3_delta, 9_900_000);
    }

    #[test]
    fn invalid_shares_not_summing_to_10000_rejected() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        let beneficiary2 = Address::generate(&env);
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 5_000_u32));
        bens.push_back((beneficiary2.clone(), 4_999_u32));

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Bad Shares"),
            &5_000_000,
            &2_000,
            &token_client.address,
        );
        assert!(result.is_err());
    }

    #[test]
    fn empty_beneficiaries_rejected() {
        let (env, client, creator, _beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens: Vec<(Address, u32)> = Vec::new(&env);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "No Bens"),
            &5_000_000,
            &2_000,
            &token_client.address,
        );
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Sequential ID generation
    // -----------------------------------------------------------------------

    #[test]
    fn id_generation_is_sequential_and_collision_free() {
        let (env, client, creator, beneficiary, _, _admin, token_client, _) = setup();
        env.budget().reset_unlimited();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        for expected_id in 1_u64..=100_u64 {
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bench"),
                &1_000_000,
                &2_000,
                &token_client.address,
            );
            assert_eq!(id, expected_id);
        }
    }

    // -----------------------------------------------------------------------
    // Top donors
    // -----------------------------------------------------------------------

    #[test]
    fn top_donors_accumulates_repeat_donor() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Top Donors"),
            &20_000_000,
            &2_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &1_000_000);
        client.donate(&donor, &campaign_id, &5_000_000);

        let top = client.get_top_donors(&campaign_id);
        assert_eq!(top.len(), 1);
        assert_eq!(top.get(0).unwrap().1, 6_000_000);
    }

    // -----------------------------------------------------------------------
    // Reentrancy lock
    // -----------------------------------------------------------------------

    #[test]
    fn reentrancy_lock_uses_temporary_storage_and_blocks_reentry() {
        let env = Env::default();
        let contract_id = env.register_contract(None, StellarGiveContract);

        env.as_contract(&contract_id, || {
            let key = super::lock_key();

            assert!(!env.storage().temporary().has(&key));
            assert!(!env.storage().persistent().has(&key));

            super::enter_lock(&env).unwrap();
            assert!(env.storage().temporary().has(&key));
            assert!(!env.storage().persistent().has(&key));

            assert_eq!(
                super::enter_lock(&env),
                Err(ContractError::ReentrancyDetected)
            );

            super::exit_lock(&env);
            assert!(!env.storage().temporary().has(&key));

            super::enter_lock(&env).unwrap();
            super::exit_lock(&env);
        });
    }

    // -----------------------------------------------------------------------
    // Platform fee
    // -----------------------------------------------------------------------

    #[test]
    fn calculate_platform_fee_round_half_up() {
        assert_eq!(calculate_platform_fee(0).unwrap(), 0);
        assert_eq!(calculate_platform_fee(49).unwrap(), 0);
        assert_eq!(calculate_platform_fee(50).unwrap(), 1);
        assert_eq!(calculate_platform_fee(100).unwrap(), 1);
        assert_eq!(calculate_platform_fee(100_000).unwrap(), 1_000);
        assert_eq!(calculate_platform_fee(149).unwrap(), 1);
        assert_eq!(calculate_platform_fee(150).unwrap(), 2);
    }

    #[test]
    fn claim_funds_fee_deducted_from_beneficiary_payout() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        // 1_000_000 gross; fee = 1% = 10_000; net = 990_000
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Fee Test"),
            &1_000_000,
            &20_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &1_000_000);

        let ben_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&beneficiary, &campaign_id);

        assert_eq!(claimed, 1_000_000);
        assert_eq!(token_client.balance(&admin) - admin_before, 10_000);
        assert_eq!(token_client.balance(&beneficiary) - ben_before, 990_000);
    }

    #[test]
    fn claim_funds_fee_plus_net_equals_gross() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        let gross: i128 = 33_333_300;
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Property"),
            &gross,
            &20_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &gross);

        let ben_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        client.claim_funds(&beneficiary, &campaign_id);

        let fee_delta = token_client.balance(&admin) - admin_before;
        let net_delta = token_client.balance(&beneficiary) - ben_before;
        assert_eq!(fee_delta + net_delta, gross);
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    #[test]
    fn claim_funds_fails_when_admin_not_initialized() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1_000);

        let creator = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let donor = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_client = token::Client::new(&env, &token_id.address());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());
        token_admin_client.mint(&donor, &100_000_000_000);

        // Do NOT call initialize — admin must not be set.
        let contract_id = env.register_contract(None, StellarGiveContract);
        let client = StellarGiveContractClient::new(&env, &contract_id);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Uninit"),
            &1_000_000,
            &5_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &1_000_000);

        let result = client.try_claim_funds(&creator, &campaign_id);
        assert!(
            result.is_err(),
            "claim must fail when platform admin is not initialized"
        );
    }

    #[test]
    fn initialize_rejects_second_call() {
        let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) = setup();

        let other_admin = Address::generate(&env);
        let result = client.try_initialize(&other_admin);
        assert!(
            result.is_err(),
            "initialize must reject a second call once admin is set"
        );
    }
}
