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
  getSACBalance,
  resolveAddressName,
  Campaign,
} from "@/lib/soroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/WalletProvider";
import { toRawAmount } from "@/utils/format";

export function useCampaign(id: bigint) {
  return useQuery({
    queryKey: ["campaign", id.toString()],
    queryFn: () => getCampaign(id),
    // Individual campaign pages are the LCP content; serve from cache for up
    // to 30 s before considering a background refetch.
    staleTime: 30_000,
  });
}

export function useRecentCampaigns() {
  return useQuery({
    queryKey: ["campaigns", "recent"],
    queryFn: () => getRecentCampaigns(),
    // Profile page remounts on wallet changes — 30 s staleTime prevents
    // back-to-back refetches when the wallet context re-renders.
    staleTime: 30_000,
  });
}

export function useCampaignsPaged(limit: number) {
  return useQuery({
    queryKey: ["campaigns", "paged", limit],
    queryFn: () => getCampaignsPage(limit),
    placeholderData: (prev) => prev,
    // Explore page mounts/unmounts on navigation; 30 s staleTime means
    // paginated results are served instantly on back-navigation without a
    // redundant network call.
    staleTime: 30_000,
  });
}

import { notify } from "@/lib/toast";

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

export function mapTransactionError(error: any): string {
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
      description: string;
      category?: string;
      metadataUri?: string;
      targetAmount: string;
      deadline: number;
      acceptedToken: string;
      website?: string;
      twitter?: string;
      maxPerDonor?: string | null;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      if (params.beneficiary === CONTRACT_ID) {
        throw new Error("Beneficiary cannot be the campaign contract address.");
      }

      // Pack the single beneficiary address into the format expected by the contract's
      // beneficiaries argument, which is Vec<(Address, u32)>. We map this to a nested
      // array packaging: [[Address, 10000]] (100% share to the beneficiary).
      const beneficiariesVec = xdr.ScVal.scvVec([
        xdr.ScVal.scvVec([
          new Address(params.beneficiary).toScVal(),
          nativeToScVal(10000, { type: "u32" }),
        ]),
      ]);

      const args = [
        new Address(address).toScVal(), // 1. creator: Address
        beneficiariesVec, // 2. beneficiaries: Vec<(Address, u32)>
        nativeToScVal(params.title, { type: "string" }), // 3. title: String
        nativeToScVal(params.description, { type: "string" }), // 4. description: String
        nativeToScVal(params.metadataUri || "https://example.com", { type: "string" }), // 5. metadata_uri: String
        nativeToScVal(params.category || "relief", { type: "symbol" }), // 6. category: Symbol
        nativeToScVal(toStroops(params.targetAmount), { type: "i128" }), // 7. target_amount: i128
        nativeToScVal(BigInt(params.deadline), { type: "u64" }), // 8. deadline: u64
        new Address(params.acceptedToken).toScVal(), // 9. accepted_token: Address
        params.maxPerDonor
          ? nativeToScVal(toStroops(params.maxPerDonor), { type: "i128" })
          : nativeToScVal(null, { type: "i128" }), // 10. max_per_donor: Option<i128>
      ];

      return submitTransaction(address, "create_campaign", args);
    },
    onMutate: () => {
      const toastId = notify.loading();
      return { toastId };
    },
    onSuccess: (data: any, variables: any, context: any) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables: any, context: any) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
  });
}

