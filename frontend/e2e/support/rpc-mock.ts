import type { Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * Shared Soroban RPC mocking for e2e specs that read campaigns off the
 * `/explore` page (and anything that reuses its seeded fixtures, like the
 * campaign detail page). Routes `simulateTransaction` calls for
 * `get_campaign`, `get_campaigns_paged`, `get_total_campaigns`, and token
 * metadata reads (`decimals`/`name`/`symbol`) against an in-memory seed list,
 * decoding the invoked contract function straight out of the transaction XDR
 * so no real RPC endpoint is needed.
 */

export const DEFAULT_CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
export const DEFAULT_TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

export type CampaignStatus = "Active" | "Funded" | "Claimed" | "Refunded" | "Cancelled";

export interface CampaignSeed {
  id: number;
  title: string;
  status: CampaignStatus;
  raised: bigint;
  target: bigint;
  creator?: string;
  beneficiary?: string;
  acceptedToken?: string;
  category?: string;
  description?: string;
  deadline?: bigint;
  metadataUri?: string;
  website?: string;
  twitter?: string;
}

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

/** Build the raw ScVal (a map) representing one campaign. */
function campaignToScVal(c: CampaignSeed): xdr.ScVal {
  const creator = c.creator ?? DEFAULT_CREATOR;
  const beneficiary = c.beneficiary ?? creator;
  const acceptedToken = c.acceptedToken ?? DEFAULT_TOKEN;

  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(acceptedToken).toScVal()],
    ["beneficiary", new Address(beneficiary).toScVal()],
    ["category", nativeToScVal(c.category ?? "Disaster", { type: "string" })],
    ["creator", new Address(creator).toScVal()],
    ["deadline", nativeToScVal(c.deadline ?? 9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal(c.description ?? "Seeded campaign", { type: "string" })],
    ["id", nativeToScVal(BigInt(c.id), { type: "u64" })],
    ["metadata_uri", nativeToScVal(c.metadataUri ?? "", { type: "string" })],
    ["raised_amount", nativeToScVal(c.raised, { type: "i128" })],
    [
      "status",
      xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym(c.status), val: xdr.ScVal.scvVoid() })]),
    ],
    ["target_amount", nativeToScVal(c.target, { type: "i128" })],
    ["title", nativeToScVal(c.title, { type: "string" })],
    ["twitter", nativeToScVal(c.twitter ?? "", { type: "string" })],
    ["website", nativeToScVal(c.website ?? "", { type: "string" })],
  ];
  return xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
}

/** Base64 XDR of a single campaign map — the `get_campaign` retval shape. */
export function campaignScVal(c: CampaignSeed): string {
  return campaignToScVal(c).toXDR("base64");
}

/** Base64 XDR of a vec of campaign maps — the `get_campaigns_paged` retval shape. */
export function campaignsPagedScVal(campaigns: CampaignSeed[]): string {
  return xdr.ScVal.scvVec(campaigns.map(campaignToScVal)).toXDR("base64");
}

/** Decode the contract function + args from a simulateTransaction request. */
export function decodeInvocation(txXdr: string): { fn: string; args: unknown[] } | null {
  try {
    const fromFn =
      (xdr.TransactionEnvelope as any).fromXDR ?? (xdr.TransactionEnvelope as any).fromXdr;
    const env = fromFn.call(xdr.TransactionEnvelope, txXdr, "base64");
    const v1 = typeof (env as any).v1 === "function" ? (env as any).v1() : (env as any).v1;
    const tx = v1 ? (typeof v1.tx === "function" ? v1.tx() : v1.tx) : null;
    const ops = tx ? (typeof tx.operations === "function" ? tx.operations() : tx.operations) : [];
    const op = ops?.[0];
    const opBody = op ? (typeof op.body === "function" ? op.body() : op.body) : null;
    const hostFnOp = opBody
      ? typeof opBody.invokeHostFunctionOp === "function"
        ? opBody.invokeHostFunctionOp()
        : opBody.invokeHostFunctionOp ?? opBody.value
      : null;
    const hostFn = hostFnOp
      ? typeof hostFnOp.hostFunction === "function"
        ? hostFnOp.hostFunction()
        : hostFnOp.hostFunction ?? hostFnOp.value
      : null;
    const ic = hostFn
      ? typeof hostFn.invokeContract === "function"
        ? hostFn.invokeContract()
        : hostFn.invokeContract ?? hostFn.value
      : null;
    if (!ic) return null;
    const fnNameVal = typeof ic.functionName === "function" ? ic.functionName() : ic.functionName;
    const fn = fnNameVal?.toString() ?? "";
    const argsVal = typeof ic.args === "function" ? ic.args() : ic.args;
    const args = Array.isArray(argsVal) ? argsVal.map((a: any) => scValToNative(a)) : [];
    return { fn, args };
  } catch {
    return null;
  }
}

