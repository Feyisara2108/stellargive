import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/soroban", () => ({
  getSACBalance: vi.fn(),
  getTokenMetadata: vi.fn(),
  resolveAddressName: vi.fn(),
}));

import { getSACBalance, getTokenMetadata, resolveAddressName } from "@/lib/soroban";
import {
  useResolvedName,
  useTokenMetadata,
  useTokenMetadataBatch,
  useWalletBalance,
} from "./tokens";

const ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const meta = (symbol: string) => ({ name: symbol, symbol, decimals: 7 });

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useWalletBalance", () => {
  it.each([
    ["token id is missing", null, ADDRESS],
    ["token id is undefined", undefined, ADDRESS],
    ["address is missing", "CTOKEN", null],
  ])("is disabled when the %s", (_label, token, address) => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWalletBalance(token, address), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getSACBalance).not.toHaveBeenCalled();
  });

  it("calls getSACBalance(token, address) when enabled", async () => {
    vi.mocked(getSACBalance).mockResolvedValue(123n as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWalletBalance("CTOKEN", ADDRESS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSACBalance).toHaveBeenCalledWith("CTOKEN", ADDRESS);
    expect(result.current.data).toBe(123n);
  });
});

describe("useResolvedName", () => {
  it("is disabled for a null address", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResolvedName(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(resolveAddressName).not.toHaveBeenCalled();
  });

  it("is disabled unless the address is 56 characters", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResolvedName("GSHORT"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(resolveAddressName).not.toHaveBeenCalled();
  });

  it("returns the mocked name for a 56-character address", async () => {
    vi.mocked(resolveAddressName).mockResolvedValue("alice.stellar" as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResolvedName(ADDRESS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(resolveAddressName).toHaveBeenCalledWith(ADDRESS);
    expect(result.current.data).toBe("alice.stellar");
  });
});

describe("useTokenMetadata", () => {
  it.each([null, undefined])("is disabled for %s", (id) => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTokenMetadata(id), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getTokenMetadata).not.toHaveBeenCalled();
  });

  it("returns metadata when enabled", async () => {
    vi.mocked(getTokenMetadata).mockResolvedValue(meta("USDC") as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTokenMetadata("CUSDC"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getTokenMetadata).toHaveBeenCalledWith("CUSDC");
    expect(result.current.data).toEqual(meta("USDC"));
  });
});

describe("useTokenMetadataBatch", () => {
  it("never calls getTokenMetadata for an empty list", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTokenMetadataBatch([]), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getTokenMetadata).not.toHaveBeenCalled();
  });

  it("collapses duplicate and empty ids and sorts them", async () => {
    vi.mocked(getTokenMetadata).mockImplementation((async (id: string) => meta(id)) as never);
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useTokenMetadataBatch(["CB", "", "CA", "CB"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getTokenMetadata).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getTokenMetadata).mock.calls.map((c) => c[0])).toEqual(["CA", "CB"]);
    expect(
      queryClient.getQueryCache().find({ queryKey: ["token-metadata-batch", "CA,CB"] }),
    ).toBeDefined();
  });

  it("yields null for a failing id and seeds the single-token cache for the rest", async () => {
    vi.mocked(getTokenMetadata).mockImplementation((async (id: string) => {
      if (id === "CBAD") throw new Error("boom");
      return meta(id);
    }) as never);
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useTokenMetadataBatch(["CGOOD", "CBAD"]), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ CBAD: null, CGOOD: meta("CGOOD") });
    expect(queryClient.getQueryData(["token-metadata", "CGOOD"])).toEqual(meta("CGOOD"));
    expect(queryClient.getQueryData(["token-metadata", "CBAD"])).toBeUndefined();
  });
});
