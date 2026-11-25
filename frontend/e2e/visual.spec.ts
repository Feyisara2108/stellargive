import { test, expect, type Page } from "@playwright/test";
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { type RpcRequestBody, decodeInvocation } from "./support/xdr";
import { campaignScVal, campaignsPagedScVal, ok, type CampaignSeed } from "./support/rpc-mock";

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

const CAMPAIGNS: CampaignSeed[] = [
  {
    id: 1,
    title: "Clean Water Infrastructure",
    status: "Active",
    raised: 25_000_000n,
    target: 100_000_000n,
    description: "Providing clean drinking water to underserved communities.",
    creator: CREATOR,
    acceptedToken: TOKEN,
    category: "relief",
    website: "https://stellargive.org",
    twitter: "https://twitter.com/stellargive",
  },
  {
    id: 2,
    title: "Emergency Medical Relief",
    status: "Active",
    raised: 75_000_000n,
    target: 100_000_000n,
    description: "Rapid deployment of medical supplies and field hospitals.",
    creator: CREATOR,
    acceptedToken: TOKEN,
    category: "relief",
    website: "https://stellargive.org",
    twitter: "https://twitter.com/stellargive",
  },
  {
    id: 3,
    title: "Education & Literacy Drive",
    status: "Funded",
    raised: 50_000_000n,
    target: 50_000_000n,
    description: "Building community libraries and funding teacher salaries.",
    creator: CREATOR,
    acceptedToken: TOKEN,
    category: "relief",
    website: "https://stellargive.org",
    twitter: "https://twitter.com/stellargive",
  },
];

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: RpcRequestBody = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // ignore
    }
    const method = body.method || "";
    const id = body.id ?? 0;

    if (method === "getLatestLedger" || method === "getHealth") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { status: "healthy", sequence: 1000, latestLedger: 1000 },
        }),
      });
      return;
    }

    if (method === "simulateTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";

      let retvalXdr: string;
      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 1);
        const seed = CAMPAIGNS.find((c) => c.id === wanted) ?? CAMPAIGNS[0];
        retvalXdr = campaignScVal(seed);
      } else if (fn === "get_campaigns_paged") {
        const offset = Number(call?.args?.[0] ?? 0);
        const limit = Number(call?.args?.[1] ?? CAMPAIGNS.length);
        retvalXdr = campaignsPagedScVal(CAMPAIGNS.slice(offset, offset + limit));
      } else if (fn === "balance") {
        retvalXdr = nativeToScVal(1_000_000_000n, { type: "i128" }).toXDR("base64");
      } else if (fn === "get_total_campaigns") {
        retvalXdr = nativeToScVal(BigInt(CAMPAIGNS.length), { type: "u64" }).toXDR("base64");
      } else if (fn === "decimals") {
        retvalXdr = nativeToScVal(7, { type: "u32" }).toXDR("base64");
      } else if (fn === "name" || fn === "symbol") {
        retvalXdr = nativeToScVal("XLM", { type: "string" }).toXDR("base64");
      } else {
        retvalXdr = xdr.ScVal.scvVoid().toXDR("base64");
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(id, retvalXdr)),
      });
      return;
    }

    if (method === "getEvents") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { events: [], latestLedger: 1000 },
        }),
      });
      return;
    }

    if (method === "getAccount") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { id: CREATOR, sequence: "100" },
        }),
      });
      return;
    }

    await route.continue();
  });
}

// Mask selectors for volatile elements across test environments
const DYNAMIC_MASKS = {
  walletButton: "[data-testid='wallet-btn'], button:has(.lucide-wallet)",
  progressBars: "[role='progressbar']",
  addresses: "[data-testid='address-link'], a[href*='stellar.expert']",
  donationAmounts: "[data-testid='donation-amount']",
  timestamps: "time, [data-testid='relative-time']",
  countdowns: ".countdown, span:has-text('left'), span:has-text('⏱️')",
  rpcBadge: "[role='status']",
};

async function gotoWithTheme(page: Page, url: string, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => {
    localStorage.setItem("theme", t);
  }, theme);
  await page.goto(url);
  await page.waitForSelector("h1", { timeout: 20_000 });
  await page.evaluate((t) => {
    if (t === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
  }, theme);
  await page.waitForTimeout(500);
}

test.describe("Visual Regression Baselines", () => {
  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page);
  });

  test.describe("Home Page", () => {
    test("light mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/", "light");

      await expect(page).toHaveScreenshot("home-light.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });

    test("dark mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/", "dark");

      await expect(page).toHaveScreenshot("home-dark.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });
  });

  test.describe("Explore Page", () => {
    test("light mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/explore", "light");

      await expect(page).toHaveScreenshot("explore-light.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });

    test("dark mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/explore", "dark");

      await expect(page).toHaveScreenshot("explore-dark.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });
  });

  test.describe("Campaign Detail Page", () => {
    test("light mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/campaign/1", "light");

      await expect(page).toHaveScreenshot("campaign-detail-light.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.donationAmounts),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });

    test("dark mode matches snapshot", async ({ page }) => {
      await gotoWithTheme(page, "/campaign/1", "dark");

      await expect(page).toHaveScreenshot("campaign-detail-dark.png", {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
        mask: [
          page.locator(DYNAMIC_MASKS.walletButton),
          page.locator(DYNAMIC_MASKS.progressBars),
          page.locator(DYNAMIC_MASKS.addresses),
          page.locator(DYNAMIC_MASKS.donationAmounts),
          page.locator(DYNAMIC_MASKS.timestamps),
          page.locator(DYNAMIC_MASKS.countdowns),
        ],
      });
    });
  });
});
