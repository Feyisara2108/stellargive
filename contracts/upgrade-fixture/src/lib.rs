#![no_std]

//! Minimal "v2" contract used as the WASM target of the upgrade test.
//!
//! It reads the same storage keys as `stellar-give` (instance `OWNER`,
//! persistent `("CMP", id)`) so the test can prove that state written by the
//! old code is still visible to the new code after `upgrade`, and it exposes
//! `version` so the test can prove the new code is the one executing.

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env};

#[contract]
pub struct UpgradeFixture;

#[contractimpl]
impl UpgradeFixture {
    pub fn version(_env: Env) -> u32 {
        2
    }

    pub fn get_owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("OWNER"))
            .unwrap()
    }

    pub fn has_campaign(env: Env, id: u64) -> bool {
        env.storage().persistent().has(&(symbol_short!("CMP"), id))
    }
}
