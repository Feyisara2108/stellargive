import { test, expect, type Page } from "@playwright/test";
import { mockSorobanRPC, DEFAULT_CAMPAIGNS as CAMPAIGNS } from "./support/rpc-mock";

/**
 * E2E: Explore search, status filters, and sort (#272 — covers #225/#230).
 *
 * Discovery is a top-of-funnel surface, so this drives the real Explore page
 * against a seeded set of campaigns served entirely through mocked Soroban RPC
 * (no live testnet). It asserts that:
 *   - the default "Active" filter shows only active campaigns,
 *   - search narrows the result set,
 *   - the status filters change the result set,
 *   - filter/sort state is reflected in the URL and survives a reload.
 */

const ACTIVE_COUNT = CAMPAIGNS.filter((c) => c.status === "Active" && c.raised < c.target).length;

// A campaign card links to its detail page, so count those anchors.
const cards = (page: Page) => page.locator('a[href^="/campaign/"]');

test.describe("Explore — search, filters, and sort", () => {
  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page, CAMPAIGNS);
  });

  test("default Active filter shows only active campaigns", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: /Explore Campaigns/i })).toBeVisible();
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);
  });

  test("search narrows the result set", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);

    await page.getByPlaceholder(/Search by title or creator/i).fill("Flood");
    // Debounced search (300ms) then a single matching card.
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText("Flood Relief Kenya")).toBeVisible();
  });

  test("status filters change the result set", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);

    await page.getByRole("tab", { name: /^All/i }).click();
    await expect(cards(page)).toHaveCount(CAMPAIGNS.length);

    await page.getByRole("tab", { name: /^Funded/i }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText("Medical Fund Complete")).toBeVisible();
  });

  test("filter and sort state persists in the URL across reload", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("tab", { name: /^Funded/i }).click();
    await page.getByRole("tab", { name: /Ending Soon/i }).click();

    await expect(page).toHaveURL(/status=funded/);
    await expect(page).toHaveURL(/sort=ending-soon/);

    await page.reload();

    // State restored from the URL after reload.
    await expect(page).toHaveURL(/status=funded/);
    await expect(page).toHaveURL(/sort=ending-soon/);
    await expect(page.getByRole("tab", { name: /^Funded/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(cards(page)).toHaveCount(1);
  });
});
