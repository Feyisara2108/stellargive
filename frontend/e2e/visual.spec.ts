import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

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
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(CREATOR).toScVal()],
    ["category", nativeToScVal("Disaster", { type: "string" })],
    ["creator", new Address(CREATOR).toScVal()],
    ["deadline", nativeToScVal(9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal(c.description, { type: "string" })],
    ["id", nativeToScVal(BigInt(c.id), { type: "u64" })],
    ["metadata_uri", nativeToScVal("", { type: "string" })],
    ["raised_amount", nativeToScVal(c.raised, { type: "i128" })],
    [
      "status",
      xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym(c.status), val: xdr.ScVal.scvVoid() })]),
    ],
    ["target_amount", nativeToScVal(c.target, { type: "i128" })],
    ["title", nativeToScVal(c.title, { type: "string" })],
    ["twitter", nativeToScVal("https://twitter.com/stellargive", { type: "string" })],
    ["website", nativeToScVal("https://stellargive.org", { type: "string" })],
  ];
  const map = xdr.ScVal.scvMap(
    entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })),
  );
  return map.toXDR("base64");
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

    if (method === "simulateTransaction") {
      const txXdr = body.params?.transaction ?? "";
      const call = decodeInvocation(txXdr);
      const fn = call?.fn ?? "";

      if (fn === "get_campaign" || txXdr.includes("Z2V0X2NhbXBhaWdu")) {
        const wanted = Number(call?.args?.[0] ?? 1);
        const seed = CAMPAIGNS.find((c) => c.id === wanted) ?? CAMPAIGNS[0];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, campaignScVal(seed))),
        });
        return;
      }

      if (fn === "get_total_campaigns") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok(id, nativeToScVal(CAMPAIGNS.length, { type: "u32" }).toXDR("base64")),
          ),
        });
        return;
      }

      if (fn === "decimals") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, nativeToScVal(7, { type: "u32" }).toXDR("base64"))),
        });
        return;
      }

      if (fn === "name" || fn === "symbol") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, nativeToScVal("XLM", { type: "string" }).toXDR("base64"))),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(id, xdr.ScVal.scvVoid().toXDR("base64"))),
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
