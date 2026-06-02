import { test, expect } from "@playwright/test";

// Mask selectors for elements with dynamic blockchain data
const DYNAMIC_MASKS = {
  campaignCards: "[data-testid='campaign-card'], .campaign-card",
  walletButton: "[data-testid='wallet-btn'], button:has(.lucide-wallet)",
  progressBars: "[role='progressbar']",
  addresses: "[data-testid='address-link']",
  donationAmounts: "[data-testid='donation-amount']",
};

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the hero section to be visible (static, always present)
    await page.waitForSelector("h1", { timeout: 15_000 });
    // Let any layout shifts settle
    await page.waitForLoadState("networkidle").catch(() => {
      // networkidle may time out on blockchain connections; that's fine
    });
  });

  test("hero section matches snapshot", async ({ page }) => {
    const hero = page.locator("section").first();
    await expect(hero).toBeVisible();
    await expect(page).toHaveScreenshot("landing-hero.png", {
      fullPage: false,
      animations: "disabled",
      mask: [page.locator(DYNAMIC_MASKS.walletButton)],
    });
  });

  test("full page matches snapshot", async ({ page }) => {
    await expect(page).toHaveScreenshot("landing-full.png", {
      fullPage: true,
      animations: "disabled",
      mask: [
        page.locator(DYNAMIC_MASKS.campaignCards),
        page.locator(DYNAMIC_MASKS.walletButton),
        page.locator(DYNAMIC_MASKS.progressBars),
      ],
    });
  });
});

test.describe("Explore page", () => {
  test("empty state matches snapshot", async ({ page }) => {
    // Navigate with a search term that will return no results
    await page.goto("/explore?search=non-existent-campaign-xyz-123");
    await page.waitForSelector("text=No campaigns found", { timeout: 15_000 });
    await expect(page).toHaveScreenshot("explore-empty-state.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});

test.describe("Create Campaign page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/create");
    await page.waitForSelector("h1", { timeout: 15_000 });
  });

  test("form matches snapshot", async ({ page }) => {
    await expect(page).toHaveScreenshot("create-campaign.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});

test.describe("Campaign Detail page", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to campaign 1; page handles missing data gracefully with skeletons
    await page.goto("/campaign/1");
    // Wait for either the campaign title or a skeleton/error state
    await page
      .waitForSelector("h1", { timeout: 20_000 })
      .catch(() => {/* page may show skeleton */});
    // Allow network to settle or skeleton to stabilise
    await page.waitForTimeout(1500);
  });

  test("campaign detail matches snapshot", async ({ page }) => {
    await expect(page).toHaveScreenshot("campaign-detail.png", {
      fullPage: true,
      animations: "disabled",
      mask: [
        page.locator(DYNAMIC_MASKS.addresses),
        page.locator(DYNAMIC_MASKS.progressBars),
        page.locator(DYNAMIC_MASKS.donationAmounts),
        // Mask numeric values that change over time
        page.locator("text=/\\d+\\.\\d+ XLM/"),
      ],
    });
  });
});
