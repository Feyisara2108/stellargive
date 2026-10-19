import { fromStroops } from "@/lib/amounts";

/** Rendered wherever an on-chain event is missing a field we expected. */
export const MISSING_FIELD = "—";

/** Anonymous donations are recorded against the contract's zero placeholder. */
export const ANONYMOUS_DONOR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Field order for events the contract publishes as tuples rather than structs.
 * `(funds, claimed)` carries `(campaign_id, beneficiary, amount, accepted_token)`;
 * every other event is a `#[contracttype]` struct and is read by name.
 */
const TUPLE_EVENT_FIELDS: Record<string, readonly string[]> = {
  claimed: ["campaign_id", "beneficiary", "amount", "accepted_token"],
};

/**
 * Contract events arrive via `scValToNative` either as structs (plain objects
 * keyed by field name) or, for a few events, as positional tuples. Tuples with a
 * known layout are mapped onto named fields so callers only ever read by name.
 * Readers must never throw on a malformed, truncated, or re-shaped payload.
 */
export function getEventPayload(event: unknown): Record<string, unknown> | null {
  const data = (event as { data?: unknown })?.data;
  if (data === null || typeof data !== "object") return null;
  if (!Array.isArray(data)) return data as Record<string, unknown>;

  const topic = (event as { topic?: unknown })?.topic;
  const fields = typeof topic === "string" ? TUPLE_EVENT_FIELDS[topic] : undefined;
  if (!fields) return null;
  return Object.fromEntries(fields.map((field, i) => [field, data[i]]));
}

/** Reads a named field from an event payload (struct, or tuple with a known layout). */
export function getEventField(event: unknown, field: string): unknown {
  const payload = getEventPayload(event);
  if (!payload) return undefined;
  return payload[field];
}

/** Parses a scalar into a bigint, or null when it is missing/garbage. */
export function parseBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && typeof (value as { toString?: unknown }).toString !== "function")
    return null;
  try {
    return BigInt(value as string | number | bigint | boolean);
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

/**
 * Account (`G…`) or contract (`C…`) address field, or null when it is missing,
 * malformed, or the anonymous-donor placeholder.
 */
function readAddress(event: unknown, field: string): string | null {
  const value = getEventField(event, field);
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === ANONYMOUS_DONOR) return null;
  return /^[GC][A-Z2-7]{55}$/.test(str) ? str : null;
}

/** Optional string field (e.g. a donation `comment`), or null. */
function readString(event: unknown, field: string): string | null {
  const value = getEventField(event, field);
  return typeof value === "string" ? value : null;
}

/** `DonationEvent { campaign_id, donor, amount, total_raised, accepted_token, comment }`. */
export interface DonationEventData {
  campaignId: string | null;
  /** Donor address, or null for anonymous donations (the zero placeholder). */
  donor: string | null;
  /** Stroops, or null when the field is missing/garbage (render "—", sum as 0). */
  amount: bigint | null;
  totalRaised: bigint | null;
  acceptedToken: string | null;
  comment: string | null;
}

/** `CreatedEvent { id, creator, target_amount }`. */
export interface CreatedEventData {
  campaignId: string | null;
  creator: string | null;
  targetAmount: bigint | null;
}

/**
 * A claim: either the `(funds, claimed)` tuple / `ClaimedEvent` struct, or an
 * `AutoClaimedEvent { campaign_id, total_raised, beneficiary }`.
 */
export interface ClaimEventData {
  campaignId: string | null;
  beneficiary: string | null;
  amount: bigint | null;
  acceptedToken: string | null;
}

/** Parses a `received` donation event, or null for any other topic. */
export function parseDonationEvent(event: unknown): DonationEventData | null {
  if ((event as { topic?: unknown })?.topic !== "received") return null;
  return {
    campaignId: getCampaignId(event),
    donor: readAddress(event, "donor"),
    amount: parseBigInt(getEventField(event, "amount")),
    totalRaised: parseBigInt(getEventField(event, "total_raised")),
    acceptedToken: readAddress(event, "accepted_token"),
    comment: readString(event, "comment"),
  };
}

/** Parses a `created` campaign event, or null for any other topic. */
export function parseCreatedEvent(event: unknown): CreatedEventData | null {
  if ((event as { topic?: unknown })?.topic !== "created") return null;
  return {
    campaignId: getCampaignId(event),
    creator: readAddress(event, "creator"),
    targetAmount: parseBigInt(getEventField(event, "target_amount")),
  };
}

/** Parses a `claimed` (tuple or struct) or `autoclaimed` event, or null otherwise. */
export function parseClaimEvent(event: unknown): ClaimEventData | null {
  const topic = (event as { topic?: unknown })?.topic;
  if (topic !== "claimed" && topic !== "autoclaimed") return null;
  return {
    campaignId: getCampaignId(event),
    beneficiary: readAddress(event, "beneficiary"),
    amount:
      parseBigInt(getEventField(event, "amount")) ??
      parseBigInt(getEventField(event, "total_raised")),
    acceptedToken: readAddress(event, "accepted_token"),
  };
}

/** Formats a parsed stroop amount as "12.5 XLM", or "—" when unusable. */
export function formatStroops(amount: bigint | null): string {
  if (amount === null) return MISSING_FIELD;
  try {
    return `${fromStroops(amount)} XLM`;
  } catch {
    return MISSING_FIELD;
  }
}

const WINDOW_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

function formatWindowDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", WINDOW_DATE_FORMAT);
}

/**
 * Human label for the period an event-derived number covers, e.g.
 * "Oct 12, 2026 – Oct 19, 2026". Falls back to the RPC retention wording when
 * the RPC didn't report ledger close times.
 */
export function formatEventWindow(windowStart: string | null, windowEnd: string | null): string {
  const start = formatWindowDate(windowStart);
  const end = formatWindowDate(windowEnd);
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `since ${start}`;
  return "the RPC's event retention window";
}
