import type { SorobanEvent } from "@/lib/soroban";
import { getAmountStroops, getCampaignId, getEventField } from "@/lib/eventData";
import { UNKNOWN_TOKEN } from "@/lib/tokenTotals";

/** Anonymous donations are recorded against the contract's zero placeholder. */
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export type TimeRange = "all" | "monthly" | "weekly";

export interface DonorTotal {
  donor: string;
  /** Raw amount in the token this ranking is for. */
  total: bigint;
  donations: number;
  campaigns: number;
}

/** Ranked donors for each token donations were made in, keyed by token contract id. */
export type DonorsByToken = Map<string, DonorTotal[]>;

/**
 * Aggregates every `received` event into one row per donor per token, each
 * token ranked by total amount donated across all campaigns. Amounts in
 * different tokens have different decimals and values, so they are never
 * added together. Anonymous donations (the zero address) are excluded so they
 * can't occupy a rank.
 */
export function aggregateDonorsByToken(
  events: SorobanEvent[] | undefined,
  timeRange: TimeRange,
  now = Date.now(),
): DonorsByToken {
  const byToken = new Map<
    string,
    Map<string, { total: bigint; donations: number; campaigns: Set<string> }>
  >();

  // Calculate time cutoff based on selected range
  let cutoffMs = 0;
  if (timeRange === "weekly") {
    cutoffMs = 7 * 24 * 60 * 60 * 1000;
  } else if (timeRange === "monthly") {
    cutoffMs = 30 * 24 * 60 * 60 * 1000;
  }
  const cutoff = cutoffMs > 0 ? now - cutoffMs : 0;

  for (const event of events ?? []) {
    if (event?.topic !== "received" || !event.data) continue;

    // Filter by time range if not "all"
    // `getEvents` stamps events with `createdAt` (ledger close time); `timestamp` is the legacy name.
    const eventStamp = event.createdAt ?? event.timestamp;
    if (cutoff > 0 && eventStamp) {
      const eventTime = new Date(eventStamp).getTime();
      if (eventTime < cutoff) continue;
    }

    const donorRaw = getEventField(event, "donor");
    const donor = donorRaw?.toString();
    if (!donor || donor === ZERO_ADDRESS) continue;

    const amount = getAmountStroops(event, "amount");
    if (amount <= 0n) continue;

    const token = getEventField(event, "accepted_token")?.toString() || UNKNOWN_TOKEN;
    const totals = byToken.get(token) ?? new Map();
    byToken.set(token, totals);

    const entry = totals.get(donor) ?? { total: 0n, donations: 0, campaigns: new Set<string>() };
    entry.total += amount;
    entry.donations += 1;
    const campaignId = getCampaignId(event);
    if (campaignId) {
      entry.campaigns.add(campaignId);
    }
    totals.set(donor, entry);
  }

  const ranked: DonorsByToken = new Map();
  for (const [token, totals] of byToken) {
    ranked.set(
      token,
      Array.from(totals.entries())
        .map(([donor, { total, donations, campaigns }]) => ({
          donor,
          total,
          donations,
          campaigns: campaigns.size,
        }))
        .sort((a, b) => (b.total === a.total ? 0 : b.total > a.total ? 1 : -1)),
    );
  }
  return ranked;
}

/**
 * The token to rank by: the one requested in the URL if donations exist in it,
 * otherwise the token with the most donors (native XLM wins ties).
 */
export function pickLeaderboardToken(
  byToken: DonorsByToken,
  requested: string | null,
  nativeTokenId: string,
): string | null {
  if (requested && byToken.has(requested)) return requested;
  let best: string | null = null;
  for (const [token, donors] of byToken) {
    const bestCount = best === null ? -1 : byToken.get(best)!.length;
    if (donors.length > bestCount || (donors.length === bestCount && token === nativeTokenId)) {
      best = token;
    }
  }
  return best;
}
