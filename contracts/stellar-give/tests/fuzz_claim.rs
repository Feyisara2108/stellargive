//! Fuzz / property-based tests for claim_funds arithmetic.
//!
//! Covers fee tiers, multi-beneficiary splits, and rounding invariants:
//!   - fee + net == gross (no stroop lost or created)
//!   - beneficiary payouts sum to net exactly
//!   - fee is non-negative and bounded by FEE_BPS / FEE_DENOMINATOR
//!
//! Mirrors the structure of fuzz_donate.rs.

use proptest::prelude::*;
use soroban_sdk::{symbol_short, testutils::Address as _, token, Address, Env, String, Vec};
use stellar_give::{StellarGiveContract, StellarGiveContractClient};

mod helpers;
use helpers::{set_timestamp, single_ben};

/// Platform fee in basis points (mirrors lib.rs constant).
const FEE_BPS: i128 = 100;
const FEE_DENOMINATOR: i128 = 10_000;
/// Minimum donation (0.1 token with 7 decimals).
const MIN_DONATION: i128 = 1_000_000;
