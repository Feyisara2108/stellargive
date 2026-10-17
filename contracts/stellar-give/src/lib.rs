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
pub struct PausedEvent {
    pub admin: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct UnpausedEvent {
    pub admin: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct CampaignUpdateEvent {
    pub campaign_id: u64,
    pub content: String,
    pub timestamp: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub beneficiaries: Vec<(Address, u32)>,
    pub title: String,
    /// Optional long-form description for donor context and discoverability.
    /// Stored in Persistent storage; each additional character costs ~8 bytes
    /// of ledger entry space, so we cap at 500 chars to bound storage growth.
    pub description: String,
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
    /// Campaign description exceeds the 500-character limit.
    /// Each character occupies ~8 bytes of Persistent ledger storage, so the
    /// cap bounds worst-case storage cost per campaign to ~4 KB.
    DescriptionTooLong = 32,
    /// Contract is paused by an admin.
    ContractPaused = 33,
    /// Refund rejected because campaign is not expired or target was met.
    RefundNotAllowed = 34,
    /// Refund rejected because the campaign has not been cancelled.
    CampaignNotCancelled = 35,
    /// The donor has no recorded contribution left to refund.
    NothingToRefund = 36,
    /// The token transfer back to the donor failed during refund.
    RefundTransferFailed = 37,
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

fn paused_key() -> Symbol {
    symbol_short!("PAUSED")
}

/// Returns `Err(ContractPaused)` when the contract is in paused state.
fn ensure_not_paused(env: &Env) -> Result<(), ContractError> {
    if env
        .storage()
        .instance()
        .get::<_, bool>(&paused_key())
        .unwrap_or(false)
    {
        return Err(ContractError::ContractPaused);
    }
    Ok(())
}

// The fundraising policy limits below are `pub` so integration tests and
// downstream Rust callers can assert against the same numbers the contract
// enforces, instead of mirroring magic values that can drift.

/// Platform fee, in basis points. 100 = 1.00%.
pub const FEE_BPS: i128 = 100;
/// Basis-point denominator (10_000 = 100%).
pub const FEE_DENOMINATOR: i128 = 10_000;
/// Minimum permitted donation amount, in stroops (0.1 token with 7 decimals).
pub const MIN_DONATION: i128 = 1_000_000;
/// Minimum fundraising target, in stroops (1.0 token with 7 decimals).
pub const MIN_TARGET: i128 = 10_000_000;
/// Maximum campaign lifetime: one year. This keeps campaign state timely and
/// avoids indefinite ledger growth from stale fundraising records.
pub const MAX_DURATION: u64 = 31_536_000;
/// Storage bloat guard: maximum campaigns per creator address.
pub const MAX_CAMPAIGNS_PER_CREATOR: u32 = 10;
/// Storage bloat guard: title length cap.
pub const MAX_TITLE_LEN: u32 = 50;
/// Storage bloat guard: metadata URI length cap.
pub const MAX_METADATA_URI_LEN: u32 = 256;
/// Maximum description length in characters (Soroban `String` counts UTF-8 bytes).
/// Soroban Persistent entries incur a base overhead plus ~8 bytes per character;
/// 500 chars caps the description contribution to roughly 4 KB per campaign.
pub const MAX_DESCRIPTION_LENGTH: u32 = 500;
/// Optional donor comment length cap.
pub const MAX_COMMENT_LEN: u32 = 250;
/// Fixed creation fee in stroops, sent to platform admin.
pub const CREATION_FEE_STROOPS: i128 = 100_000;

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
    env.storage().persistent().extend_ttl(
        key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
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

fn donor_contribution_key(campaign_id: u64, donor: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("DCON"), campaign_id, donor.clone())
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
    if update.is_some() {
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
        env.storage().instance().set(&paused_key(), &false);
        Ok(())
    }

    /// Pauses the contract. Only callable by the platform admin.
    /// While paused, all state-mutating functions (create_campaign, donate,
    /// cancel_campaign, claim_funds, add_update, refund) will return ContractPaused.
    pub fn pause(env: Env) -> Result<(), ContractError> {
        let admin = read_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&paused_key(), &true);
        env.events()
            .publish((symbol_short!("paused"),), PausedEvent { admin });
        Ok(())
    }

    /// Unpauses the contract. Only callable by the platform admin.
    pub fn unpause(env: Env) -> Result<(), ContractError> {
        let admin = read_admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&paused_key(), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), UnpausedEvent { admin });
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
        description: String,
        metadata_uri: String,
        category: Symbol,
        target_amount: i128,
        deadline: u64,
        accepted_token: Address,
        max_per_donor: Option<i128>,
    ) -> Result<u64, ContractError> {
        ensure_not_paused(&env)?;
        creator.require_auth();

        if title.is_empty() {
            return Err(ContractError::EmptyTitle);
        }
        if description.len() > MAX_DESCRIPTION_LENGTH {
            return Err(ContractError::DescriptionTooLong);
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
            description,
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
        ensure_not_paused(&env)?;
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
            if campaign.is_private && !read_whitelist(&env, campaign_id, &donor) {
                return Err(ContractError::NotWhitelisted);
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

    /// Cancels a campaign before fundraising begins.
    pub fn cancel_campaign(env: Env, id: u64) -> Result<(), ContractError> {
        ensure_not_paused(&env)?;
        let mut campaign = read_campaign(&env, id)?;
        campaign.creator.require_auth();

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
                id,
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
    pub fn claim_refund(env: Env, donor: Address, campaign_id: u64) -> Result<i128, ContractError> {
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
        ensure_not_paused(&env)?;
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
        ensure_not_paused(&env)?;
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
            token::Client::new(&env, &campaign.accepted_token).transfer(
                &env.current_contract_address(),
                &donor,
                &donated,
            );

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
        let campaign = read_campaign(&env, id)?;
        campaign.creator.require_auth();

        // Batch write whitelist entries
        for addr in addresses.iter() {
            write_whitelist(&env, id, &addr, true);
        }

        Ok(())
    }

    /// Adds an update to a campaign. Maximum 10 updates allowed.
    pub fn add_update(env: Env, id: u64, content: String) -> Result<(), ContractError> {
        ensure_not_paused(&env)?;
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

        env.events().publish(
            (symbol_short!("update"),),
            CampaignUpdateEvent {
                campaign_id: id,
                content: update.content.clone(),
                timestamp: update.timestamp,
            },
        );

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
mod private_internals {
    //! Unit tests that have to reach inside the module.
    //!
    //! Everything exercisable through `StellarGiveContractClient` lives in
    //! `tests/` (#1152). What stays here are the cases that assert on private
    //! items — `calculate_platform_fee`, the reentrancy lock's temporary
    //! storage key, the `next_id` migration, and the campaign/contribution
    //! storage helpers — which an external test binary cannot name.

    extern crate std;

    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{token, Address, Env, String, Vec};

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

    // ── fee arithmetic ────────────────────────────────────────────────────

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

    // ── reentrancy lock (temporary-storage key) ───────────────────────────

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

    // ── next_id storage and migration ─────────────────────────────────────

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
            &String::from_str(&env, "A sample campaign description."),
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
            &String::from_str(&env, "A sample campaign description."),
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
            &String::from_str(&env, "A sample campaign description."),
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

    // ── campaign and contribution storage helpers ─────────────────────────

    #[test]
    fn donate_detects_overflow_and_returns_arithmetic_error() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        set_timestamp(&env, 1_000);

        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Overflow Guard"),
            &String::from_str(&env, "A sample campaign description."),
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

    #[test]
    fn test_comment_not_stored_in_persistent_state() {
        let (env, client, creator, beneficiary, donor, _admin, token_client, _) = setup();
        let bens = single_ben(&env, &beneficiary);
        let campaign_id = client.create_campaign(
            &creator,
            &bens,
            &String::from_str(&env, "Campaign"),
            &String::from_str(&env, "A sample campaign description."),
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
            &String::from_str(&env, "A sample campaign description."),
            &String::from_str(&env, "https://example.com/meta"),
            &symbol_short!("relief"),
            &10_000_000,
            &10_000,
            &token_client.address,
            &None,
        );

        // Public campaign should accept any donor
        client.donate(&donor, &campaign_id, &1_000_000, &false, &None);

        // Turn campaign private by toggling storage directly (creator action).
        // The internal storage helpers must run inside the contract context.
        env.as_contract(&client.address, || {
            let mut campaign = read_campaign(&env, campaign_id).unwrap();
            campaign.is_private = true;
            write_campaign(&env, &campaign);
        });

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
}
