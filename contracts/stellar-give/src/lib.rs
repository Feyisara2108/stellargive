#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
    IntoVal, String, Symbol, Val, Vec,
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
    Cancelled,
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
pub struct GoalReachedEvent {
    pub campaign_id: u64,
    pub total_raised: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct CancelledEvent {
    pub id: u64,
    pub creator: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RefundEvent {
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct DonationEvent {
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
    pub total_raised: i128,
    pub accepted_token: Address,
    pub comment: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RefundEvent {
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct AutoClaimedEvent {
    pub campaign_id: u64,
    pub total_raised: i128,
    pub beneficiary: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ClaimedEvent {
    pub campaign_id: u64,
    pub amount: i128,
    pub beneficiary: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct DeadlineExtendedEvent {
    pub campaign_id: u64,
    pub old_deadline: u64,
    pub new_deadline: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub beneficiaries: Vec<(Address, u32)>,
    pub title: String,
    pub metadata_uri: String,
    /// Browsing category for discoverability (e.g., `medical`, `food`, `shelter`, `education`, `relief`, `other`).
    /// Best practice: use stable predefined symbols to allow for reliable frontend filtering.
    pub category: Symbol,
    pub target_amount: i128,
    pub raised_amount: i128,
    pub deadline: u64,
    pub accepted_token: Address,
    pub status: CampaignStatus,
    pub max_per_donor: Option<i128>,
    pub website: Option<String>,
    pub twitter: Option<String>,
    pub is_private: bool,
    pub was_extended: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Update {
    pub content: String,
    pub timestamp: u64,
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
    TargetTooLow = 17,
    ExceedsDonorCap = 18,
    InvalidMetadataUri = 19,
    MetadataUriTooLong = 20,
    InvalidUrl = 21,
    ArithmeticError = 22,
    LimitExceeded = 23,
    InvalidTitle = 24,
    CreationFeeTransferFailed = 25,
    InvalidUpdateContent = 26,
    TooManyUpdates = 27,
    InvalidBeneficiary = 28,
    InvalidCategory = 30,
    CommentTooLong = 29,
    NotWhitelisted = 31,
    CampaignNotCancelled = 32,
    NothingToRefund = 33,
    RefundTransferFailed = 34,
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

fn owner_key() -> Symbol {
    symbol_short!("OWNER")
}

/// Platform fee, in basis points. 100 = 1.00%.
const FEE_BPS: i128 = 100;
/// Basis-point denominator (10_000 = 100%).
const FEE_DENOMINATOR: i128 = 10_000;
/// Minimum permitted donation amount, in stroops (0.1 token with 7 decimals).
const MIN_DONATION: i128 = 1_000_000;
/// Minimum fundraising target, in stroops (1.0 token with 7 decimals).
const MIN_TARGET: i128 = 10_000_000;
/// Maximum campaign lifetime: one year. This keeps campaign state timely and
/// avoids indefinite ledger growth from stale fundraising records.
const MAX_DURATION: u64 = 31_536_000;
/// Storage bloat guard: maximum campaigns per creator address.
const MAX_CAMPAIGNS_PER_CREATOR: u32 = 10;
/// Storage bloat guard: title length cap.
const MAX_TITLE_LEN: u32 = 50;
/// Storage bloat guard: metadata URI length cap.
const MAX_METADATA_URI_LEN: u32 = 256;
/// Optional donor comment length cap.
const MAX_COMMENT_LEN: u32 = 250;
/// Fixed creation fee in stroops, sent to platform admin.
const CREATION_FEE_STROOPS: i128 = 100_000;

fn is_allowed_category(category: &Symbol) -> bool {
    category == &symbol_short!("medical")
        || category == &symbol_short!("food")
        || category == &symbol_short!("shelter")
        || category == &symbol_short!("education")
        || category == &symbol_short!("relief")
        || category == &symbol_short!("other")
}

fn read_admin(env: &Env) -> Result<Address, ContractError> {
    let key = admin_key();
    let admin: Address = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(ContractError::NotInitialized)?;
    extend_persistent_ttl(env, &key);
    Ok(admin)
}

fn write_admin(env: &Env, admin: &Address) {
    let key = admin_key();
    env.storage().persistent().set(&key, admin);
    extend_persistent_ttl(env, &key);
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

const INSTANCE_BUMP_AMOUNT: u32 = 518400; // ~30 days
const INSTANCE_LIFETIME_THRESHOLD: u32 = 17280; // ~1 day

const PERSISTENT_BUMP_AMOUNT: u32 = 518400; // ~30 days
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 17280; // ~1 day

fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn extend_persistent_ttl<K: IntoVal<Env, Val>>(env: &Env, key: &K) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

fn read_next_id(env: &Env) -> u64 {
    let key = next_id_key();

    if let Some(id) = env.storage().instance().get(&key) {
        extend_instance_ttl(env);
        return id;
    }

    // Phase 5: Migration logic from persistent to instance storage
    if let Some(id) = env.storage().persistent().get(&key) {
        env.storage().instance().set(&key, &id);
        env.storage().persistent().remove(&key);
        extend_instance_ttl(env);
        return id;
    }

    extend_instance_ttl(env);
    1_u64
}

fn write_next_id(env: &Env, next_id: u64) {
    env.storage().instance().set(&next_id_key(), &next_id);
    extend_instance_ttl(env);
}

fn read_campaign(env: &Env, id: u64) -> Result<Campaign, ContractError> {
    let key = campaign_key(id);
    let campaign: Campaign = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(ContractError::CampaignNotFound)?;
    extend_persistent_ttl(env, &key);
    Ok(campaign)
}

fn write_campaign(env: &Env, campaign: &Campaign) {
    let key = campaign_key(campaign.id);
    env.storage().persistent().set(&key, campaign);
    extend_persistent_ttl(env, &key);
}

fn top_donors_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("TDON"), id)
}

fn read_top_donors(env: &Env, id: u64) -> Vec<(Address, i128)> {
    let key = top_donors_key(id);
    let donors = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
    }
    donors
}

fn write_top_donors(env: &Env, id: u64, donors: &Vec<(Address, i128)>) {
    let key = top_donors_key(id);
    env.storage().persistent().set(&key, donors);
    extend_persistent_ttl(env, &key);
}

fn write_donor_contribution(env: &Env, campaign_id: u64, donor: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&donor_contribution_key(campaign_id, donor), &amount);
}

fn goal_reached_topic(env: &Env) -> Symbol {
    Symbol::new(env, "goal_reached")
}

fn creator_campaign_count_key(creator: &Address) -> (Symbol, Address) {
    (symbol_short!("CCNT"), creator.clone())
}

fn read_creator_campaign_count(env: &Env, creator: &Address) -> u32 {
    let key = creator_campaign_count_key(creator);
    let count = env.storage().persistent().get(&key).unwrap_or(0);
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
    }
    count
}

fn write_creator_campaign_count(env: &Env, creator: &Address, count: u32) {
    let key = creator_campaign_count_key(creator);
    env.storage().persistent().set(&key, &count);
    extend_persistent_ttl(env, &key);
}

fn read_donor_contribution(env: &Env, campaign_id: u64, donor: &Address) -> i128 {
    let key = donor_contribution_key(campaign_id, donor);
    let amount = env.storage().persistent().get(&key).unwrap_or(0);
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
    }
    amount
}

fn write_donor_contribution(env: &Env, campaign_id: u64, donor: &Address, amount: i128) {
    let key = donor_contribution_key(campaign_id, donor);
    env.storage().persistent().set(&key, &amount);
    extend_persistent_ttl(env, &key);
}

fn whitelist_key(campaign_id: u64, addr: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("WLST"), campaign_id, addr.clone())
}

fn read_whitelist(env: &Env, campaign_id: u64, addr: &Address) -> bool {
    let key = whitelist_key(campaign_id, addr);
    let allowed = env.storage().persistent().get(&key).unwrap_or(false);
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
    }
    allowed
}

fn write_whitelist(env: &Env, campaign_id: u64, addr: &Address, allowed: bool) {
    let key = whitelist_key(campaign_id, addr);
    env.storage().persistent().set(&key, &allowed);
    extend_persistent_ttl(env, &key);
}

fn update_count_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("UPCT"), id)
}

fn update_key(id: u64, idx: u32) -> (Symbol, u64, u32) {
    (symbol_short!("UPDT"), id, idx)
}

fn read_update_count(env: &Env, id: u64) -> u32 {
    let key = update_count_key(id);
    let count = env.storage().persistent().get(&key).unwrap_or(0);
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
    }
    count
}

fn write_update_count(env: &Env, id: u64, count: u32) {
    let key = update_count_key(id);
    env.storage().persistent().set(&key, &count);
    extend_persistent_ttl(env, &key);
}

fn read_update(env: &Env, id: u64, idx: u32) -> Option<Update> {
    let key = update_key(id, idx);
    let update: Option<Update> = env.storage().persistent().get(&key);
    if let Some(_) = update {
        extend_persistent_ttl(env, &key);
    }
    update
}

fn write_update(env: &Env, id: u64, idx: u32, update: &Update) {
    let key = update_key(id, idx);
    env.storage().persistent().set(&key, update);
    extend_persistent_ttl(env, &key);
}

