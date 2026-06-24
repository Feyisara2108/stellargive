"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCampaign,
  getRecentCampaigns,
  getCampaignsPage,
  submitTransaction,
  estimateFee,
  CONTRACT_ID,
  toStroops,
  getEvents,
  getUpdates,
  getTotalCampaigns,
} from "@/lib/soroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/WalletProvider";

export function useCampaign(id: bigint) {
  return useQuery({
    queryKey: ["campaign", id.toString()],
    queryFn: () => getCampaign(id),
  });
}

export function useRecentCampaigns() {
  return useQuery({
    queryKey: ["campaigns", "recent"],
    queryFn: () => getRecentCampaigns(),
  });
}

export function useCampaignsPaged(limit: number) {
  return useQuery({
    queryKey: ["campaigns", "paged", limit],
    queryFn: () => getCampaignsPage(limit),
    placeholderData: (prev) => prev,
  });
}

import { toast } from "sonner";

/**
 * Funding milestones (percent of target) that trigger a celebratory toast.
 * Order matters — callers iterate in ascending order so multiple thresholds
 * crossed by a single donation fire in the right sequence.
 */
export const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;
export type MilestonePercent = (typeof MILESTONE_PERCENTS)[number];

/**
 * Returns the milestone thresholds (25, 50, 75, 100) that the raised amount
 * crossed when moving from `beforeStroops` to `afterStroops` for a campaign
 * with `targetStroops` as its target. A threshold is "crossed" when the
 * before-percentage is strictly below it and the after-percentage is at or
 * above it. Returns an empty array for non-positive targets (defensive — the
 * contract rejects those at create time).
 */
export function getCrossedMilestones(
  beforeStroops: bigint,
  afterStroops: bigint,
  targetStroops: bigint,
): MilestonePercent[] {
  if (targetStroops <= 0n) return [];
  // Scale before dividing so we don't lose precision converting i128-sized
  // bigints to Number. Result is percentage with two decimal places.
  const pctBefore = Number((beforeStroops * 10_000n) / targetStroops) / 100;
  const pctAfter = Number((afterStroops * 10_000n) / targetStroops) / 100;
  return MILESTONE_PERCENTS.filter((m) => pctBefore < m && pctAfter >= m);
}

function mapTransactionError(error: any): string {
  const msg = error?.message || String(error);
  if (
    msg.includes("User declined") ||
    msg.includes("cancelled") ||
    msg.includes("Wallet error") ||
    msg.includes("User rejected")
  ) {
    return "Transaction was cancelled.";
  }
  if (
    msg.includes("Network Error") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Send failed")
  ) {
    return "Network error. Please try again.";
  }
  if (msg.includes("Simulation failed") || msg.includes("Transaction failed")) {
    return "Transaction failed on-chain.";
  }
  return "Something went wrong. Please try again.";
}

export function useCreateCampaign() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      beneficiary: string;
      title: string;
      category?: string;
      metadataUri?: string;
      targetAmount: string;
      deadline: number;
      acceptedToken: string;
      website?: string;
      twitter?: string;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      if (params.beneficiary === CONTRACT_ID) {
        throw new Error("Beneficiary cannot be the campaign contract address.");
      }

      const args = [
        new Address(address).toScVal(),
        new Address(params.beneficiary).toScVal(),
        nativeToScVal(params.title, { type: "string" }),
        nativeToScVal(params.metadataUri || "https://example.com", { type: "string" }),
        nativeToScVal(params.category || "relief", { type: "symbol" }),
        nativeToScVal(toStroops(params.targetAmount), { type: "i128" }),
        nativeToScVal(BigInt(params.deadline), { type: "u64" }),
        new Address(params.acceptedToken).toScVal(),
        nativeToScVal(null, { type: "i128" }),
      ];

      return submitTransaction(address, "create_campaign", args);
    },
    onMutate: () => {
      const toastId = toast.loading("Submitting transaction...");
      return { toastId };
    },
    onSuccess: (data: any, variables, context) => {
      const action = data?.hash
        ? {
            label: "View Explorer",
            onClick: () =>
              window.open(`https://stellar.expert/explorer/testnet/tx/${data.hash}`, "_blank"),
          }
        : undefined;
      const message = "Transaction confirmed";
      if (context?.toastId) {
        toast.success(message, { id: context.toastId, action });
      } else {
        toast.success(message, { action });
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables, context) => {
      const mappedError = mapTransactionError(error);
      if (context?.toastId) {
        toast.error(mappedError, { id: context.toastId });
      } else {
        toast.error(mappedError);
      }
    },
  });
}

