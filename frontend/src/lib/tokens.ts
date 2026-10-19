import { Networks } from "@/lib/network";
import { isValidContractAddress } from "@/lib/strkey";

// Read directly (not via @/lib/soroban) so these constants stay real in tests
// that mock the soroban module wholesale. Fallback matches lib/network.ts.
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.STANDALONE;

// Contract IDs below are precomputed rather than derived with the Stellar SDK
// (`Asset.contractId(passphrase)`) at import time, so token pickers and the
// navbar don't pull the SDK into a route's first-load bundle. tokens.test.ts
// re-derives the native XLM entries with the SDK; the USDC entries were derived
// the same way (in Node — the SDK's asset-code encoding fails under jsdom).

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
 * Predefined Stellar Asset Contract (SAC) addresses for USDC per supported network:
 * `new Asset("USDC", USDC_ISSUERS[network]).contractId(network)`.
 */
export const PREDEFINED_USDC_CONTRACT_IDS: Record<string, string> = {
  [Networks.TESTNET]: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  [Networks.PUBLIC]: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
};

/** Native XLM SAC per network: `Asset.native().contractId(network)`. */
export const NATIVE_XLM_CONTRACT_IDS: Record<string, string> = {
  [Networks.PUBLIC]: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  [Networks.TESTNET]: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  [Networks.FUTURENET]: "CB64D3G7SM2RTH6JSGG34DDTFTQ5CFDKVDZJZSODMCX4NJ2HV2KN7OHT",
  [Networks.SANDBOX]: "CBCXITBB6VMN52OFOPNIF5GBCRE2T4PKVT2FOK3VHL5Z2KK24XUD4ILU",
  [Networks.STANDALONE]: "CDMLFMKMMD7MWZP3FKUBZPVHTUEDLSX4BYGYKH4GCESXYHS3IHQ4EIG4",
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
  if (trimmed && isValidContractAddress(trimmed)) {
    return trimmed;
  }
  return PREDEFINED_USDC_CONTRACT_IDS[passphrase] ?? null;
}

/**
 * Resolves the native XLM SAC for a network. A custom network (unknown
 * passphrase) must set NEXT_PUBLIC_NATIVE_XLM_CONTRACT_ID.
 */
export function resolveNativeXlmContractId(
  passphrase: string = NETWORK_PASSPHRASE,
  envOverride: string | undefined = process.env.NEXT_PUBLIC_NATIVE_XLM_CONTRACT_ID,
): string {
  const trimmed = envOverride?.trim();
  if (trimmed && isValidContractAddress(trimmed)) {
    return trimmed;
  }
  return NATIVE_XLM_CONTRACT_IDS[passphrase] ?? "";
}

/**
 * Stellar Asset Contract (SAC) address for native XLM on the configured network.
 * Differs between networks, so it is looked up by passphrase.
 */
export const NATIVE_XLM_CONTRACT_ID = resolveNativeXlmContractId();

/**
 * USDC SAC address for the configured network.
 * Derived from Circle's official issuer on Testnet and Mainnet;
 * env override takes precedence when configured.
 */
export const USDC_CONTRACT_ID = resolveUsdcContractId();
