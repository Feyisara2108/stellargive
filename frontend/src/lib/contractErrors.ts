/**
 * Contract error codes (`ContractError` in contracts/stellar-give/src/lib.rs).
 * Kept free of SDK imports so this module is safe to use from components whose
 * tests mock `@/lib/soroban`.
 */
export const CONTRACT_ERROR_CODES = {
  Unauthorized: 1,
  InvalidDeadline: 2,
  InvalidAmount: 3,
  CampaignNotFound: 4,
  InvalidToken: 5,
  CampaignNotActive: 6,
  ClaimNotAllowed: 7,
  AlreadyClaimed: 8,
  ReentrancyDetected: 9,
  EmptyTitle: 10,
  NothingToClaim: 11,
  InvalidShares: 12,
  TokenTransferFailed: 13,
  NotInitialized: 14,
  AlreadyInitialized: 15,
  InvalidDuration: 16,
  TargetTooLow: 17,
  ExceedsDonorCap: 18,
  InvalidMetadataUri: 19,
  MetadataUriTooLong: 20,
  InvalidUrl: 21,
  ArithmeticError: 22,
  LimitExceeded: 23,
  InvalidTitle: 24,
  CreationFeeTransferFailed: 25,
  InvalidUpdateContent: 26,
  TooManyUpdates: 27,
  InvalidBeneficiary: 28,
  CommentTooLong: 29,
  InvalidCategory: 30,
  NotWhitelisted: 31,
  DescriptionTooLong: 32,
  ContractPaused: 33,
  RefundNotAllowed: 34,
  CampaignNotCancelled: 35,
  NothingToRefund: 36,
  RefundTransferFailed: 37,
} as const;

/** Shown when a donation would push the donor past the campaign's `max_per_donor`. */
export const EXCEEDS_DONOR_CAP_MESSAGE =
  "This donation exceeds the campaign's maximum per donor. Try a smaller amount.";

/** Shown when beneficiary shares don't add up to exactly 100%. */
export const INVALID_SHARES_MESSAGE = "Beneficiary shares must add up to exactly 100%.";

const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  [CONTRACT_ERROR_CODES.Unauthorized]: "You are not authorized to perform this action.",
  [CONTRACT_ERROR_CODES.InvalidDeadline]: "Choose a campaign deadline in the future.",
  [CONTRACT_ERROR_CODES.InvalidAmount]: "Enter an amount that meets the campaign requirements.",
  [CONTRACT_ERROR_CODES.CampaignNotFound]: "This campaign could not be found.",
  [CONTRACT_ERROR_CODES.InvalidToken]: "This token is not supported for this campaign.",
  [CONTRACT_ERROR_CODES.CampaignNotActive]: "This campaign is no longer accepting donations.",
  [CONTRACT_ERROR_CODES.ClaimNotAllowed]: "Campaign funds cannot be claimed yet.",
  [CONTRACT_ERROR_CODES.AlreadyClaimed]: "The campaign funds have already been claimed.",
  [CONTRACT_ERROR_CODES.ReentrancyDetected]: "The transaction could not be processed safely. Please retry.",
  [CONTRACT_ERROR_CODES.EmptyTitle]: "A campaign title is required.",
  [CONTRACT_ERROR_CODES.NothingToClaim]: "There are no campaign funds available to claim.",
  [CONTRACT_ERROR_CODES.InvalidShares]: INVALID_SHARES_MESSAGE,
  [CONTRACT_ERROR_CODES.TokenTransferFailed]: "The token transfer failed. Please try again.",
  [CONTRACT_ERROR_CODES.NotInitialized]: "The contract is not initialized. Please try again later.",
  [CONTRACT_ERROR_CODES.AlreadyInitialized]: "The contract has already been initialized.",
  [CONTRACT_ERROR_CODES.InvalidDuration]: "Choose a valid campaign duration.",
  [CONTRACT_ERROR_CODES.TargetTooLow]: "The campaign target is below the minimum allowed amount.",
  [CONTRACT_ERROR_CODES.ExceedsDonorCap]: EXCEEDS_DONOR_CAP_MESSAGE,
  [CONTRACT_ERROR_CODES.InvalidMetadataUri]: "The campaign metadata URL is invalid.",
  [CONTRACT_ERROR_CODES.MetadataUriTooLong]: "The campaign metadata URL is too long.",
  [CONTRACT_ERROR_CODES.InvalidUrl]: "Enter a valid URL.",
  [CONTRACT_ERROR_CODES.ArithmeticError]: "The transaction amount could not be calculated safely.",
  [CONTRACT_ERROR_CODES.LimitExceeded]: "The request exceeds the contract's allowed limit.",
  [CONTRACT_ERROR_CODES.InvalidTitle]: "The campaign title is invalid.",
  [CONTRACT_ERROR_CODES.CreationFeeTransferFailed]: "The campaign creation fee transfer failed.",
  [CONTRACT_ERROR_CODES.InvalidUpdateContent]: "The campaign update content is invalid.",
  [CONTRACT_ERROR_CODES.TooManyUpdates]: "This campaign has reached its update limit.",
  [CONTRACT_ERROR_CODES.InvalidBeneficiary]: "The campaign beneficiary is invalid.",
  [CONTRACT_ERROR_CODES.CommentTooLong]: "Your comment is too long. Please shorten it and try again.",
  [CONTRACT_ERROR_CODES.InvalidCategory]: "Choose a valid campaign category.",
  [CONTRACT_ERROR_CODES.NotWhitelisted]: "This address is not allowed to perform this action.",
  [CONTRACT_ERROR_CODES.DescriptionTooLong]: "The campaign description is too long.",
  [CONTRACT_ERROR_CODES.ContractPaused]: "The contract is temporarily paused. Please try again later.",
  [CONTRACT_ERROR_CODES.RefundNotAllowed]: "A refund is not available for this campaign yet.",
  [CONTRACT_ERROR_CODES.CampaignNotCancelled]: "This campaign has not been cancelled.",
  [CONTRACT_ERROR_CODES.NothingToRefund]: "There is no contribution left to refund.",
  [CONTRACT_ERROR_CODES.RefundTransferFailed]: "The refund transfer failed. Please try again.",
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

/**
 * Extracts the numeric contract error code from a simulation/transaction
 * error, e.g. `HostError: Error(Contract, #18)` → 18. Returns null when the
 * error did not originate from a contract `ContractError`.
 */
export function getContractErrorCode(error: unknown): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(errorMessage(error));
  return match ? Number(match[1]) : null;
}

export function isUserCancellation(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("User declined") ||
    message.includes("cancelled") ||
    message.includes("Wallet error") ||
    message.includes("User rejected")
  );
}

/** Maps contract failures and common wallet/network errors to shared UI copy. */
export function mapTransactionError(error: unknown): string {
  const code = getContractErrorCode(error);
  if (code !== null && CONTRACT_ERROR_MESSAGES[code]) return CONTRACT_ERROR_MESSAGES[code];

  const message = errorMessage(error);
  if (isUserCancellation(error)) return "Transaction was cancelled.";
  if (
    message.includes("Network Error") ||
    message.includes("Failed to fetch") ||
    message.includes("Send failed")
  ) {
    return "Network error. Please try again.";
  }
  if (message.includes("Simulation failed") || message.includes("Transaction failed")) {
    return "Transaction failed on-chain.";
  }
  return "Something went wrong. Please try again.";
}
