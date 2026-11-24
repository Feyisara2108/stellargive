import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Campaign } from "@/lib/soroban";

vi.mock("@/lib/soroban", () => ({
  getCampaign: vi.fn(),
  getRecentCampaigns: vi.fn(),
  getTotalCampaigns: vi.fn(),
  getPlatformConfig: vi.fn(),
}));

import { getCampaign, getRecentCampaigns, getTotalCampaigns } from "@/lib/soroban";
import {
  parseQueryOptions,
  useActiveCampaigns,
  useCampaign,
  useCampaignsByCategory,
  useFilteredCampaigns,
  usePlatformStats,
  useRecentCampaigns,
  useUserCampaigns,
} from "./campaignQueries";

const ALICE = "GALICE";
const BOB = "GBOB";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: ALICE,
    beneficiary: ALICE,
    beneficiaries: [{ address: ALICE, share: 10000 }],
    title: "Title",
    description: "Description",
    category: "relief",
    target_amount: 1_000n,
    raised_amount: 100n,
    deadline: 1_900_000_000n,
    accepted_token: "CTOKEN",
    status: "Active",
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const campaigns = [
  makeCampaign({ id: 1n, creator: ALICE, category: "relief", status: "Active" }),
  makeCampaign({ id: 2n, creator: BOB, category: "education", status: "Active" }),
  makeCampaign({ id: 3n, creator: ALICE, category: "education", status: "Cancelled" }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseQueryOptions", () => {
  it("turns a function argument into { select }", () => {
    const select = (c: number) => c * 2;
    expect(parseQueryOptions(select)).toEqual({ select });
  });

  it("passes an options object through", () => {
    const options = { enabled: false, staleTime: 5 };
    expect(parseQueryOptions(options)).toBe(options);
  });

  it("turns undefined into an empty object", () => {
    expect(parseQueryOptions(undefined)).toEqual({});
  });
});

describe("useCampaign", () => {
  it("queries by ['campaign', id] and applies select", async () => {
    vi.mocked(getCampaign).mockResolvedValue(makeCampaign({ id: 7n, title: "Seven" }));
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useCampaign(7n, (c) => c.title), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("Seven");
    expect(getCampaign).toHaveBeenCalledWith(7n);
    expect(queryClient.getQueryData(["campaign", "7"])).toBeDefined();
  });

  it("does not fetch when enabled is false", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCampaign(7n, { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getCampaign).not.toHaveBeenCalled();
  });
});

describe("useRecentCampaigns", () => {
  it("fetches under ['campaigns', 'recent']", async () => {
    vi.mocked(getRecentCampaigns).mockResolvedValue(campaigns);
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecentCampaigns(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(campaigns);
    expect(queryClient.getQueryData(["campaigns", "recent"])).toEqual(campaigns);
  });
});

describe("selector-backed hooks", () => {
  beforeEach(() => {
    vi.mocked(getRecentCampaigns).mockResolvedValue(campaigns);
  });

  it("useUserCampaigns returns only the creator's campaigns", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserCampaigns(ALICE), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual([1n, 3n]);
    expect(getRecentCampaigns).toHaveBeenCalledTimes(1);
  });

  it("useUserCampaigns returns nothing without an address", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserCampaigns(null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("useActiveCampaigns returns only Active campaigns", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useActiveCampaigns(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual([1n, 2n]);
  });

  it("useCampaignsByCategory returns only matching campaigns", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCampaignsByCategory("education"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual([2n, 3n]);
    expect(getRecentCampaigns).toHaveBeenCalledTimes(1);
  });

  it("useFilteredCampaigns filters by the supplied options", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFilteredCampaigns({ status: "active", creator: BOB }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((c) => c.id)).toEqual([2n]);
  });
});

describe("usePlatformStats", () => {
  it("returns zero totals without fetching campaigns when there are none", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(0n);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePlatformStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      totalCampaigns: 0n,
      totalRaised: "0",
      activeCampaigns: 0,
    });
    expect(getRecentCampaigns).not.toHaveBeenCalled();
  });

  it("sums raised amounts and counts Active campaigns", async () => {
    vi.mocked(getTotalCampaigns).mockResolvedValue(3n);
    vi.mocked(getRecentCampaigns).mockResolvedValue([
      makeCampaign({ raised_amount: 100n, status: "Active" }),
      makeCampaign({ id: 2n, raised_amount: 250n, status: "Active" }),
      makeCampaign({ id: 3n, raised_amount: 50n, status: "Cancelled" }),
    ]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePlatformStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getRecentCampaigns).toHaveBeenCalledWith(3);
    expect(result.current.data).toEqual({
      totalCampaigns: 3n,
      totalRaised: "400",
      activeCampaigns: 2,
    });
  });
});
