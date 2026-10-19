/**
 * Contract error codes (`ContractError` in contracts/stellar-give/src/lib.rs)
 * that the UI maps to a specific message. Kept free of SDK imports so it is
 * safe to use from components whose tests mock `@/lib/soroban`.
 */
export const CONTRACT_ERROR_CODES = {
  InvalidShares: 12,
  ExceedsDonorCap: 18,
  InvalidBeneficiary: 28,
} as const;

/** Shown when a donation would push the donor past the campaign's `max_per_donor`. */
export const EXCEEDS_DONOR_CAP_MESSAGE =
  "This donation exceeds the campaign's maximum per donor. Try a smaller amount.";

/** Shown when beneficiary shares don't add up to exactly 100%. */
export const INVALID_SHARES_MESSAGE = "Beneficiary shares must add up to exactly 100%.";

/**
 * Extracts the numeric contract error code from a simulation/transaction
 * error, e.g. `HostError: Error(Contract, #18)` → 18. Returns null when the
 * error did not originate from a contract `ContractError`.
 */
export function getContractErrorCode(error: unknown): number | null {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(msg);
  return match ? Number(match[1]) : null;
}