fn update_top_donors(
    env: &Env,
    campaign_id: u64,
    donor: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    let old = read_top_donors(env, campaign_id);
    let mut new_donors: Vec<(Address, i128)> = Vec::new(env);

    // Carry over all existing entries except the current donor; accumulate their total.
    let mut cumulative = amount;
    for (addr, prev) in old.iter() {
        if addr == *donor {
            cumulative = prev
                .checked_add(amount)
                .ok_or(ContractError::ArithmeticError)?;
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
    Ok(())
}

fn enter_lock(env: &Env) -> Result<(), ContractError> {
    let key = lock_key();
    if env
        .storage()
        .temporary()
        .get::<_, bool>(&key)
        .unwrap_or(false)
    {
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
    // Terminal statuses must not be downgraded by timestamp checks.
    if campaign.status == CampaignStatus::Claimed || campaign.status == CampaignStatus::Cancelled {
        return campaign.status.clone();
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

/// Validates that a URL is a plausible HTTPS or IPFS metadata/social link.
/// Keeps campaign metadata constrained to safe, externally resolvable URIs.
#[allow(dead_code, clippy::manual_range_contains)]
fn validate_url(url: &String) -> Result<(), ContractError> {
    let len = url.len() as usize;
    if !(8..=200).contains(&len) {
        return Err(ContractError::InvalidUrl);
    }
    let mut buf = [0u8; 200];
    let dest_slice = &mut buf[0..len];
    url.copy_into_slice(dest_slice);
    if &dest_slice[0..8] != b"https://" {
        return Err(ContractError::InvalidUrl);
    }
    Ok(())
}

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

/// Rejects campaigns that name the contract itself as a beneficiary.
///
/// If the contract address is allowed into the payout set, `claim_funds`
/// would transfer funds back into contract-owned storage instead of an
/// externally controlled account, which can permanently lock user funds.
fn validate_beneficiaries(
    env: &Env,
    beneficiaries: &Vec<(Address, u32)>,
) -> Result<(), ContractError> {
    let contract_address = env.current_contract_address();
    for (beneficiary, _) in beneficiaries.iter() {
        if beneficiary == contract_address {
            return Err(ContractError::InvalidBeneficiary);
        }
    }
    Ok(())
}

/// Distributes raised funds to beneficiaries after deducting the platform fee.
///
/// Net proceeds (after 1% platform fee) are split proportionally among
/// beneficiaries according to their basis-point shares. The first beneficiary
/// absorbs any rounding dust so that `fee + Σpayouts == amount` exactly.
fn distribute_funds(
    env: &Env,
    admin: &Address,
    campaign: &Campaign,
    amount: i128,
) -> Result<(), ContractError> {
    let fee = calculate_platform_fee(amount)?;
    let net = amount
        .checked_sub(fee)
        .ok_or(ContractError::InvalidAmount)?;

    let token = token::Client::new(env, &campaign.accepted_token);

    // Fee leg: skipped when rounding produces zero to avoid no-op transfers.
    if fee > 0 {
        token.transfer(&env.current_contract_address(), admin, &fee);
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
        env.storage().instance().set(&owner_key(), &admin);
        Ok(())
    }

    /// Creates a new fundraising campaign.
    ///
    /// # Arguments
    /// * `creator` - Address creating the campaign. Must be authenticated.
    /// * `beneficiaries` - Vec of `(Address, u32)` share recipients summing to `10_000` basis points.
    /// * `title` - Campaign title. Must not be empty.
    /// * `category` - Lowercase browsing category. Prefer stable symbols like
    ///   `medical`, `food`, `shelter`, `education`, `relief`, or `other`.
    /// * `target_amount` - Funding goal in stroops. Must be positive.
    /// * `deadline` - Unix timestamp after which donations are no longer accepted. Validated against the ledger time source (`env.ledger().timestamp()`).
    /// * `accepted_token` - Token contract address. Must implement the Soroban token interface.
    ///
    /// # Errors
    /// * `InvalidToken` if `accepted_token` does not implement `decimals()` and `symbol()`.
    /// * `InvalidBeneficiary` if any beneficiary matches the contract address.
    #[allow(clippy::too_many_arguments)]
    pub fn create_campaign(
        env: Env,
        creator: Address,
        beneficiaries: Vec<(Address, u32)>,
        title: String,
        metadata_uri: String,
        category: Symbol,
        target_amount: i128,
        deadline: u64,
        accepted_token: Address,
        max_per_donor: Option<i128>,
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if title.is_empty() {
            return Err(ContractError::EmptyTitle);
        }
        if title.len() > MAX_TITLE_LEN {
            return Err(ContractError::InvalidTitle);
        }
        if target_amount < MIN_TARGET {
            return Err(ContractError::TargetTooLow);
        }
        if metadata_uri.len() > MAX_METADATA_URI_LEN {
            return Err(ContractError::MetadataUriTooLong);
        }
        if !is_allowed_category(&category) {
            return Err(ContractError::InvalidCategory);
        }

        let mut is_valid = false;
        let len = metadata_uri.len() as usize;
        let mut buffer = [0u8; 256];
        metadata_uri.copy_into_slice(&mut buffer[..len]);

        if (len >= 7 && &buffer[..7] == b"ipfs://") || (len >= 8 && &buffer[..8] == b"https://") {
            is_valid = true;
        }

        if !is_valid {
            return Err(ContractError::InvalidMetadataUri);
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

        let creator_campaigns = read_creator_campaign_count(&env, &creator);
        if creator_campaigns >= MAX_CAMPAIGNS_PER_CREATOR {
            return Err(ContractError::LimitExceeded);
        }

        // Small creation fee discourages campaign spam and storage bloat.
        if let Ok(admin) = read_admin(&env) {
            if token::Client::new(&env, &accepted_token)
                .try_transfer(&creator, &admin, &CREATION_FEE_STROOPS)
                .is_err()
            {
                return Err(ContractError::CreationFeeTransferFailed);
            }
        }

        if beneficiaries.is_empty() {
            return Err(ContractError::InvalidShares);
        }

        // Prevent self-referential payout plans. If the contract is listed as a
        // beneficiary, claim settlement would route funds back into the contract
        // address and lock them there permanently.
        validate_beneficiaries(&env, &beneficiaries)?;

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
            metadata_uri,
            category,
            target_amount,
            raised_amount: 0,
            deadline,
            accepted_token: accepted_token.clone(),
            status: CampaignStatus::Active,
            max_per_donor,
            website: None,
            twitter: None,
            is_private: false,
            was_extended: false,
        };

        write_campaign(&env, &campaign);
        let updated_campaign_count = creator_campaigns
            .checked_add(1)
            .ok_or(ContractError::ArithmeticError)?;
        write_creator_campaign_count(&env, &creator, updated_campaign_count);
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
        is_anonymous: bool,
        comment: Option<String>,
    ) -> Result<(), ContractError> {
        donor.require_auth();
        if amount < MIN_DONATION {
            return Err(ContractError::InvalidAmount);
        }
        if let Some(c) = &comment {
            if c.len() > MAX_COMMENT_LEN {
                return Err(ContractError::CommentTooLong);
            }
        }

        enter_lock(&env)?;
        let result = (|| {
            let mut campaign = read_campaign(&env, campaign_id)?;
            sync_status(&env, &mut campaign);

            if campaign.status != CampaignStatus::Active {
                return Err(ContractError::CampaignNotActive);
            }

            // If campaign is private, ensure donor is whitelisted
            if campaign.is_private {
                if !read_whitelist(&env, campaign_id, &donor) {
                    return Err(ContractError::NotWhitelisted);
                }
            }

            if let Some(cap) = campaign.max_per_donor {
                let current_total = read_donor_contribution(&env, campaign_id, &donor);
                if current_total
                    .checked_add(amount)
                    .ok_or(ContractError::ArithmeticError)?
                    > cap
                {
                    return Err(ContractError::ExceedsDonorCap);
                }
            }

            // Use try_transfer so a failing token contract reverts the donation
            // cleanly instead of propagating a raw panic.
            if token::Client::new(&env, &campaign.accepted_token)
                .try_transfer(&donor, &env.current_contract_address(), &amount)
                .is_err()
            {
                return Err(ContractError::TokenTransferFailed);
            }

            let new_donor_total = read_donor_contribution(&env, campaign_id, &donor)
                .checked_add(amount)
                .ok_or(ContractError::ArithmeticError)?;
            write_donor_contribution(&env, campaign_id, &donor, new_donor_total);

            let old_raised = campaign.raised_amount;
            campaign.raised_amount = campaign
                .raised_amount
                .checked_add(amount)
                .ok_or(ContractError::ArithmeticError)?;

            let goal_reached = old_raised < campaign.target_amount
                && campaign.raised_amount >= campaign.target_amount;

            campaign.status = if campaign.raised_amount >= campaign.target_amount {
                CampaignStatus::Funded
            } else {
                CampaignStatus::Active
            };

            write_campaign(&env, &campaign);

            if goal_reached {
                env.events().publish(
                    (goal_reached_topic(&env),),
                    GoalReachedEvent {
                        campaign_id: campaign.id,
                        total_raised: campaign.raised_amount,
                    },
                );

                // Auto-claim: immediately transfer funds to beneficiaries
                let admin = read_admin(&env)?;
                let total_raised = campaign.raised_amount;

                // Distribute funds to beneficiaries
                distribute_funds(&env, &admin, &campaign, total_raised)?;

                // Update campaign status and clear raised amount
                campaign.raised_amount = 0;
                campaign.status = CampaignStatus::Claimed;
                write_campaign(&env, &campaign);

                // Emit AutoClaimed event for the first beneficiary
                let (first_beneficiary, _) = campaign.beneficiaries.get(0).unwrap();
                env.events().publish(
                    (Symbol::new(&env, "autoclaimed"),),
                    AutoClaimedEvent {
                        campaign_id: campaign.id,
                        total_raised,
                        beneficiary: first_beneficiary.clone(),
                    },
                );
            }

            let event_donor = if is_anonymous {
                Address::from_string(&String::from_str(
                    &env,
                    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
                ))
            } else {
                donor.clone()
            };

            update_top_donors(&env, campaign_id, &event_donor, amount)?;
            env.events().publish(
                (symbol_short!("donation"), symbol_short!("received")),
                DonationEvent {
                    campaign_id: campaign.id,
                    donor: event_donor,
                    amount,
                    total_raised: campaign.raised_amount,
                    accepted_token: campaign.accepted_token.clone(),
                    comment: comment.clone(),
                },
            );
            Ok(())
        })();

        exit_lock(&env);
        result
    }

    /// Cancels an active campaign and unlocks per-donor refunds.
    ///
    /// Only the creator may cancel, and only while the campaign is still
    /// active (not yet funded/claimed, expired, or already cancelled). Any
    /// funds already donated remain held by the contract; each donor reclaims
    /// their exact recorded contribution by calling `claim_refund`.
    ///
    /// # Arguments
    /// * `caller` - Address requesting cancellation. Must equal the creator.
    /// * `campaign_id` - ID of the campaign to cancel.
    pub fn cancel_campaign(
        env: Env,
        caller: Address,
        campaign_id: u64,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let mut campaign = read_campaign(&env, campaign_id)?;
        if caller != campaign.creator {
            return Err(ContractError::Unauthorized);
        }

        // Refresh derived status so an expired/funded campaign is not treated
        // as active. Funds are only claimable while a campaign is still active.
        sync_status(&env, &mut campaign);
        if campaign.status != CampaignStatus::Active {
            return Err(ContractError::CampaignNotActive);
        }

        campaign.status = CampaignStatus::Cancelled;
        write_campaign(&env, &campaign);

        env.events().publish(
            (symbol_short!("cancel"),),
            CancelledEvent {
                id: campaign_id,
                creator: campaign.creator,
            },
        );

        Ok(())
    }

    /// Refunds a donor's recorded contribution to a cancelled campaign.
    ///
    /// Returns the donor's exact contribution (in stroops) and zeroes their
    /// recorded balance so a refund cannot be claimed twice. The campaign's
    /// `raised_amount` is decremented by the refunded amount.
    ///
    /// # Arguments
    /// * `donor` - Address reclaiming its contribution. Must authorize the call.
    /// * `campaign_id` - ID of the cancelled campaign.
    ///
    /// # Returns
    /// `Ok(amount)` with the refunded amount in stroops.
    pub fn claim_refund(
        env: Env,
        donor: Address,
        campaign_id: u64,
    ) -> Result<i128, ContractError> {
        donor.require_auth();

        let mut campaign = read_campaign(&env, campaign_id)?;
        if campaign.status != CampaignStatus::Cancelled {
            return Err(ContractError::CampaignNotCancelled);
        }

        let amount = read_donor_contribution(&env, campaign_id, &donor);
        if amount <= 0 {
            return Err(ContractError::NothingToRefund);
        }

        enter_lock(&env)?;
        let result = (|| {
            // Zero the recorded contribution before transferring to prevent a
            // reentrant or repeated refund.
            write_donor_contribution(&env, campaign_id, &donor, 0);
            campaign.raised_amount = campaign
                .raised_amount
                .checked_sub(amount)
                .ok_or(ContractError::ArithmeticError)?;
            write_campaign(&env, &campaign);

            if token::Client::new(&env, &campaign.accepted_token)
                .try_transfer(&env.current_contract_address(), &donor, &amount)
                .is_err()
            {
                return Err(ContractError::RefundTransferFailed);
            }

            env.events().publish(
                (symbol_short!("refund"), campaign_id),
                RefundEvent {
                    campaign_id,
                    donor: donor.clone(),
                    amount,
                },
            );

            Ok(amount)
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
    pub fn claim_funds(
        env: Env,
        beneficiary: Address,
        campaign_id: u64,
    ) -> Result<i128, ContractError> {
        beneficiary.require_auth();

        let mut campaign = read_campaign(&env, campaign_id)?;
        sync_status(&env, &mut campaign);

        if campaign.status == CampaignStatus::Claimed {
            return Err(ContractError::AlreadyClaimed);
        }

        let is_beneficiary = campaign
            .beneficiaries
            .iter()
            .any(|(addr, _)| addr == beneficiary);
        if beneficiary != campaign.creator && !is_beneficiary {
            return Err(ContractError::Unauthorized);
        }

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

            // Distribute funds to beneficiaries (including platform fee calculation)
            distribute_funds(&env, &admin, &campaign, amount)?;

            campaign.raised_amount = 0;
            campaign.status = CampaignStatus::Claimed;
            write_campaign(&env, &campaign);

            // Gross amount in event preserves the original raised amount for indexers.
            env.events().publish(
                (symbol_short!("funds"), symbol_short!("claimed")),
                (
                    campaign.id,
                    beneficiary.clone(),
                    amount,
                    campaign.accepted_token.clone(),
                ),
            );

            env.events().publish(
                (symbol_short!("claimed"), campaign.id),
                ClaimedEvent {
                    campaign_id: campaign.id,
                    amount,
                    beneficiary: beneficiary.clone(),
                },
            );

            Ok(amount)
        })();

        exit_lock(&env);
        result
    }

    /// Refunds a donor's contribution when a campaign expires without meeting its target.
    pub fn refund(env: Env, campaign_id: u64, donor: Address) -> Result<(), ContractError> {
        donor.require_auth();

        enter_lock(&env)?;
        let result = (|| {
            let mut campaign = read_campaign(&env, campaign_id)?;
            sync_status(&env, &mut campaign);

            // Only allow refunds for campaigns that expired without meeting their target.
            if campaign.status != CampaignStatus::Expired
                || campaign.raised_amount >= campaign.target_amount
            {
                return Err(ContractError::RefundNotAllowed);
            }

            let donated = read_donor_contribution(&env, campaign_id, &donor);
            if donated <= 0 {
                return Err(ContractError::NothingToClaim);
            }

            // Transfer exact donated amount back to the donor.
            token::Client::new(&env, &campaign.accepted_token)
                .transfer(&env.current_contract_address(), &donor, &donated);

            // Reset donor contribution and update campaign total.
            write_donor_contribution(&env, campaign_id, &donor, 0);
            campaign.raised_amount = campaign
                .raised_amount
                .checked_sub(donated)
                .ok_or(ContractError::ArithmeticError)?;
            write_campaign(&env, &campaign);

            env.events().publish(
                (symbol_short!("refund"),),
                RefundEvent {
                    campaign_id,
                    donor,
                    amount: donated,
                },
            );

            Ok(())
        })();

        exit_lock(&env);
        result
    }

    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), ContractError> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&owner_key())
            .ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        env.events()
            .publish((symbol_short!("Upgraded"),), new_wasm_hash);
        Ok(())
    }

    pub fn get_owner(env: Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&owner_key())
            .ok_or(ContractError::NotInitialized)
    }

    pub fn set_owner(env: Env, new_owner: Address) -> Result<(), ContractError> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&owner_key())
            .ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        env.storage().instance().set(&owner_key(), &new_owner);
        env.events()
            .publish((symbol_short!("OwnerSet"),), new_owner);
        Ok(())
    }

    pub fn get_campaigns_by_creator(env: Env, creator: Address) -> Vec<Campaign> {
        let mut result = Vec::new(&env);
        let next_id = read_next_id(&env);
        let now = env.ledger().timestamp();
        for id in 1..next_id {
            if let Ok(mut campaign) = read_campaign(&env, id) {
                if campaign.creator == creator {
                    campaign.status = derive_status(now, &campaign);
                    result.push_back(campaign);
                }
            }
        }
        result
    }

    #[allow(unused_mut)]
    pub fn get_campaigns_paged(env: Env, offset: u64, mut limit: u32) -> Vec<Campaign> {
        if limit > 20 {
            limit = 20;
        }
        let mut result = Vec::new(&env);
        let next_id = read_next_id(&env);
        let start_id = offset + 1;

        let mut end_id = offset + (limit as u64);
        if end_id >= next_id {
            if next_id > 0 {
                end_id = next_id - 1;
            } else {
                end_id = 0;
            }
        }

        let now = env.ledger().timestamp();
        for id in start_id..=end_id {
            if let Ok(mut campaign) = read_campaign(&env, id) {
                campaign.status = derive_status(now, &campaign);
                result.push_back(campaign);
            }
        }
        result
    }

    pub fn get_campaigns(env: Env, ids: Vec<u64>) -> Result<Vec<Option<Campaign>>, ContractError> {
        if ids.len() > 50 {
            return Err(ContractError::LimitExceeded);
        }
        let mut result = Vec::new(&env);
        let now = env.ledger().timestamp();
        for id in ids.iter() {
            match read_campaign(&env, id) {
                Ok(mut campaign) => {
                    campaign.status = derive_status(now, &campaign);
                    result.push_back(Some(campaign));
                }
                Err(_) => {
                    result.push_back(None);
                }
            }
        }
        Ok(result)
    }

    /// Returns the current state of a campaign with a derived status.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, ContractError> {
        let mut campaign = read_campaign(&env, campaign_id)?;
        campaign.status = derive_status(env.ledger().timestamp(), &campaign);
        Ok(campaign)
    }

    /// Returns the total number of campaigns ever created.
    ///
    /// This value is derived from the NEXT_ID storage key and reflects all campaigns
    /// created, including expired or cancelled campaigns.
    pub fn get_total_campaigns(env: Env) -> u64 {
        let next_id = read_next_id(&env);
        next_id.saturating_sub(1)
    }

    /// Returns the top 5 donors for a campaign sorted by donated amount.
    pub fn get_top_donors(
        env: Env,
        campaign_id: u64,
    ) -> Result<Vec<(Address, i128)>, ContractError> {
        read_campaign(&env, campaign_id)?;
        Ok(read_top_donors(&env, campaign_id))
    }

    /// Returns the time remaining until the campaign deadline in seconds.
    ///
    /// Returns 0 if the deadline has passed, otherwise returns the number of seconds
    /// until the deadline. This is a read-only function that requires no authentication.
    pub fn get_time_left(env: Env, campaign_id: u64) -> Result<u64, ContractError> {
        let campaign = read_campaign(&env, campaign_id)?;
        let now = env.ledger().timestamp();

        if now >= campaign.deadline {
            Ok(0)
        } else {
            Ok(campaign.deadline - now)
        }
    }

    /// Adds a batch of addresses to the campaign whitelist. Only the creator may call.
    pub fn add_to_whitelist(
        env: Env,
        id: u64,
        addresses: Vec<Address>,
    ) -> Result<(), ContractError> {
        let mut campaign = read_campaign(&env, id)?;
        campaign.creator.require_auth();

        // Batch write whitelist entries
        for addr in addresses.iter() {
            write_whitelist(&env, id, &addr, true);
        }

        Ok(())
    }

    /// Adds an update to a campaign. Maximum 10 updates allowed.
    pub fn add_update(env: Env, id: u64, content: String) -> Result<(), ContractError> {
        let campaign = read_campaign(&env, id)?;
        campaign.creator.require_auth();

        if content.is_empty() {
            return Err(ContractError::InvalidUpdateContent);
        }

        let count = read_update_count(&env, id);
        if count >= 10 {
            return Err(ContractError::TooManyUpdates);
        }

        let update = Update {
            content,
            timestamp: env.ledger().timestamp(),
        };

        write_update(&env, id, count, &update);
        write_update_count(&env, id, count + 1);

        Ok(())
    }

    /// Retrieves all updates for a campaign in chronological order.
    pub fn get_updates(env: Env, id: u64) -> Vec<Update> {
        let count = read_update_count(&env, id);
        let mut updates = Vec::new(&env);
        for i in 0..count {
            if let Some(update) = read_update(&env, id, i) {
                updates.push_back(update);
            }
        }
        updates
    }
}

