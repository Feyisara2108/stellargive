import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { server as rpcServer } from "@/lib/soroban";
import { Account, nativeToScVal } from "@stellar/stellar-sdk";
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
  signTransaction: vi.fn((xdr: any) => Promise.resolve({ signedTxXdr: xdr })),
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

function makeWrapper(queryOverrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, ...queryOverrides },
      mutations: { retry: false },
    },
  });
  vi.spyOn(queryClient, "invalidateQueries");

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return { queryClient, Wrapper };
}

// Raw MSW `getEvents` fixture builder — encodes topics as Soroban symbols so
// the hook's `topics[1]` extraction can be exercised against real XDR.
function encodeSymbol(value: string) {
  return nativeToScVal(value, { type: "symbol" }).toXDR("base64");
}

const SAMPLE_EVENT_VALUE_XDR =
  "AAAAEAAAAAEAAAADAAAABQAAAAAAAAADAAAADgAAADhHQlJQWUhJTDJDSTNXSFpEVE9PUUZDNkVCNENHUU9GTjRMNU1IWjVSV0JOUlVCQUxYQVM1RjNCMgAAAAUAAAAAAExLQA==";

function makeRawEvent(id: string, topicSymbol: string) {
  return {
    type: "contract",
    ledger: 123000,
    ledgerClosedAt: "2024-01-01T00:00:00Z",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    id,
    pagingToken: id,
    topic: [encodeSymbol("campaign"), encodeSymbol(topicSymbol)],
    value: SAMPLE_EVENT_VALUE_XDR,
    inSuccessfulContractInvocation: true,
    txn_result_code: "txSUCCESS",
    tx_set_operation_count: 0,
    extends_transaction_set: [],
    created_at: "2024-01-01T00:00:00Z",
  };
}

