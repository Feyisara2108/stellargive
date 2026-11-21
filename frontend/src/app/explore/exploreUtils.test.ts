import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isStatusFilter,
  isCategoryKey,
  campaignCategoryKey,
  matchesCategory,
  sortCampaigns,
} from "./exploreUtils";
import { makeCampaign } from "@/test/factories";

describe("isStatusFilter", () => {
  it.each(["all", "active", "funded"] as const)("returns true for '%s'", (status) => {
    expect(isStatusFilter(status)).toBe(true);
  });

  it.each([null, "", "pending", "closed", "unknown", "ALL"])("returns false for '%s'", (value) => {
    expect(isStatusFilter(value)).toBe(false);
  });
});

describe("isCategoryKey", () => {
  it.each(["all", "medical", "food", "shelter", "education", "relief", "uncategorized"] as const)(
    "returns true for valid category '%s'",
    (category) => {
      expect(isCategoryKey(category)).toBe(true);
    },
  );

  it.each([null, "", "other", "sports", "tech", "RELIEF"])("returns false for '%s'", (value) => {
    expect(isCategoryKey(value)).toBe(false);
  });
});

describe("campaignCategoryKey", () => {
  it("maps empty or whitespace category to uncategorized", () => {
    expect(campaignCategoryKey(makeCampaign({ category: "" }))).toBe("uncategorized");
    expect(campaignCategoryKey(makeCampaign({ category: "   " }))).toBe("uncategorized");
    expect(campaignCategoryKey(makeCampaign({ category: undefined as unknown as string }))).toBe(
      "uncategorized",
    );
  });

  it("maps 'other' (case-insensitive with trimming) to uncategorized", () => {
    expect(campaignCategoryKey(makeCampaign({ category: "other" }))).toBe("uncategorized");
    expect(campaignCategoryKey(makeCampaign({ category: " Other " }))).toBe("uncategorized");
    expect(campaignCategoryKey(makeCampaign({ category: "OTHER" }))).toBe("uncategorized");
  });

  it("maps known and mixed-case categories to lowercased trimmed strings", () => {
    expect(campaignCategoryKey(makeCampaign({ category: "Medical" }))).toBe("medical");
    expect(campaignCategoryKey(makeCampaign({ category: " EDUCATION " }))).toBe("education");
    expect(campaignCategoryKey(makeCampaign({ category: "relief" }))).toBe("relief");
  });
});

describe("matchesCategory", () => {
  it("always matches when category is 'all'", () => {
    const c1 = makeCampaign({ category: "medical" });
    const c2 = makeCampaign({ category: "other" });
    const c3 = makeCampaign({ category: "" });

    expect(matchesCategory(c1, "all")).toBe(true);
    expect(matchesCategory(c2, "all")).toBe(true);
    expect(matchesCategory(c3, "all")).toBe(true);
  });

  it("matches specific categories via campaignCategoryKey mapping", () => {
    const medicalCampaign = makeCampaign({ category: " Medical " });
    const uncategorizedCampaign = makeCampaign({ category: "other" });
    const emptyCampaign = makeCampaign({ category: "" });

    expect(matchesCategory(medicalCampaign, "medical")).toBe(true);
    expect(matchesCategory(medicalCampaign, "food")).toBe(false);

    expect(matchesCategory(uncategorizedCampaign, "uncategorized")).toBe(true);
    expect(matchesCategory(emptyCampaign, "uncategorized")).toBe(true);
    expect(matchesCategory(uncategorizedCampaign, "relief")).toBe(false);
  });
});

