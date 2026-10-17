import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Stub the whole soroban module so no RPC server is constructed and the event
// feed can be driven directly (#1154).
vi.mock("@/lib/soroban", () => ({
  getCampaign: vi.fn(),
  getRecentCampaigns: vi.fn(),
  getCampaignsPage: vi.fn(),
  submitTransaction: vi.fn(),
  estimateFee: vi.fn(),
  getEvents: vi.fn(),
  getUpdates: vi.fn(),
  getTotalCampaigns: vi.fn(),
  getPlatformConfig: vi.fn(),
  getSACBalance: vi.fn(),
  resolveAddressName: vi.fn(),
  toStroops: vi.fn(),
  CONTRACT_ID: "CTEST",
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(() => ({ address: null, isConnected: false })),
}));

import { countUniqueDonors, useUniqueDonors, DONOR_SCAN_EVENT_LIMIT } from "./useSoroban";
import { getEvents } from "@/lib/soroban";
import { makeClaimedEvent, makeCreatedEvent, makeDonationEvent, makeEvent } from "@/test/factories";

/**
 * The placeholder the contract records every anonymous donation against. Kept
 * as a literal rather than imported so a change to the module constant shows
 * up here as a failure instead of passing silently.
 */
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const DONOR_A = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const DONOR_B = "GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFN4L5MHZ5RWBNRUBALXAS5F3B2";
const DONOR_C = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("countUniqueDonors", () => {
  it("counts each distinct donor once", () => {
    const events = [
      makeDonationEvent("1", DONOR_A, 100n),
      makeDonationEvent("2", DONOR_B, 200n),
      makeDonationEvent("3", DONOR_C, 300n),
    ];

    expect(countUniqueDonors(events)).toBe(3);
  });

  it("collapses repeat donations from the same address into one donor", () => {
    const events = [
      makeDonationEvent("1", DONOR_A, 100n),
      makeDonationEvent("2", DONOR_A, 200n),
      makeDonationEvent("3", DONOR_A, 300n),
      makeDonationEvent("4", DONOR_B, 400n),
    ];

    expect(countUniqueDonors(events)).toBe(2);
  });

  it("counts a donor once across different campaigns", () => {
    const events = [
      makeDonationEvent("1", DONOR_A, 100n, 1n),
      makeDonationEvent("2", DONOR_A, 100n, 2n),
      makeDonationEvent("3", DONOR_A, 100n, 3n),
    ];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("excludes anonymous donations recorded against the zero address", () => {
    const events = [
      makeDonationEvent("1", ZERO_ADDRESS, 100n),
      makeDonationEvent("2", ZERO_ADDRESS, 200n),
    ];

    // Anonymous donations share one on-chain placeholder, so counting them
    // would report a single phantom donor for an unknown number of people.
    expect(countUniqueDonors(events)).toBe(0);
  });

  it("counts only the named donors when anonymous and named donations mix", () => {
    const events = [
      makeDonationEvent("1", DONOR_A, 100n),
      makeDonationEvent("2", ZERO_ADDRESS, 200n),
      makeDonationEvent("3", DONOR_B, 300n),
      makeDonationEvent("4", ZERO_ADDRESS, 400n),
    ];

    expect(countUniqueDonors(events)).toBe(2);
  });

  it("does not let an anonymous donation mask the same donor's named one", () => {
    // A donor who gives once anonymously and once openly is still one donor,
    // and the anonymous event must not add a second.
    const events = [
      makeDonationEvent("1", ZERO_ADDRESS, 100n),
      makeDonationEvent("2", DONOR_A, 200n),
    ];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("ignores non-donation events", () => {
    const events = [
      makeCreatedEvent("1", { creator: DONOR_A }),
      makeClaimedEvent("2", { beneficiary: DONOR_B }),
      makeDonationEvent("3", DONOR_C, 100n),
    ];

    // A creator or beneficiary address is not a donation, even though the
    // payloads carry addresses too.
    expect(countUniqueDonors(events)).toBe(1);
  });

  it("ignores an unrecognized topic that happens to carry a donor field", () => {
    const events = [makeEvent("1", "refund" as never, { donor: DONOR_A, amount: 100n })];

    expect(countUniqueDonors(events)).toBe(0);
  });

  it("returns 0 for an empty feed", () => {
    expect(countUniqueDonors([])).toBe(0);
  });

  it("returns 0 when the feed is undefined", () => {
    // The hook hands straight through whatever `getEvents` produced, so an
    // absent feed must not throw.
    expect(countUniqueDonors(undefined)).toBe(0);
  });

  it("skips donation events with no payload at all", () => {
    const events = [
      { id: "1", topic: "received", data: undefined },
      { id: "2", topic: "received", data: null },
      makeDonationEvent("3", DONOR_A, 100n),
    ];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("skips donation events whose payload has no donor", () => {
    const events = [
      makeDonationEvent("1", null, 100n),
      makeEvent("2", "received", { amount: 100n }),
      makeDonationEvent("3", DONOR_A, 100n),
    ];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("skips null and undefined entries in the feed", () => {
    const events = [null, undefined, makeDonationEvent("1", DONOR_A, 100n)];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("treats a donor object with a toString as its string form", () => {
    // `scValToNative` yields plain strings today, but the count stringifies
    // defensively — two spellings of one address must not become two donors.
    const events = [
      makeEvent("1", "received", { donor: { toString: () => DONOR_A }, amount: 100n }),
      makeDonationEvent("2", DONOR_A, 100n),
    ];

    expect(countUniqueDonors(events)).toBe(1);
  });

  it("distinguishes addresses that differ only in case", () => {
    // Stellar addresses are uppercase base32; a lowercase variant is a
    // different string, not the same donor, and is left as the feed gave it.
    const events = [
      makeDonationEvent("1", DONOR_A, 100n),
      makeDonationEvent("2", DONOR_A.toLowerCase(), 100n),
    ];

    expect(countUniqueDonors(events)).toBe(2);
  });
});

describe("useUniqueDonors", () => {
  it("reports the count once the event feed resolves", async () => {
    vi.mocked(getEvents).mockResolvedValue([
      makeDonationEvent("1", DONOR_A, 100n),
      makeDonationEvent("2", DONOR_A, 200n),
      makeDonationEvent("3", DONOR_B, 300n),
      makeDonationEvent("4", ZERO_ADDRESS, 400n),
    ] as never);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
  });

  it("scans the documented event window", async () => {
    vi.mocked(getEvents).mockResolvedValue([] as never);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEvents).toHaveBeenCalledWith(DONOR_SCAN_EVENT_LIMIT);
  });

  it("is loading with no data before the feed resolves", async () => {
    let release: (events: unknown[]) => void = () => {};
    vi.mocked(getEvents).mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (events: unknown[]) => void;
      }) as never,
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);

    release([makeDonationEvent("1", DONOR_A, 100n)]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(1);
  });

  it("surfaces an unreachable event feed as a query error", async () => {
    // Unlike the campaign totals, a failed donor scan is not masked to 0 —
    // the caller needs to tell "nobody has donated" from "we cannot tell".
    vi.mocked(getEvents).mockRejectedValue(new Error("rpc down"));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe("rpc down");
  });

  it("returns 0 rather than erroring on an empty feed", async () => {
    vi.mocked(getEvents).mockResolvedValue([] as never);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
    expect(result.current.isError).toBe(false);
  });

  it("serves a remount from cache instead of rescanning the feed", async () => {
    vi.mocked(getEvents).mockResolvedValue([makeDonationEvent("1", DONOR_A, 100n)] as never);

    const { Wrapper } = makeWrapper();
    const first = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = renderHook(() => useUniqueDonors(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    // 60s staleTime: the second mount must not trigger another RPC scan.
    expect(second.result.current.data).toBe(1);
    expect(getEvents).toHaveBeenCalledTimes(1);
  });
});
