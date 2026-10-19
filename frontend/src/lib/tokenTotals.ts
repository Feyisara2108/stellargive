import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import type { TokenMetadata } from "@/lib/soroban";
import { formatTokenAmount } from "@/utils/format";

/**
 * Raw (smallest-unit) amounts keyed by token contract id.
 *
 * Campaigns can accept different tokens, and a raw amount only means something
 * next to its token's decimals, so amounts are never added across tokens.
 */
export type TokenTotals = Map<string, bigint>;

/** Key for amounts whose token couldn't be read (e.g. a malformed event). */
export const UNKNOWN_TOKEN = "";

/**
 * Reads totals that crossed a query boundary as decimal strings (bigints can't
 * go through JSON, and the query cache is persisted to sessionStorage).
 */
export function parseTokenTotals(raw: Record<string, string> | undefined): TokenTotals {
  const totals: TokenTotals = new Map();
  for (const [token, amount] of Object.entries(raw ?? {})) {
    try {
      totals.set(token, BigInt(amount));
    } catch {
      // skip a corrupt entry rather than failing the whole total
    }
  }
  return totals;
}

export interface TokenDisplay {
  symbol: string;
  decimals: number;
}

/**
 * Symbol and decimals for a token. Native XLM is known up front (its SAC
 * reports the symbol "native"); other tokens use their on-chain metadata and,
 * until it loads, a shortened contract id so they can't be mistaken for XLM.
 */
export function describeToken(tokenId: string, meta?: TokenMetadata | null): TokenDisplay {
  if (tokenId === NATIVE_XLM_CONTRACT_ID) return { symbol: "XLM", decimals: 7 };
  if (meta) return { symbol: meta.symbol, decimals: meta.decimals };
  if (tokenId === UNKNOWN_TOKEN) return { symbol: "unknown token", decimals: 7 };
  return { symbol: `${tokenId.slice(0, 4)}…${tokenId.slice(-4)}`, decimals: 7 };
}

/** Token ids whose metadata has to be fetched to label them (everything but XLM). */
export function tokensNeedingMetadata(tokenIds: Iterable<string>): string[] {
  return Array.from(tokenIds).filter((id) => id !== NATIVE_XLM_CONTRACT_ID && id !== UNKNOWN_TOKEN);
}

/** Human amount for a raw value, e.g. "1,250.5". */
export function formatTokenTotal(raw: bigint, decimals: number): string {
  return Number(formatTokenAmount(raw, decimals)).toLocaleString();
}

/**
 * One label per token with a non-zero total, e.g. ["1,250.5 XLM", "40 USDC"],
 * in insertion order. Never a combined figure.
 */
export function formatTokenTotals(
  totals: TokenTotals,
  metas: Record<string, TokenMetadata | null | undefined> = {},
): string[] {
  return Array.from(totals)
    .filter(([, amount]) => amount !== 0n)
    .map(([token, amount]) => {
      const { symbol, decimals } = describeToken(token, metas[token]);
      return `${formatTokenTotal(amount, decimals)} ${symbol}`;
    });
}
