import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";

// Read directly (not via @/lib/soroban) so these constants stay real in tests
// that mock the soroban module wholesale. Fallback matches lib/soroban.ts.
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.STANDALONE;

/**
 * Circle's official USDC issuer accounts on Stellar:
 * - Mainnet: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 *   Source: Circle official documentation (https://developers.circle.com).
 * - Testnet: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 *   Source: Circle testnet documentation and faucet (https://developers.circle.com).
 * - Futurenet / Standalone: Circle does not deploy or document official USDC issuers
 *   for Futurenet or local standalone networks. These networks remain opt-in via
 *   the NEXT_PUBLIC_USDC_CONTRACT_ID environment variable.
 */
export const USDC_ISSUERS = {
  [Networks.TESTNET]: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  [Networks.PUBLIC]: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
} as const;

/**
 * Predefined Stellar Asset Contract (SAC) addresses for USDC per supported network.
 * Derived with Asset.contractId(passphrase) from asset code (USDC) and verified issuer account.
 */
export const PREDEFINED_USDC_CONTRACT_IDS: Record<string, string> = {
  [Networks.TESTNET]: new Asset("USDC", USDC_ISSUERS[Networks.TESTNET]).contractId(
    Networks.TESTNET,
  ),
  [Networks.PUBLIC]: new Asset("USDC", USDC_ISSUERS[Networks.PUBLIC]).contractId(
    Networks.PUBLIC,
  ),
};

/**
 * Resolves the USDC contract ID for the specified network passphrase.
 * The NEXT_PUBLIC_USDC_CONTRACT_ID env override takes precedence if set and valid.
 */
export function resolveUsdcContractId(
  passphrase: string = NETWORK_PASSPHRASE,
  envOverride: string | undefined = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID,
): string | null {
  const trimmed = envOverride?.trim();
  if (trimmed && StrKey.isValidContract(trimmed)) {
    return trimmed;
  }
  return PREDEFINED_USDC_CONTRACT_IDS[passphrase] ?? null;
}

/**
 * Stellar Asset Contract (SAC) address for native XLM on the configured network.
 * Derived rather than hardcoded because it differs between testnet and mainnet.
 */
export const NATIVE_XLM_CONTRACT_ID = Asset.native().contractId(NETWORK_PASSPHRASE);

/**
 * USDC SAC address for the configured network.
 * Derived from Circle's official issuer on Testnet and Mainnet;
 * env override takes precedence when configured.
 */
export const USDC_CONTRACT_ID = resolveUsdcContractId();
