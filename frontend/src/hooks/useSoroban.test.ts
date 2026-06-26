import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// All three mocks are hoisted by Vitest before any imports.

vi.mock("@/lib/soroban", () => ({
  getCampaign: vi.fn(),
  getRecentCampaigns: vi.fn(),
  getCampaignsPage: vi.fn(),
  submitTransaction: vi.fn(),
  getEvents: vi.fn(),
  getUpdates: vi.fn(),
  CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  toStroops: vi.fn((v: string) => BigInt(Math.round(parseFloat(v) * 1e7))),
}));

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

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  useCampaign,
  useRecentCampaigns,
  useCampaignsPaged,
  useDonate,
  useClaimFunds,
} from "./useSoroban";
import {
  getCampaign,
  getRecentCampaigns,
  getCampaignsPage,
  submitTransaction,
} from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { toast } from "sonner";
import type { Campaign } from "@/lib/soroban";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const mockCampaign: Campaign = {
  id: 1n,
  creator: WALLET,
  beneficiary: WALLET,
  title: "Test Campaign",
  category: "relief",
  target_amount: 1_000_000_000n,
  raised_amount: 350_000_000n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86_400),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
};

const TX_SUCCESS = { status: "SUCCESS", hash: "abc123def456" };

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
    // Restore defaults cleared by resetAllMocks
    vi.mocked(toast.loading).mockReturnValue("test-toast-id" as any);
    vi.mocked(useWallet).mockReturnValue({
      address: WALLET,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  // ── useCampaign ────────────────────────────────────────────────────────────

  describe("useCampaign", () => {
    it("returns the mapped campaign from getCampaign", async () => {
      vi.mocked(getCampaign).mockResolvedValueOnce(mockCampaign);
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockCampaign);
      expect(getCampaign).toHaveBeenCalledWith(1n);
    });

    it("uses ['campaign', id.toString()] as the query key", async () => {
      vi.mocked(getCampaign).mockResolvedValueOnce(mockCampaign);
      const { Wrapper, queryClient } = makeWrapper();

      renderHook(() => useCampaign(42n), { wrapper: Wrapper });

      await waitFor(() =>
        expect(queryClient.getQueryState(["campaign", "42"])).toBeDefined(),
      );
    });

    it("exposes the error when getCampaign rejects", async () => {
      vi.mocked(getCampaign).mockRejectedValueOnce(new Error("Simulation failed: not found"));
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Simulation failed: not found");
    });
  });

  // ── useRecentCampaigns ────────────────────────────────────────────────────

  describe("useRecentCampaigns", () => {
    it("returns an array of campaigns", async () => {
      vi.mocked(getRecentCampaigns).mockResolvedValueOnce([mockCampaign]);
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useRecentCampaigns(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockCampaign]);
    });

    it("returns an empty array when no campaigns exist", async () => {
      vi.mocked(getRecentCampaigns).mockResolvedValueOnce([]);
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useRecentCampaigns(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });
  });

  // ── useCampaignsPaged ─────────────────────────────────────────────────────

  describe("useCampaignsPaged", () => {
    it("returns campaigns with hasMore:false when all fit within the limit", async () => {
      vi.mocked(getCampaignsPage).mockResolvedValueOnce({
        campaigns: [mockCampaign],
        hasMore: false,
      });
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useCampaignsPaged(5), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.campaigns).toEqual([mockCampaign]);
      expect(result.current.data?.hasMore).toBe(false);
      expect(getCampaignsPage).toHaveBeenCalledWith(5);
    });

    it("returns hasMore:true when more campaigns exist beyond the limit", async () => {
      vi.mocked(getCampaignsPage).mockResolvedValueOnce({
        campaigns: [mockCampaign, mockCampaign],
        hasMore: true,
      });
      const { Wrapper } = makeWrapper();

      const { result } = renderHook(() => useCampaignsPaged(2), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.hasMore).toBe(true);
    });

    it("includes the limit in the query key", async () => {
      vi.mocked(getCampaignsPage).mockResolvedValueOnce({ campaigns: [], hasMore: false });
      const { Wrapper, queryClient } = makeWrapper();

      renderHook(() => useCampaignsPaged(10), { wrapper: Wrapper });

      await waitFor(() =>
        expect(queryClient.getQueryState(["campaigns", "paged", 10])).toBeDefined(),
      );
    });
  });

  // ── useDonate ─────────────────────────────────────────────────────────────

  describe("useDonate", () => {
    const params = { campaignId: 1n, amount: "10", isAnonymous: false };

    it("success: shows confirmation toast and invalidates the campaign and campaigns caches", async () => {
      vi.mocked(submitTransaction).mockResolvedValueOnce(TX_SUCCESS);
      const { Wrapper, queryClient } = makeWrapper();

      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync(params);
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" }),
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["campaign", "1"],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["campaigns"],
      });
    });

    it("error: maps 'User declined' → 'Transaction was cancelled.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(
        new Error("User declined to sign the transaction"),
      );
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Transaction was cancelled.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps 'User rejected' → 'Transaction was cancelled.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("User rejected request"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Transaction was cancelled.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps 'Network Error' → 'Network error. Please try again.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("Network Error"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Network error. Please try again.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps 'Send failed' → 'Network error. Please try again.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(
        new Error("Send failed: connection timeout"),
      );
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Network error. Please try again.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps 'Simulation failed' → 'Transaction failed on-chain.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("Simulation failed: bad input"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Transaction failed on-chain.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps unrecognised errors → 'Something went wrong. Please try again.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("Completely unknown problem"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Something went wrong. Please try again.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("rejects immediately when the wallet is not connected", async () => {
      vi.mocked(useWallet).mockReturnValueOnce({
        address: null,
        isConnected: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useDonate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Wallet not connected");
      expect(submitTransaction).not.toHaveBeenCalled();
    });
  });

  // ── useClaimFunds ─────────────────────────────────────────────────────────

  describe("useClaimFunds", () => {
    it("success: shows confirmation toast and invalidates the campaign and campaigns caches", async () => {
      vi.mocked(submitTransaction).mockResolvedValueOnce(TX_SUCCESS);
      const { Wrapper, queryClient } = makeWrapper();

      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync(1n);
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ id: "test-toast-id" }),
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["campaign", "1"],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["campaigns"],
      });
    });

    it("invalidates the correct campaign when multiple are cached (id scoping)", async () => {
      vi.mocked(submitTransaction).mockResolvedValueOnce(TX_SUCCESS);
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync(7n);
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["campaign", "7"],
      });
      // Should NOT invalidate a different campaign's key
      expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["campaign", "1"],
      });
    });

    it("error: maps 'Transaction failed' → 'Transaction failed on-chain.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(new Error("Transaction failed: FAILED"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(1n);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Transaction failed on-chain.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("error: maps 'Wallet error' → 'Transaction was cancelled.'", async () => {
      vi.mocked(submitTransaction).mockRejectedValueOnce(
        new Error("Wallet error: user closed popup"),
      );
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(1n);
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Transaction was cancelled.",
          expect.objectContaining({ id: "test-toast-id" }),
        ),
      );
    });

    it("rejects immediately when the wallet is not connected", async () => {
      vi.mocked(useWallet).mockReturnValueOnce({
        address: null,
        isConnected: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useClaimFunds(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate(1n);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Wallet not connected");
      expect(submitTransaction).not.toHaveBeenCalled();
    });
  });
});
