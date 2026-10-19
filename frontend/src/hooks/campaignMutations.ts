import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/WalletProvider";
import { CONTRACT_ID, Campaign, SubmitTransactionResult, estimateFee, submitTransaction, toStroops } from "@/lib/soroban";
import { toRawAmount } from "@/utils/format";
import { notify } from "@/lib/toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@tanstack/react-query";
import { mapTransactionError } from "@/lib/contractErrors";

export { mapTransactionError } from "@/lib/contractErrors";

export const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;
export type MilestonePercent = (typeof MILESTONE_PERCENTS)[number];
export function getCrossedMilestones(beforeStroops: bigint, afterStroops: bigint, targetStroops: bigint): MilestonePercent[] {
  if (targetStroops <= 0n) return [];
  const before = Number((beforeStroops * 10_000n) / targetStroops) / 100;
  const after = Number((afterStroops * 10_000n) / targetStroops) / 100;
  return MILESTONE_PERCENTS.filter((milestone) => before < milestone && after >= milestone);
}
function useContractMutation<T>(method: string, buildArgs: (value: T, address: string) => xdr.ScVal[], success: string) {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: T) => { if (!address) throw new Error("Wallet not connected"); return submitTransaction(address, method, buildArgs(value, address)); },
    onMutate: () => ({ toastId: notify.loading() }),
    onSuccess: (data: SubmitTransactionResult, _value, context) => { notify.success(success, { id: context?.toastId, hash: data.hash }); queryClient.invalidateQueries({ queryKey: ["campaigns"] }); queryClient.invalidateQueries({ queryKey: ["events"] }); },
    onError: (error: unknown, _value, context) => notify.error(mapTransactionError(error), { id: context?.toastId }),
  });
}
export function useCreateCampaign() {
  const { address } = useWallet(); const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (params: { beneficiary: string; title: string; description: string; category?: string; metadataUri?: string; targetAmount: string; deadline: number; acceptedToken: string; website?: string; twitter?: string; maxPerDonor?: string | null }) => {
    if (!address) throw new Error("Wallet not connected"); if (params.beneficiary === CONTRACT_ID) throw new Error("Beneficiary cannot be the campaign contract address.");
    const beneficiaries = xdr.ScVal.scvVec([xdr.ScVal.scvVec([new Address(params.beneficiary).toScVal(), nativeToScVal(10000, { type: "u32" })])]);
    return submitTransaction(address, "create_campaign", [new Address(address).toScVal(), beneficiaries, nativeToScVal(params.title, { type: "string" }), nativeToScVal(params.description, { type: "string" }), nativeToScVal(params.metadataUri || "https://example.com", { type: "string" }), nativeToScVal(params.category || "relief", { type: "symbol" }), nativeToScVal(toStroops(params.targetAmount), { type: "i128" }), nativeToScVal(BigInt(params.deadline), { type: "u64" }), new Address(params.acceptedToken).toScVal(), params.maxPerDonor ? nativeToScVal(toStroops(params.maxPerDonor), { type: "i128" }) : nativeToScVal(null, { type: "i128" })]);
  }, onMutate: () => ({ toastId: notify.loading() }), onSuccess: (data: SubmitTransactionResult, _v, context) => { notify.success("Transaction confirmed", { id: context?.toastId, hash: data.hash }); queryClient.invalidateQueries({ queryKey: ["campaigns"] }); }, onError: (error: unknown, _v, context) => notify.error(mapTransactionError(error), { id: context?.toastId }) });
}
export function useDonate() {
  const { address } = useWallet(); const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { campaignId: bigint; amount: string; isAnonymous: boolean; decimals: number; message?: string }) => { if (!address) throw new Error("Wallet not connected"); return submitTransaction(address, "donate", [new Address(address).toScVal(), nativeToScVal(params.campaignId, { type: "u64" }), nativeToScVal(toRawAmount(params.amount, params.decimals), { type: "i128" }), nativeToScVal(params.isAnonymous, { type: "bool" }), ...(params.message ? [nativeToScVal(params.message, { type: "string" })] : [])]); },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      await queryClient.cancelQueries({ queryKey: ["campaigns"] });
      const previousCampaign = queryClient.getQueryData<Campaign>(["campaign", variables.campaignId.toString()]);
      const previousCampaignsQueries = queryClient.getQueriesData<{ campaigns: Campaign[]; hasMore: boolean }>({ queryKey: ["campaigns"] });
      const amountRaw = toRawAmount(variables.amount, variables.decimals);
      if (previousCampaign) queryClient.setQueryData<Campaign>(["campaign", variables.campaignId.toString()], { ...previousCampaign, raised_amount: previousCampaign.raised_amount + amountRaw });
      queryClient.setQueriesData<{ campaigns: Campaign[]; hasMore: boolean }>({ queryKey: ["campaigns"] }, (old) => old ? { ...old, campaigns: old.campaigns.map((campaign) => campaign.id === variables.campaignId ? { ...campaign, raised_amount: campaign.raised_amount + amountRaw } : campaign) } : old);
      return { previousCampaign, previousCampaignsQueries, toastId: notify.loading() };
    },
    onSuccess: (data: SubmitTransactionResult, _v, context) => { notify.success("Transaction confirmed", { id: context?.toastId, hash: data.hash }); queryClient.invalidateQueries({ queryKey: ["campaign", _v.campaignId.toString()] }); queryClient.invalidateQueries({ queryKey: ["campaigns"] }); queryClient.invalidateQueries({ queryKey: ["events"] }); },
    onError: (error: unknown, variables, context) => { if (context?.previousCampaign) queryClient.setQueryData(["campaign", variables.campaignId.toString()], context.previousCampaign); context?.previousCampaignsQueries?.forEach(([queryKey, previousData]) => queryClient.setQueryData(queryKey, previousData)); notify.error(mapTransactionError(error), { id: context?.toastId }); },
    onSettled: (_data, _error, variables) => { queryClient.invalidateQueries({ queryKey: ["campaign", variables.campaignId.toString()] }); queryClient.invalidateQueries({ queryKey: ["campaigns"] }); },
  });
}
export function useClaimFunds() { return useContractMutation("claim_funds", (id, address) => [new Address(address).toScVal(), nativeToScVal(id, { type: "u64" })], "Transaction confirmed"); }
export function useClaimRefund() { return useContractMutation("claim_refund", (id, address) => [new Address(address).toScVal(), nativeToScVal(id, { type: "u64" })], "Refund claimed successfully"); }
export function useCancelCampaign() { return useContractMutation("cancel_campaign", (id, address) => [new Address(address).toScVal(), nativeToScVal(id, { type: "u64" })], "Campaign cancelled"); }
export function useAddToWhitelist() { return useContractMutation("add_to_whitelist", (params) => [nativeToScVal(params.campaignId, { type: "u64" }), xdr.ScVal.scvVec([new Address(params.addressToWhitelist).toScVal()])], "Address whitelisted"); }
export function useDonateFeeEstimate(params: { campaignId: bigint; amount: string; address: string | null; decimals: number }) {
  const amount = useDebouncedValue(params.amount, 600);
  return useQuery({
    queryKey: ["fee-estimate", "donate", params.campaignId.toString(), amount, params.address, params.decimals],
    queryFn: () => params.address && amount ? estimateFee(params.address, "donate", [new Address(params.address).toScVal(), nativeToScVal(params.campaignId, { type: "u64" }), nativeToScVal(toRawAmount(amount, params.decimals), { type: "i128" }), nativeToScVal(false, { type: "bool" })]) : null,
    enabled: !!params.address && !!amount && Number(amount) > 0,
    retry: false,
    staleTime: 30_000,
  });
}
export function usePauseContract() { return useContractMutation("pause", () => [], "Contract paused"); }
export function useUnpauseContract() { return useContractMutation("unpause", () => [], "Contract unpaused"); }
export type { Campaign, SubmitTransactionResult };
