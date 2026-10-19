import { CONTRACT_ID, isValidStellarAddress, type CampaignBeneficiary } from "@/lib/soroban";
import { INVALID_SHARES_MESSAGE } from "@/lib/contractErrors";

/** Basis points representing a 100% share (the contract requires shares to sum to this). */
export const TOTAL_SHARE_BPS = 10_000;

/**
 * Converts a percentage string with at most two decimals ("33.33") to basis
 * points (3333). Returns null for anything that isn't a non-negative number
 * with ≤ 2 decimal places, since finer shares can't be represented in bps.
 */
export function percentToBps(percent: string): number | null {
  const trimmed = percent.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/**
 * Client-side mirror of the contract's beneficiary checks: at least one
 * beneficiary, valid unique addresses, none equal to the contract, positive
 * integer basis-point shares totalling exactly 10000. Returns an error message,
 * or null when the list is valid.
 */
export function validateBeneficiaries(beneficiaries: CampaignBeneficiary[]): string | null {
  if (beneficiaries.length === 0) return "Add at least one beneficiary.";
  const seen = new Set<string>();
  let total = 0;
  for (const { address, share } of beneficiaries) {
    if (!isValidStellarAddress(address)) {
      return `Invalid beneficiary address: ${address || "(empty)"}`;
    }
    if (address === CONTRACT_ID) return "Beneficiary cannot be the campaign contract address.";
    if (seen.has(address)) return "Each beneficiary address can only be listed once.";
    seen.add(address);
    if (!Number.isInteger(share) || share <= 0) {
      return "Each beneficiary share must be greater than 0%.";
    }
    total += share;
  }
  return total === TOTAL_SHARE_BPS ? null : INVALID_SHARES_MESSAGE;
}
