import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCampaignSearch,
  campaignMatchesTerm,
  CAMPAIGN_SEARCH_DEBOUNCE_MS,
} from "./useCampaignSearch";
import type { Campaign } from "@/lib/soroban";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: "GCREATOR",
    beneficiary: "GBENEFICIARY",
    beneficiaries: [],
    title: "Clean Water Initiative",
    description: "Fund wells in drought-affected regions.",
    category: "Environment",
    target_amount: 10_000n,
    raised_amount: 2_000n,
    deadline: 0n,
    accepted_token: "USDC",
    status: "Active",
    ...overrides,
  };
}

// ─── campaignMatchesTerm: exact substring matching ─────────────────────────
//
// useCampaignSearch does substring matching over title/creator/category/
// description — there is no fuzzy matching or match-highlighting anywhere in
// this hook (or the rest of the codebase). #875's requirements describe
// "fuzzy matching" and "highlight ranges", which this hook does not
// implement; those two requirements can't be tested because the behavior
// doesn't exist. This file covers what the hook actually does: exact
// (case-insensitive, substring) matching across every searchable field, plus
// the debounce timing that gates it.
describe("campaignMatchesTerm", () => {
  it("matches an empty term against everything", () => {
    expect(campaignMatchesTerm(makeCampaign(), "")).toBe(true);
  });

  it("matches a substring of the title", () => {
    const campaign = makeCampaign({ title: "Clean Water Initiative" });
    expect(campaignMatchesTerm(campaign, "water")).toBe(true);
  });

  it("lowercases the field value, so a mixed-case title still matches a lowercase term", () => {
    // campaignMatchesTerm assumes the caller (useCampaignSearch) has already
    // lowercased `term` — it only lowercases the field side of the
    // comparison. Passing an uppercase term here is a caller error, not
    // something this function normalizes.
    const campaign = makeCampaign({ title: "CLEAN WATER INITIATIVE" });
    expect(campaignMatchesTerm(campaign, "water")).toBe(true);
  });

  it("matches a substring of the creator", () => {
    const campaign = makeCampaign({ creator: "GABC123CREATOR" });
    expect(campaignMatchesTerm(campaign, "abc123")).toBe(true);
  });

  it("matches a substring of the category", () => {
    const campaign = makeCampaign({ category: "Disaster Relief" });
    expect(campaignMatchesTerm(campaign, "relief")).toBe(true);
  });

  it("matches a substring of the description", () => {
    const campaign = makeCampaign({ description: "Fund wells in drought-affected regions." });
    expect(campaignMatchesTerm(campaign, "drought")).toBe(true);
  });

  it("does not match a term absent from every field", () => {
    const campaign = makeCampaign();
    expect(campaignMatchesTerm(campaign, "earthquake")).toBe(false);
  });

  it("does not perform fuzzy/typo-tolerant matching (exact substring only)", () => {
    // "watr" is a one-letter-dropped typo of "water" — a fuzzy matcher would
    // typically still match this; the current implementation does not.
    const campaign = makeCampaign({ title: "Clean Water Initiative" });
    expect(campaignMatchesTerm(campaign, "watr")).toBe(false);
  });

  it("does not match across word boundaries a substring matcher wouldn't span", () => {
    const campaign = makeCampaign({ title: "Clean Water", description: "Initiative details" });
    expect(campaignMatchesTerm(campaign, "water initiative")).toBe(false);
  });
});

// ─── useCampaignSearch: debounced filtering over a campaign list ───────────

describe("useCampaignSearch", () => {
  const campaigns = [
    makeCampaign({ id: 1n, title: "Clean Water Initiative", category: "Environment" }),
    makeCampaign({ id: 2n, title: "School Rebuilding Fund", category: "Education" }),
    makeCampaign({ id: 3n, title: "Flood Relief Drive", category: "Disaster Relief" }),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns every campaign immediately when the term is empty", () => {
    const { result } = renderHook(() => useCampaignSearch(campaigns, ""));
    expect(result.current.results).toEqual(campaigns);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.term).toBe("");
  });

  it("does not apply a new term before the debounce delay elapses", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "water" });

    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS - 1);
    });

    expect(result.current.results).toEqual(campaigns);
    expect(result.current.isSearching).toBe(false);
  });

  it("applies the term once the debounce delay elapses, returning only matches", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "water" });

    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });

    expect(result.current.results).toEqual([campaigns[0]]);
    expect(result.current.isSearching).toBe(true);
    expect(result.current.term).toBe("water");
  });

  it("resets the debounce timer on every keystroke rather than accumulating", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "w" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ term: "wa" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ term: "water" });

    // Only 200ms have passed since the last keystroke — still debouncing.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.results).toEqual(campaigns);

    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS - 200);
    });
    expect(result.current.results).toEqual([campaigns[0]]);
  });

  it("trims and lowercases the term before matching and exposing it", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "  WATER  " });
    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });

    expect(result.current.term).toBe("water");
    expect(result.current.results).toEqual([campaigns[0]]);
  });

  it("treats a whitespace-only term the same as an empty term", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "   " });
    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });

    expect(result.current.results).toEqual(campaigns);
    expect(result.current.isSearching).toBe(false);
  });

  it("returns an empty result set when nothing matches", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term), {
      initialProps: { term: "" },
    });

    rerender({ term: "earthquake" });
    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(true);
  });

  it("respects a custom debounce delay", () => {
    const { result, rerender } = renderHook(({ term }) => useCampaignSearch(campaigns, term, 1000), {
      initialProps: { term: "" },
    });

    rerender({ term: "water" });

    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.results).toEqual(campaigns);

    act(() => {
      vi.advanceTimersByTime(1000 - CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.results).toEqual([campaigns[0]]);
  });

  it("re-filters when the campaign list itself changes, without waiting on the debounce", () => {
    const { result, rerender } = renderHook(
      ({ list, term }) => useCampaignSearch(list, term),
      { initialProps: { list: campaigns, term: "water" } },
    );

    act(() => {
      vi.advanceTimersByTime(CAMPAIGN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.results).toEqual([campaigns[0]]);

    const moreWater = [...campaigns, makeCampaign({ id: 4n, title: "Watershed Restoration" })];
    rerender({ list: moreWater, term: "water" });

    expect(result.current.results).toEqual([campaigns[0], moreWater[3]]);
  });
});
