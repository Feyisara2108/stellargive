"use client";

import React, { useMemo } from "react";
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
  const fieldMatch = SEARCHABLE_FIELDS.some((field) => {
    const value = String(campaign[field] ?? "").toLowerCase();
    // All query words must match the field value.
    return words.every((w) => value.includes(w) || fuzzyWordMatch(w, value));
  });
  if (fieldMatch) return true;

  // Also search across free-form tags (joined as a single haystack).
  if (campaign.tags && campaign.tags.length > 0) {
    const tagsHaystack = campaign.tags.join(" ").toLowerCase();
    return words.every((w) => tagsHaystack.includes(w) || fuzzyWordMatch(w, tagsHaystack));
  }

  return false;
}

/** Shortest query word that gets typo tolerance; shorter words match too loosely. */
const FUZZY_MIN_LENGTH = 4;

/** True when `a` and `b` differ by at most one insertion, deletion, or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Typo-tolerant fallback for when substring matching misses: `word` matches if
 * some single word in `text` is within one edit of it (e.g. "watr" -> "water").
 * Comparing whole words keeps long descriptions from matching everything.
 */
function fuzzyWordMatch(word: string, text: string): boolean {
  if (word.length < FUZZY_MIN_LENGTH) return false;
  return text.split(/[^\p{L}\p{N}]+/u).some((token) => withinOneEdit(word, token));
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
 * Full-text campaign search over title, creator, category, description, and tags.
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
