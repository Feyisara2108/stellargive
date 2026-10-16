import { fromStroops } from "@/lib/soroban";

/** Rendered wherever an on-chain event is missing a field we expected. */
export const MISSING_FIELD = "—";

/**
 * Contract events arrive as structs via `scValToNative` (plain objects with
 * field names). Older fixtures used positional arrays; readers must never throw
 * on a malformed, truncated, or re-shaped payload.
 */
export function getEventPayload(event: unknown): Record<string, unknown> | null {
  const data = (event as { data?: unknown })?.data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/** Reads a named field from a struct event payload. */
export function getEventField(event: unknown, field: string): unknown {
  const payload = getEventPayload(event);
  if (!payload) return undefined;
  return payload[field];
}

/** Parses a scalar into a bigint, or null when it is missing/garbage. */
export function parseBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && typeof (value as any).toString !== "function") return null;
  try {
    return BigInt(value as any);
  } catch {
    return null;
  }
}

/**
 * Campaign id from a contract event struct.
 * Donation/Claimed/Refund use `campaign_id`; Created/Cancelled use `id`.
 */
export function getCampaignId(event: unknown): string | null {
  const parsed =
    parseBigInt(getEventField(event, "campaign_id")) ?? parseBigInt(getEventField(event, "id"));
  return parsed === null ? null : parsed.toString();
}

/** Stroop amount from a named field (default `amount`), defaulting to 0n. */
export function getAmountStroops(event: unknown, field = "amount"): bigint {
  return parseBigInt(getEventField(event, field)) ?? 0n;
}

/** Human amount from a named field, e.g. "12.5 XLM", or "—" when unusable. */
export function formatEventAmount(event: unknown, field = "amount"): string {
  const parsed = parseBigInt(getEventField(event, field));
  if (parsed === null) return MISSING_FIELD;
  try {
    return `${fromStroops(parsed)} XLM`;
  } catch {
    return MISSING_FIELD;
  }
}

/** Shortened tx hash for display, or null when the hash is missing/too short. */
export function formatTxHash(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 12) return null;
  return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
}