/** Overrides the `getEvents` RPC method only; other methods 404 via the default fallback. */
function useEventsFixture(events: ReturnType<typeof makeRawEvent>[]) {
  server.use(
    http.post("*/rpc", async ({ request }) => {
      const body = (await request.json()) as any;
      if (body.method !== "getEvents") {
        return HttpResponse.json({
          id: body.id,
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
        });
      }
      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        result: {
          latestLedger: 123456,
          latestLedgerCloseTime: "1234567890",
          oldestLedger: 1,
          oldestLedgerCloseTime: "1000000000",
          events,
        },
      });
    }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSoroban", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toast.loading).mockReturnValue("test-toast-id" as any);
    vi.mocked(useWallet).mockReturnValue({
      address: WALLET,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any);
    vi.spyOn(rpcServer, "getAccount").mockResolvedValue(new Account(WALLET, "1"));
  });

  describe("Queries", () => {
    it("useCampaign returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      await waitFor(() => {
        if (result.current.isError) {
          console.error("useCampaign Error:", result.current.error);
        }
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data?.title).toBe("First Campaign");
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
      await waitFor(() => {
        if (result.current.isError) {
          console.error("useRecentCampaigns Error:", result.current.error);
        }
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toHaveLength(2);
    });

    it("useCampaignsPaged returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useCampaignsPaged(5), { wrapper: Wrapper });
      await waitFor(() => {
        if (result.current.isError) {
          console.error("useCampaignsPaged Error:", result.current.error);
        }
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data?.campaigns).toHaveLength(2);
      expect(result.current.data?.hasMore).toBe(false);
    });

    it("useEvents returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useEvents(10), { wrapper: Wrapper });
      await waitFor(() => {
        if (result.current.isError) {
          console.error("useEvents Error:", result.current.error);
        }
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toHaveLength(1);
    });

    it("useGetUpdates returns data on success", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useGetUpdates(1n), { wrapper: Wrapper });
      await waitFor(() => {
        if (result.current.isError) {
          console.error("useGetUpdates Error:", result.current.error);
        }
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].content).toBe("Update 1");
    });
  });

  describe("useCampaign caching / staleTime", () => {
    it("serves a remount from cache within the 30s staleTime instead of refetching", async () => {
      // Non-zero gcTime so the cache entry survives the first hook unmounting.
      const { Wrapper, queryClient } = makeWrapper({ gcTime: 60_000 });
      const simSpy = vi.spyOn(rpcServer, "simulateTransaction");

      const { result, unmount } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(simSpy).toHaveBeenCalledTimes(1);
      unmount();

      function Wrapper2({ children }: { children: React.ReactNode }) {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
      }
      const { result: result2 } = renderHook(() => useCampaign(1n), { wrapper: Wrapper2 });

      // Cached data is returned synchronously; no additional network call.
      expect(result2.current.isSuccess).toBe(true);
      expect(result2.current.data?.title).toBe("First Campaign");
      expect(simSpy).toHaveBeenCalledTimes(1);
    });

    it("refetches when the cache is explicitly invalidated, even within staleTime", async () => {
      const { Wrapper, queryClient } = makeWrapper({ gcTime: 60_000 });
      const simSpy = vi.spyOn(rpcServer, "simulateTransaction");

      const { result } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(simSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ["campaign", "1"] });
      });

      await waitFor(() => expect(simSpy).toHaveBeenCalledTimes(2));
    });

    it("keeps independent cache entries per campaign id", async () => {
      const { Wrapper, queryClient } = makeWrapper({ gcTime: 60_000 });

      const { result: r1 } = renderHook(() => useCampaign(1n), { wrapper: Wrapper });
      const { result: r2 } = renderHook(() => useCampaign(2n), { wrapper: Wrapper });
      await waitFor(() => expect(r1.current.isSuccess).toBe(true));
      await waitFor(() => expect(r2.current.isSuccess).toBe(true));

      expect(queryClient.getQueryData(["campaign", "1"])).toMatchObject({
        title: "First Campaign",
      });
      expect(queryClient.getQueryData(["campaign", "2"])).toMatchObject({
        category: "medical",
      });
    });
  });

  describe("useEvents pagination and topic filtering", () => {
    it("passes the requested limit through to the RPC call", async () => {
      const { Wrapper } = makeWrapper();
      const eventsSpy = vi.spyOn(rpcServer, "getEvents");

      const { result } = renderHook(() => useEvents(5), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(eventsSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    });

    it("caches each page size under its own query key", async () => {
      const { Wrapper, queryClient } = makeWrapper();

      const { result: pageOf10 } = renderHook(() => useEvents(10), { wrapper: Wrapper });
      await waitFor(() => expect(pageOf10.current.isSuccess).toBe(true));

      const { result: pageOf20 } = renderHook(() => useEvents(20), { wrapper: Wrapper });
      await waitFor(() => expect(pageOf20.current.isSuccess).toBe(true));

      expect(queryClient.getQueryData(["events", 10])).toBeDefined();
      expect(queryClient.getQueryData(["events", 20])).toBeDefined();
    });

    it("keeps the previous page's data visible while a new limit is loading", async () => {
      const { Wrapper } = makeWrapper();
      const { result, rerender } = renderHook(({ limit }) => useEvents(limit), {
        wrapper: Wrapper,
        initialProps: { limit: 10 },
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const firstPageData = result.current.data;

      rerender({ limit: 15 });

      // placeholderData keeps the prior page's events on screen instead of
      // flashing to an empty/undefined state while the new page loads.
      expect(result.current.data).toBe(firstPageData);
      await waitFor(() => expect(result.current.isFetching).toBe(false));
    });

    it("extracts the second topic segment (created/received/claimed) per event", async () => {
      useEventsFixture([
        makeRawEvent("0-1", "created"),
        makeRawEvent("0-2", "received"),
        makeRawEvent("0-3", "claimed"),
      ]);

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useEvents(20), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.map((e) => e.topic)).toEqual([
        "created",
        "received",
        "claimed",
      ]);
      expect(result.current.data?.map((e) => e.id)).toEqual(["0-1", "0-2", "0-3"]);
    });

    it("surfaces an unrecognized topic value as-is rather than dropping the event", async () => {
      useEventsFixture([makeRawEvent("0-1", "unknown_action")]);

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useEvents(20), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The hook performs no client-side topic filtering — callers (event
      // feed UI) are responsible for filtering by known topic.
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].topic).toBe("unknown_action");
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
        expect.objectContaining({ id: "test-toast-id" }),
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
        expect.objectContaining({ id: "test-toast-id" }),
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
        expect.objectContaining({ id: "test-toast-id" }),
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
        expect.objectContaining({ id: "test-toast-id" }),
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["updates", "1"] });
    });

    it("useAddUpdate invalidates only that campaign's updates, not unrelated caches", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync({ campaignId: 7n, content: "Progress report" });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["updates", "7"] });
      expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    });

    it("useAddUpdate does not invalidate the cache when the wallet is disconnected", async () => {
      vi.mocked(useWallet).mockReturnValueOnce({
        address: null,
        isConnected: false,
      } as any);

      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate({ campaignId: 1n, content: "New update" });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Wallet not connected");
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("useAddUpdate does not invalidate the cache when the transaction fails", async () => {
      server.use(...errorHandlers.transactionFailed);
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useAddUpdate(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate({ campaignId: 1n, content: "New update" });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
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