export function useDonate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      campaignId: bigint;
      amount: string;
      isAnonymous: boolean;
      decimals: number;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        new Address(address).toScVal(),
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(toRawAmount(params.amount, params.decimals), { type: "i128" }),
        nativeToScVal(params.isAnonymous, { type: "bool" }),
      ];

      return submitTransaction(address, "donate", args);
    },
    onMutate: async (variables: any) => {
      await queryClient.cancelQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      await queryClient.cancelQueries({ queryKey: ["campaigns"] });

      const previousCampaign = queryClient.getQueryData<Campaign>([
        "campaign",
        variables.campaignId.toString(),
      ]);
      const previousCampaignsQueries = queryClient.getQueriesData<{
        campaigns: Campaign[];
        hasMore: boolean;
      }>({ queryKey: ["campaigns"] });

      const amountRaw = toRawAmount(variables.amount, variables.decimals);

      // Update individual campaign cache
      if (previousCampaign) {
        queryClient.setQueryData<Campaign>(["campaign", variables.campaignId.toString()], {
          ...previousCampaign,
          raised_amount: previousCampaign.raised_amount + amountRaw,
        });
      }

      // Update campaigns lists (recent, paged)
      queryClient.setQueriesData<{ campaigns: Campaign[]; hasMore: boolean }>(
        { queryKey: ["campaigns"] },
        (old: any) => {
          if (!old) return old;
          const newCampaigns =
            old.campaigns?.map((c: any) =>
              c.id === variables.campaignId
                ? { ...c, raised_amount: c.raised_amount + amountRaw }
                : c,
            ) || [];
          return { ...old, campaigns: newCampaigns };
        },
      );

      const toastId = notify.loading();
      return { previousCampaign, previousCampaignsQueries, toastId };
    },
    onSuccess: (data: any, variables: any, context: any) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
    },
    onError: (error: any, variables: any, context: any) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData(
          ["campaign", variables.campaignId.toString()],
          context.previousCampaign,
        );
      }
      if (context?.previousCampaignsQueries) {
        context.previousCampaignsQueries.forEach(([queryKey, previousData]: any) => {
          queryClient.setQueryData(queryKey, previousData);
        });
      }
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
    onSettled: (data: any, error: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
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
      const toastId = notify.loading();
      return { toastId };
    },
    onSuccess: (data: any, campaignId: any, context: any) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, variables: any, context: any) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
  });
}

export function useClaimRefund() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: bigint) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "claim_refund", args);
    },
    onMutate: () => {
      const toastId = notify.loading("Claiming refund...");
      return { toastId };
    },
    onSuccess: (data: any, campaignId: any, context: any) => {
      notify.success("Refund claimed successfully", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["refund-eligibility", campaignId.toString()] });
    },
    onError: (error: any, _variables: any, context: any) => {
      notify.error("Unable to claim refund. Please try again.", { id: context?.toastId });
    },
  });
}

export function useRefundEligibility(campaignId: bigint, isCancelled: boolean) {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["refund-eligibility", campaignId.toString(), address],
    queryFn: async () => {
      if (!address || !isCancelled) return false;
      try {
        const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];
        const fee = await estimateFee(address, "claim_refund", args);
        return fee !== null;
      } catch {
        return false;
      }
    },
    enabled: !!address && isCancelled,
    staleTime: 60_000,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const totalCampaigns = await getTotalCampaigns();
      let totalRaised = BigInt(0);
      let activeCampaigns = 0;
      if (totalCampaigns > 0n) {
        const campaigns = await getRecentCampaigns(Number(totalCampaigns));
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

/** Steady-state poll interval for the event feed, in ms. */
export const EVENTS_POLL_INTERVAL_MS = 10_000;
/** Upper bound on the error backoff, in ms. */
export const EVENTS_MAX_BACKOFF_MS = 60_000;

/**
 * Adaptive refetch interval for the event feed.
 *
 * - Hidden tab: `false`, which pauses polling entirely.
 * - Errored query: exponential backoff from the failure count, capped at
 *   `EVENTS_MAX_BACKOFF_MS` so a persistent outage cannot stretch the gap
 *   without bound.
 * - Otherwise: the steady `EVENTS_POLL_INTERVAL_MS`.
 *
 * Pure apart from reading `document.hidden`, so it is exercised directly rather
 * than through a rendered query.
 */
export function eventsRefetchInterval(query: {
  state: { status: string; fetchFailureCount: number };
}): number | false {
  if (typeof document !== "undefined" && document.hidden) {
    return false;
  }
  if (query.state.status === "error") {
    const failureCount = query.state.fetchFailureCount;
    return Math.min(EVENTS_POLL_INTERVAL_MS * Math.pow(2, failureCount), EVENTS_MAX_BACKOFF_MS);
  }
  return EVENTS_POLL_INTERVAL_MS;
}

export function useEvents(limit = 20) {
  return useQuery({
    queryKey: ["events", limit],
    queryFn: () => getEvents(limit),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.hidden) {
        return false;
      }
      if (query.state.status === "error") {
        const failureCount = query.state.fetchFailureCount;
        return Math.min(10000 * Math.pow(2, failureCount), 60000);
      }
      return 10000;
    },
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
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.campaignId.toString()] });
    },
  });
}

