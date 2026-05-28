"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCampaign, getRecentCampaigns, getCampaignsPage, submitTransaction, CONTRACT_ID, toStroops, getEvents } from "@/lib/soroban";
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

export function useCreateCampaign() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      beneficiary: string;
      title: string;
      targetAmount: string;
      deadline: number;
      acceptedToken: string;
      website?: string;
      twitter?: string;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        new Address(address).toScVal(),
        new Address(params.beneficiary).toScVal(),
        nativeToScVal(params.title, { type: "string" }),
        nativeToScVal(toStroops(params.targetAmount), { type: "i128" }),
        nativeToScVal(BigInt(params.deadline), { type: "u64" }),
        new Address(params.acceptedToken).toScVal(),
        nativeToScVal(params.website || null, { type: "string" }),
        nativeToScVal(params.twitter || null, { type: "string" }),
      ];

      return submitTransaction(address, "create_campaign", args);
    },
    onMutate: () => {
      const toastId = toast.loading("Transaction submitted... waiting for ledger confirmation");
      return { toastId };
    },
    onSuccess: (data, variables, context) => {
      if (context?.toastId) {
        toast.success("Campaign created successfully!", { id: context.toastId });
      } else {
        toast.success("Campaign created successfully!");
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables, context) => {
      if (context?.toastId) {
        toast.error(error.message || "Failed to create campaign", { id: context.toastId });
      } else {
        toast.error(error.message || "Failed to create campaign");
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
      const toastId = toast.loading("Transaction submitted... waiting for ledger confirmation");
      return { toastId };
    },
    onSuccess: (_, variables, context) => {
      if (context?.toastId) {
        toast.success("Thank you for your donation!", { id: context.toastId });
      } else {
        toast.success("Thank you for your donation!");
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables, context) => {
      if (context?.toastId) {
        toast.error(error.message || "Failed to donate", { id: context.toastId });
      } else {
        toast.error(error.message || "Failed to donate");
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

      const args = [
        new Address(address).toScVal(),
        nativeToScVal(campaignId, { type: "u64" }),
      ];

      return submitTransaction(address, "claim_funds", args);
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: () => getEvents(),
    refetchInterval: 5000,
  });
}
