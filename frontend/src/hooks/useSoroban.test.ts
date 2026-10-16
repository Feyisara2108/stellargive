import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { server as rpcServer } from "@/lib/soroban";
import { Account, Address, nativeToScVal } from "@stellar/stellar-sdk";
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
  createMemoizedSelector,
  areArraysShallowEqual,
  selectActiveCampaigns,
  getSelectUserCampaigns,
  getSelectCampaignsByCategory,
  getSelectFilteredAndSortedCampaigns,
  useUserCampaigns,
  useActiveCampaigns,
  useCampaignsByCategory,
  useFilteredCampaigns,
  fetchXlmPriceInUsd,
  useXlmPrice,
  usePauseContract,
  useUnpauseContract,
  usePlatformConfig,
} from "./useSoroban";
import { getPlatformConfig, getOwner } from "@/lib/soroban";
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
    contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
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

      expect(result.current.data?.map((e) => e.topic)).toEqual(["created", "received", "claimed"]);
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

  describe("Memoized Selectors & Referential Stability", () => {
    it("areArraysShallowEqual correctly identifies identical and changed arrays", () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      expect(areArraysShallowEqual([obj1, obj2], [obj1, obj2])).toBe(true);
      expect(areArraysShallowEqual([obj1, obj2], [obj1])).toBe(false);
      expect(areArraysShallowEqual([obj1, obj2], [obj1, { id: 2 }])).toBe(false);
    });

    it("createMemoizedSelector preserves array reference when output elements are shallowly equal", () => {
      const c1 = { id: 1n, status: "Active" } as any;
      const c2 = { id: 2n, status: "Active" } as any;
      const rawData1 = [c1, c2];
      const rawData2 = [c1, c2]; // New array instance with same elements

      const selector = createMemoizedSelector((list: any[]) =>
        list.filter((x) => x.status === "Active"),
      );

      const res1 = selector(rawData1);
      const res2 = selector(rawData2);

      // Same reference returned despite rawData2 being a new array instance
      expect(res1).toBe(res2);
    });

    it("getSelectUserCampaigns returns referentially stable selector for same address", () => {
      const sel1 = getSelectUserCampaigns("GABC123");
      const sel2 = getSelectUserCampaigns("GABC123");
      expect(sel1).toBe(sel2);
    });

    it("getSelectCampaignsByCategory returns referentially stable selector for same category", () => {
      const sel1 = getSelectCampaignsByCategory("medical");
      const sel2 = getSelectCampaignsByCategory("medical");
      expect(sel1).toBe(sel2);
    });

    it("getSelectFilteredAndSortedCampaigns returns referentially stable selector for identical filter options", () => {
      const sel1 = getSelectFilteredAndSortedCampaigns({ category: "relief", sortBy: "newest" });
      const sel2 = getSelectFilteredAndSortedCampaigns({ category: "relief", sortBy: "newest" });
      expect(sel1).toBe(sel2);
    });

    it("useRecentCampaigns supports select option and returns transformed data", async () => {
      const { Wrapper } = makeWrapper();
      const selectTitles = (campaigns: any[]) => campaigns.map((c) => c.title);
      const { result } = renderHook(() => useRecentCampaigns(selectTitles), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(["First Campaign", "Second Campaign"]);
    });

    it("useActiveCampaigns filters and returns active campaigns", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useActiveCampaigns(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it("useUserCampaigns filters campaigns by creator address", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useUserCampaigns(WALLET), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
    });

    it("useFilteredCampaigns filters and sorts campaigns", async () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useFilteredCampaigns({ category: "relief", sortBy: "newest" }),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
    });
  });
});

// ─── XLM price fetch ─────────────────────────────────────────────────────────

