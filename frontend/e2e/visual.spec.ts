import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

const CREATOR = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYSFSSTY2FOWOWPPTXY";
const TOKEN = "CDLZFC3SYJYDTIW67FYOFNPZNR2BAZZB54JZWJZWJZWJZWJZWJZWJZWZ";

type Seed = {
  id: number;
  title: string;
  status: "Active" | "Funded";
  raised: bigint;
  target: bigint;
  description: string;
};

const CAMPAIGNS: Seed[] = [
  {
    id: 1,
    title: "Clean Water Infrastructure",
    status: "Active",
    raised: 25_000_000n,
    target: 100_000_000n,
    description: "Providing clean drinking water to underserved communities.",
  },
  {
    id: 2,
    title: "Emergency Medical Relief",
    status: "Active",
    raised: 75_000_000n,
    target: 100_000_000n,
    description: "Rapid deployment of medical supplies and field hospitals.",
  },
  {
    id: 3,
    title: "Education & Literacy Drive",
    status: "Funded",
    raised: 50_000_000n,
    target: 50_000_000n,
    description: "Building community libraries and funding teacher salaries.",
  },
];

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignScVal(c: Seed): string {
  const mockCampaign = {
    id: BigInt(c.id),
    creator: CREATOR,
    beneficiary: CREATOR,
    title: c.title,
    description: c.description,
    category: "Disaster",
    target_amount: c.target,
    raised_amount: c.raised,
    deadline: 9_999_999_999n,
    accepted_token: TOKEN,
    status: { [c.status]: null },
    metadata_uri: "",
    website: "https://stellargive.org",
    twitter: "https://twitter.com/stellargive",
  };
  return nativeToScVal(mockCampaign).toXDR("base64");
}

function decodeInvocation(txXdr: string): { fn: string; args: unknown[] } | null {
  try {
    const env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
    const op = env.v1().tx().operations()[0];
    const ic = op.body().invokeHostFunctionOp().hostFunction().invokeContract();
    return {
      fn: ic.functionName().toString(),
      args: ic.args().map((a) => scValToNative(a)),
    };
  } catch {
    return null;
  }
}

function ok(id: number, retvalXdr: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      transactionData: "",
      minResourceFee: "100",
      cost: { cpuInsns: "1000", memBytes: "1000" },
      results: [{ xdr: retvalXdr }],
      latestLedger: 1000,
    },
  };
}

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // ignore
    }
    const method = body.method || "";
    const id = body.id;

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
      const xdrString = body.params?.transaction ?? body.params?.[0] ?? "";
      const buffer = Buffer.from(xdrString, "base64");

      let retval: any;
      if (buffer.includes("get_campaign")) {
        const mockCampaign = {
          id: 1n,
          creator: CREATOR,
          beneficiary: CREATOR,
          title: "Clean Water Infrastructure",
          description: "Providing clean drinking water to underserved communities.",
          category: "relief",
          target_amount: 100000000n, // 10 XLM
          raised_amount: 25000000n, // 2.5 XLM
          deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
          accepted_token: TOKEN,
          status: { Active: null },
          metadata_uri: "",
          website: "https://stellargive.org",
          twitter: "https://twitter.com/stellargive",
        };
        retval = nativeToScVal(mockCampaign);
      } else if (buffer.includes("get_campaigns_paged")) {
        const mockCampaigns = CAMPAIGNS.map((c) => ({
          id: BigInt(c.id),
          creator: CREATOR,
          beneficiary: CREATOR,
          title: c.title,
          description: c.description,
          category: "relief",
          target_amount: c.target,
          raised_amount: c.raised,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
          accepted_token: TOKEN,
          status: { [c.status]: null },
          metadata_uri: "",
          website: "https://stellargive.org",
          twitter: "https://twitter.com/stellargive",
        }));
        retval = nativeToScVal(mockCampaigns);
      } else if (buffer.includes("balance")) {
        retval = nativeToScVal(1000000000n, { type: "i128" });
      } else if (buffer.includes("get_total_campaigns")) {
        retval = nativeToScVal(BigInt(CAMPAIGNS.length), { type: "u64" });
      } else if (buffer.includes("decimals")) {
        retval = nativeToScVal(7, { type: "u32" });
      } else if (buffer.includes("name") || buffer.includes("symbol")) {
        retval = nativeToScVal("XLM", { type: "string" });
      } else {
        retval = nativeToScVal(null);
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            transactionData: "",
            minResourceFee: "100",
            cost: { cpuInsns: "1000", memBytes: "1000" },
            results: [{ xdr: retval.toXDR("base64") }],
            latestLedger: 1000,
          },
        }),
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
