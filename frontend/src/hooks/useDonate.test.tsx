import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Campaign } from "@/lib/soroban";

// Stub the whole soroban module so no RPC server is constructed and the
// submission can be resolved or rejected on demand (#538).
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
  useWallet: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  notify: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useDonate } from "./useSoroban";
import { submitTransaction } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const CAMPAIGN_ID = 1n;
const DECIMALS = 7;
/** "10" at 7 decimals. */
const DONATION_RAW = 100_000_000n;

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Test Campaign",
    description: "Test description",
    category: "relief",
    target_amount: 1_000_000_000n,
    raised_amount: 350_000_000n,
    deadline: 1_900_000_000n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

/**
 * A QueryClient seeded with the two caches useDonate touches: the single
 * campaign and a campaigns list containing it plus an unrelated campaign.
 */
function makeSeededWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // gcTime must stay generous: seeded entries have no active observer, and
      // a zero gcTime collects them before the mutation can read them back.
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const campaign = makeCampaign();
  const otherCampaign = makeCampaign({ id: 2n, raised_amount: 5n });

  queryClient.setQueryData(["campaign", "1"], campaign);
  queryClient.setQueryData(["campaigns", "recent"], {
    campaigns: [campaign, otherCampaign],
    hasMore: false,
  });

  vi.spyOn(queryClient, "invalidateQueries");

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return { queryClient, Wrapper, campaign, otherCampaign };
}

function readCampaign(queryClient: QueryClient) {
  return queryClient.getQueryData<Campaign>(["campaign", "1"]);
}

function readList(queryClient: QueryClient) {
  return queryClient.getQueryData<{ campaigns: Campaign[]; hasMore: boolean }>([
    "campaigns",
    "recent",
  ]);
}

const donation = { campaignId: CAMPAIGN_ID, amount: "10", isAnonymous: false, decimals: DECIMALS };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWallet).mockReturnValue({
    address: WALLET,
    isConnected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as any);
});

describe("useDonate — optimistic update", () => {
  it("bumps raised_amount in the campaign cache before the tx resolves", async () => {
    // The submission never settles, so only onMutate has run when we assert.
    vi.mocked(submitTransaction).mockImplementation(() => new Promise(() => {}));
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate(donation);
    });

    await waitFor(() =>
      expect(readCampaign(queryClient)?.raised_amount).toBe(
        campaign.raised_amount + DONATION_RAW,
      ),
    );
  });

  it("bumps the matching campaign inside the campaigns list", async () => {
    vi.mocked(submitTransaction).mockImplementation(() => new Promise(() => {}));
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate(donation);
    });

    await waitFor(() =>
      expect(readList(queryClient)?.campaigns[0].raised_amount).toBe(
        campaign.raised_amount + DONATION_RAW,
      ),
    );
  });

  it("leaves other campaigns in the list untouched", async () => {
    vi.mocked(submitTransaction).mockImplementation(() => new Promise(() => {}));
    const { Wrapper, queryClient, otherCampaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate(donation);
    });

    await waitFor(() => expect(readCampaign(queryClient)?.raised_amount).not.toBe(350_000_000n));
    expect(readList(queryClient)?.campaigns[1].raised_amount).toBe(otherCampaign.raised_amount);
  });

  it("keeps the optimistic value after the tx succeeds", async () => {
    vi.mocked(submitTransaction).mockResolvedValue({ hash: "abc123" } as any);
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation);
    });

    expect(readCampaign(queryClient)?.raised_amount).toBe(
      campaign.raised_amount + DONATION_RAW,
    );
  });

  it("scales the delta by the token's decimals", async () => {
    vi.mocked(submitTransaction).mockImplementation(() => new Promise(() => {}));
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    act(() => {
      // "10" at 2 decimals is 1_000 raw units, not 100_000_000.
      result.current.mutate({ ...donation, decimals: 2 });
    });

    await waitFor(() =>
      expect(readCampaign(queryClient)?.raised_amount).toBe(campaign.raised_amount + 1_000n),
    );
  });

  it("does not disturb caches for a campaign that was never seeded", async () => {
    vi.mocked(submitTransaction).mockImplementation(() => new Promise(() => {}));
    const { Wrapper, queryClient } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ ...donation, campaignId: 99n });
    });

    await waitFor(() => expect(readList(queryClient)).toBeDefined());
    expect(queryClient.getQueryData(["campaign", "99"])).toBeUndefined();
    expect(readCampaign(queryClient)?.raised_amount).toBe(350_000_000n);
  });
});

describe("useDonate — rollback on error", () => {
  it("restores the campaign cache to its previous snapshot", async () => {
    vi.mocked(submitTransaction).mockRejectedValue(new Error("Simulation failed"));
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readCampaign(queryClient)).toEqual(campaign);
  });

  it("restores the campaigns list to its previous snapshot", async () => {
    vi.mocked(submitTransaction).mockRejectedValue(new Error("Simulation failed"));
    const { Wrapper, queryClient, campaign, otherCampaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readList(queryClient)).toEqual({
      campaigns: [campaign, otherCampaign],
      hasMore: false,
    });
  });

  it("rolls back both caches after a wallet rejection", async () => {
    vi.mocked(submitTransaction).mockRejectedValue(new Error("User declined"));
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readCampaign(queryClient)?.raised_amount).toBe(campaign.raised_amount);
    expect(readList(queryClient)?.campaigns[0].raised_amount).toBe(campaign.raised_amount);
  });

  it("does not compound the optimistic delta across a failed then successful donation", async () => {
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("Network Error"));
    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    vi.mocked(submitTransaction).mockResolvedValueOnce({ hash: "def456" } as any);
    await act(async () => {
      await result.current.mutateAsync(donation);
    });

    // Exactly one donation's worth, not two.
    expect(readCampaign(queryClient)?.raised_amount).toBe(
      campaign.raised_amount + DONATION_RAW,
    );
  });
});

describe("useDonate — settlement", () => {
  it("invalidates the campaign and campaigns keys after success", async () => {
    vi.mocked(submitTransaction).mockResolvedValue({ hash: "abc123" } as any);
    const { Wrapper, queryClient } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation);
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["campaign", "1"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["campaigns"],
    });
  });

  it("invalidates the same keys after failure, so the rollback is reconciled", async () => {
    vi.mocked(submitTransaction).mockRejectedValue(new Error("Transaction failed"));
    const { Wrapper, queryClient } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["campaign", "1"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["campaigns"],
    });
  });

  it("never submits without a connected wallet", async () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null,
      isConnected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any);
    const { Wrapper, queryClient, campaign } = makeSeededWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Wallet not connected");
    expect(submitTransaction).not.toHaveBeenCalled();
    // The optimistic bump is rolled back even though nothing was ever sent.
    expect(readCampaign(queryClient)?.raised_amount).toBe(campaign.raised_amount);
  });
});