describe("fetchXlmPriceInUsd / useXlmPrice", () => {
  const COINGECKO = "api.coingecko.com";
  const STELLAR_EXPERT = "api.stellar.expert";

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  /** Routes the stubbed fetch by host so each upstream can fail independently. */
  function stubFetch(handlers: Record<string, () => Response | Promise<Response>>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const key = Object.keys(handlers).find((host) => url.includes(host));
      if (!key) throw new Error(`Unexpected fetch: ${url}`);
      return handlers[key]();
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchXlmPriceInUsd", () => {
    it("returns the CoinGecko price on success without calling the fallback", async () => {
      const fetchMock = stubFetch({
        [COINGECKO]: () => jsonResponse({ stellar: { usd: 0.123 } }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBe(0.123);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain(COINGECKO);
    });

    it("falls back to Stellar Expert when CoinGecko returns a non-200", async () => {
      const fetchMock = stubFetch({
        [COINGECKO]: () => jsonResponse({ error: "rate limited" }, 429),
        [STELLAR_EXPERT]: () => jsonResponse({ price: 0.2 }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBe(0.2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns null without throwing when every endpoint returns a non-200", async () => {
      stubFetch({
        [COINGECKO]: () => jsonResponse({}, 500),
        [STELLAR_EXPERT]: () => jsonResponse({}, 503),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBeNull();
    });

    it("falls back when CoinGecko returns malformed JSON", async () => {
      stubFetch({
        [COINGECKO]: () => new Response("<html>not json</html>", { status: 200 }),
        [STELLAR_EXPERT]: () => jsonResponse({ price: 0.3 }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBe(0.3);
    });

    it("returns null without throwing when every endpoint returns malformed JSON", async () => {
      stubFetch({
        [COINGECKO]: () => new Response("{oops", { status: 200 }),
        [STELLAR_EXPERT]: () => new Response("{oops", { status: 200 }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBeNull();
    });

    it("rejects well-formed JSON whose price is missing or not a number", async () => {
      stubFetch({
        [COINGECKO]: () => jsonResponse({ stellar: { usd: "0.12" } }),
        [STELLAR_EXPERT]: () => jsonResponse({ price: null }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBeNull();
    });

    it("falls back when CoinGecko has a network failure", async () => {
      stubFetch({
        [COINGECKO]: () => Promise.reject(new TypeError("Failed to fetch")),
        [STELLAR_EXPERT]: () => jsonResponse({ price: 0.4 }),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBe(0.4);
    });

    it("returns null without throwing when the network is down entirely", async () => {
      stubFetch({
        [COINGECKO]: () => Promise.reject(new TypeError("Failed to fetch")),
        [STELLAR_EXPERT]: () => Promise.reject(new TypeError("Failed to fetch")),
      });

      await expect(fetchXlmPriceInUsd()).resolves.toBeNull();
    });
  });

  describe("useXlmPrice", () => {
    it("exposes the fetched price", async () => {
      stubFetch({ [COINGECKO]: () => jsonResponse({ stellar: { usd: 0.5 } }) });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useXlmPrice(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(0.5);
    });

    it("resolves to null (not an error state) when all sources fail", async () => {
      stubFetch({
        [COINGECKO]: () => Promise.reject(new TypeError("Failed to fetch")),
        [STELLAR_EXPERT]: () => jsonResponse({}, 500),
      });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useXlmPrice(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it("resolves to null on malformed JSON from every source", async () => {
      stubFetch({
        [COINGECKO]: () => new Response("nope", { status: 200 }),
        [STELLAR_EXPERT]: () => new Response("nope", { status: 200 }),
      });
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useXlmPrice(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
      expect(result.current.isError).toBe(false);
    });
  });
});

// ─── Pause / unpause and platform config ─────────────────────────────────────

describe("pause/unpause and platform config", () => {
  const OWNER = WALLET;

  /** Names of the contract functions passed to simulateTransaction so far. */
  function simulatedFunctions(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls.map((call) => {
      const op = (call[0] as any).operations[0];
      return op.func.invokeContract().functionName().toString();
    });
  }

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([
    {
      name: "usePauseContract",
      useHook: usePauseContract,
      method: "pause",
      pending: "Pausing contract...",
      done: "Contract paused",
    },
    {
      name: "useUnpauseContract",
      useHook: useUnpauseContract,
      method: "unpause",
      pending: "Unpausing contract...",
      done: "Contract unpaused",
    },
  ])("$name", ({ useHook, method, pending, done }) => {
    it(`calls the "${method}" contract method with no arguments`, async () => {
      const simSpy = vi.spyOn(rpcServer, "simulateTransaction");
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      // submitTransaction simulates once itself and again inside prepareTransaction.
      const simulated = simulatedFunctions(simSpy);
      expect(simulated.length).toBeGreaterThan(0);
      expect(simulated.every((fn) => fn === method)).toBe(true);
      const op = (simSpy.mock.calls[0][0] as any).operations[0];
      expect(op.func.invokeContract().args()).toHaveLength(0);
    });

    it("shows a loading toast then a success toast and invalidates platform-config", async () => {
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(toast.loading).toHaveBeenCalledWith(pending);
      expect(toast.success).toHaveBeenCalledWith(
        done,
        expect.objectContaining({ id: "test-toast-id" }),
      );
      expect(toast.error).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["platform-config"],
      });
    });

    it("shows a mapped error toast and does not invalidate on failure", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockRejectedValue(new Error("Failed to fetch"));
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("Network error. Please try again.", {
        id: "test-toast-id",
      });
      expect(toast.success).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("maps a wallet rejection to a cancelled toast", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockRejectedValue(new Error("User declined"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("Transaction was cancelled.", {
        id: "test-toast-id",
      });
    });

    it("fails without submitting when the wallet is not connected", async () => {
      vi.mocked(useWallet).mockReturnValue({ address: null, isConnected: false } as any);
      const simSpy = vi.spyOn(rpcServer, "simulateTransaction");
      const { Wrapper, queryClient } = makeWrapper();
      const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("Wallet not connected");
      expect(simSpy).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe("getOwner", () => {
    it("simulates get_owner and returns the owner address", async () => {
      const simSpy = vi.spyOn(rpcServer, "simulateTransaction").mockResolvedValue({
        result: { retval: new Address(OWNER).toScVal() },
      } as any);

      await expect(getOwner()).resolves.toBe(OWNER);
      expect(simulatedFunctions(simSpy)).toEqual(["get_owner"]);
    });

    it("throws when the simulation errors", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockResolvedValue({ error: "boom" } as any);

      await expect(getOwner()).rejects.toThrow("Simulation failed: boom");
    });

    it("throws when the simulation returns no result", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockResolvedValue({} as any);

      await expect(getOwner()).rejects.toThrow("Failed to get owner: no result");
    });
  });

  describe("getPlatformConfig", () => {
    function mockConfigSimulation() {
      return vi.spyOn(rpcServer, "simulateTransaction").mockImplementation((async (tx: any) => {
        const fn = tx.operations[0].func.invokeContract().functionName().toString();
        return {
          result: {
            retval:
              fn === "get_owner"
                ? new Address(OWNER).toScVal()
                : nativeToScVal(42n, { type: "u64" }),
          },
        };
      }) as any);
    }

    it("combines owner, total campaigns and the fixed fee", async () => {
      const simSpy = mockConfigSimulation();

      await expect(getPlatformConfig()).resolves.toEqual({
        owner: OWNER,
        totalCampaigns: 42n,
        feeBps: 100,
        feeDenominator: 10_000,
      });
      expect(simulatedFunctions(simSpy).sort()).toEqual(["get_owner", "get_total_campaigns"]);
    });

    it("rejects (rather than masking to 0) when a read fails", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockRejectedValue(new Error("RPC down"));

      await expect(getPlatformConfig()).rejects.toThrow("RPC down");
    });
  });

  describe("usePlatformConfig", () => {
    it("returns the platform config on success", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockImplementation((async (tx: any) => {
        const fn = tx.operations[0].func.invokeContract().functionName().toString();
        return {
          result: {
            retval:
              fn === "get_owner"
                ? new Address(OWNER).toScVal()
                : nativeToScVal(7n, { type: "u64" }),
          },
        };
      }) as any);
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => usePlatformConfig(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toMatchObject({ owner: OWNER, totalCampaigns: 7n });
    });

    it("surfaces a real query error when the read fails", async () => {
      vi.spyOn(rpcServer, "simulateTransaction").mockRejectedValue(new Error("RPC down"));
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => usePlatformConfig(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as Error).message).toBe("RPC down");
      expect(result.current.data).toBeUndefined();
    });
  });
});