export function useDonate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { campaignId: bigint; amount: string; isAnonymous: boolean }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        new Address(address).toScVal(),
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(toStroops(params.amount), { type: "i128" }),
        nativeToScVal(params.isAnonymous, { type: "bool" }),
      ];

      return submitTransaction(address, "donate", args);
    },
    onMutate: () => {
      const toastId = toast.loading("Submitting transaction...");
      return { toastId };
    },
    onSuccess: (data: any, variables, context) => {
      const action = data?.hash
        ? {
            label: "View Explorer",
            onClick: () =>
              window.open(`https://stellar.expert/explorer/testnet/tx/${data.hash}`, "_blank"),
          }
        : undefined;
      const message = "Transaction confirmed";
      if (context?.toastId) {
        toast.success(message, { id: context.toastId, action });
      } else {
        toast.success(message, { action });
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables, context) => {
      const mappedError = mapTransactionError(error);
      if (context?.toastId) {
        toast.error(mappedError, { id: context.toastId });
      } else {
        toast.error(mappedError);
      }
    },
  });
}

export function useClaimFunds() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: bigint) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "claim_funds", args);
    },
    onMutate: () => {
      const toastId = toast.loading("Submitting transaction...");
      return { toastId };
    },
    onSuccess: (data: any, campaignId, context) => {
      const action = data?.hash
        ? {
            label: "View Explorer",
            onClick: () =>
              window.open(`https://stellar.expert/explorer/testnet/tx/${data.hash}`, "_blank"),
          }
        : undefined;
      const message = "Transaction confirmed";
      if (context?.toastId) {
        toast.success(message, { id: context.toastId, action });
      } else {
        toast.success(message, { action });
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables, context) => {
      const mappedError = mapTransactionError(error);
      if (context?.toastId) {
        toast.error(mappedError, { id: context.toastId });
      } else {
        toast.error(mappedError);
      }
    },
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const totalCampaigns = await getTotalCampaigns();
      let totalRaised = BigInt(0);
      let activeCampaigns = 0;
      if (totalCampaigns > 0) {
        const campaigns = await getRecentCampaigns(totalCampaigns);
        for (const c of campaigns) {
          totalRaised += c.raised_amount;
          if (c.status === "Active") activeCampaigns++;
        }
      }
      return { totalCampaigns, totalRaised: totalRaised.toString(), activeCampaigns };
    },
    staleTime: 60_000,
  });
}

export function useEvents(limit = 20) {
  return useQuery({
    queryKey: ["events", limit],
    queryFn: () => getEvents(limit),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useGetUpdates(campaignId: bigint) {
  return useQuery({
    queryKey: ["updates", campaignId.toString()],
    queryFn: () => getUpdates(campaignId),
  });
}

export function useAddUpdate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { campaignId: bigint; content: string }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(params.content, { type: "string" }),
      ];

      return submitTransaction(address, "add_update", args);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.campaignId.toString()] });
    },
  });
}

export function useDonateFeeEstimate(params: {
  campaignId: bigint;
  amount: string;
  address: string | null;
}) {
  const debouncedAmount = useDebouncedValue(params.amount, 600);

  return useQuery({
    queryKey: [
      "fee-estimate",
      "donate",
      params.campaignId.toString(),
      debouncedAmount,
      params.address,
    ],
    queryFn: async () => {
      if (!params.address || !debouncedAmount || Number(debouncedAmount) <= 0) return null;
      try {
        const args = [
          new Address(params.address).toScVal(),
          nativeToScVal(params.campaignId, { type: "u64" }),
          nativeToScVal(toStroops(debouncedAmount), { type: "i128" }),
          nativeToScVal(false, { type: "bool" }),
        ];
        return estimateFee(params.address, "donate", args);
      } catch {
        return null;
      }
    },
    enabled: !!params.address && !!debouncedAmount && Number(debouncedAmount) > 0,
    retry: false,
    staleTime: 30_000,
  });
}

export function useCancelCampaign() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: bigint) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "cancel_campaign", args);
    },
    onMutate: () => {
      const toastId = toast.loading("Cancelling campaign...");
      return { toastId };
    },
    onSuccess: (data: any, campaignId, context) => {
      const action = data?.hash
        ? {
            label: "View Explorer",
            onClick: () =>
              window.open(`https://stellar.expert/explorer/testnet/tx/${data.hash}`, "_blank"),
          }
        : undefined;
      const message = "Campaign cancelled";
      if (context?.toastId) {
        toast.success(message, { id: context.toastId, action });
      } else {
        toast.success(message, { action });
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, _variables, context) => {
      const mappedError = mapTransactionError(error);
      if (context?.toastId) {
        toast.error(mappedError, { id: context.toastId });
      } else {
        toast.error(mappedError);
      }
    },
  });
}