export function ok(id: number, retvalXdr: string) {
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

export function simError(id: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: { error: message, events: [], latestLedger: 1000 },
  };
}

// A deterministic, seeded catalogue shared by every spec that just needs
// *some* campaigns to render (explore, keyboard navigation, …). Four are
// "active" (raised < target, status Active); one is fully "funded".
export const DEFAULT_CAMPAIGNS: CampaignSeed[] = [
  {
    id: 1,
    title: "Flood Relief Kenya",
    status: "Active",
    raised: 20_000_000n,
    target: 100_000_000n,
  },
  {
    id: 2,
    title: "Earthquake Aid Nepal",
    status: "Active",
    raised: 50_000_000n,
    target: 100_000_000n,
  },
  {
    id: 3,
    title: "School Rebuild Project",
    status: "Active",
    raised: 10_000_000n,
    target: 100_000_000n,
  },
  {
    id: 4,
    title: "Clean Water Wells",
    status: "Active",
    raised: 80_000_000n,
    target: 100_000_000n,
  },
  {
    id: 5,
    title: "Medical Fund Complete",
    status: "Funded",
    raised: 100_000_000n,
    target: 100_000_000n,
  },
];

export interface MockSorobanRPCOptions {
  tokenSymbol?: string;
  tokenDecimals?: number;
}

/**
 * Route `**\/soroban/rpc*` against an in-memory seed list, answering every
 * read the Explore page and campaign detail page make: `get_campaign`,
 * `get_campaigns_paged`, `get_total_campaigns`, and token metadata reads.
 */
export async function mockSorobanRPC(
  page: Page,
  campaigns: CampaignSeed[],
  options: MockSorobanRPCOptions = {},
) {
  const { tokenSymbol = "XLM", tokenDecimals = 7 } = options;

  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // not JSON — pass through
    }
    const method = body.method || "";
    const id = body.id;

    if (method === "simulateTransaction") {
      const txXdr = body.params?.transaction ?? "";
      const call = decodeInvocation(txXdr);
      const fn = call?.fn ?? "";

      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        const seed = campaigns.find((c) => c.id === wanted);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            seed ? ok(id, campaignScVal(seed)) : simError(id, "Campaign not found"),
          ),
        });
        return;
      }

      if (fn === "get_campaigns_paged") {
        const offset = Number(call?.args?.[0] ?? 0);
        const limit = Number(call?.args?.[1] ?? campaigns.length);
        const page = campaigns.slice(offset, offset + limit);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, campaignsPagedScVal(page))),
        });
        return;
      }

      if (fn === "get_total_campaigns") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok(id, nativeToScVal(campaigns.length, { type: "u32" }).toXDR("base64")),
          ),
        });
        return;
      }

      if (fn === "decimals") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok(id, nativeToScVal(tokenDecimals, { type: "u32" }).toXDR("base64")),
          ),
        });
        return;
      }

      if (fn === "name" || fn === "symbol") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok(id, nativeToScVal(tokenSymbol, { type: "string" }).toXDR("base64")),
          ),
        });
        return;
      }

      // Unknown read — return an empty void result.
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
