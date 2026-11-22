import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { scValToNative, type xdr } from "@stellar/stellar-sdk";
import React from "react";

vi.mock("@/lib/soroban", () => ({
  CONTRACT_ID: "CTEST",
  submitTransaction: vi.fn(),
  estimateFee: vi.fn(),
  toStroops: vi.fn(),
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

import { submitTransaction } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { notify } from "@/lib/toast";
import { mapTransactionError } from "@/lib/contractErrors";
import {
  useAddToWhitelist,
  useCancelCampaign,
  useClaimFunds,
  useClaimRefund,
  usePauseContract,
  useUnpauseContract,
} from "./campaignMutations";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const OTHER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

function lastCall() {
  const [signer, method, args] = vi.mocked(submitTransaction).mock.calls[0] as [
    string,
    string,
    xdr.ScVal[],
  ];
  return { signer, method, args: args.map((a) => scValToNative(a)) };
}

function expectInvalidated(invalidate: ReturnType<typeof makeWrapper>["invalidate"]) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["events"] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWallet).mockReturnValue({ address: WALLET } as never);
  vi.mocked(submitTransaction).mockResolvedValue({ hash: "tx-hash" } as never);
});

describe("lifecycle mutations", () => {
  it("useClaimFunds submits claim_funds with address then u64 id", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useClaimFunds(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(5n);
    });
    expect(lastCall()).toEqual({ signer: WALLET, method: "claim_funds", args: [WALLET, 5n] });
    expect(notify.success).toHaveBeenCalledWith("Transaction confirmed", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });

  it("useClaimRefund submits claim_refund with address then u64 id", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useClaimRefund(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(6n);
    });
    expect(lastCall()).toEqual({ signer: WALLET, method: "claim_refund", args: [WALLET, 6n] });
    expect(notify.success).toHaveBeenCalledWith("Refund claimed successfully", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });

  // The contract defines cancel_campaign(env, id) with a single argument, but the
  // hook currently passes the wallet address first. This asserts current behaviour.
  it("useCancelCampaign submits cancel_campaign with address then u64 id", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useCancelCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(7n);
    });
    expect(lastCall()).toEqual({ signer: WALLET, method: "cancel_campaign", args: [WALLET, 7n] });
    expect(notify.success).toHaveBeenCalledWith("Campaign cancelled", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });

  it("useAddToWhitelist submits u64 id then a vec holding one address", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddToWhitelist(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ campaignId: 8n, addressToWhitelist: OTHER });
    });
    expect(lastCall()).toEqual({
      signer: WALLET,
      method: "add_to_whitelist",
      args: [8n, [OTHER]],
    });
    expect(notify.success).toHaveBeenCalledWith("Address whitelisted", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });

  it("usePauseContract submits pause with no arguments", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => usePauseContract(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(undefined as never);
    });
    expect(lastCall()).toEqual({ signer: WALLET, method: "pause", args: [] });
    expect(notify.success).toHaveBeenCalledWith("Contract paused", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });

  it("useUnpauseContract submits unpause with no arguments", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useUnpauseContract(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(undefined as never);
    });
    expect(lastCall()).toEqual({ signer: WALLET, method: "unpause", args: [] });
    expect(notify.success).toHaveBeenCalledWith("Contract unpaused", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expectInvalidated(invalidate);
  });
});

describe("useClaimFunds failure paths", () => {
  it("shows the mapped error when the transaction fails", async () => {
    const error = new Error("rpc exploded");
    vi.mocked(submitTransaction).mockRejectedValue(error);
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useClaimFunds(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(5n).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notify.error).toHaveBeenCalledWith(mapTransactionError(error), { id: "toast-id" });
    expect(notify.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rejects with 'Wallet not connected' and never submits without a wallet", async () => {
    vi.mocked(useWallet).mockReturnValue({ address: null } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useClaimFunds(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(5n)).rejects.toThrow("Wallet not connected");
    });
    expect(submitTransaction).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith(
      mapTransactionError(new Error("Wallet not connected")),
      { id: "toast-id" },
    );
  });
});
