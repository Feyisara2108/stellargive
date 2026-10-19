import { CATEGORIES, type CategoryKey } from "@/components/CategorySelector";
import type { SortKey } from "@/components/SortSelector";
import type { Campaign } from "@/lib/soroban";

export const PAGE_SIZE = 9;

export type StatusFilter = "all" | "active" | "funded";
export type ViewMode = "grid" | "list";

export function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "all" || value === "active" || value === "funded";
}

export function isCategoryKey(value: string | null): value is CategoryKey {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Mirrors CampaignCard's badge logic: a campaign with an empty or "other"
 * category is labelled "Uncategorized". Both the filter and the per-tab counts
 * go through this so they can never disagree (#1090).
 */
export function campaignCategoryKey(campaign: Campaign): string {
  const value = (campaign.category ?? "").trim().toLowerCase();
  return value === "" || value === "other" ? "uncategorized" : value;
}

export function matchesCategory(campaign: Campaign, category: CategoryKey): boolean {
  if (category === "all") return true;
  return campaignCategoryKey(campaign) === category;
}

export function sortCampaigns(campaigns: Campaign[], sortBy: SortKey): Campaign[] {
  const sorted = [...campaigns];
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => Number(b.deadline) - Number(a.deadline));
    case "ending-soon":
      return sorted.sort((a, b) => Number(a.deadline) - Number(b.deadline));
    case "most-funded":
    case "near-goal": {
      const progress = (c: Campaign) =>
        c.target_amount === 0n ? 0 : Number((c.raised_amount * 10_000n) / c.target_amount);
      return sorted.sort((a, b) => progress(b) - progress(a));
    }
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
    case "trending": {
      const now = Date.now() / 1000;
      const trendingScore = (c: Campaign) => {
        const progress =
          c.target_amount === 0n ? 0 : Number(c.raised_amount) / Number(c.target_amount);
        const daysLeft = Math.max((Number(c.deadline) - now) / 86400, 0.1);
        return progress / daysLeft;
      };
      return sorted.sort((a, b) => trendingScore(b) - trendingScore(a));
    }
    default:
      return sorted;
  }
}

/** Stable IDs used to wire tabs → tabpanel with aria-controls/aria-labelledby */
export const STATUS_TABS = [
  { value: "all", label: "All", id: "status-tab-all", badgeStatus: "All" as const },
  { value: "active", label: "Active", id: "status-tab-active", badgeStatus: "Active" as const },
  { value: "funded", label: "Funded", id: "status-tab-funded", badgeStatus: "Funded" as const },
] as const;

export const RESULTS_PANEL_ID = "campaign-results-panel";
