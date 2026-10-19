// Stroop <-> token amount helpers. Kept free of the Stellar SDK so read-only UI
// can format amounts without pulling the SDK into its first-load bundle.

export const STROOP_PRECISION = 7;

/**
 * Maximum resource fee (in stroops) we expect any single contract call to
 * consume.  Transactions simulating above this threshold are flagged so the UI
 * can warn the user before they sign.  The hard cap set here is deliberately
 * generous (10 M CPU units worth of fee headroom); tighten per-call if needed.
 */
export const MAX_SIMULATION_FEE_STROOPS = 10_000_000;

export function toStroops(amount: string | number): bigint {
  const str = amount.toString().trim();

  // Reject non-numeric inputs
  if (!/^\d+(\.\d+)?$/.test(str)) {
    if (str.startsWith("-")) {
      throw new Error("Invalid amount: negative values not allowed");
    }
    throw new Error("Invalid amount: not a number");
  }

  const parts = str.split(".");

  // Reject excessive decimal places (more than 7)
  if (parts.length > 1 && parts[1].length > STROOP_PRECISION) {
    throw new Error(`Invalid amount: exceeds ${STROOP_PRECISION} decimal places`);
  }

  let stroops = BigInt(parts[0]) * BigInt(10 ** STROOP_PRECISION);
  if (parts.length > 1) {
    const decimals = parts[1].padEnd(STROOP_PRECISION, "0");
    stroops += BigInt(decimals);
  }
  return stroops;
}

export function fromStroops(stroops: bigint | string | number): string {
  const n = BigInt(stroops);
  const intPart = (n / 10_000_000n).toString();
  const decRaw = (n % 10_000_000n).toString().padStart(7, "0");
  const decPart = decRaw.replace(/0+$/, "");
  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
}