#[cfg(test)]
mod tests {
    extern crate std;

    use super::*;
    use soroban_sdk::testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger, MockAuth,
        MockAuthInvoke,
    };
    use soroban_sdk::{token, Address, BytesN, Env, IntoVal, String, Symbol, TryFromVal, Vec};

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

    fn setup_without_auth_mock() -> (
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

        let creator = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let donor = Address::generate(&env);
        let platform_admin = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_client = token::Client::new(&env, &token_id.address());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id.address());

        token_admin_client
            .mock_all_auths()
            .mint(&donor, &1_000_000_000_000);
        token_admin_client
            .mock_all_auths()
            .mint(&creator, &1_000_000_000_000);

        let contract_id = env.register_contract(None, StellarGiveContract);
        let client = StellarGiveContractClient::new(&env, &contract_id);
        client.mock_all_auths().initialize(&platform_admin);

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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.id, 1);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(campaign.creator, creator);
        assert_eq!(campaign.beneficiaries, bens);
        assert_eq!(campaign.target_amount, 10_000_000);
        assert_eq!(campaign.raised_amount, 0);
        assert_eq!(campaign.category, symbol_short!("relief"));
        assert_eq!(
            campaign.metadata_uri,
            String::from_str(&env, "https://example.com/meta")
        );
        assert_eq!(campaign.max_per_donor, None);
        assert_eq!(campaign.website, None);
        assert_eq!(campaign.twitter, None);
    }

    #[test]
    fn create_campaign_emits_created_event() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let target_amount: i128 = 10_000_000;
        let bens = single_ben(&env, &beneficiary);
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Flood Relief"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &target_amount,
            &2_000,
            &token_client.address,
            &None,
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
    fn create_campaign_rejects_contract_address_as_beneficiary() {
        let (env, client, creator, _beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let contract_beneficiary =
            env.as_contract(&client.address, || env.current_contract_address());
        let mut bens = Vec::new(&env);
        bens.push_back((contract_beneficiary, 10_000_u32));

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Locked Funds"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        assert_eq!(result, Err(Ok(ContractError::InvalidBeneficiary)));
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &(1_000 + MAX_DURATION),
            &token_client.address,
            &None,
        );
        assert_eq!(id, 1);

        // One second over the limit is rejected.
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Too Long Relief"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &(1_000 + MAX_DURATION + 1),
            &token_client.address,
            &None,
        );
        assert!(result.is_err());
    }

    #[test]
    fn create_campaign_rejects_past_deadline() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000); // Mock current ledger time

        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Past Deadline"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &4_999, // Set deadline strictly in the past
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
    }

    #[test]
    fn cancel_campaign_requires_creator_auth_and_emits_event() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
            setup_without_auth_mock();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.mock_all_auths().create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Cancelable Relief"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        client.mock_all_auths().cancel_campaign(&creator, &campaign_id);

        assert_eq!(
            env.auths(),
            std::vec![(
                creator.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        client.address.clone(),
                        Symbol::new(&env, "cancel_campaign"),
                        (creator.clone(), campaign_id).into_val(&env)
                    )),
                    sub_invocations: std::vec![]
                }
            )]
        );

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.status, CampaignStatus::Cancelled);

        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("cancel"))
            })
            .expect("CancelledEvent was not emitted by cancel_campaign");

        let payload = CancelledEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as CancelledEvent");
        assert_eq!(payload.id, campaign_id);
        assert_eq!(payload.creator, creator);
    }

    #[test]
    fn cancel_campaign_rejects_non_creator_auth() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) =
            setup_without_auth_mock();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.mock_all_auths().create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Creator Only"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        let attacker = Address::generate(&env);
        let invoke = MockAuthInvoke {
            contract: &client.address,
            fn_name: "cancel_campaign",
            args: (attacker.clone(), campaign_id).into_val(&env),
            sub_invokes: &[],
        };
        let auths = [MockAuth {
            address: &attacker,
            invoke: &invoke,
        }];

        let result = client
            .mock_auths(&auths)
            .try_cancel_campaign(&attacker, &campaign_id);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Active
        );
    }

    #[test]
    fn cancel_campaign_allows_cancellation_with_donations() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Already Fundraising"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &MIN_DONATION, &false, &None);

        client.cancel_campaign(&creator, &campaign_id);
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Cancelled
        );
    }

    #[test]
    fn claim_refund_returns_exact_contribution() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Refundable"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        let contribution: i128 = 3_000_000;
        let donor_before = token_client.balance(&donor);
        client.donate(&donor, &campaign_id, &contribution, &false, &None);
        client.cancel_campaign(&creator, &campaign_id);

        let refunded = client.claim_refund(&donor, &campaign_id);
        assert_eq!(refunded, contribution);
        // Donor is made whole to the exact stroop.
        assert_eq!(token_client.balance(&donor), donor_before);
        // Recorded contribution is cleared and raised_amount drained.
        assert_eq!(client.get_campaign(&campaign_id).raised_amount, 0);

        // A second refund must find nothing left to return.
        let second = client.try_claim_refund(&donor, &campaign_id);
        assert_eq!(second, Err(Ok(ContractError::NothingToRefund)));
    }

    #[test]
    fn claim_refund_emits_event() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Refundable"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        let contribution: i128 = 2_500_000;
        client.donate(&donor, &campaign_id, &contribution, &false, &None);
        client.cancel_campaign(&creator, &campaign_id);
        client.claim_refund(&donor, &campaign_id);

        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("refund"))
            })
            .expect("RefundEvent was not emitted by claim_refund");

        let payload = RefundEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as RefundEvent");
        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.donor, donor);
        assert_eq!(payload.amount, contribution);
    }

    #[test]
    fn cancel_campaign_rejects_after_claim() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Funded And Claimed"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        // Donating the full target auto-claims, moving the campaign to Claimed.
        client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Claimed
        );

        let result = client.try_cancel_campaign(&creator, &campaign_id);
        assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
    }

    #[test]
    fn claim_refund_rejects_when_not_cancelled() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Active Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &MIN_DONATION, &false, &None);

        let result = client.try_claim_refund(&donor, &campaign_id);
        assert_eq!(result, Err(Ok(ContractError::CampaignNotCancelled)));
    }

    // -----------------------------------------------------------------------
    // Issue #10 — token interface validation
    // -----------------------------------------------------------------------

    #[test]
    fn create_campaign_accepts_valid_sac_token() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "SAC Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );
        assert!(result.is_ok(), "valid SAC token must be accepted");
    }

    #[test]
    fn create_campaign_rejects_non_token_contract() {
        let (env, client, creator, beneficiary, _donor, _admin, _token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let not_a_token = client.address.clone();
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Bad Token Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &not_a_token,
            &None,
        );
        assert!(
            result.is_err(),
            "non-token contract address must be rejected"
        );
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &3_000_000, &false, &None);
        let after_first = client.get_campaign(&campaign_id);
        assert_eq!(after_first.raised_amount, 3_000_000);
        assert_eq!(after_first.status, CampaignStatus::Active);

        client.donate(&donor, &campaign_id, &7_000_000, &false, &None);
        let after_second = client.get_campaign(&campaign_id);
        assert_eq!(after_second.raised_amount, 10_000_000);
        assert_eq!(after_second.status, CampaignStatus::Funded);
    }

    #[test]
    fn donate_emits_goal_reached_event_on_exact_target_hit() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Goal Hit"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

        let goal_event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(goal_reached_topic(&env))
            })
            .expect("GoalReachedEvent was not emitted when the target was hit");

        let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
            .expect("event data did not decode as GoalReachedEvent");
        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.total_raised, 10_000_000);
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Funded
        );
    }

    #[test]
    fn donate_emits_goal_reached_event_on_overshoot() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Goal Overshoot"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &11_000_000, &false, &None);

        let goal_event_count = env
            .events()
            .all()
            .iter()
            .filter(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(goal_reached_topic(&env))
            })
            .count();

        assert_eq!(goal_event_count, 1);

        let goal_event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(goal_reached_topic(&env))
            })
            .expect("GoalReachedEvent was not emitted when the target was overshot");

        let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
            .expect("event data did not decode as GoalReachedEvent");
        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.total_raised, 11_000_000);
        assert_eq!(
            client.get_campaign(&campaign_id).status,
            CampaignStatus::Funded
        );
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        let result = client.try_donate(&donor, &campaign_id, &(MIN_DONATION - 1), &false, &None);
        assert!(result.is_err());
    }

    #[test]
    fn donate_detects_overflow_and_returns_arithmetic_error() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Overflow Guard"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        // Seed campaign state near i128::MAX to exercise checked_add in donate path.
        env.as_contract(&client.address, || {
            let mut campaign = read_campaign(&env, campaign_id).unwrap();
            campaign.target_amount = i128::MAX;
            campaign.raised_amount = i128::MAX - (MIN_DONATION - 1);
            write_campaign(&env, &campaign);
        });

        let result = client.try_donate(&donor, &campaign_id, &MIN_DONATION, &false, &None);
        assert_eq!(result, Err(Ok(ContractError::ArithmeticError)));
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &12_000_000,
            &20_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &12_000_000, &false, &None);

        let ben_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let ben_after = token_client.balance(&beneficiary);
        let admin_after = token_client.balance(&admin);
        let campaign = client.get_campaign(&campaign_id);

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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &50_000_000,
            &500,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &5_000_000, &false, &None);
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &1_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &1_000_000, &false, &None);
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &20_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &20_000_000, &false, &None);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);

        assert_eq!(claimed, 20_000_000);
        assert_eq!(b2_after - b2_before, 9_900_000);
        assert_eq!(b1_after - b1_before, 9_900_000);
        assert_eq!((b1_after - b1_before) + (b2_after - b2_before), 19_800_000);
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

        let b1_before = token_client.balance(&beneficiary);
        let b2_before = token_client.balance(&beneficiary2);
        let b3_before = token_client.balance(&beneficiary3);
        let claimed = client.claim_funds(&creator, &campaign_id);
        let b1_after = token_client.balance(&beneficiary);
        let b2_after = token_client.balance(&beneficiary2);
        let b3_after = token_client.balance(&beneficiary3);

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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
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
        for expected_id in 1_u64..=u64::from(MAX_CAMPAIGNS_PER_CREATOR) {
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bench"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &20_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &1_000_000, &false, &None);
        client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

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

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Fee Test"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &20_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

        let ben_before = token_client.balance(&beneficiary);
        let admin_before = token_client.balance(&admin);
        let claimed = client.claim_funds(&beneficiary, &campaign_id);

        assert_eq!(claimed, 10_000_000);
        assert_eq!(token_client.balance(&admin) - admin_before, 100_000);
        assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
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
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &gross,
            &20_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &gross, &false, &None);

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

        let contract_id = env.register_contract(None, StellarGiveContract);
        let client = StellarGiveContractClient::new(&env, &contract_id);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Uninit"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &5_000,
            &token_client.address,
            &None,
        );
        client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

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

    #[test]
    fn create_campaign_rejects_sub_minimum_target() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Too Low"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &(MIN_TARGET - 1),
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
    }

    #[test]
    fn create_campaign_validates_metadata_uri() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        // Invalid prefix
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Invalid Prefix"),
            &String::from_str(&env, "ftp://example.com"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::InvalidMetadataUri)));

        // Too long
        let mut long_uri_bytes = [b'a'; 260];
        long_uri_bytes[0..8].copy_from_slice(b"https://");
        let long_uri_str = core::str::from_utf8(&long_uri_bytes).unwrap();
        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Too Long"),
            &String::from_str(&env, long_uri_str),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::MetadataUriTooLong)));
    }

    #[test]
    fn create_campaign_validates_category() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let bens = single_ben(&env, &beneficiary);

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Invalid Category"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("sports"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::InvalidCategory)));
    }

    #[test]
    fn create_campaign_enforces_title_length_limit() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let bens = single_ben(&env, &beneficiary);

        let valid_title =
            String::from_str(&env, "12345678901234567890123456789012345678901234567890");
        let ok = client.try_create_campaign(
            &creator,
            &bens,
            &valid_title,
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert!(ok.is_ok(), "title of 50 chars should be accepted");

        let too_long_title =
            String::from_str(&env, "123456789012345678901234567890123456789012345678901");
        let err = client.try_create_campaign(
            &creator,
            &bens,
            &too_long_title,
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(err, Err(Ok(ContractError::InvalidTitle)));
    }

    #[test]
    fn create_campaign_enforces_creator_campaign_limit() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);
        let bens = single_ben(&env, &beneficiary);

        for _ in 0..MAX_CAMPAIGNS_PER_CREATOR {
            let _ = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Cap Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &MIN_TARGET,
                &2_000,
                &token_client.address,
                &None,
            );
        }

        let result = client.try_create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Cap Test Overflow"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &MIN_TARGET,
            &2_000,
            &token_client.address,
            &None,
        );
        assert_eq!(result, Err(Ok(ContractError::LimitExceeded)));
    }

    #[test]
    fn donate_enforces_donor_cap() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let mut bens = Vec::new(&env);
        bens.push_back((beneficiary.clone(), 10_000_u32));

        let cap = 50_000_000;
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Capped"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &100_000_000,
            &2_000,
            &token_client.address,
            &Some(cap),
        );

        // First donation within cap
        client.donate(&donor, &campaign_id, &30_000_000, &false, &None);

        // Second donation exceeding cap
        let result = client.try_donate(&donor, &campaign_id, &30_000_000, &false, &None);
        assert_eq!(result, Err(Ok(ContractError::ExceedsDonorCap)));

        // Second donation exactly at cap
        client.donate(&donor, &campaign_id, &20_000_000, &false, &None);
    }

    #[test]
    fn donate_anonymous_emits_masked_event_and_transfers_funds() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Medical Aid"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        let before_bal = token_client.balance(&donor);
        client.donate(&donor, &campaign_id, &1_000_000, &true, &None);
        let after_bal = token_client.balance(&donor);

        // Funds must be debited correctly from the donor's address.
        assert_eq!(before_bal - after_bal, 1_000_000);

        let after_donate = client.get_campaign(&campaign_id);
        assert_eq!(after_donate.raised_amount, 1_000_000);

        // Verify the emitted event uses the masked address.
        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("donation"))
            })
            .expect("Donation event was not emitted");

        let payload = DonationEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as DonationEvent");

        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(
            payload.donor,
            Address::from_string(&String::from_str(
                &env,
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
            ))
        );
        assert_eq!(payload.amount, 1_000_000);
        assert_eq!(payload.total_raised, 1_000_000);
        assert_eq!(payload.accepted_token, token_client.address);

        // Top donors should also show the masked zero address instead of real donor.
        let top = client.get_top_donors(&campaign_id);
        assert_eq!(top.len(), 1);
        assert_eq!(
            top.get(0).unwrap().0,
            Address::from_string(&String::from_str(
                &env,
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
            ))
        );
    }

    #[test]
    fn donate_non_anonymous_emits_real_address() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 5_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Medical Aid"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("donation"))
            })
            .expect("Donation event was not emitted");

        let payload = DonationEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as DonationEvent");

        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.donor, donor);
        assert_eq!(payload.amount, 1_000_000);

        // Top donors should show the real address.
        let top = client.get_top_donors(&campaign_id);
        assert_eq!(top.len(), 1);
        assert_eq!(top.get(0).unwrap().0, donor);
    }

    #[test]
    fn test_next_id_migration_and_instance_storage() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();

        env.as_contract(&client.address, || {
            let key = next_id_key();

            // Ensure starting state is 1
            assert_eq!(read_next_id(&env), 1);

            // Simulate old deployment by setting NEXT_ID in persistent storage manually
            let old_id: u64 = 42;
            env.storage().persistent().set(&key, &old_id);

            // Ensure it's not in instance storage yet
            assert!(env.storage().instance().get::<_, u64>(&key).is_none());

            // 1. Next read should migrate from persistent to instance
            let read_id = read_next_id(&env);
            assert_eq!(read_id, old_id);

            // 2. Verify it was removed from persistent
            assert!(env.storage().persistent().get::<_, u64>(&key).is_none());

            // 3. Verify it was written to instance
            let instance_id = env.storage().instance().get::<_, u64>(&key).unwrap();
            assert_eq!(instance_id, old_id);
        });

        // Create a campaign, should use the migrated ID 42 and increment to 43
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Migrated Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        assert_eq!(campaign_id, 42);

        // Check next id is 43 in instance storage
        env.as_contract(&client.address, || {
            let key = next_id_key();
            assert_eq!(read_next_id(&env), 43);
            assert_eq!(env.storage().instance().get::<_, u64>(&key).unwrap(), 43);
        });
    }

    #[test]
    fn test_sequential_id_behavior() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();

        let bens = single_ben(&env, &beneficiary);
        let id1 = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Camp 1"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );
        let id2 = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Camp 2"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        env.as_contract(&client.address, || {
            assert_eq!(read_next_id(&env), 3);
        });
    }

    #[test]
    fn test_donation_with_comment_emits_event() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        let comment_str = String::from_str(&env, "Great project!");
        client.donate(
            &donor,
            &campaign_id,
            &1_000_000,
            &false,
            &Some(comment_str.clone()),
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
                        == Some(symbol_short!("donation"))
            })
            .expect("Donation event was not emitted");

        let payload = DonationEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as DonationEvent");

        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.donor, donor);
        assert_eq!(payload.amount, 1_000_000);
        assert_eq!(payload.comment, Some(comment_str));
    }

    #[test]
    fn test_donation_without_comment_emits_event() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

        let event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                addr == &client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("donation"))
            })
            .expect("Donation event was not emitted");

        let payload = DonationEvent::try_from_val(&env, &event.2)
            .expect("event data did not decode as DonationEvent");

        assert_eq!(payload.campaign_id, campaign_id);
        assert_eq!(payload.donor, donor);
        assert_eq!(payload.amount, 1_000_000);
        assert_eq!(payload.comment, None);
    }

    #[test]
    fn test_comment_not_stored_in_persistent_state() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Campaign"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        let comment_str = String::from_str(&env, "Great project!");
        client.donate(&donor, &campaign_id, &1_000_000, &false, &Some(comment_str));

        let campaign = client.get_campaign(&campaign_id);
        assert_eq!(campaign.raised_amount, 1_000_000);

        env.as_contract(&client.address, || {
            let contribution = read_donor_contribution(&env, campaign_id, &donor);
            assert_eq!(contribution, 1_000_000);
        });
    }

    // =======================================================================
    // Issue #116: Comprehensive unit tests for create_campaign
    // =======================================================================

    mod create_campaign_tests {
        use super::*;

        /// Helper: create a campaign with standard valid parameters.
        fn create_standard_campaign(
            client: &StellarGiveContractClient<'static>,
            creator: &Address,
            bens: &Vec<(Address, u32)>,
            token_address: &Address,
        ) -> u64 {
            client.create_campaign(
                creator,
                bens,
                &String::from_str(&client.env, "Test Campaign"),
                &String::from_str(&client.env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                token_address,
                &None,
            )
        }

        #[test]
        fn create_campaign_with_valid_parameters_succeeds() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Medical Aid Fund"),
                &String::from_str(&env, "https://ipfs.io/ipfs/QmTest123"),
                &symbol_short!("medical"),
                &50_000_000,
                &5_000,
                &token_client.address,
                &Some(25_000_000),
            );

            let campaign = client.get_campaign(&id);
            assert_eq!(campaign.id, id);
            assert_eq!(campaign.creator, creator);
            assert_eq!(campaign.beneficiaries, bens);
            assert_eq!(campaign.title, String::from_str(&env, "Medical Aid Fund"));
            assert_eq!(
                campaign.metadata_uri,
                String::from_str(&env, "https://ipfs.io/ipfs/QmTest123")
            );
            assert_eq!(campaign.category, symbol_short!("medical"));
            assert_eq!(campaign.target_amount, 50_000_000);
            assert_eq!(campaign.raised_amount, 0);
            assert_eq!(campaign.deadline, 5_000);
            assert_eq!(campaign.accepted_token, token_client.address);
            assert_eq!(campaign.status, CampaignStatus::Active);
            assert_eq!(campaign.max_per_donor, Some(25_000_000));
        }

        #[test]
        fn create_campaign_with_ipfs_metadata_uri_succeeds() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "IPFS Campaign"),
                &String::from_str(&env, "ipfs://QmYwAPJzv5CZsnN625s3XfREM3zN1Bv2e7v6b1ALg"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );

            let campaign = client.get_campaign(&id);
            assert_eq!(
                campaign.metadata_uri,
                String::from_str(&env, "ipfs://QmYwAPJzv5CZsnN625s3XfREM3zN1Bv2e7v6b1ALg")
            );
        }

        #[test]
        fn create_campaign_stores_all_input_parameters_correctly() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Shelter Build"),
                &String::from_str(&env, "https://example.com/shelter"),
                &symbol_short!("shelter"),
                &100_000_000,
                &50_000,
                &token_client.address,
                &Some(50_000_000),
            );

            let c = client.get_campaign(&id);
            assert_eq!(c.id, id);
            assert_eq!(c.creator, creator);
            assert_eq!(c.beneficiaries.len(), 1);
            assert_eq!(c.beneficiaries.get(0).unwrap().0, beneficiary);
            assert_eq!(c.beneficiaries.get(0).unwrap().1, 10_000_u32);
            assert_eq!(c.title, String::from_str(&env, "Shelter Build"));
            assert_eq!(
                c.metadata_uri,
                String::from_str(&env, "https://example.com/shelter")
            );
            assert_eq!(c.category, symbol_short!("shelter"));
            assert_eq!(c.target_amount, 100_000_000);
            assert_eq!(c.raised_amount, 0);
            assert_eq!(c.deadline, 50_000);
            assert_eq!(c.accepted_token, token_client.address);
            assert_eq!(c.status, CampaignStatus::Active);
            assert_eq!(c.max_per_donor, Some(50_000_000));
            assert_eq!(c.website, None);
            assert_eq!(c.twitter, None);
        }

        #[test]
        fn create_campaign_stores_optional_website_and_twitter() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Social Campaign"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("other"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );

            let c = client.get_campaign(&id);
            assert_eq!(c.website, None);
            assert_eq!(c.twitter, None);
        }

        // --- Failure cases ---

        #[test]
        fn create_campaign_rejects_empty_title() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, ""),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::EmptyTitle)));
        }

        #[test]
        fn create_campaign_rejects_title_at_51_chars() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let title_51 =
                String::from_str(&env, "123456789012345678901234567890123456789012345678901");
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &title_51,
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
        }

        #[test]
        fn create_campaign_accepts_title_at_exactly_50_chars() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let title_50 =
                String::from_str(&env, "12345678901234567890123456789012345678901234567890");
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &title_50,
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert!(result.is_ok(), "50-char title should be accepted");
        }

        #[test]
        fn create_campaign_rejects_zero_target() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Zero Target"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &0,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
        }

        #[test]
        fn create_campaign_rejects_target_below_minimum() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Low Target"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &(MIN_TARGET - 1),
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::TargetTooLow)));
        }

        #[test]
        fn create_campaign_accepts_target_at_minimum() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Min Target"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &MIN_TARGET,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(id, 1);
        }

        #[test]
        fn create_campaign_rejects_deadline_in_the_past() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 5_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Past Deadline"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &4_999,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
        }

        #[test]
        fn create_campaign_rejects_deadline_equal_to_now() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 5_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Equal Deadline"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &5_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
        }

        #[test]
        fn create_campaign_rejects_deadline_beyond_one_year() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Too Far"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &(1_000 + MAX_DURATION + 1),
                &token_client.address,
                &None,
            );
            assert!(result.is_err());
        }

        #[test]
        fn create_campaign_accepts_deadline_at_exactly_one_year() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "One Year Max"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &(1_000 + MAX_DURATION),
                &token_client.address,
                &None,
            );
            assert_eq!(id, 1);
        }

        #[test]
        fn create_campaign_rejects_invalid_metadata_uri_prefix() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bad URI"),
                &String::from_str(&env, "ftp://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidMetadataUri)));
        }

        #[test]
        fn create_campaign_rejects_oversized_metadata_uri() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let mut long_uri = [b'a'; 260];
            long_uri[0..8].copy_from_slice(b"https://");
            let long_uri_str = core::str::from_utf8(&long_uri).unwrap();
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Long URI"),
                &String::from_str(&env, long_uri_str),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::MetadataUriTooLong)));
        }

        #[test]
        fn create_campaign_rejects_invalid_category() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bad Category"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("sports"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidCategory)));
        }

        #[test]
        fn create_campaign_accepts_all_valid_categories() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let categories = ["medical", "food", "shelter", "education", "relief", "other"];

            for (i, cat) in categories.iter().enumerate() {
                let id = client.create_campaign(
                    &creator,
                    &bens,
                    &String::from_str(&env, "Cat Test"),
                    &String::from_str(&env, "https://example.com/meta"),
                    &Symbol::new(&env, cat),
                    &10_000_000,
                    &(3_000 + i as u64),
                    &token_client.address,
                    &None,
                );
                assert_eq!(id, (i + 1) as u64);
            }
        }

        #[test]
        fn create_campaign_rejects_contract_address_as_beneficiary() {
            let (env, client, creator, _beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let contract_ben = env.as_contract(&client.address, || env.current_contract_address());
            let mut bens = Vec::new(&env);
            bens.push_back((contract_ben, 10_000_u32));

            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Contract Ben"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidBeneficiary)));
        }

        #[test]
        fn create_campaign_rejects_beneficiary_shares_not_summing_to_10000() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let beneficiary2 = Address::generate(&env);
            let mut bens = Vec::new(&env);
            bens.push_back((beneficiary.clone(), 5_000_u32));
            bens.push_back((beneficiary2.clone(), 4_999_u32));

            let result = client.try_create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Bad Shares"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            assert_eq!(result, Err(Ok(ContractError::InvalidShares)));
        }

        // --- ID increment tests ---

        #[test]
        fn first_campaign_gets_id_1() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = create_standard_campaign(&client, &creator, &bens, &token_client.address);
            assert_eq!(id, 1);
        }

        #[test]
        fn second_campaign_gets_id_2() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id1 = create_standard_campaign(&client, &creator, &bens, &token_client.address);
            let id2 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Second Campaign"),
                &String::from_str(&env, "https://example.com/meta2"),
                &symbol_short!("education"),
                &20_000_000,
                &3_000,
                &token_client.address,
                &None,
            );
            assert_eq!(id1, 1);
            assert_eq!(id2, 2);
        }

        #[test]
        fn id_increments_across_multiple_creators() {
            let (
                env,
                client,
                creator,
                beneficiary,
                _donor,
                _admin,
                token_client,
                token_admin_client,
            ) = setup();
            set_timestamp(&env, 1_000);

            let creator2 = Address::generate(&env);
            token_admin_client.mint(&creator2, &1_000_000_000_000);

            let bens = single_ben(&env, &beneficiary);
            let id1 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Creator 1 Campaign"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000,
                &token_client.address,
                &None,
            );
            let id2 = client.create_campaign(
                &creator2,
                &bens,
                &String::from_str(&env, "Creator 2 Campaign"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &3_000,
                &token_client.address,
                &None,
            );
            assert_eq!(id1, 1);
            assert_eq!(id2, 2);
        }

        #[test]
        fn stored_campaign_data_matches_input_exactly() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Exact Match"),
                &String::from_str(&env, "https://example.com/exact"),
                &symbol_short!("food"),
                &77_777_777,
                &12_345,
                &token_client.address,
                &Some(10_000_000),
            );

            let c = client.get_campaign(&id);
            assert_eq!(c.id, id);
            assert_eq!(c.creator, creator);
            assert_eq!(c.beneficiaries.get(0).unwrap().0, beneficiary);
            assert_eq!(c.beneficiaries.get(0).unwrap().1, 10_000_u32);
            assert_eq!(c.title, String::from_str(&env, "Exact Match"));
            assert_eq!(
                c.metadata_uri,
                String::from_str(&env, "https://example.com/exact")
            );
            assert_eq!(c.category, symbol_short!("food"));
            assert_eq!(c.target_amount, 77_777_777);
            assert_eq!(c.raised_amount, 0);
            assert_eq!(c.deadline, 12_345);
            assert_eq!(c.accepted_token, token_client.address);
            assert_eq!(c.status, CampaignStatus::Active);
            assert_eq!(c.max_per_donor, Some(10_000_000));
        }

        #[test]
        fn create_campaign_emits_created_event_with_correct_payload() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Event Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &25_000_000,
                &2_000,
                &token_client.address,
                &None,
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
                .expect("CreatedEvent was not emitted");

            let payload = CreatedEvent::try_from_val(&env, &event.2)
                .expect("event data did not decode as CreatedEvent");
            assert_eq!(payload.id, id);
            assert_eq!(payload.creator, creator);
            assert_eq!(payload.target_amount, 25_000_000);
        }
    }

    // =======================================================================
    // Issue #117: Integration test for full donation and claim flow
    // =======================================================================

    mod donate_claim_integration_tests {
        use super::*;

        /// Helper: create a campaign, donate to meet target, and return (env, client, ids, addresses).
        fn setup_funded_campaign() -> (
            Env,
            StellarGiveContractClient<'static>,
            u64,
            Address,
            Address,
            Address,
            Address,
            token::Client<'static>,
            token::StellarAssetClient<'static>,
        ) {
            let (env, client, creator, beneficiary, donor, admin, token_client, token_admin) =
                setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Integration Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            (
                env,
                client,
                campaign_id,
                creator,
                beneficiary,
                donor,
                admin,
                token_client,
                token_admin,
            )
        }

        #[test]
        fn full_flow_create_donate_target_met_claim_verify_balances() {
            let (env, client, campaign_id, creator, beneficiary, donor, admin, token_client, _) =
                setup_funded_campaign();

            let initial = client.get_campaign(&campaign_id);
            assert_eq!(initial.status, CampaignStatus::Active);
            assert_eq!(initial.raised_amount, 0);

            let donor_before = token_client.balance(&donor);
            let contract_before = token_client.balance(&client.address);
            let ben_before = token_client.balance(&beneficiary);
            let admin_before = token_client.balance(&admin);

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let after_donate = client.get_campaign(&campaign_id);
            assert_eq!(after_donate.raised_amount, 10_000_000);
            assert_eq!(after_donate.status, CampaignStatus::Funded);

            let donor_after_donate = token_client.balance(&donor);
            let contract_after_donate = token_client.balance(&client.address);
            assert_eq!(donor_before - donor_after_donate, 10_000_000);
            assert_eq!(contract_after_donate - contract_before, 10_000_000);

            let claimed = client.claim_funds(&creator, &campaign_id);
            assert_eq!(claimed, 10_000_000);

            let after_claim = client.get_campaign(&campaign_id);
            assert_eq!(after_claim.status, CampaignStatus::Claimed);
            assert_eq!(after_claim.raised_amount, 0);

            let ben_after = token_client.balance(&beneficiary);
            assert_eq!(ben_after - ben_before, 9_900_000);

            let admin_after = token_client.balance(&admin);
            assert_eq!(admin_after - admin_before, 100_000);

            let contract_after = token_client.balance(&client.address);
            assert_eq!(contract_after, contract_before);
        }

        #[test]
        fn full_flow_emits_donation_event() {
            let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &5_000_000, &false, &None);

            let donation_event = env
                .events()
                .all()
                .iter()
                .find(|(addr, topics, _)| {
                    addr == &client.address
                        && topics
                            .get(0)
                            .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                            == Some(symbol_short!("donation"))
                })
                .expect("Donation event was not emitted");

            let payload = DonationEvent::try_from_val(&env, &donation_event.2)
                .expect("event data did not decode as DonationEvent");
            assert_eq!(payload.campaign_id, campaign_id);
            assert_eq!(payload.donor, donor);
            assert_eq!(payload.amount, 5_000_000);
            assert_eq!(payload.total_raised, 5_000_000);
            assert_eq!(payload.accepted_token, token_client.address);
        }

        #[test]
        fn full_flow_emits_goal_reached_event_when_target_met() {
            let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, _token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let goal_event = env
                .events()
                .all()
                .iter()
                .find(|(addr, topics, _)| {
                    addr == &client.address
                        && topics
                            .get(0)
                            .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                            == Some(goal_reached_topic(&env))
                })
                .expect("GoalReachedEvent was not emitted");

            let payload = GoalReachedEvent::try_from_val(&env, &goal_event.2)
                .expect("event data did not decode as GoalReachedEvent");
            assert_eq!(payload.campaign_id, campaign_id);
            assert_eq!(payload.total_raised, 10_000_000);
        }

        #[test]
        fn full_flow_with_overshoot_donation() {
            let (env, client, campaign_id, creator, beneficiary, donor, admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &15_000_000, &false, &None);

            let after_donate = client.get_campaign(&campaign_id);
            assert_eq!(after_donate.raised_amount, 15_000_000);
            assert_eq!(after_donate.status, CampaignStatus::Funded);

            let ben_before = token_client.balance(&beneficiary);
            let admin_before = token_client.balance(&admin);
            let claimed = client.claim_funds(&creator, &campaign_id);

            assert_eq!(claimed, 15_000_000);
            assert_eq!(token_client.balance(&beneficiary) - ben_before, 14_850_000);
            assert_eq!(token_client.balance(&admin) - admin_before, 150_000);

            let after_claim = client.get_campaign(&campaign_id);
            assert_eq!(after_claim.status, CampaignStatus::Claimed);
            assert_eq!(after_claim.raised_amount, 0);
        }

        #[test]
        fn full_flow_with_multiple_donors() {
            let (
                env,
                client,
                campaign_id,
                creator,
                beneficiary,
                donor,
                _admin,
                token_client,
                token_admin_client,
            ) = setup_funded_campaign();

            let donor2 = Address::generate(&env);
            token_admin_client.mint(&donor2, &1_000_000_000_000);

            client.donate(&donor, &campaign_id, &6_000_000, &false, &None);
            client.donate(&donor2, &campaign_id, &4_000_000, &false, &None);

            let after_donate = client.get_campaign(&campaign_id);
            assert_eq!(after_donate.raised_amount, 10_000_000);
            assert_eq!(after_donate.status, CampaignStatus::Funded);

            let top = client.get_top_donors(&campaign_id);
            assert_eq!(top.len(), 2);
            assert_eq!(top.get(0).unwrap().0, donor);
            assert_eq!(top.get(0).unwrap().1, 6_000_000);
            assert_eq!(top.get(1).unwrap().0, donor2);
            assert_eq!(top.get(1).unwrap().1, 4_000_000);

            let ben_before = token_client.balance(&beneficiary);
            let claimed = client.claim_funds(&beneficiary, &campaign_id);
            assert_eq!(claimed, 10_000_000);
            assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
        }

        #[test]
        fn full_flow_with_anonymous_donation() {
            let (env, client, campaign_id, _creator, _beneficiary, donor, _admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &10_000_000, &true, &None);

            let donation_event = env
                .events()
                .all()
                .iter()
                .find(|(addr, topics, _)| {
                    addr == &client.address
                        && topics
                            .get(0)
                            .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                            == Some(symbol_short!("donation"))
                })
                .expect("Donation event was not emitted");

            let payload = DonationEvent::try_from_val(&env, &donation_event.2)
                .expect("event data did not decode as DonationEvent");

            let masked = Address::from_string(&String::from_str(
                &env,
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            ));
            assert_eq!(payload.donor, masked);

            let c = client.get_campaign(&campaign_id);
            assert_eq!(c.status, CampaignStatus::Funded);
            assert_eq!(c.raised_amount, 10_000_000);
        }

        #[test]
        fn full_flow_claim_by_beneficiary() {
            let (env, client, campaign_id, _creator, beneficiary, donor, _admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let ben_before = token_client.balance(&beneficiary);
            let claimed = client.claim_funds(&beneficiary, &campaign_id);
            assert_eq!(claimed, 10_000_000);
            assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);
        }

        #[test]
        fn full_flow_contract_token_balance_decreases_after_claim() {
            let (env, client, campaign_id, creator, _beneficiary, donor, _admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
            let contract_with_funds = token_client.balance(&client.address);

            client.claim_funds(&creator, &campaign_id);
            let contract_after_claim = token_client.balance(&client.address);

            assert_eq!(contract_with_funds - contract_after_claim, 10_000_000);
        }

        #[test]
        fn full_flow_fee_plus_net_equals_gross() {
            let (env, client, campaign_id, creator, beneficiary, donor, admin, token_client, _) =
                setup_funded_campaign();

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let ben_before = token_client.balance(&beneficiary);
            let admin_before = token_client.balance(&admin);
            client.claim_funds(&creator, &campaign_id);

            let fee = token_client.balance(&admin) - admin_before;
            let net = token_client.balance(&beneficiary) - ben_before;
            assert_eq!(fee + net, 10_000_000);
        }

        #[test]
        fn full_flow_claim_after_deadline_partial_funding() {
            let (env, client, creator, beneficiary, donor, admin, token_client, _) = setup();
            set_timestamp(&env, 100);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Partial Fund"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &50_000_000,
                &500,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &20_000_000, &false, &None);

            let after_donate = client.get_campaign(&campaign_id);
            assert_eq!(after_donate.raised_amount, 20_000_000);
            assert_eq!(after_donate.status, CampaignStatus::Active);

            set_timestamp(&env, 600);

            let ben_before = token_client.balance(&beneficiary);
            let admin_before = token_client.balance(&admin);
            let claimed = client.claim_funds(&beneficiary, &campaign_id);

            assert_eq!(claimed, 20_000_000);
            assert_eq!(token_client.balance(&beneficiary) - ben_before, 19_800_000);
            assert_eq!(token_client.balance(&admin) - admin_before, 200_000);

            let after_claim = client.get_campaign(&campaign_id);
            assert_eq!(after_claim.status, CampaignStatus::Claimed);
            assert_eq!(after_claim.raised_amount, 0);
        }
    }

    // =======================================================================
    // Issue #118: Security test — Reentrancy prevention
    // =======================================================================

    mod reentrancy_security_tests {
        use super::*;

        #[test]
        fn claim_funds_lock_prevents_direct_reentry() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Reentrancy Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
            let c = client.get_campaign(&campaign_id);
            assert_eq!(c.status, CampaignStatus::Funded);

            let ben_before = token_client.balance(&beneficiary);
            let claimed = client.claim_funds(&creator, &campaign_id);
            assert_eq!(claimed, 10_000_000);
            assert_eq!(token_client.balance(&beneficiary) - ben_before, 9_900_000);

            let result = client.try_claim_funds(&creator, &campaign_id);
            assert!(result.is_err(), "double-claim must fail");
        }

        #[test]
        fn claim_funds_lock_releases_after_successful_claim() {
            let env = Env::default();
            let contract_id = env.register_contract(None, StellarGiveContract);

            env.as_contract(&contract_id, || {
                let key = super::lock_key();

                assert!(!env.storage().temporary().has(&key));

                super::enter_lock(&env).unwrap();
                assert!(env.storage().temporary().has(&key));

                assert_eq!(
                    super::enter_lock(&env),
                    Err(ContractError::ReentrancyDetected)
                );

                super::exit_lock(&env);
                assert!(!env.storage().temporary().has(&key));

                super::enter_lock(&env).unwrap();
                assert!(env.storage().temporary().has(&key));

                super::exit_lock(&env);
                assert!(!env.storage().temporary().has(&key));
            });
        }

        #[test]
        fn claim_funds_lock_only_affects_temporary_storage() {
            let env = Env::default();
            let contract_id = env.register_contract(None, StellarGiveContract);

            env.as_contract(&contract_id, || {
                let key = super::lock_key();

                super::enter_lock(&env).unwrap();

                assert!(env.storage().temporary().has(&key));
                assert!(!env.storage().persistent().has(&key));

                super::exit_lock(&env);
            });
        }

        #[test]
        fn reentrancy_lock_survives_concurrent_campaign_claims() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);

            let c1 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign A"),
                &String::from_str(&env, "https://example.com/a"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );
            let c2 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign B"),
                &String::from_str(&env, "https://example.com/b"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &c1, &10_000_000, &false, &None);
            client.donate(&donor, &c2, &10_000_000, &false, &None);

            let claimed1 = client.claim_funds(&creator, &c1);
            let claimed2 = client.claim_funds(&creator, &c2);

            assert_eq!(claimed1, 10_000_000);
            assert_eq!(claimed2, 10_000_000);

            assert_eq!(client.get_campaign(&c1).status, CampaignStatus::Claimed);
            assert_eq!(client.get_campaign(&c2).status, CampaignStatus::Claimed);
        }

        #[test]
        fn donate_cannot_be_reentered_via_donation_event() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Donate Lock"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &100_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &30_000_000, &false, &None);
            client.donate(&donor, &campaign_id, &30_000_000, &false, &None);
            client.donate(&donor, &campaign_id, &40_000_000, &false, &None);

            let c = client.get_campaign(&campaign_id);
            assert_eq!(c.raised_amount, 100_000_000);
            assert_eq!(c.status, CampaignStatus::Funded);
        }

        #[test]
        fn claim_fails_when_campaign_already_claimed_no_double_transfer() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "No Double"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let ben_before = token_client.balance(&beneficiary);
            client.claim_funds(&creator, &campaign_id);
            let ben_after_first = token_client.balance(&beneficiary);
            assert_eq!(ben_after_first - ben_before, 9_900_000);

            let result = client.try_claim_funds(&creator, &campaign_id);
            assert!(result.is_err(), "double-claim must be rejected");

            let ben_after_second = token_client.balance(&beneficiary);
            assert_eq!(ben_after_second, ben_after_first);
        }

        #[test]
        fn claim_funds_emits_audit_event_and_is_idempotent() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Claimed Event Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let claimed = client.claim_funds(&creator, &campaign_id);
            assert_eq!(claimed, 10_000_000);

            let events = env.events().all();
            let claimed_event_exists = events.iter().any(|event| {
                event
                    .1
                    .get(0)
                    .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                    == Some(symbol_short!("claimed"))
            });
            assert!(
                claimed_event_exists,
                "Audit event Claimed must be published"
            );
        }

        #[test]
        fn unauthorized_user_cannot_trigger_reentrancy() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Auth Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let attacker = Address::generate(&env);
            let result = client.try_claim_funds(&attacker, &campaign_id);
            assert!(result.is_err(), "unauthorized claim must fail");
        }

        #[test]
        fn reentrancy_error_variant_is_correct() {
            let env = Env::default();
            let contract_id = env.register_contract(None, StellarGiveContract);

            env.as_contract(&contract_id, || {
                super::enter_lock(&env).unwrap();
                let result = super::enter_lock(&env);
                assert_eq!(result, Err(ContractError::ReentrancyDetected));
                super::exit_lock(&env);
            });
        }

        #[test]
        fn lock_state_is_clean_after_failed_claim() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Clean Lock"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            let attacker = Address::generate(&env);
            let _ = client.try_claim_funds(&attacker, &campaign_id);

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);
            let claimed = client.claim_funds(&creator, &campaign_id);
            assert_eq!(claimed, 10_000_000);
        }

        #[test]
        fn donate_at_target_triggers_auto_claim() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Auto Claim Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            let beneficiary_balance_before = token_client.balance(&beneficiary);

            // Donate exactly the target amount
            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            // Check that campaign is now Claimed
            let campaign = client.get_campaign(&campaign_id);
            assert_eq!(campaign.status, CampaignStatus::Claimed);
            assert_eq!(campaign.raised_amount, 0);

            // Check that beneficiary received funds (net of 1% fee)
            let beneficiary_balance_after = token_client.balance(&beneficiary);
            let net_amount = 10_000_000 - calculate_platform_fee(10_000_000).unwrap();
            assert_eq!(
                beneficiary_balance_after - beneficiary_balance_before,
                net_amount
            );
        }

        #[test]
        fn donate_after_auto_claim_is_rejected() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Auto Claim Reject Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            // First donation hits the target and triggers auto-claim
            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            // Verify campaign is Claimed
            let campaign = client.get_campaign(&campaign_id);
            assert_eq!(campaign.status, CampaignStatus::Claimed);

            // Try to donate again - should fail because campaign is not Active
            let second_donor = Address::generate(&env);
            let result = client.try_donate(&second_donor, &campaign_id, &1_000_000, &false, &None);
            assert!(
                result.is_err(),
                "donation after auto-claim must be rejected"
            );
            assert_eq!(
                result.unwrap_err().unwrap(),
                ContractError::CampaignNotActive
            );
        }

        #[test]
        fn donate_auto_claim_emits_auto_claimed_event() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Auto Claimed Event Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            // Check for AutoClaimed event
            let auto_claimed_event = env
                .events()
                .all()
                .iter()
                .find(|(addr, topics, _)| {
                    addr == &client.address
                        && topics
                            .get(0)
                            .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                            == Some(Symbol::new(&env, "autoclaimed"))
                })
                .expect("AutoClaimedEvent was not emitted");

            let payload = AutoClaimedEvent::try_from_val(&env, &auto_claimed_event.2)
                .expect("Failed to parse AutoClaimedEvent");
            assert_eq!(payload.campaign_id, campaign_id);
            assert_eq!(payload.total_raised, 10_000_000);
            assert_eq!(payload.beneficiary, beneficiary);
        }

        #[test]
        fn donate_over_target_triggers_auto_claim() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Over Target Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            let beneficiary_balance_before = token_client.balance(&beneficiary);

            // Donate more than the target amount
            client.donate(&donor, &campaign_id, &15_000_000, &false, &None);

            // Check that campaign is now Claimed
            let campaign = client.get_campaign(&campaign_id);
            assert_eq!(campaign.status, CampaignStatus::Claimed);
            assert_eq!(campaign.raised_amount, 0);

            // Check that beneficiary received funds based on the total raised (15M, not the target 10M)
            let beneficiary_balance_after = token_client.balance(&beneficiary);
            let net_amount = 15_000_000 - calculate_platform_fee(15_000_000).unwrap();
            assert_eq!(
                beneficiary_balance_after - beneficiary_balance_before,
                net_amount
            );
        }

        #[test]
        fn auto_claim_with_multiple_beneficiaries() {
            let (env, client, creator, _beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let ben1 = Address::generate(&env);
            let ben2 = Address::generate(&env);
            let ben3 = Address::generate(&env);

            let mut bens = Vec::new(&env);
            bens.push_back((ben1.clone(), 5_000_u32)); // 50%
            bens.push_back((ben2.clone(), 3_000_u32)); // 30%
            bens.push_back((ben3.clone(), 2_000_u32)); // 20%

            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Multi Ben Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            let ben1_before = token_client.balance(&ben1);
            let ben2_before = token_client.balance(&ben2);
            let ben3_before = token_client.balance(&ben3);

            // Donate to hit target
            client.donate(&donor, &campaign_id, &10_000_000, &false, &None);

            let campaign = client.get_campaign(&campaign_id);
            assert_eq!(campaign.status, CampaignStatus::Claimed);

            // Calculate expected payouts (net of 1% fee)
            let total_raised = 10_000_000;
            let fee = calculate_platform_fee(total_raised).unwrap();
            let net = total_raised - fee;

            let ben1_payout = net * 5_000 / 10_000;
            let ben2_payout = net * 3_000 / 10_000;
            let ben3_payout = net - ben1_payout - ben2_payout; // Takes remainder

            let ben1_after = token_client.balance(&ben1);
            let ben2_after = token_client.balance(&ben2);
            let ben3_after = token_client.balance(&ben3);

            assert_eq!(ben1_after - ben1_before, ben1_payout);
            assert_eq!(ben2_after - ben2_before, ben2_payout);
            assert_eq!(ben3_after - ben3_before, ben3_payout);
        }

        #[test]
        fn private_campaign_whitelist_behavior() {
            let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            // Create public campaign (default)
            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Public Campaign"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );

            // Public campaign should accept any donor
            client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

            // Turn campaign private by toggling storage directly (creator action)
            let mut campaign = read_campaign(&env, campaign_id).unwrap();
            campaign.is_private = true;
            write_campaign(&env, &campaign);

            // Non-whitelisted donor should be rejected
            let another = Address::generate(&env);
            let res = client.try_donate(&another, &campaign_id, &1_000_000, &false, &None);
            assert!(res.is_err());
            assert_eq!(res.unwrap_err().unwrap(), ContractError::NotWhitelisted);

            // Creator adds donor to whitelist
            let mut addrs = Vec::new(&env);
            addrs.push_back(donor.clone());
            client.add_to_whitelist(&campaign_id, &addrs);

            // Now whitelisted donor can donate
            client.donate(&donor, &campaign_id, &1_000_000, &false, &None);
        }

        #[test]
        fn get_time_left_returns_zero_when_deadline_passed() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Time Test"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &2_000, // deadline at 2000
                &token_client.address,
                &None,
            );

            // Move time past deadline
            set_timestamp(&env, 3_000);

            let time_left = client.get_time_left(&campaign_id);
            assert_eq!(time_left, 0);
        }

        #[test]
        fn get_time_left_returns_positive_delta_before_deadline() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let deadline = 5_000u64;
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Time Test Future"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &deadline,
                &token_client.address,
                &None,
            );

            let time_left = client.get_time_left(&campaign_id);
            assert_eq!(time_left, 4_000); // 5000 - 1000
        }

        #[test]
        fn get_time_left_at_exact_deadline_returns_zero() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let deadline = 5_000u64;
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Exact Deadline"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &deadline,
                &token_client.address,
                &None,
            );

            // Move to exact deadline
            set_timestamp(&env, 5_000);

            let time_left = client.get_time_left(&campaign_id);
            assert_eq!(time_left, 0);
        }

        #[test]
        fn get_time_left_rejects_nonexistent_campaign() {
            let (env, client, _creator, _beneficiary, _donor, _admin, _token_client, _) = setup();

            let result = client.try_get_time_left(&9_999u64);
            assert!(
                result.is_err(),
                "get_time_left must reject nonexistent campaigns"
            );
            assert_eq!(
                result.unwrap_err().unwrap(),
                ContractError::CampaignNotFound
            );
        }

        #[test]
        fn get_time_left_updates_as_time_progresses() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let deadline = 10_000u64;
            let campaign_id = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Progressive Time"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &deadline,
                &token_client.address,
                &None,
            );

            // Check time at start
            let time_left_1 = client.get_time_left(&campaign_id);
            assert_eq!(time_left_1, 9_000);

            // Move forward
            set_timestamp(&env, 5_000);
            let time_left_2 = client.get_time_left(&campaign_id);
            assert_eq!(time_left_2, 5_000);

            // Move closer
            set_timestamp(&env, 9_000);
            let time_left_3 = client.get_time_left(&campaign_id);
            assert_eq!(time_left_3, 1_000);

            // Pass deadline
            set_timestamp(&env, 15_000);
            let time_left_4 = client.get_time_left(&campaign_id);
            assert_eq!(time_left_4, 0);
        }

        #[test]
        fn get_total_campaigns_counts_created_campaigns() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            assert_eq!(client.get_total_campaigns(), 0);

            let bens = single_ben(&env, &beneficiary);
            client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 1"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );
            client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 2"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &20_000,
                &token_client.address,
                &None,
            );
            client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 3"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &30_000,
                &token_client.address,
                &None,
            );

            assert_eq!(client.get_total_campaigns(), 3);
        }

        #[test]
        fn get_total_campaigns_ignores_cancellations() {
            let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
            set_timestamp(&env, 1_000);

            let bens = single_ben(&env, &beneficiary);
            let campaign_id_1 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 1"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &10_000,
                &token_client.address,
                &None,
            );
            let campaign_id_2 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 2"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &20_000,
                &token_client.address,
                &None,
            );
            let campaign_id_3 = client.create_campaign(
                &creator,
                &bens,
                &String::from_str(&env, "Campaign 3"),
                &String::from_str(&env, "https://example.com/meta"),
                &symbol_short!("relief"),
                &10_000_000,
                &30_000,
                &token_client.address,
                &None,
            );

            client.cancel_campaign(&creator, &campaign_id_2);

            assert_eq!(client.get_total_campaigns(), 3);
        }
    }

    // =======================================================================
    // Admin authorization tests
    // Verifies that upgrade, set_owner, and get_owner enforce correct access
    // control, and that ownership transfers correctly revoke old-owner rights.
    // =======================================================================

    mod admin_auth_tests {
        use super::*;

        // -------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------

        /// Build a MockAuth for a single contract function call.
        macro_rules! mock_auth {
            ($addr:expr, $client:expr, $fn:expr, $args:expr) => {
                MockAuth {
                    address: $addr,
                    invoke: &MockAuthInvoke {
                        contract: &$client.address,
                        fn_name: $fn,
                        args: $args,
                        sub_invokes: &[],
                    },
                }
            };
        }

        fn zero_hash(env: &Env) -> BytesN<32> {
            BytesN::<32>::from_array(env, &[0u8; 32])
        }

        // -------------------------------------------------------------------
        // get_owner
        // -------------------------------------------------------------------

        #[test]
        fn get_owner_returns_admin_set_by_initialize() {
            let (_, client, _, _, _, admin, _, _) = setup();
            assert_eq!(client.get_owner(), admin);
        }

        #[test]
        fn get_owner_fails_before_initialize() {
            let env = Env::default();
            env.mock_all_auths();
            let id = env.register_contract(None, StellarGiveContract);
            let client = StellarGiveContractClient::new(&env, &id);
            assert_eq!(
                client.try_get_owner(),
                Err(Ok(ContractError::NotInitialized))
            );
        }

        // -------------------------------------------------------------------
        // upgrade — NotInitialized guard
        // -------------------------------------------------------------------

        #[test]
        fn upgrade_returns_not_initialized_before_initialize() {
            let env = Env::default();
            env.mock_all_auths();
            let id = env.register_contract(None, StellarGiveContract);
            let client = StellarGiveContractClient::new(&env, &id);
            let result = client.try_upgrade(&zero_hash(&env));
            assert_eq!(
                result,
                Err(Ok(ContractError::NotInitialized)),
                "upgrade must return NotInitialized when contract is not yet initialized"
            );
        }

        // -------------------------------------------------------------------
        // upgrade — unauthorized caller is rejected
        // -------------------------------------------------------------------

        #[test]
        fn upgrade_rejects_non_owner_caller() {
            let (env, client, _, _, _, _, _, _) = setup_without_auth_mock();
            let attacker = Address::generate(&env);
            let dummy = zero_hash(&env);
            let result = client
                .mock_auths(&[mock_auth!(
                    &attacker,
                    client,
                    "upgrade",
                    (dummy.clone(),).into_val(&env)
                )])
                .try_upgrade(&dummy);
            assert!(
                result.is_err(),
                "upgrade must reject a caller that is not the owner"
            );
        }

        #[test]
        fn upgrade_rejects_random_third_party() {
            let (env, client, _, _, _, _, _, _) = setup_without_auth_mock();
            // Use several distinct addresses to confirm no hardcoded bypass
            for _ in 0..3 {
                let stranger = Address::generate(&env);
                let dummy = zero_hash(&env);
                let result = client
                    .mock_auths(&[mock_auth!(
                        &stranger,
                        client,
                        "upgrade",
                        (dummy.clone(),).into_val(&env)
                    )])
                    .try_upgrade(&dummy);
                assert!(result.is_err(), "stranger must be rejected by upgrade");
            }
        }

        // -------------------------------------------------------------------
        // -------------------------------------------------------------------
        // set_owner — NotInitialized guard
        // -------------------------------------------------------------------

        #[test]
        fn set_owner_returns_not_initialized_before_initialize() {
            let env = Env::default();
            env.mock_all_auths();
            let id = env.register_contract(None, StellarGiveContract);
            let client = StellarGiveContractClient::new(&env, &id);
            let result = client.try_set_owner(&Address::generate(&env));
            assert_eq!(
                result,
                Err(Ok(ContractError::NotInitialized)),
                "set_owner must return NotInitialized when contract is not yet initialized"
            );
        }

        // -------------------------------------------------------------------
        // set_owner — unauthorized caller is rejected
        // -------------------------------------------------------------------

        #[test]
        fn set_owner_rejects_non_owner_caller() {
            let (env, client, _, _, _, _, _, _) = setup_without_auth_mock();
            let attacker = Address::generate(&env);
            let new_owner = Address::generate(&env);
            let result = client
                .mock_auths(&[mock_auth!(
                    &attacker,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .try_set_owner(&new_owner);
            assert!(
                result.is_err(),
                "set_owner must reject a caller that is not the current owner"
            );
        }

        #[test]
        fn set_owner_rejects_beneficiary_acting_as_owner() {
            let (env, client, _, beneficiary, _, _, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);
            let result = client
                .mock_auths(&[mock_auth!(
                    &beneficiary,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .try_set_owner(&new_owner);
            assert!(result.is_err(), "beneficiary address must not bypass set_owner auth");
        }

        // -------------------------------------------------------------------
        // set_owner — authorized owner succeeds
        // -------------------------------------------------------------------

        #[test]
        fn set_owner_accepts_current_owner_and_persists_new_address() {
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);
            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .set_owner(&new_owner);
            assert_eq!(
                client.get_owner(),
                new_owner,
                "get_owner must return the address passed to set_owner"
            );
        }

        #[test]
        fn set_owner_emits_owner_set_event() {
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);
            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .set_owner(&new_owner);
            let found = env.events().all().iter().any(|(addr, topics, _)| {
                addr == client.address
                    && topics
                        .get(0)
                        .and_then(|t| Symbol::try_from_val(&env, &t).ok())
                        == Some(symbol_short!("OwnerSet"))
            });
            assert!(found, "set_owner must emit an OwnerSet event");
        }

        // -------------------------------------------------------------------
        // Ownership transfer edge cases
        // -------------------------------------------------------------------

        #[test]
        fn old_owner_rejected_by_set_owner_after_transfer() {
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);

            // Transfer ownership admin → new_owner
            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .set_owner(&new_owner);

            // Old admin tries to transfer ownership again → must fail
            let another = Address::generate(&env);
            let result = client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (another.clone(),).into_val(&env)
                )])
                .try_set_owner(&another);
            assert!(
                result.is_err(),
                "old owner must be rejected by set_owner after ownership has been transferred"
            );
        }

        #[test]
        fn new_owner_accepted_by_set_owner_after_transfer() {
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);

            // Transfer ownership admin → new_owner
            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .set_owner(&new_owner);

            // New owner transfers to a third address → must succeed
            let third_owner = Address::generate(&env);
            client
                .mock_auths(&[mock_auth!(
                    &new_owner,
                    client,
                    "set_owner",
                    (third_owner.clone(),).into_val(&env)
                )])
                .set_owner(&third_owner);
            assert_eq!(
                client.get_owner(),
                third_owner,
                "new owner must be able to exercise set_owner after transfer"
            );
        }

        #[test]
        fn old_owner_rejected_by_upgrade_after_transfer() {
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let new_owner = Address::generate(&env);

            // Transfer ownership admin → new_owner
            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (new_owner.clone(),).into_val(&env)
                )])
                .set_owner(&new_owner);

            // Old admin now tries to call upgrade → must fail
            let dummy = zero_hash(&env);
            let result = client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "upgrade",
                    (dummy.clone(),).into_val(&env)
                )])
                .try_upgrade(&dummy);
            assert!(
                result.is_err(),
                "old owner must be rejected by upgrade after ownership has been transferred"
            );
        }

        #[test]
        fn ownership_chain_transfer_is_respected() {
            // A → B → C: each hand-off must revoke the previous owner
            let (env, client, _, _, _, admin, _, _) = setup_without_auth_mock();
            let owner_b = Address::generate(&env);
            let owner_c = Address::generate(&env);

            client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "set_owner",
                    (owner_b.clone(),).into_val(&env)
                )])
                .set_owner(&owner_b);

            client
                .mock_auths(&[mock_auth!(
                    &owner_b,
                    client,
                    "set_owner",
                    (owner_c.clone(),).into_val(&env)
                )])
                .set_owner(&owner_c);

            assert_eq!(client.get_owner(), owner_c);

            // Original admin (A) must now be rejected
            let dummy = zero_hash(&env);
            let result_a = client
                .mock_auths(&[mock_auth!(
                    &admin,
                    client,
                    "upgrade",
                    (dummy.clone(),).into_val(&env)
                )])
                .try_upgrade(&dummy);
            assert!(result_a.is_err(), "original admin must be rejected after two-hop transfer");

            // Owner B must now be rejected
            let result_b = client
                .mock_auths(&[mock_auth!(
                    &owner_b,
                    client,
                    "upgrade",
                    (dummy.clone(),).into_val(&env)
                )])
                .try_upgrade(&dummy);
            assert!(result_b.is_err(), "intermediate owner B must be rejected after transfer to C");
        }
    }

    // -----------------------------------------------------------------------
    // Deadline Extension
    // -----------------------------------------------------------------------

    #[test]
    fn extend_deadline_succeeds_once_for_active_campaign() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Extend Relief"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &5_000, // original deadline
            &token_client.address,
            &None,
        );

        // Valid extension: 5k -> 6k
        client.extend_deadline(&id, &6_000);
        let campaign = client.get_campaign(&id);
        assert_eq!(campaign.deadline, 6_000);
        assert!(campaign.was_extended);

        // Second extension must fail
        let result = client.try_extend_deadline(&id, &7_000);
        assert_eq!(result, Err(Ok(ContractError::AlreadyExtended)));
    }

    #[test]
    fn extend_deadline_rejected_for_expired_campaign() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Expired Extend"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &2_000,
            &token_client.address,
            &None,
        );

        // Fast-forward to expire the campaign
        set_timestamp(&env, 3_000);

        let result = client.try_extend_deadline(&id, &4_000);
        assert_eq!(result, Err(Ok(ContractError::CampaignNotActive)));
    }

    #[test]
    fn extend_deadline_must_be_monotonic() {
        let (env, client, creator, beneficiary, _donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Retro Relief"),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &5_000,
            &token_client.address,
            &None,
        );

        // Cannot move deadline backwards or keep it same
        let result = client.try_extend_deadline(&id, &5_000);
        assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));

        let result = client.try_extend_deadline(&id, &4_999);
        assert_eq!(result, Err(Ok(ContractError::InvalidDeadline)));
    }
}
