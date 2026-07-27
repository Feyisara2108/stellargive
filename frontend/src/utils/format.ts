/**
 * The Stellar protocol's canonical "null" address — used as a placeholder
 * when no real address is present (e.g. anonymous donations, zero-value fields).
 * Centralised here so every consumer uses the same constant and tests can
 * import it directly.
 */
export const ZERO_ADDRESS =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Returns a normalised Stellar G-address, or `null` if the value is absent,
 * the zero-address placeholder, or not a valid 56-char G-address.
 *
 * Use this anywhere an on-chain address field could legitimately be the
 * protocol zero-address (anonymous donations, unclaimed beneficiaries, etc.).
 */
export function normalizeAddress(value: unknown): string | null {
  if (!value) return null;
  const str = value.toString();
  if (str === ZERO_ADDRESS) return null;
  return str.length === 56 && str.startsWith("G") ? str : null;
}

export const formatAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

/**
 * Canonical token amount formatter.
 *
 * Converts a raw on-chain integer (in the token's smallest unit) to a
 * human-readable decimal string, stripping trailing zeros.
 * All other amount formatters in this file delegate here so there is a
 * single implementation path — no float arithmetic, no precision drift.
 *
 * @param raw     Raw stroop / token-unit value as bigint, string, or number.
 * @param decimals Token decimal places (default 7 for XLM/stroops).
 */
export const formatTokenAmount = (raw: bigint | string | number, decimals: number = 7): string => {
  const n = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const intPart = (n / divisor).toString();

  if (decimals === 0) return intPart;

  let decRaw = (n % divisor).toString();
  // Handle negative remainder
  if (decRaw.startsWith("-")) decRaw = decRaw.slice(1);
  decRaw = decRaw.padStart(decimals, "0");

  const decPart = decRaw.replace(/0+$/, "");

  // Handle negative zero for formatting (e.g. -0.5)
  if (n < 0n && intPart === "0") {
    return decPart.length > 0 ? `-0.${decPart}` : "0";
  }

  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
};

/**
 * Formats a stroop value (XLM's 7-decimal smallest unit) as a human-readable
 * string. Delegates to `formatTokenAmount(stroop, 7)` — no separate
 * implementation, no float conversion.
 *
 * @deprecated Prefer `formatTokenAmount(value, decimals)` when the token
 * decimal count is known at the call site. Use this only for legacy callers
 * that receive pre-typed stroop bigints.
 */
export const formatStroop = (stroop: bigint): string => formatTokenAmount(stroop, 7);

/**
 * Formats a pre-divided XLM float (e.g. from `Number(stroops) / 1e7`).
 * Retained for call sites that already have a JS `number` after dividing.
 * Prefer `formatTokenAmount` for bigint on-chain values to avoid float drift.
 */
export const formatXLM = (xlm: number): string => {
  return xlm.toFixed(7).replace(/\.?0+$/, "");
};

export const formatBasisPoints = (bps: number): string => {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toString() : pct.toFixed(2)}%`;
};

export const toRawAmount = (amount: string | number, decimals: number = 7): bigint => {
  const str = amount.toString().trim();

  // Reject non-numeric inputs (allow .5, 5., 5.5)
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(str)) {
    throw new Error("Invalid amount: not a number");
  }

  const parts = str.split(".");
  const isNegative = parts[0].startsWith("-");
  const intPart = isNegative ? parts[0].slice(1) : parts[0];

  if (parts.length > 1 && parts[1].length > decimals) {
    throw new Error(`Invalid amount: exceeds ${decimals} decimal places`);
  }

  let raw = BigInt(intPart || "0") * BigInt(10 ** decimals);
  if (parts.length > 1 && parts[1].length > 0) {
    const fraction = parts[1].padEnd(decimals, "0");
    raw += BigInt(fraction);
  }

  return isNegative ? -raw : raw;
};
