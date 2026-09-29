import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const getLatestLedger = vi.hoisted(() => vi.fn());

vi.mock("@/lib/soroban", () => ({
  server: { getLatestLedger },
}));

import { useRpcHealth } from "./useRpcHealth";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return { queryClient, Wrapper };
}

/**
 * Fakes only `performance.now` and has the mocked ping advance it by `ms`,
 * so the measured latency is exact regardless of how often React or
 * react-query read the clock in between.
 */
function mockPingLatency(ms: number) {
  vi.useFakeTimers({ toFake: ["performance"] });
  getLatestLedger.mockImplementationOnce(async () => {
    vi.advanceTimersByTime(ms);
    return {};
  });
}

beforeEach(() => {
  getLatestLedger.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useRpcHealth — status transitions", () => {
  it("reports 'loading' before the first ping settles", () => {
    getLatestLedger.mockImplementation(() => new Promise(() => {}));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });

    expect(result.current).toEqual({ status: "loading", latencyMs: null });
  });

  it("classifies as healthy when latency is below the degraded threshold", async () => {
    mockPingLatency(500);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe("healthy"));
    expect(result.current.latencyMs).toBe(500);
  });

  it("classifies as degraded when latency is at or above the threshold", async () => {
    mockPingLatency(1_000);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe("degraded"));
    expect(result.current.latencyMs).toBe(1_000);
  });

  it("classifies well above the threshold as degraded too", async () => {
    mockPingLatency(3_500);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe("degraded"));
    expect(result.current.latencyMs).toBe(3_500);
  });

  it("transitions to down when the ping fails", async () => {
    getLatestLedger.mockRejectedValue(new Error("RPC timeout"));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe("down"));
    expect(result.current.latencyMs).toBeNull();
  });

  it("stays down across repeated failures", async () => {
    getLatestLedger.mockRejectedValue(new Error("RPC timeout"));
    const { Wrapper, queryClient } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe("down"));

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["rpc-health"] });
    });

    expect(result.current.status).toBe("down");
    expect(result.current.latencyMs).toBeNull();
    expect(getLatestLedger).toHaveBeenCalledTimes(2);
  });

  it("recovers to healthy once a ping succeeds again after failures", async () => {
    getLatestLedger.mockRejectedValueOnce(new Error("RPC timeout"));
    const { Wrapper, queryClient } = makeWrapper();

    const { result } = renderHook(() => useRpcHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe("down"));

    mockPingLatency(200);

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["rpc-health"] });
    });

    await waitFor(() => expect(result.current.status).toBe("healthy"));
    expect(result.current.latencyMs).toBe(200);
  });
});
