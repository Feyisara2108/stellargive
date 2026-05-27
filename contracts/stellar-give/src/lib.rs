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
    /// Token transfer failed — revert donation, no state changes persist.
    TokenTransferFailed = 12,
    NotInitialized = 13,
    AlreadyInitialized = 14,
    InvalidDuration = 15,
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
    /// Creates a new fundraising campaign.
    ///
    /// # Arguments
    /// * `env` - The Soroban contract environment.
    /// * `creator` - Address creating the campaign. Must be authenticated with `require_auth()`.
    /// * `beneficiaries` - Vector of `(Address, u32)` share recipients. Must contain at least one entry and sum to `10_000`.
    /// * `title` - Campaign title. Must not be empty.
    /// * `target_amount` - Funding goal in stroops.
    /// * `deadline` - Unix timestamp after which donations are no longer accepted.
    /// * `accepted_token` - Token contract address used for donations.
    ///
    /// # Returns
    /// `Ok(campaign_id)` on success.
    ///
    /// # Errors
    /// * `Unauthorized` if `creator` is not authenticated.
    /// * `EmptyTitle` if the title is empty.
    /// * `InvalidAmount` if `target_amount <= 0` or if the campaign ID overflows.
    /// * `InvalidDeadline` if the deadline is not strictly in the future.
    /// * `InvalidToken` if the accepted token contract does not implement the required token interface.
    /// * `InvalidShares` if `beneficiaries` is empty or shares do not sum to `10_000`.
    ///
    /// ### ⚠️ Precision Warning
    /// `target_amount` must be in **stroops** (1 XLM = 10,000,000 stroops).
    /// Never use floating-point math to calculate this value.
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
    /// * `env` - The Soroban contract environment.
    /// * `donor` - Address providing the donation. Must be authenticated with `require_auth()`.
    /// * `campaign_id` - ID of the campaign to donate to.
    /// * `amount` - Donation amount in stroops.
    ///
    /// # Returns
    /// `Ok(())` on success.
    ///
    /// # Errors
    /// * `Unauthorized` if `donor` is not authenticated.
    /// * `InvalidAmount` if `amount <= 0`.
    /// * `CampaignNotFound` if the campaign does not exist.
    /// * `CampaignNotActive` if the campaign is not active.
    /// * `TokenTransferFailed` if the token transfer from donor to contract fails.
    ///
    /// ### ⚠️ Precision Warning
    /// `amount` must be in **stroops** (1 XLM = 10,000,000 stroops).
    /// Always use integer math for financial calculations.
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

    /// Claims raised funds for a campaign.
    ///
    /// # Arguments
    /// * `env` - The Soroban contract environment.
    /// * `caller` - Address requesting payout. Must be authenticated with `require_auth()`.
    /// * `campaign_id` - ID of the campaign to claim.
    ///
    /// # Returns
    /// `Ok(total)` with the distributed amount in stroops.
    ///
    /// # Errors
    /// * `Unauthorized` if `caller` is neither the campaign creator nor a beneficiary.
    /// * `CampaignNotFound` if the campaign does not exist.
    /// * `AlreadyClaimed` if funds have already been claimed.
    /// * `ClaimNotAllowed` if the campaign is still active and not eligible for payout.
    /// * `NothingToClaim` if the campaign has zero raised amount.
    ///
    /// ### ⚠️ Precision Warning
    /// All returned and internal amounts are in **stroops**.
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

            // Two-leg payout: fee → admin, net → beneficiary. The fee leg is
            // skipped entirely when rounding produces a zero fee, so small
            // claims do not pay the runtime cost of a no-op transfer.
            let token = token::TokenClient::new(&env, &campaign.accepted_token);
            if fee > 0 {
                token.transfer(&env.current_contract_address(), &admin, &fee);
            }
            token.transfer(&env.current_contract_address(), &campaign.beneficiary, &net);

            campaign.raised_amount = 0;
            campaign.status = CampaignStatus::Claimed;
            write_campaign(&env, &campaign);

            // `amount` in the event continues to represent the gross settled
            // amount (fee + net), preserving the existing indexer contract.
            env.events().publish(
                (symbol_short!("funds"), symbol_short!("claimed")),
                (campaign.id, caller, total, campaign.accepted_token),
            );

            Ok(total)
        })();

        exit_lock(&env);
        result
    }

    /// Returns the current state of a campaign.
    ///
    /// # Arguments
    /// * `env` - The Soroban contract environment.
    /// * `campaign_id` - ID of the campaign to read.
    ///
    /// # Returns
    /// `Ok(Campaign)` with campaign state and derived status.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the campaign does not exist.
    ///
    /// ### ⚠️ Precision Warning
    /// All amounts in the returned `Campaign` struct are in **stroops**.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, ContractError> {
        let mut campaign = read_campaign(&env, campaign_id)?;
        campaign.status = derive_status(env.ledger().timestamp(), &campaign);
        Ok(campaign)
    }

    /// Returns the top 5 donors for a campaign.
    ///
    /// # Arguments
    /// * `env` - The Soroban contract environment.
    /// * `campaign_id` - ID of the campaign to read.
    ///
    /// # Returns
    /// `Ok(Vec<(Address, i128)>)` with the top five donors sorted by donated amount.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the campaign does not exist.
    ///
    /// ### ⚠️ Precision Warning
    /// All donation amounts are in **stroops**.
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

        token_admin_client.mint(&donor, &1_000_000);
        token_admin_client.mint(&creator, &1_000_000);

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

    #[test]
    fn create_and_get_campaign() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
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
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
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
    fn create_campaign_enforces_max_duration() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        // Exactly one year is accepted; only longer campaigns are rejected.
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "One Year Relief"),
            &500_000,
            &(1_000 + MAX_DURATION),
            &token_client.address,
        );
        assert_eq!(id, 1);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Too Long Relief"),
            &500_000,
            &(1_000 + MAX_DURATION + 1),
            &token_client.address,
        );
        assert!(result.is_err());
    }

    #[test]
    fn donate_updates_raised_and_status() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
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
    fn donate_rejects_sub_minimum_amount() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Seed Relief"),
            &100_000,
            &10_000,
            &token_client.address,
        );

        let result = client.try_donate(&donor, &campaign_id, &999_999);
        assert!(result.is_err());
    }

    #[test]
    fn claim_when_target_met_transfers_to_beneficiary() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
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
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let beneficiary_after = token_client.balance(&beneficiary);
        let admin_after = token_client.balance(&admin);
        let campaign = client.get_campaign(&campaign_id);

        // Gross return value is unchanged; the 1% fee is split off internally.
        assert_eq!(claimed, 120_000);
        assert_eq!(beneficiary_after - beneficiary_before, 118_800);
        assert_eq!(admin_after - admin_before, 1_200);
        assert_eq!(campaign.status, CampaignStatus::Claimed);
        assert_eq!(campaign.raised_amount, 0);
    }

    #[test]
    fn claim_after_deadline_when_target_not_met() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
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
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
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

        let campaign_id = client.create_campaign(
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
    fn donate_blocked_when_lock_already_held() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens: Vec<(Address, u32)> = Vec::new(&env);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Three Way"),
            &10_000,
            &5_000,
            &token_client.address,
        );
        assert!(result.is_err());
    }

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
    #[test]
    fn top_donors_accumulates_repeat_donor() {
        let (env, client, creator, beneficiary, donor, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Top Donors"),
            &200_000,
            &2_000,
            &token_client.address,
        );

        client.donate(&donor, &campaign_id, &10_000);
        client.donate(&donor, &campaign_id, &5_000);

        let top = client.get_top_donors(&campaign_id);
        assert_eq!(top.len(), 1);
        assert_eq!(top.get(0).unwrap().1, 15_000);
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

    // -----------------------------------------------------------------------
    // Issue — Fee on claim tests
    // -----------------------------------------------------------------------

    #[test]
    fn calculate_platform_fee_round_half_up() {
        // Below the half-stroop threshold: fee rounds down to 0.
        assert_eq!(calculate_platform_fee(0).unwrap(), 0);
        assert_eq!(calculate_platform_fee(49).unwrap(), 0);

        // Exact half-stroop remainder: rounds up to favor the platform.
        assert_eq!(calculate_platform_fee(50).unwrap(), 1);

        // Exact 1% with no remainder.
        assert_eq!(calculate_platform_fee(100).unwrap(), 1);
        assert_eq!(calculate_platform_fee(100_000).unwrap(), 1_000);

        // Remainder above the half threshold rounds up; below rounds down.
        assert_eq!(calculate_platform_fee(149).unwrap(), 1);
        assert_eq!(calculate_platform_fee(150).unwrap(), 2);
    }

    #[test]
    fn claim_funds_fee_round_half_up_boundary() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        // raised_amount = 50 → scaled 5000, biased 10000, fee = 1.
        let campaign_id = client.create_campaign(
            &creator,
            &beneficiary,
            &String::from_str(&env, "Boundary"),
            &50,
            &20_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &50);

        let beneficiary_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&beneficiary, &campaign_id);

        assert_eq!(claimed, 50);
        assert_eq!(token_client.balance(&admin) - admin_before, 1);
        assert_eq!(token_client.balance(&beneficiary) - beneficiary_before, 49);
    }

    #[test]
    fn claim_funds_fee_rounds_to_zero_for_tiny_settlement() {
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 100);

        // raised_amount = 49 → scaled 4900, biased 9900, fee = 0.
        // Force the deadline path because raised < target.
        let campaign_id = client.create_campaign(
            &creator,
            &beneficiary,
            &String::from_str(&env, "Tiny"),
            &10_000,
            &500,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &49);
        set_timestamp(&env, 600);

        let beneficiary_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&beneficiary, &campaign_id);

        assert_eq!(claimed, 49);
        // Admin must receive nothing when the fee rounds to zero.
        assert_eq!(token_client.balance(&admin), admin_before);
        // Beneficiary receives the full raised amount.
        assert_eq!(token_client.balance(&beneficiary) - beneficiary_before, 49);
    }

    #[test]
    fn claim_funds_preserves_gross_amount_across_split() {
        // Property check: for any successful claim, fee + net == gross.
        let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
        set_timestamp(&env, 10_000);

        let gross: i128 = 333_333;
        let campaign_id = client.create_campaign(
            &creator,
            &beneficiary,
            &String::from_str(&env, "Property"),
            &gross,
            &20_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &gross);

        let beneficiary_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        client.claim_funds(&beneficiary, &campaign_id);

        let fee_delta = token_client.balance(&admin) - admin_before;
        let net_delta = token_client.balance(&beneficiary) - beneficiary_before;
        assert_eq!(fee_delta + net_delta, gross);
        // 333_333 * 100 = 33_333_300; +5000 = 33_338_300; /10_000 = 3_333.
        assert_eq!(fee_delta, 3_333);
    }

    #[test]
    fn claim_funds_fails_when_admin_not_initialized() {
        // Build a contract without calling initialize, then attempt a claim.
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1_000);

        let creator = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let donor = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(token_admin);
        let token_client = token::Client::new(&env, &token_id.address());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());
        token_admin_client.mint(&donor, &1_000_000);

        let contract_id = env.register_contract(None, StellarGiveContract);
        let client = StellarGiveContractClient::new(&env, &contract_id);

        let campaign_id = client.create_campaign(
            &creator,
            &beneficiary,
            &String::from_str(&env, "Uninit"),
            &100_000,
            &5_000,
            &token_client.address,
        );
        client.donate(&donor, &campaign_id, &100_000);

        let result = client.try_claim_funds(&creator, &campaign_id);
        assert!(
            result.is_err(),
            "claim must fail when the platform admin has not been initialized"
        );
    }

    #[test]
    fn initialize_rejects_second_call() {
        // setup() already calls initialize once; a second call must fail.
        let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) = setup();
        let _ = &env;

        let other_admin = Address::generate(&env);
        let result = client.try_initialize(&other_admin);
        assert!(
            result.is_err(),
            "initialize must reject a second call once the admin is set"
        );
    }
}
