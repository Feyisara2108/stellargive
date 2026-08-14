import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { server as rpcServer } from "@/lib/soroban";
import { Account } from "@stellar/stellar-sdk";
import { http, HttpResponse } from "msw";
import { server, errorHandlers } from "../mocks/setup";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@stellar/freighter-api", () => ({
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "mock_xdr" }),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  useCampaign,
  useRecentCampaigns,
  useCampaignsPaged,
  useCreateCampaign,
  useDonate,
  useClaimFunds,
  useEvents,
  useGetUpdates,
  useAddUpdate,
} from "./useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { toast } from "sonner";
import { WALLET_ADDRESS } from "@/test/factories";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WALLET = WALLET_ADDRESS;

// ─── Wrapper factory ─────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.spyOn(queryClient, "invalidateQueries");

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return { queryClient, Wrapper };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSoroban", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(toast.loading).mockReturnValue("test-toast-id" as any);
    vi.mocked(useWallet).mockReturnValue({
      address: WALLET,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any);
    vi.spyOn(rpcServer, "getAccount").mockResolvedValue(
      new Account(WALLET, "1")
    );
  });

  describe("Queries", () => {
    it("useCampaign returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.title).toBe("Test Campaign");
    });

    it("useCampaign returns error on failure", async () => {
      server.use(...errorHandlers.transactionFailed);
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it("useRecentCampaigns returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useRecentCampaigns(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
    });

    it("useCampaignsPaged returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCampaignsPaged(5), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.campaigns).toHaveLength(1);
      expect(result.current.data?.hasMore).toBe(false);
    });

    it("useEvents returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useEvents(10), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
    });

    it("useGetUpdates returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useGetUpdates(1n), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].content).toBe("Update 1");
    });
  });

  describe("Mutations", () => {
    it("useCreateCampaign triggers toast and invalidate on success", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useCreateCampaign(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          beneficiary: WALLET,
          title: "Test",
          description: "Test description",
          targetAmount: "100",
          deadline: 1234567890,
          acceptedToken: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" })
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
    });

    it("useDonate triggers toast and invalidate on success", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          campaignId: 1n,
          amount: "10",
          isAnonymous: false,
          decimals: 7,
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" })
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["campaign", "1"] });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    });

    it("useClaimFunds triggers toast and invalidate on success", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync(1n);
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" })
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["campaign", "1"] });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    });

    it("useAddUpdate triggers toast and invalidate on success", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync({ campaignId: 1n, content: "New update" });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" })
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["updates", "1"] });
    });

    it("rejects immediately when wallet is not connected", async () => {
      vi.mocked(useWallet).mockReturnValueOnce({
        address: null,
        isConnected: false,
      } as any);
      
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCreateCampaign(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate({
          beneficiary: WALLET,
          title: "Test",
          description: "Test description",
          targetAmount: "100",
          deadline: 1234567890,
          acceptedToken: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Wallet not connected");
    });
  });
});
