"use client";

import { useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { Campaign } from "@/lib/soroban";

/** Debounce applied to raw input before matching runs, so typing stays cheap. */
export const CAMPAIGN_SEARCH_DEBOUNCE_MS = 300;

/** Campaign fields a search term is matched against. */
const SEARCHABLE_FIELDS = ["title", "creator", "category", "description"] as const;

/**
 * True when `term` (already trimmed + lowercased) appears in any searchable
 * field. An empty term matches everything.
 */
export function campaignMatchesTerm(campaign: Campaign, term: string): boolean {
  if (!term) return true;
  return SEARCHABLE_FIELDS.some((field) => {
    const value = String(campaign[field] ?? "").toLowerCase();
    return value.includes(term);
  });
}

export interface CampaignSearchResult {
  /** Campaigns matching the debounced term (the full list when it's empty). */
  results: Campaign[];
  /** The debounced term, trimmed and lowercased — safe to use as a UI flag. */
  term: string;
  /** Whether a non-empty term is currently applied. */
  isSearching: boolean;
}

/**
 * Full-text campaign search over title, creator, category, and description.
 * Debouncing is handled internally, so callers only pass the raw input value.
 */
export function useCampaignSearch(
  campaigns: Campaign[],
  term: string,
  delayMs: number = CAMPAIGN_SEARCH_DEBOUNCE_MS,
): CampaignSearchResult {
  const debounced = useDebouncedValue(term, delayMs);
  const normalized = debounced.trim().toLowerCase();

  const results = useMemo(
    () => (normalized ? campaigns.filter((c) => campaignMatchesTerm(c, normalized)) : campaigns),
    [campaigns, normalized],
  );

  return { results, term: normalized, isSearching: normalized.length > 0 };
}