describe("sortCampaigns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not mutate the original array and returns a new array", () => {
    const c1 = makeCampaign({ id: 1n, deadline: 100n });
    const c2 = makeCampaign({ id: 2n, deadline: 200n });
    const input = [c1, c2];

    const sorted = sortCampaigns(input, "newest");
    expect(sorted).not.toBe(input);
    expect(input[0].id).toBe(1n);
    expect(input[1].id).toBe(2n);
  });

  it("returns unchanged copy for unknown sort key (default)", () => {
    const c1 = makeCampaign({ id: 1n });
    const c2 = makeCampaign({ id: 2n });
    const input = [c1, c2];

    const sorted = sortCampaigns(input, "non-existent" as any);
    expect(sorted).toEqual([c1, c2]);
    expect(sorted).not.toBe(input);
  });

  it("sorts by 'newest' (deadline descending)", () => {
    const early = makeCampaign({ id: 1n, deadline: 1000n });
    const mid = makeCampaign({ id: 2n, deadline: 2000n });
    const late = makeCampaign({ id: 3n, deadline: 3000n });

    const sorted = sortCampaigns([early, late, mid], "newest");
    expect(sorted.map((c) => c.id)).toEqual([3n, 2n, 1n]);
  });

  it("sorts by 'ending-soon' (deadline ascending)", () => {
    const early = makeCampaign({ id: 1n, deadline: 1000n });
    const mid = makeCampaign({ id: 2n, deadline: 2000n });
    const late = makeCampaign({ id: 3n, deadline: 3000n });

    const sorted = sortCampaigns([late, early, mid], "ending-soon");
    expect(sorted.map((c) => c.id)).toEqual([1n, 2n, 3n]);
  });

  it.each(["most-funded", "near-goal"] as const)(
    "sorts by '%s' based on progress percentage, treating target_amount === 0n as 0",
    (sortKey) => {
      // 50% progress: 50 / 100
      const half = makeCampaign({ id: 1n, raised_amount: 50n, target_amount: 100n });
      // 80% progress: 80 / 100
      const high = makeCampaign({ id: 2n, raised_amount: 80n, target_amount: 100n });
      // 0% progress because target_amount is 0n
      const zeroTarget = makeCampaign({ id: 3n, raised_amount: 50n, target_amount: 0n });
      // 10% progress: 10 / 100
      const low = makeCampaign({ id: 4n, raised_amount: 10n, target_amount: 100n });

      const sorted = sortCampaigns([half, zeroTarget, low, high], sortKey);
      expect(sorted.map((c) => c.id)).toEqual([2n, 1n, 4n, 3n]);
    },
  );

  it("sorts by 'most-raised' (raised_amount descending)", () => {
    const c100 = makeCampaign({ id: 1n, raised_amount: 100n });
    const c500 = makeCampaign({ id: 2n, raised_amount: 500n });
    const c300 = makeCampaign({ id: 3n, raised_amount: 300n });

    const sorted = sortCampaigns([c100, c500, c300], "most-raised");
    expect(sorted.map((c) => c.id)).toEqual([2n, 3n, 1n]);
  });

  it("sorts by 'trending' (progress / daysLeft) with fixed Date.now() and clamps daysLeft to 0.1", () => {
    // Fix current time to 1,000,000 seconds
    const nowSec = 1_000_000;
    vi.setSystemTime(new Date(nowSec * 1000));

    // c1: 50% funded (50/100), deadline in 1 day (86400s) -> score = 0.5 / 1.0 = 0.5
    const c1 = makeCampaign({
      id: 1n,
      raised_amount: 50n,
      target_amount: 100n,
      deadline: BigInt(nowSec + 86400),
    });

    // c2: 80% funded (80/100), deadline in 1 day (86400s) -> score = 0.8 / 1.0 = 0.8
    const c2 = makeCampaign({
      id: 2n,
      raised_amount: 80n,
      target_amount: 100n,
      deadline: BigInt(nowSec + 86400),
    });

    // c3: target_amount is 0n -> progress 0 -> score = 0
    const c3 = makeCampaign({
      id: 3n,
      raised_amount: 50n,
      target_amount: 0n,
      deadline: BigInt(nowSec + 86400),
    });

    // c4: deadline already passed (nowSec - 1000) -> daysLeft clamped to 0.1 -> progress 0.2 (20/100) -> score = 0.2 / 0.1 = 2.0
    const c4 = makeCampaign({
      id: 4n,
      raised_amount: 20n,
      target_amount: 100n,
      deadline: BigInt(nowSec - 1000),
    });

    const sorted = sortCampaigns([c1, c2, c3, c4], "trending");
    // Expected order: c4 (score 2.0), c2 (score 0.8), c1 (score 0.5), c3 (score 0)
    expect(sorted.map((c) => c.id)).toEqual([4n, 2n, 1n, 3n]);
  });
});
