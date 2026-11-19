import { describe, it, expect } from "vitest";
import {
  Account,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { buildCampaign } from "../test/factories";
import { MOCK_CAMPAIGNS, setMockCampaigns } from "./handlers";

const RPC_URL = "http://localhost:8000/rpc";
const CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const NETWORK_PASSPHRASE = "Standalone Network ; February 2017";

async function rpc(method: string, params?: unknown) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

function pagedTx(offset: number, limit: number): string {
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      new Contract(CONTRACT_ID).call(
        "get_campaigns_paged",
        nativeToScVal(offset, { type: "u64" }),
        nativeToScVal(limit, { type: "u32" }),
      ),
    )
    .setTimeout(30)
    .build()
    .toXDR();
}

describe("shared MSW handlers", () => {
  it("answers getHealth with the retention window", async () => {
    const body = await rpc("getHealth");
    expect(body.result).toEqual({
      status: "healthy",
      latestLedger: 123456,
      oldestLedger: 1,
      ledgerRetentionWindow: 120960,
    });
  });

  it("returns the requested slice for get_campaigns_paged", async () => {
    setMockCampaigns([1n, 2n, 3n, 4n].map((id) => buildCampaign({ id })));
    const body = await rpc("simulateTransaction", { transaction: pagedTx(1, 2) });
    const page = scValToNative(xdr.ScVal.fromXDR(body.result.results[0].xdr, "base64")) as {
      id: bigint;
    }[];
    expect(page.map((c) => Number(c.id))).toEqual([2, 3]);
  });

  it("sets campaigns for one test only (setup)", () => {
    setMockCampaigns([buildCampaign({ id: 99n, title: "Leaky" })]);
    expect(MOCK_CAMPAIGNS.map((c) => c.id)).toEqual([99n]);
  });

  it("sets campaigns for one test only (next test)", () => {
    expect(MOCK_CAMPAIGNS.some((c) => c.id === 99n)).toBe(false);
  });
});
