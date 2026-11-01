import { describe, it, expect, vi, beforeEach } from "vitest";
import { nativeToScVal, xdr, Keypair, Address } from "@stellar/stellar-sdk";

// Constructable stub so the module-level `new rpc.Server(...)` yields an object
// whose RPC methods each test can drive.
vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(function () {
        return {};
      }),
    },
  };
});

import {
  dedupeClaimEvents,
  eventTopicLabel,
  getEventHistory,
  getEvents,
  server,
} from "@/lib/soroban";

const rpcServer = server as unknown as {
  getHealth: ReturnType<typeof vi.fn>;
  getLatestLedger: ReturnType<typeof vi.fn>;
  getEvents: ReturnType<typeof vi.fn>;
};

const DONOR = Keypair.random().publicKey();

function sym(value: string) {
  return nativeToScVal(value, { type: "symbol" });
}

/** A raw RPC donation event with a `DonationEvent`-shaped struct value. */
function rawDonation(i: number) {
  return {
    id: `evt-${i}`,
    txHash: `tx-${i}`,
    ledger: 1000 + i,
    ledgerClosedAt: "2026-10-15T00:00:00Z",
    topic: [sym("donation"), sym("received")],
    value: xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: sym("amount"), val: nativeToScVal(5n, { type: "i128" }) }),
      new xdr.ScMapEntry({ key: sym("campaign_id"), val: nativeToScVal(1n, { type: "u64" }) }),
      new xdr.ScMapEntry({ key: sym("donor"), val: new Address(DONOR).toScVal() }),
    ]),
  };
}

function page(events: unknown[], cursor: string) {
  return {
    events,
    cursor,
    latestLedger: 2000,
    oldestLedger: 500,
    latestLedgerCloseTime: "2026-10-19T00:00:00Z",
    oldestLedgerCloseTime: "2026-10-12T00:00:00Z",
  };
}

beforeEach(() => {
  rpcServer.getHealth = vi.fn().mockResolvedValue({ oldestLedger: 500, latestLedger: 2000 });
  rpcServer.getLatestLedger = vi.fn().mockResolvedValue({ sequence: 2000 });
  rpcServer.getEvents = vi.fn();
});

describe("getEventHistory", () => {
  it("pages past a single request with the RPC cursor and reports the window", async () => {
    const first = Array.from({ length: 3 }, (_, i) => rawDonation(i));
    const second = Array.from({ length: 3 }, (_, i) => rawDonation(3 + i));
    const last = [rawDonation(6)];
    rpcServer.getEvents
      .mockResolvedValueOnce(page(first, "c1"))
      .mockResolvedValueOnce(page(second, "c2"))
      .mockResolvedValueOnce(page(last, "c3"));

    const history = await getEventHistory(10, 3);

    expect(history.events).toHaveLength(7);
    expect(history.events[0]).toMatchObject({
      topic: "received",
      data: { campaign_id: 1n, donor: DONOR, amount: 5n },
    });
    expect(history).toMatchObject({
      windowStart: "2026-10-12T00:00:00Z",
      windowEnd: "2026-10-19T00:00:00Z",
      truncated: false,
    });
    expect(rpcServer.getEvents.mock.calls[0][0]).toMatchObject({ startLedger: 500, limit: 3 });
    expect(rpcServer.getEvents.mock.calls[1][0]).toMatchObject({ cursor: "c1", limit: 3 });
    expect(rpcServer.getEvents.mock.calls[1][0].startLedger).toBeUndefined();
    expect(rpcServer.getEvents.mock.calls[2][0]).toMatchObject({ cursor: "c2" });
  });

  it("stops at the page cap and flags the result as truncated", async () => {
    rpcServer.getEvents.mockImplementation(async () =>
      page([rawDonation(0), rawDonation(1)], "next"),
    );

    const history = await getEventHistory(2, 2);

    expect(rpcServer.getEvents).toHaveBeenCalledTimes(2);
    expect(history.truncated).toBe(true);
    expect(history.windowEnd).toBe("2026-10-15T00:00:00Z");
  });

  it("falls back to a tip-anchored start when getHealth is unavailable", async () => {
    rpcServer.getHealth.mockRejectedValue(new Error("no health"));
    rpcServer.getEvents.mockResolvedValue(page([], "c"));

    await getEventHistory();

    expect(rpcServer.getEvents.mock.calls[0][0].startLedger).toBe(1);
  });
});

describe("getEvents", () => {
  it("starts at an available ledger and follows cursors for large requests", async () => {
    const first = Array.from({ length: 1_000 }, (_, i) => rawDonation(i));
    const last = [rawDonation(1_000)];
    rpcServer.getEvents
      .mockResolvedValueOnce(page(first, "c1"))
      .mockResolvedValueOnce(page(last, "c2"));

    const events = await getEvents(1_001);

    expect(events).toHaveLength(1_001);
    expect(rpcServer.getEvents.mock.calls[0][0]).toMatchObject({
      startLedger: 500,
      limit: 1_000,
    });
    expect(rpcServer.getEvents.mock.calls[1][0]).toMatchObject({
      cursor: "c1",
      limit: 1,
    });
  });

  it("retries from a refreshed ledger when the requested range is unavailable", async () => {
    rpcServer.getHealth
      .mockResolvedValueOnce({ oldestLedger: 500, latestLedger: 2000 })
      .mockResolvedValueOnce({ oldestLedger: 700, latestLedger: 2000 });
    rpcServer.getEvents
      .mockRejectedValueOnce(new Error("startLedger is outside the available ledger range"))
      .mockResolvedValueOnce(page([rawDonation(0)], "c1"));

    await getEvents(1);

    expect(rpcServer.getEvents.mock.calls[0][0].startLedger).toBe(500);
    expect(rpcServer.getEvents.mock.calls[1][0].startLedger).toBe(700);
  });
});

describe("eventTopicLabel", () => {
  it("uses the second topic only when it is a symbol", () => {
    expect(eventTopicLabel(["donation", "received"])).toBe("received");
    expect(eventTopicLabel(["funds", "claimed"])).toBe("claimed");
    expect(eventTopicLabel(["claimed", 7n])).toBe("claimed");
    expect(eventTopicLabel(["refund", 3n])).toBe("refund");
    expect(eventTopicLabel(["created"])).toBe("created");
  });
});

describe("dedupeClaimEvents", () => {
  it("keeps one claimed event per transaction", () => {
    const events = [
      { topic: "claimed", txHash: "a", id: "1" },
      { topic: "claimed", txHash: "a", id: "2" },
      { topic: "received", txHash: "a", id: "3" },
      { topic: "claimed", txHash: "b", id: "4" },
    ];
    expect(dedupeClaimEvents(events).map((e) => e.id)).toEqual(["1", "3", "4"]);
  });
});
