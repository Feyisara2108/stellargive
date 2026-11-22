import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { scValToNative, type xdr } from "@stellar/stellar-sdk";
import React from "react";
import type { Campaign } from "@/lib/soroban";

vi.mock("@/lib/soroban", () => ({
  CONTRACT_ID: "CTEST",
  submitTransaction: vi.fn(),
  estimateFee: vi.fn(),
  toStroops: vi.fn((value: string) => BigInt(Math.round(Number(value) * 10_000_000))),
  isValidStellarAddress: vi.fn((address: string) => /^G[A-Z2-7]{55}$/.test(address)),
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
import { mapTransactionError, INVALID_SHARES_MESSAGE } from "@/lib/contractErrors";
import { useCreateCampaign, useDonate } from "./campaignMutations";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const OTHER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Test Campaign",
    description: "Test description",
    category: "relief",
    target_amount: 1_000_000_000n,
    raised_amount: 350_000_000n,
    deadline: 1_900_000_000n,
    accepted_token: TOKEN,
    status: "Active",
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

function submittedArgs() {
  const [, method, args] = vi.mocked(submitTransaction).mock.calls[0] as [
    string,
    string,
    xdr.ScVal[],
  ];
  return { method, args: args.map((a) => scValToNative(a)) };
}

const baseParams = {
  beneficiary: OTHER,
  title: "Title",
  description: "Description",
  targetAmount: "100",
  deadline: 1_900_000_000,
  acceptedToken: TOKEN,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWallet).mockReturnValue({ address: WALLET } as never);
  vi.mocked(submitTransaction).mockResolvedValue({ hash: "tx-hash" } as never);
});

describe("useCreateCampaign", () => {
  it("rejects a beneficiary equal to the contract id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...baseParams, beneficiary: "CTEST" }),
      ).rejects.toThrow("Beneficiary cannot be the campaign contract address.");
    });
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("rejects shares that do not sum to 10000", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          ...baseParams,
          beneficiaries: [
            { address: WALLET, share: 4000 },
            { address: OTHER, share: 4000 },
          ],
        }),
      ).rejects.toThrow(INVALID_SHARES_MESSAGE);
    });
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("rejects when no wallet is connected", async () => {
    vi.mocked(useWallet).mockReturnValue({ address: null } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(baseParams)).rejects.toThrow("Wallet not connected");
    });
  });

  it("submits a single [beneficiary, 10000] pair when no beneficiaries are given", async () => {
    const { invalidate, wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(baseParams);
    });
    const { method, args } = submittedArgs();
    expect(method).toBe("create_campaign");
    expect(args[1]).toEqual([[OTHER, 10000]]);
    expect(notify.success).toHaveBeenCalledWith("Transaction confirmed", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
  });

  it("applies default category and metadata URI and converts the target to stroops", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(baseParams);
    });
    const { args } = submittedArgs();
    expect(args[0]).toBe(WALLET);
    expect(args[2]).toBe("Title");
    expect(args[3]).toBe("Description");
    expect(args[4]).toBe("https://example.com");
    expect(args[5]).toBe("relief");
    expect(args[6]).toBe(1_000_000_000n);
    expect(args[7]).toBe(1_900_000_000n);
    expect(args[8]).toBe(TOKEN);
  });

  it("uses the supplied category and metadata URI", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        ...baseParams,
        category: "health",
        metadataUri: "https://meta.test/1",
      });
    });
    const { args } = submittedArgs();
    expect(args[4]).toBe("https://meta.test/1");
    expect(args[5]).toBe("health");
  });

  it("encodes maxPerDonor as stroops when present and null when absent", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...baseParams, maxPerDonor: "5" });
    });
    expect(submittedArgs().args[9]).toBe(50_000_000n);

    vi.mocked(submitTransaction).mockClear();
    await act(async () => {
      await result.current.mutateAsync({ ...baseParams, maxPerDonor: null });
    });
    expect(submittedArgs().args[9]).toBeNull();
  });

  it("shows the mapped error when submission fails", async () => {
    const error = new Error("rpc down");
    vi.mocked(submitTransaction).mockRejectedValue(error);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(baseParams).catch(() => undefined);
    });
    expect(notify.error).toHaveBeenCalledWith(mapTransactionError(error), { id: "toast-id" });
  });
});

describe("useDonate", () => {
  const donation = { campaignId: 1n, amount: "10", isAnonymous: false, decimals: 7 };
  const DONATION_RAW = 100_000_000n;

  function seed(queryClient: QueryClient) {
    queryClient.setQueryData(["campaign", "1"], makeCampaign());
    queryClient.setQueryData(["campaigns", "recent"], {
      campaigns: [makeCampaign(), makeCampaign({ id: 2n, raised_amount: 5n })],
      hasMore: false,
    });
  }

  it("optimistically raises raised_amount before the transaction resolves, then invalidates", async () => {
    const { queryClient, invalidate, wrapper } = makeWrapper();
    seed(queryClient);
    let resolveTx: (v: { hash: string }) => void = () => undefined;
    vi.mocked(submitTransaction).mockReturnValue(
      new Promise((resolve) => {
        resolveTx = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useDonate(), { wrapper });

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.mutateAsync(donation);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(queryClient.getQueryData<Campaign>(["campaign", "1"])?.raised_amount).toBe(
      350_000_000n + DONATION_RAW,
    );
    const list = queryClient.getQueryData<{ campaigns: Campaign[] }>(["campaigns", "recent"]);
    expect(list?.campaigns[0].raised_amount).toBe(350_000_000n + DONATION_RAW);
    expect(list?.campaigns[1].raised_amount).toBe(5n);

    await act(async () => {
      resolveTx({ hash: "tx-hash" });
      await pending;
    });

    expect(notify.success).toHaveBeenCalledWith("Transaction confirmed", {
      id: "toast-id",
      hash: "tx-hash",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaign", "1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("rolls the caches back and shows the mapped error on failure", async () => {
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);
    const error = new Error("tx failed");
    vi.mocked(submitTransaction).mockRejectedValue(error);
    const { result } = renderHook(() => useDonate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation).catch(() => undefined);
    });

    expect(queryClient.getQueryData<Campaign>(["campaign", "1"])?.raised_amount).toBe(350_000_000n);
    const list = queryClient.getQueryData<{ campaigns: Campaign[] }>(["campaigns", "recent"]);
    expect(list?.campaigns[0].raised_amount).toBe(350_000_000n);
    expect(notify.error).toHaveBeenCalledWith(mapTransactionError(error), { id: "toast-id" });
  });

  it("rejects without a wallet", async () => {
    vi.mocked(useWallet).mockReturnValue({ address: null } as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(donation)).rejects.toThrow("Wallet not connected");
    });
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("omits the message argument when absent and appends it when present", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDonate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(donation);
    });
    const without = submittedArgs();
    expect(without.method).toBe("donate");
    expect(without.args).toEqual([WALLET, 1n, DONATION_RAW, false]);

    vi.mocked(submitTransaction).mockClear();
    await act(async () => {
      await result.current.mutateAsync({ ...donation, message: "Good luck" });
    });
    expect(submittedArgs().args).toEqual([WALLET, 1n, DONATION_RAW, false, "Good luck"]);
  });
});