export function useDonateFeeEstimate(params: {
  campaignId: bigint;
  amount: string;
  address: string | null;
  decimals: number;
}) {
  const debouncedAmount = useDebouncedValue(params.amount, 600);

  return useQuery({
    queryKey: [
      "fee-estimate",
      "donate",
      params.campaignId.toString(),
      debouncedAmount,
      params.address,
      params.decimals,
    ],
    queryFn: async () => {
      if (!params.address || !debouncedAmount || Number(debouncedAmount) <= 0) return null;
      try {
        const args = [
          new Address(params.address).toScVal(),
          nativeToScVal(params.campaignId, { type: "u64" }),
          nativeToScVal(toRawAmount(debouncedAmount, params.decimals), { type: "i128" }),
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
      const toastId = notify.loading("Cancelling campaign...");
      return { toastId };
    },
    onSuccess: (data: any, campaignId: any, context: any) => {
      notify.success("Campaign cancelled", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: any, _variables: any, context: any) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
  });
}

export function useAddToWhitelist() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { campaignId: bigint; addressToWhitelist: string }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        nativeToScVal(params.campaignId, { type: "u64" }),
        xdr.ScVal.scvVec([new Address(params.addressToWhitelist).toScVal()]),
      ];

      return submitTransaction(address, "add_to_whitelist", args);
    },
    onMutate: () => {
      const toastId = notify.loading("Whitelisting address...");
      return { toastId };
    },
    onSuccess: (data: any, variables: any, context: any) => {
      notify.success("Address whitelisted", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({
        queryKey: ["campaign", variables.campaignId.toString()],
      });
    },
    onError: (error: any, _variables: any, context: any) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
  });
}

export function useWalletBalance(
  tokenContractId: string | null | undefined,
  address: string | null,
) {
  return useQuery({
    queryKey: ["wallet-balance", tokenContractId, address],
    queryFn: async () => {
      if (!tokenContractId || !address) return null;
      return getSACBalance(tokenContractId, address);
    },
    enabled: !!tokenContractId && !!address,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Hook to resolve a Soroban Domain name for an address with caching.
 * Returns the domain name if available, otherwise returns null.
 * Never blocks render - resolution happens asynchronously.
 */
export function useResolvedName(address: string | null) {
  return useQuery({
    queryKey: ["resolved-name", address],
    queryFn: () => (address ? resolveAddressName(address) : null),
    enabled: !!address && address.length === 56,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    retry: false, // Don't retry on failure
  });
}

export function useTokenMetadata(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ["token-metadata", contractId],
    queryFn: async () => {
      if (!contractId) return null;
      const { getTokenMetadata } = await import("@/lib/soroban");
      return getTokenMetadata(contractId);
    },
    enabled: !!contractId,
    staleTime: 1000 * 60 * 60 * 24, // cache for 24h since token metadata doesn't change
    retry: 2,
  });
}

export function useTokenMetadataBatch(contractIds: string[]) {
  const queryClient = useQueryClient();
  const uniqueIds = Array.from(new Set(contractIds)).filter(Boolean).sort();

  return useQuery({
    queryKey: ["token-metadata-batch", uniqueIds.join(",")],
    queryFn: async () => {
      if (uniqueIds.length === 0) return {};
      const { getTokenMetadata } = await import("@/lib/soroban");

      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const meta = await getTokenMetadata(id);
            // Pre-populate individual cache so CampaignCard doesn't fetch
            if (meta) {
              queryClient.setQueryData(["token-metadata", id], meta);
            }
            return [id, meta] as const;
          } catch (e) {
            return [id, null] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
    enabled: uniqueIds.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });
}
