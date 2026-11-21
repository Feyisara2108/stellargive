import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React, { useEffect } from "react";
import { useQueryClient, QueryClient } from "@tanstack/react-query";
import { Providers } from "./Providers";

// Mock matchMedia for NextThemes
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const STORAGE_KEY = "stellargive:query-cache";

function ProbeClient({ onReady }: { onReady: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => {
    onReady(client);
  }, [client, onReady]);
  return <div data-testid="probe">Probe Active</div>;
}

describe("Providers query cache persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists successful queries to sessionStorage and serializes BigInt as { '__stellargive_bigint__': '<digits>' }", async () => {
    let capturedClient!: QueryClient;

    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    act(() => {
      capturedClient.setQueryData(["campaign", "101"], {
        id: 101n,
        target_amount: 5000000000n,
        negative_val: -123n,
        title: "Clean Water Initiative",
      });
    });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queryKey: ["campaign", "101"],
          state: expect.objectContaining({
            status: "success",
            data: {
              id: { __stellargive_bigint__: "101" },
              target_amount: { __stellargive_bigint__: "5000000000" },
              negative_val: { __stellargive_bigint__: "-123" },
              title: "Clean Water Initiative",
            },
          }),
        }),
      ]),
    );
  });

  it("persists queries with non-string first key elements", async () => {
    let capturedClient!: QueryClient;

    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    act(() => {
      capturedClient.setQueryData([999, "numeric-key"], {
        value: 10n,
      });
    });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toContain('"queryKey":[999,"numeric-key"]');
  });

  it("pre-seeds sessionStorage and restores BigInt as bigint preserving dataUpdatedAt", async () => {
    const seededCache = [
      {
        queryKey: ["campaign", "42"],
        state: {
          status: "success",
          data: {
            id: { __stellargive_bigint__: "42" },
            raised_amount: { __stellargive_bigint__: "123456789012345678" },
            negative_big: { __stellargive_bigint__: "-999" },
            regular_text: "Restored from storage",
            not_quite_bigint: { __stellargive_bigint__: "123", extra: true },
            non_numeric_tag: { __stellargive_bigint__: "not-a-number" },
          },
          dataUpdatedAt: 1710000000000,
        },
      },
    ];

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seededCache));

    let capturedClient!: QueryClient;
    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    const restoredData = capturedClient.getQueryData<any>(["campaign", "42"]);
    expect(restoredData).toBeDefined();
    expect(restoredData.id).toBe(42n);
    expect(restoredData.raised_amount).toBe(123456789012345678n);
    expect(restoredData.negative_big).toBe(-999n);
    expect(restoredData.regular_text).toBe("Restored from storage");
    expect(restoredData.not_quite_bigint).toEqual({ __stellargive_bigint__: "123", extra: true });
    expect(restoredData.non_numeric_tag).toEqual({ __stellargive_bigint__: "not-a-number" });

    const queryState = capturedClient.getQueryState(["campaign", "42"]);
    expect(queryState?.dataUpdatedAt).toBe(1710000000000);
  });

  it("does not write sensitive queries starting with wallet-balance, refund-eligibility, or fee-estimate", async () => {
    let capturedClient!: QueryClient;

    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    act(() => {
      capturedClient.setQueryData(["wallet-balance", "GSECRET"], { balance: 500n });
      capturedClient.setQueryData(["refund-eligibility", "10", "GSECRET"], false);
      capturedClient.setQueryData(["fee-estimate", "claim"], 1000n);
      capturedClient.setQueryData(["allowed-query"], { safe: true });
    });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("wallet-balance");
    expect(raw).not.toContain("refund-eligibility");
    expect(raw).not.toContain("fee-estimate");
    expect(raw).toContain("allowed-query");
  });

  it("handles corrupt JSON in storage without throwing and removes the key", () => {
    sessionStorage.setItem(STORAGE_KEY, "{corrupt-non-json-data");

    expect(() => {
      render(
        <Providers>
          <div>Child component</div>
        </Providers>,
      );
    }).not.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("swallows errors when removeItem throws during corrupt JSON handling", () => {
    sessionStorage.setItem(STORAGE_KEY, "invalid-json");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Blocked removeItem");
    });

    expect(() => {
      render(
        <Providers>
          <div>Child component</div>
        </Providers>,
      );
    }).not.toThrow();
  });

  it("swallows errors when sessionStorage.setItem throws due to quota exceeded", async () => {
    let capturedClient!: QueryClient;

    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => {
      act(() => {
        capturedClient.setQueryData(["quota-test"], { huge: true });
      });
    }).not.toThrow();
  });

  it("does not overwrite a query that is already successful in the client when restoring", async () => {
    const seededCache = [
      {
        queryKey: ["preserved-key"],
        state: {
          status: "success",
          data: "stale-stored-data",
          dataUpdatedAt: 100,
        },
      },
    ];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seededCache));

    const originalGetQueryCache = QueryClient.prototype.getQueryCache;
    vi.spyOn(QueryClient.prototype, "getQueryCache").mockImplementation(function (
      this: QueryClient,
    ) {
      const cache = originalGetQueryCache.call(this);
      const originalFind = cache.find.bind(cache);
      vi.spyOn(cache, "find").mockImplementation((filters) => {
        const key = (filters as any)?.queryKey;
        if (Array.isArray(key) && key[0] === "preserved-key") {
          return {
            state: { status: "success", data: "in-memory-fresh-data" },
          } as any;
        }
        return originalFind(filters);
      });
      return cache;
    });

    let capturedClient!: QueryClient;
    render(
      <Providers>
        <ProbeClient onReady={(client) => (capturedClient = client)} />
      </Providers>,
    );

    await waitFor(() => expect(capturedClient).toBeDefined());

    // Because existing was mocked as success, setQueryData was skipped
    expect(capturedClient.getQueryData(["preserved-key"])).toBeUndefined();
  });
});
