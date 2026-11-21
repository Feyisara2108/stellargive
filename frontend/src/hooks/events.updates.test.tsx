import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useAddUpdate,
  useGetUpdates,
  usePlatformConfigQuery,
  useRefundEligibility,
  useEvents,
} from "./events";
import {
  getEvents,
  getUpdates,
  submitTransaction,
  estimateFee,
  getPlatformConfig,
} from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { notify } from "@/lib/toast";
import { mapTransactionError } from "./campaignMutations";

vi.mock("@/lib/soroban", () => ({
  getEvents: vi.fn(),
  getUpdates: vi.fn(),
  submitTransaction: vi.fn(),
  estimateFee: vi.fn(),
  getPlatformConfig: vi.fn(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  notify: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./campaignMutations", () => ({
  mapTransactionError: vi.fn((err: unknown) =>
    err instanceof Error ? err.message : "Mapped transaction error",
  ),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

describe("useAddUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Wallet not connected' when wallet address is not present", async () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null,
      isConnected: false,
    } as ReturnType<typeof useWallet>);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ campaignId: 10n, content: "First project milestone reached!" }),
    ).rejects.toThrow("Wallet not connected");

    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("submits add_update with u64 campaign id and string content, shows success toast with hash, and invalidates ['updates', '<id>']", async () => {
    const mockAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
    vi.mocked(useWallet).mockReturnValue({
      address: mockAddress,
      isConnected: true,
    } as ReturnType<typeof useWallet>);

    const mockResult = {
      status: "SUCCESS" as const,
      hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      ledger: 12345,
    };
    vi.mocked(submitTransaction).mockResolvedValue(mockResult as never);
    vi.mocked(notify.loading).mockReturnValue("toast-test-id");

    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      campaignId: 42n,
      content: "Construction has begun on site.",
    });

    expect(notify.loading).toHaveBeenCalledTimes(1);
    expect(submitTransaction).toHaveBeenCalledWith(
      mockAddress,
      "add_update",
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );

    expect(notify.success).toHaveBeenCalledWith("Transaction confirmed", {
      id: "toast-test-id",
      hash: mockResult.hash,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["updates", "42"],
    });
  });

  it("shows mapped error notification on submission failure", async () => {
    const mockAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
    vi.mocked(useWallet).mockReturnValue({
      address: mockAddress,
      isConnected: true,
    } as ReturnType<typeof useWallet>);

    const error = new Error("Simulation failure in add_update");
    vi.mocked(submitTransaction).mockRejectedValue(error);
    vi.mocked(notify.loading).mockReturnValue("toast-error-id");
    vi.mocked(mapTransactionError).mockReturnValue("User friendly error message");

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ campaignId: 42n, content: "Update payload" }),
    ).rejects.toThrow();

    expect(mapTransactionError).toHaveBeenCalledWith(error);
    expect(notify.error).toHaveBeenCalledWith("User friendly error message", {
      id: "toast-error-id",
    });
  });
});

describe("useGetUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries by ['updates', id.toString()] and returns mocked updates", async () => {
    const mockUpdates = [
      {
        id: 1n,
        campaign_id: 7n,
        author: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
        content: "First update",
        timestamp: 1700000000n,
      },
      {
        id: 2n,
        campaign_id: 7n,
        author: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
        content: "Second update",
        timestamp: 1700003600n,
      },
    ];
    vi.mocked(getUpdates).mockResolvedValue(mockUpdates as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGetUpdates(7n), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getUpdates).toHaveBeenCalledWith(7n);
    expect(result.current.data).toEqual(mockUpdates);
  });
});

describe("usePlatformConfigQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the value from the mocked getPlatformConfig", async () => {
    const mockConfig = {
      owner: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
      totalCampaigns: 15n,
      fixedFee: 100000n,
    };
    vi.mocked(getPlatformConfig).mockResolvedValue(mockConfig as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => usePlatformConfigQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getPlatformConfig).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockConfig);
  });
});

describe("useRefundEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when fee estimation succeeds for cancelled campaign with connected wallet", async () => {
    const mockAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
    vi.mocked(useWallet).mockReturnValue({
      address: mockAddress,
      isConnected: true,
    } as ReturnType<typeof useWallet>);
    vi.mocked(estimateFee).mockResolvedValue({ minResourceFee: "100" } as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRefundEligibility(55n, true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(estimateFee).toHaveBeenCalledWith(
      mockAddress,
      "claim_refund",
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );
  });

  it("returns false when fee estimation fails or throws", async () => {
    const mockAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
    vi.mocked(useWallet).mockReturnValue({
      address: mockAddress,
      isConnected: true,
    } as ReturnType<typeof useWallet>);
    vi.mocked(estimateFee).mockRejectedValue(new Error("Estimate failed"));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRefundEligibility(55n, true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("is disabled when wallet is not connected or campaign is not cancelled", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null,
      isConnected: false,
    } as ReturnType<typeof useWallet>);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useRefundEligibility(55n, true), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(estimateFee).not.toHaveBeenCalled();
  });
});

describe("useEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches events with specified limit", async () => {
    const mockEvents = [
      {
        id: "evt-1",
        topic: "received",
        data: { amount: 100n },
        ledger: 100,
        txHash: "0x123",
      },
    ];
    vi.mocked(getEvents).mockResolvedValue(mockEvents as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEvents(10), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEvents).toHaveBeenCalledWith(10);
    expect(result.current.data).toEqual(mockEvents);
  });
});
