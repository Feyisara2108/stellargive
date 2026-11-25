import { test, expect, type Page } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { mockSorobanRPC, type CampaignSeed } from "./support/rpc-mock";

/**
 * E2E: Explore category filter, search empty-state, and "Load more" pagination (#1133).
 *
 * The previous version of this file asserted against markup that never existed
 * (a `[data-test-id='category-filter']` dropdown, a `#explore-search` fill, a
 * "Load More" button) and so every test in it failed. This rewrite drives the
 * real Explore page — the desktop category tablist, the `#explore-search`
 * input, and the "Load more" button — against a seeded catalogue served
 * through mocked Soroban RPC, mirroring the approach in explore.spec.ts (which
 * already covers status tabs, free-text search, and URL persistence, so this
 * file sticks to what that one doesn't: category filtering, the no-results
 * empty state, and pagination).
 */

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();

// 11 active campaigns: 9 fit on the first page (PAGE_SIZE), 2 spill onto "Load more".
const CAMPAIGNS: CampaignSeed[] = [
  ...Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    title: `Medical Fund ${i + 1}`,
    status: "Active" as const,
    category: "Medical",
    raised: 10_000_000n,
    target: 100_000_000n,
    creator: CREATOR,
    acceptedToken: TOKEN,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: i + 10,
    title: `Food Drive ${i + 1}`,
    status: "Active" as const,
    category: "Food",
    raised: 10_000_000n,
    target: 100_000_000n,
    creator: CREATOR,
    acceptedToken: TOKEN,
  })),
  ...Array.from({ length: 1 }, (_, i) => ({
    id: i + 20,
    title: `School Supplies ${i + 1}`,
    status: "Active" as const,
    category: "Education",
    raised: 10_000_000n,
    target: 100_000_000n,
    creator: CREATOR,
    acceptedToken: TOKEN,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: i + 30,
    title: `Relief Effort ${i + 1}`,
    status: "Active" as const,
    category: "Relief",
    raised: 10_000_000n,
    target: 100_000_000n,
    creator: CREATOR,
    acceptedToken: TOKEN,
  })),
];

const cards = (page: Page) => page.locator('a[href^="/campaign/"]');
const cardWithTitle = (page: Page, title: string) => cards(page).filter({ hasText: title });

test.describe("Explore — category filter, empty state, and pagination", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page, CAMPAIGNS);
  });

  test("category tab narrows the visible campaign count", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9);

    const categoryTabs = page.getByRole("tablist", { name: "Category tabs" });
    await categoryTabs.getByRole("tab", { name: /^Medical/i }).click();

    await expect(cards(page)).toHaveCount(3);
    await expect(cardWithTitle(page, "Medical Fund 1")).toBeVisible();
    await expect(cardWithTitle(page, "Food Drive 1")).toHaveCount(0);
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9);

    await page.getByPlaceholder(/Search by title or creator/i).fill("zzz-nonexistent-zzz");

    await expect(page.getByText("No campaigns match your search.")).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test("'Load more' reveals the rest of the catalogue and then disappears", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9);

    const loadMore = page.getByRole("button", { name: /^Load more$/i });
    await expect(loadMore).toBeVisible();

    await loadMore.click();

    await expect(cards(page)).toHaveCount(CAMPAIGNS.length);
    await expect(loadMore).toBeHidden();
  });
});
