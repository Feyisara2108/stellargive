import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Stub the whole soroban module so no RPC server is constructed and the fee
// probe can be driven directly (#539).
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

import { useRefundEligibility } from "./useSoroban";
import { estimateFee } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const CAMPAIGN_ID = 7n;

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}

function connect(address: string | null) {
  vi.mocked(useWallet).mockReturnValue({
    address,
    isConnected: !!address,
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  connect(WALLET);
});

describe("useRefundEligibility — enablement gating", () => {
  it("stays disabled with no connected address", async () => {
    connect(null);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    expect(estimateFee).not.toHaveBeenCalled();
  });

  it("stays disabled when the campaign is not cancelled", async () => {
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, false), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(estimateFee).not.toHaveBeenCalled();
  });

  it("stays disabled when neither condition holds", async () => {
    connect(null);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, false), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(estimateFee).not.toHaveBeenCalled();
  });

  it("runs the probe once an address and a cancelled campaign are both present", async () => {
    vi.mocked(estimateFee).mockResolvedValue(1234);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(estimateFee).toHaveBeenCalledTimes(1);
  });

  it("probes claim_refund on behalf of the connected address", async () => {
    vi.mocked(estimateFee).mockResolvedValue(1234);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [sender, func, args] = vi.mocked(estimateFee).mock.calls[0];
    expect(sender).toBe(WALLET);
    expect(func).toBe("claim_refund");
    expect(args).toHaveLength(2);
  });
});

describe("useRefundEligibility — fee probe outcomes", () => {
  it("resolves true when the fee estimate comes back non-null", async () => {
    vi.mocked(estimateFee).mockResolvedValue(4200);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it("treats a zero fee as eligible, since only null means unavailable", async () => {
    vi.mocked(estimateFee).mockResolvedValue(0);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it("resolves false when the fee estimate is null", async () => {
    vi.mocked(estimateFee).mockResolvedValue(null);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("swallows a thrown probe error and resolves false", async () => {
    vi.mocked(estimateFee).mockRejectedValue(new Error("simulation exploded"));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });

    // The query resolves rather than erroring — the caller only ever sees a boolean.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

describe("useRefundEligibility — query key", () => {
  it("keys the query by campaign id and address", async () => {
    vi.mocked(estimateFee).mockResolvedValue(1);
    const { Wrapper, queryClient } = makeWrapper();

    const { result } = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(["refund-eligibility", "7", WALLET])).toBe(true);
  });

  it("caches separately per wallet, so one address cannot answer for another", async () => {
    const other = "GCDEMOOTHERWALLETAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    vi.mocked(estimateFee).mockResolvedValue(1);
    const { Wrapper, queryClient } = makeWrapper();

    const first = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    connect(other);
    vi.mocked(estimateFee).mockResolvedValue(null);
    const second = renderHook(() => useRefundEligibility(CAMPAIGN_ID, true), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(["refund-eligibility", "7", WALLET])).toBe(true);
    expect(queryClient.getQueryData(["refund-eligibility", "7", other])).toBe(false);
  });

  it("caches separately per campaign", async () => {
    vi.mocked(estimateFee).mockResolvedValue(1);
    const { Wrapper, queryClient } = makeWrapper();

    const first = renderHook(() => useRefundEligibility(7n, true), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = renderHook(() => useRefundEligibility(9n, true), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(["refund-eligibility", "7", WALLET])).toBe(true);
    expect(queryClient.getQueryData(["refund-eligibility", "9", WALLET])).toBe(true);
  });
});
