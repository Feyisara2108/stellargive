import { test, expect, type Page } from "@playwright/test";

/**
 * Volatile selectors that change on every page load and must be masked so
 * snapshot comparisons stay stable across runs.
 */
const MASKS = {
  campaignCards: "[data-testid='campaign-card'], .campaign-card",
  walletButton: "[data-testid='wallet-btn'], button:has(.lucide-wallet)",
  progressBars: "[role='progressbar']",
  addresses: "[data-testid='address-link']",
  donationAmounts: "[data-testid='donation-amount']",
  // RPC health dot — status changes depending on network timing
  rpcDot: "[role='status']",
  // Countdown timers and time-based text
  countdowns: "time, [data-countdown], [data-testid='countdown']",
  // Numeric amounts that change as campaigns receive donations
  xlmAmounts: ":text-matches('\\d+\\.?\\d*\\s*XLM')",
};

/** Returns an array of masked locators shared by most full-page snapshots. */
function commonMasks(page: Page) {
  return [
    page.locator(MASKS.campaignCards),
    page.locator(MASKS.walletButton),
    page.locator(MASKS.progressBars),
    page.locator(MASKS.rpcDot),
    page.locator(MASKS.countdowns),
  ];
}

const THEMES = ["light", "dark"] as const;

// ── Landing page ─────────────────────────────────────────────────────────────

for (const colorScheme of THEMES) {
  test.describe(`Landing page — ${colorScheme}`, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.waitForSelector("h1", { timeout: 15_000 });
      await page.waitForLoadState("networkidle").catch(() => {
        // networkidle may time out on blockchain connections; that's fine
      });
    });

    test("hero section matches snapshot", async ({ page }) => {
      const hero = page.locator("section").first();
      await expect(hero).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-hero-${colorScheme}.png`, {
        fullPage: false,
        animations: "disabled",
        mask: [
          page.locator(MASKS.walletButton),
          page.locator(MASKS.rpcDot),
        ],
      });
    });

    test("full page matches snapshot", async ({ page }) => {
      await expect(page).toHaveScreenshot(`landing-full-${colorScheme}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: commonMasks(page),
      });
    });
  });
}

// ── Explore page ─────────────────────────────────────────────────────────────

for (const colorScheme of THEMES) {
  test.describe(`Explore page — ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("empty state matches snapshot", async ({ page }) => {
      await page.goto("/explore?search=non-existent-campaign-xyz-123");
      await page.waitForSelector("text=No campaigns found", { timeout: 15_000 });
      await expect(page).toHaveScreenshot(`explore-empty-state-${colorScheme}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: [
          page.locator(MASKS.walletButton),
          page.locator(MASKS.rpcDot),
        ],
      });
    });
  });
}

// ── Campaign Detail page ──────────────────────────────────────────────────────

for (const colorScheme of THEMES) {
  test.describe(`Campaign Detail page — ${colorScheme}`, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      await page.goto("/campaign/1");
      // Wait for either the campaign heading or a skeleton/error state
      await page.waitForSelector("h1", { timeout: 20_000 }).catch(() => {
        // page may show a skeleton — still a valid baseline
      });
      // Let layout shifts and data-fetch settle before snapping
      await page.waitForTimeout(1_500);
    });

    test("campaign detail matches snapshot", async ({ page }) => {
      await expect(page).toHaveScreenshot(`campaign-detail-${colorScheme}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: [
          ...commonMasks(page),
          page.locator(MASKS.addresses),
          page.locator(MASKS.donationAmounts),
          page.locator(MASKS.xlmAmounts),
        ],
      });
    });
  });
}

// ── Create Campaign page ──────────────────────────────────────────────────────

for (const colorScheme of THEMES) {
  test.describe(`Create Campaign page — ${colorScheme}`, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      await page.goto("/create");
      await page.waitForSelector("h1", { timeout: 15_000 });
    });

    test("form matches snapshot", async ({ page }) => {
      await expect(page).toHaveScreenshot(`create-campaign-${colorScheme}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: [
          page.locator(MASKS.walletButton),
          page.locator(MASKS.rpcDot),
        ],
      });
    });
  });
}
