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
 * field. An empty term matches everything. Uses fuzzy matching: each word in
 * the query must appear somewhere in the field (order-independent), allowing
 * for typos via a simple character-ratio threshold.
 */
export function campaignMatchesTerm(campaign: Campaign, term: string): boolean {
  if (!term) return true;
  const words = term.split(/\s+/).filter(Boolean);
  return SEARCHABLE_FIELDS.some((field) => {
    const value = String(campaign[field] ?? "").toLowerCase();
    // All query words must match the field value.
    return words.every((w) => value.includes(w) || fuzzyScore(w, value) >= 0.6);
  });
}

/**
 * Simple fuzzy score: what fraction of `pattern` characters appear in `text`
 * in order (not necessarily contiguous). Returns 0–1 where 1 is a perfect
 * subsequence match. Used as a fallback when substring match misses, so
 * minor typos still surface relevant results.
 */
function fuzzyScore(pattern: string, text: string): number {
  if (!pattern) return 1;
  let pi = 0;
  for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
    if (text[ti] === pattern[pi]) pi++;
  }
  return pi / pattern.length;
}

/**
 * Highlights matching substrings in `text` by wrapping them in `<mark>` tags.
 * Matching is case-insensitive; the original casing is preserved.
 */
export function highlightMatch(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;

  // Build a single regex that matches any of the query words.
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
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
