import { Asset, StrKey } from "@stellar/stellar-sdk";

// Read directly (not via @/lib/soroban) so these constants stay real in tests
// that mock the soroban module wholesale. Fallback matches lib/soroban.ts.
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Standalone Network ; February 2017";

/**
 * Stellar Asset Contract (SAC) address for native XLM on the configured network.
 * Derived rather than hardcoded because it differs between testnet and mainnet.
 */
export const NATIVE_XLM_CONTRACT_ID = Asset.native().contractId(NETWORK_PASSPHRASE);

/** Optional USDC SAC address for the configured network; unset hides USDC from the picker. */
export const USDC_CONTRACT_ID = (() => {
  const id = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID?.trim();
  return id && StrKey.isValidContract(id) ? id : null;
})();
