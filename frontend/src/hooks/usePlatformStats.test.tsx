import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Campaign } from "@/lib/soroban";

// Stub the whole soroban module so no RPC server is constructed and the two
// aggregation inputs can be driven directly (#540).
vi.mock("@/lib/soroban", () => ({
  getCampaign: vi.fn(),
  getRecentCampaigns: vi.fn(),
  getCampaignsPage: vi.fn(),
  submitTransaction: vi.fn(),
  estimateFee: vi.fn(),
  getEvents: vi.fn(),
  getUpdates: vi.fn(),
  getTotalCampaigns: vi.fn(),
  getSACBalance: vi.fn(),
  resolveAddressName: vi.fn(),
  toStroops: vi.fn(),
  CONTRACT_ID: "CTEST",
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(() => ({ address: null, isConnected: false })),
}));

import { usePlatformStats } from "./useSoroban";
import { getTotalCampaigns, getRecentCampaigns } from "@/lib/soroban";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Test Campaign",
    description: "Test description",
    category: "relief",
    target_amount: 1_000_000_000n,
    raised_amount: 0n,
    deadline: 1_900_000_000n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}

async function renderStats() {
  const { Wrapper } = makeWrapper();
  const { result } = renderHook(() => usePlatformStats(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePlatformStats — aggregation", () => {
  it("sums raised_amount across every campaign", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(3n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: 100n }),
      makeCampaign({ id: 2n, raised_amount: 250n }),
      makeCampaign({ id: 3n, raised_amount: 75n }),
    ]);

    const result = await renderStats();

    expect(result.current.data).toEqual({
      totalCampaigns: 3n,
      totalRaised: "425",
      activeCampaigns: 3,
    });
  });

  it("counts only Active campaigns, ignoring other statuses", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(4n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ id: 1n, status: "Active" }),
      makeCampaign({ id: 2n, status: "Funded" }),
      makeCampaign({ id: 3n, status: "Claimed" }),
      makeCampaign({ id: 4n, status: "Expired" }),
    ]);

    const result = await renderStats();

    expect(result.current.data?.activeCampaigns).toBe(1);
    expect(result.current.data?.totalCampaigns).toBe(4n);
  });

  it("sums raised amounts from inactive campaigns too", async () => {
    // Money raised counts toward the platform total regardless of status.
    vi.mocked(getTotalCampaigns).mockResolvedValue(2n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ id: 1n, status: "Claimed", raised_amount: 900n }),
      makeCampaign({ id: 2n, status: "Active", raised_amount: 100n }),
    ]);

    const result = await renderStats();

    expect(result.current.data?.totalRaised).toBe("1000");
    expect(result.current.data?.activeCampaigns).toBe(1);
  });

  it("returns totalRaised as a string", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(1n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([makeCampaign({ raised_amount: 42n })]);

    const result = await renderStats();

    expect(typeof result.current.data?.totalRaised).toBe("string");
    expect(result.current.data?.totalRaised).toBe("42");
  });

  it("requests every campaign, not just the default page", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(137n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([]);

    await renderStats();

    expect(getRecentCampaigns).toHaveBeenCalledWith(137);
  });

  it("reports zeroes when the campaign list comes back empty", async () => {
    // A non-zero total with an empty list is degenerate but must not throw.
    vi.mocked(getTotalCampaigns).mockResolvedValue(5n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([]);

    const result = await renderStats();

    expect(result.current.data).toEqual({
      totalCampaigns: 5n,
      totalRaised: "0",
      activeCampaigns: 0,
    });
  });
});

describe("usePlatformStats — empty short-circuit", () => {
  it("returns zeroed stats without fetching campaigns when the total is 0", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(0n);

    const result = await renderStats();

    expect(result.current.data).toEqual({
      totalCampaigns: 0n,
      totalRaised: "0",
      activeCampaigns: 0,
    });
    expect(getRecentCampaigns).not.toHaveBeenCalled();
  });
});

describe("usePlatformStats — bigint precision", () => {
  it("sums amounts far beyond Number.MAX_SAFE_INTEGER without loss", async () => {
    // Each amount is above 2^53, so any Number-based summation would drift.
    const big = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    vi.mocked(getTotalCampaigns).mockResolvedValue(3n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: big }),
      makeCampaign({ id: 2n, raised_amount: big }),
      makeCampaign({ id: 3n, raised_amount: big }),
    ]);

    const result = await renderStats();

    expect(result.current.data?.totalRaised).toBe((big * 3n).toString());
  });

  it("preserves the exact odd unit on an i128-scale total", async () => {
    // Rounding through a float would swallow the trailing 1.
    const huge = 170_141_183_460_469_231_731_687_303_715_884_105_727n; // i128 max
    vi.mocked(getTotalCampaigns).mockResolvedValue(1n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([makeCampaign({ raised_amount: huge })]);

    const result = await renderStats();

    expect(result.current.data?.totalRaised).toBe(huge.toString());
    expect(result.current.data?.totalRaised.endsWith("727")).toBe(true);
  });

  it("keeps stroop-level precision when large and tiny amounts are mixed", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(2n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: 10_000_000_000_000_000_000n }),
      makeCampaign({ id: 2n, raised_amount: 1n }),
    ]);

    const result = await renderStats();

    expect(result.current.data?.totalRaised).toBe("10000000000000000001");
  });
});
