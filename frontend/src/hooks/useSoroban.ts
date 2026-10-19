import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Campaign, EventHistory, SorobanEvent, SubmitTransactionResult } from "@/lib/soroban";
import { parseDonationEvent } from "@/lib/eventData";
import { CONTRACT_ID } from "@/lib/config";
import { toStroops } from "@/lib/amounts";
import { isValidAccountAddress } from "@/lib/strkey";
import {
  getCampaign,
  getRecentCampaigns,
  getCampaignsPage,
  submitTransaction,
  estimateFee,
  toStroops,
  getEvents,
  getUpdates,
  getTopDonors,
  getTotalCampaigns,
  getPlatformConfig,
  getSACBalance,
  getAccountMinimumReserve,
  getDonorContribution,
  resolveAddressName,
  Campaign,
  CampaignBeneficiary,
  SorobanEvent,
  SubmitTransactionResult,
} from "@/lib/soroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useWallet } from "@/lib/WalletProvider";
import { toRawAmount } from "@/utils/format";
import { NO_IMAGE_METADATA_URI } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Selector Memoization & Referential Stability Utilities
// ---------------------------------------------------------------------------

export interface SorobanQueryOptions<TData, TQueryData> {
  select?: (data: TQueryData) => TData;
  enabled?: boolean;
  staleTime?: number;
}

export function parseQueryOptions<TData, TQueryData>(
  optionsOrSelect?: ((data: TQueryData) => TData) | SorobanQueryOptions<TData, TQueryData>,
): SorobanQueryOptions<TData, TQueryData> {
  if (typeof optionsOrSelect === "function") {
    return { select: optionsOrSelect };
  }
  return optionsOrSelect || {};
}

/**
 * Performs a shallow element-wise equality check between two arrays.
 * Returns true if both arrays contain referentially identical elements in the same order.
 */
export function areArraysShallowEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Creates a memoized selector function that caches its last input and output.
 * If a new invocation yields an output array that is shallowly equal to the previous result,
 * the previous output array reference is returned.
 *
 * This ensures React Query's select function produces referentially stable results,
 * preventing unnecessary component re-renders when data has not functionally changed.
 */
export function createMemoizedSelector<TInput, TItem>(
  selectorFn: (input: TInput) => TItem[],
): (input: TInput) => TItem[] {
  let lastInput: TInput | undefined;
  let lastResult: TItem[] | undefined;

  return (input: TInput): TItem[] => {
    if (input === lastInput && lastResult !== undefined) {
      return lastResult;
    }
    const nextResult = selectorFn(input);
    if (lastResult !== undefined && areArraysShallowEqual(lastResult, nextResult)) {
      return lastResult;
    }
    lastInput = input;
    lastResult = nextResult;
    return nextResult;
  };
}

// ---------------------------------------------------------------------------
// Pure Memoized Campaign Selectors & Filters
// ---------------------------------------------------------------------------

export type CampaignSortKey = "newest" | "ending-soon" | "near-goal" | "most-raised" | "oldest";

export interface CampaignFilterOptions {
  category?: string;
  status?: string;
  creator?: string;
  beneficiary?: string;
  searchTerm?: string;
  sortBy?: CampaignSortKey;
}

/**
 * Pure selector that filters active campaigns.
 */
export const selectActiveCampaigns = createMemoizedSelector((campaigns: Campaign[]): Campaign[] => {
  return campaigns.filter((c) => c.status === "Active");
});

/**
 * Returns a referentially stable selector for campaigns belonging to a specific creator/user.
 */
const userCampaignsCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();

export function getSelectUserCampaigns(
  address: string | null,
): (campaigns: Campaign[]) => Campaign[] {
  const key = (address ?? "__null__").toLowerCase();
  let selector = userCampaignsCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]) => {
      if (!address) return [];
      return campaigns.filter((c) => c.creator.toLowerCase() === address.toLowerCase());
    });
    userCampaignsCache.set(key, selector);
  }
  return selector;
}

/**
 * Returns a referentially stable selector for campaigns in a category.
 */
const categoryCampaignsCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();

export function getSelectCampaignsByCategory(
  category: string,
): (campaigns: Campaign[]) => Campaign[] {
  const key = category.toLowerCase().trim();
  let selector = categoryCampaignsCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]) => {
      if (!key || key === "all") return campaigns;
      return campaigns.filter((c) => c.category.toLowerCase() === key);
    });
    categoryCampaignsCache.set(key, selector);
  }
  return selector;
}

/**
 * Sorts an array of campaigns given a sort key.
 */
export function sortCampaignsList(campaigns: Campaign[], sortBy?: CampaignSortKey): Campaign[] {
  if (!sortBy) return campaigns;
  const sorted = [...campaigns];
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => Number(b.deadline) - Number(a.deadline));
    case "oldest":
      return sorted.sort((a, b) => Number(a.deadline) - Number(b.deadline));
    case "ending-soon":
      return sorted.sort((a, b) => Number(a.deadline) - Number(b.deadline));
    case "near-goal": {
      const progress = (c: Campaign) =>
        c.target_amount === 0n ? 0 : Number((c.raised_amount * 10_000n) / c.target_amount);
      return sorted.sort((a, b) => progress(b) - progress(a));
    }
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
    default:
      return sorted;
  }
}

/**
 * Returns a referentially stable selector based on filter and sort parameters.
 */
const filterSortCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();

export function getSelectFilteredAndSortedCampaigns(
  options: CampaignFilterOptions,
): (campaigns: Campaign[]) => Campaign[] {
  const key = JSON.stringify({
    category: (options.category ?? "").toLowerCase().trim(),
    status: (options.status ?? "").toLowerCase().trim(),
    creator: (options.creator ?? "").toLowerCase().trim(),
    beneficiary: (options.beneficiary ?? "").toLowerCase().trim(),
    searchTerm: (options.searchTerm ?? "").toLowerCase().trim(),
    sortBy: options.sortBy ?? "",
  });

  let selector = filterSortCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]): Campaign[] => {
      let result = campaigns;

      const category = (options.category ?? "").toLowerCase().trim();
      if (category && category !== "all") {
        result = result.filter((c) => c.category.toLowerCase() === category);
      }

      const status = (options.status ?? "").toLowerCase().trim();
      if (status && status !== "all") {
        result = result.filter((c) => c.status.toLowerCase() === status);
      }

      const creator = (options.creator ?? "").toLowerCase().trim();
      if (creator) {
        result = result.filter((c) => c.creator.toLowerCase() === creator);
      }

      const beneficiary = (options.beneficiary ?? "").toLowerCase().trim();
      if (beneficiary) {
        result = result.filter((c) => c.beneficiary.toLowerCase() === beneficiary);
      }

      const term = (options.searchTerm ?? "").toLowerCase().trim();
      if (term) {
        result = result.filter(
          (c) =>
            c.title.toLowerCase().includes(term) ||
            c.description.toLowerCase().includes(term) ||
            c.category.toLowerCase().includes(term) ||
            c.creator.toLowerCase().includes(term) ||
            c.beneficiary.toLowerCase().includes(term),
        );
      }

      return sortCampaignsList(result, options.sortBy);
    });
    filterSortCache.set(key, selector);
  }
  return selector;
}

// ---------------------------------------------------------------------------
// Primary Query Hooks with Select & Option Support
// ---------------------------------------------------------------------------

export function useCampaign<TData = Campaign>(
  id: bigint,
  optionsOrSelect?: ((data: Campaign) => TData) | SorobanQueryOptions<TData, Campaign>,
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaign", id.toString()],
    queryFn: async () => (await loadSoroban()).getCampaign(id),
    staleTime: opts.staleTime ?? 30_000,
    enabled: opts.enabled,
    select: opts.select,
  });
}

export function useRecentCampaigns<TData = Campaign[]>(
  optionsOrSelect?: ((data: Campaign[]) => TData) | SorobanQueryOptions<TData, Campaign[]>,
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaigns", "recent"],
    queryFn: async () => (await loadSoroban()).getRecentCampaigns(),
    staleTime: opts.staleTime ?? 30_000,
    enabled: opts.enabled,
    select: opts.select,
  });
}

export function useCampaignsPaged<TData = { campaigns: Campaign[]; hasMore: boolean }>(
  limit: number,
  optionsOrSelect?:
    | ((data: { campaigns: Campaign[]; hasMore: boolean }) => TData)
    | SorobanQueryOptions<TData, { campaigns: Campaign[]; hasMore: boolean }>,
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaigns", "paged", limit],
    queryFn: async () => (await loadSoroban()).getCampaignsPage(limit),
    placeholderData: (prev) => prev,
    staleTime: opts.staleTime ?? 30_000,
    enabled: opts.enabled,
    select: opts.select,
  });
}

// ---------------------------------------------------------------------------
// Derived Hooks with Stable Selectors
// ---------------------------------------------------------------------------

/**
 * Selects campaigns created by a specific address, memoized against stable inputs.
 */
export function useUserCampaigns(address: string | null) {
  const selector = useMemo(() => getSelectUserCampaigns(address), [address]);
  return useRecentCampaigns(selector);
}

/**
 * Selects only active campaigns using referentially stable selector.
 */
export function useActiveCampaigns() {
  return useRecentCampaigns(selectActiveCampaigns);
}

/**
 * Selects campaigns by category using referentially stable selector.
 */
export function useCampaignsByCategory(category: string) {
  const selector = useMemo(() => getSelectCampaignsByCategory(category), [category]);
  return useRecentCampaigns(selector);
}

/**
 * Selects filtered and sorted campaigns using referentially stable selectors.
 */
export function useFilteredCampaigns(options: CampaignFilterOptions) {
  const selector = useMemo(
    () => getSelectFilteredAndSortedCampaigns(options),
    [
      options.category,
      options.status,
      options.creator,
      options.beneficiary,
      options.searchTerm,
      options.sortBy,
    ],
  );
  return useRecentCampaigns(selector);
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

export function mapTransactionError(error: unknown): string {
  switch (getContractErrorCode(error)) {
    case CONTRACT_ERROR_CODES.ExceedsDonorCap:
      return EXCEEDS_DONOR_CAP_MESSAGE;
    case CONTRACT_ERROR_CODES.InvalidShares:
      return INVALID_SHARES_MESSAGE;
  }
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
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
      /**
       * Full payout split with basis-point shares (10000 = 100%). When omitted,
       * `beneficiary` receives the whole amount.
       */
      beneficiaries?: CampaignBeneficiary[];
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
      const { Address, nativeToScVal, xdr } = await loadSdk();
      const { submitTransaction } = await loadSoroban();
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
      const beneficiaries =
        params.beneficiaries && params.beneficiaries.length > 0
          ? params.beneficiaries
          : [{ address: params.beneficiary, share: TOTAL_SHARE_BPS }];
      const beneficiariesError = validateBeneficiaries(beneficiaries);
      if (beneficiariesError) throw new Error(beneficiariesError);

      // The contract's beneficiaries argument is Vec<(Address, u32)>: one
      // [Address, basis-point share] tuple per beneficiary.
      const beneficiariesVec = xdr.ScVal.scvVec(
        beneficiaries.map((b) =>
          xdr.ScVal.scvVec([
            new Address(b.address).toScVal(),
            nativeToScVal(b.share, { type: "u32" }),
          ]),
        ),
      );

      const args = [
        new Address(address).toScVal(), // 1. creator: Address
        beneficiariesVec, // 2. beneficiaries: Vec<(Address, u32)>
        nativeToScVal(params.title, { type: "string" }), // 3. title: String
        nativeToScVal(params.description, { type: "string" }), // 4. description: String
        nativeToScVal(params.metadataUri || NO_IMAGE_METADATA_URI, { type: "string" }), // 5. metadata_uri: String
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
    onSuccess: (data: SubmitTransactionResult, _variables, context) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error: unknown, _variables, context) => {
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
      /** Optional dedication, passed to the contract's `comment: Option<String>` argument. */
      message?: string;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      const { Address, nativeToScVal } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

      const args = [
        new Address(address).toScVal(),
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(toRawAmount(params.amount, params.decimals), { type: "i128" }),
        nativeToScVal(params.isAnonymous, { type: "bool" }),
        ...(params.message ? [nativeToScVal(params.message, { type: "string" })] : []),
      ];

      return submitTransaction(address, "donate", args);
    },
    onMutate: async (variables: {
      campaignId: bigint;
      amount: string;
      isAnonymous: boolean;
      decimals: number;
      message?: string;
    }) => {
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
        (old) => {
          if (!old) return old;
          const newCampaigns =
            old.campaigns?.map((c) =>
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
    onSuccess: (data: SubmitTransactionResult, variables, context) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({
        queryKey: ["campaign", variables.campaignId.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["top-donors", variables.campaignId.toString()] });
    },
    onError: (error: unknown, variables, context) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData(
          ["campaign", variables.campaignId.toString()],
          context.previousCampaign,
        );
      }
      if (context?.previousCampaignsQueries) {
        context.previousCampaignsQueries.forEach(([queryKey, previousData]) => {
          queryClient.setQueryData(queryKey, previousData);
        });
      }
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        queryClient.invalidateQueries({ queryKey: ["campaign", variables.campaignId.toString()] });
      }
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
      const { Address, nativeToScVal } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "claim_funds", args);
    },
    onMutate: () => {
      const toastId = notify.loading();
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, campaignId, context) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: unknown, _variables, context) => {
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
      const { Address, nativeToScVal } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "claim_refund", args);
    },
    onMutate: () => {
      const toastId = notify.loading("Claiming refund...");
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, campaignId, context) => {
      notify.success("Refund claimed successfully", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["refund-eligibility", campaignId.toString()] });
    },
    onError: (_error: unknown, _variables, context) => {
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
      const { Address, nativeToScVal } = await loadSdk();
      const { estimateFee } = await loadSoroban();
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

/**
 * Campaign counts plus the amount raised per accepted token. Campaigns can
 * accept different tokens with different decimals, so raised amounts are kept
 * per token contract id (as decimal strings, since the query cache is persisted
 * as JSON) and never summed into one figure.
 */
export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const { getTotalCampaigns, getRecentCampaigns } = await loadSoroban();
      const totalCampaigns = await getTotalCampaigns();
      const raised = new Map<string, bigint>();
      let activeCampaigns = 0;
      if (totalCampaigns > 0n) {
        const campaigns = await getRecentCampaigns(Number(totalCampaigns));
        for (const c of campaigns) {
          raised.set(c.accepted_token, (raised.get(c.accepted_token) ?? 0n) + c.raised_amount);
          if (c.status === "Active") activeCampaigns++;
        }
      }
      const raisedByToken: Record<string, string> = Object.fromEntries(
        Array.from(raised, ([token, amount]) => [token, amount.toString()]),
      );
      return { totalCampaigns, raisedByToken, activeCampaigns };
    },
    staleTime: 60_000,
  });
}

/**
 * Counts the distinct donor addresses across the given donation events.
 *
 * Anonymous donations all share the zero address on-chain and are dropped, so
 * they count as no donor at all rather than as one distinct placeholder.
 *
 * Exported so the pure aggregation can be exercised without the RPC, and so the
 * counting query below only has to wire it up.
 */
export function countUniqueDonors(events: readonly unknown[] | undefined): number {
  const donors = new Set<string>();

  for (const event of events ?? []) {
    const donation = parseDonationEvent(event);
    if (donation?.donor) donors.add(donation.donor);
  }

  return donors.size;
}

/** Query key shared by every consumer of the full event history scan. */
export const EVENT_HISTORY_QUERY_KEY = ["events", "history"] as const;

/**
 * Every contract event the RPC still retains (cursor-paged, not capped at one
 * page), plus the period it covers. Shared by the leaderboard and the donor
 * count so the scan runs once.
 */
export function useEventHistory<TData = EventHistory>(select?: (data: EventHistory) => TData) {
  return useQuery({
    queryKey: EVENT_HISTORY_QUERY_KEY,
    queryFn: async () => (await loadSoroban()).getEventHistory(),
    select,
    staleTime: 60_000,
  });
}

const selectUniqueDonors = (history: EventHistory) => countUniqueDonors(history.events);

/**
 * Distinct donors across the retained event history.
 *
 * Kept apart from `usePlatformStats` on purpose: it reads a different RPC
 * resource (the event feed rather than the campaign list), and an unreachable
 * event feed shouldn't be able to take the campaign totals down with it.
 *
 * RPC event retention is a rolling window (about a week), so this is the
 * number of donors since `EventHistory.windowStart`, not an all-time total.
 * No polling, like the campaign stats: this is hero copy, not a live feed.
 */
export function useUniqueDonors() {
  return useEventHistory(selectUniqueDonors);
}

/**
 * Admin-facing platform configuration (owner, total campaigns, fee). Unlike
 * `usePlatformStats`, failures are surfaced as a real query error rather than
 * being masked to 0 — this panel exists specifically so an admin can see
 * when a read is failing.
 */
export function usePlatformConfig() {
  return useQuery({
    queryKey: ["platform-config"],
    queryFn: async () => (await loadSoroban()).getPlatformConfig(),
    staleTime: 30_000,
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
    queryFn: async () => (await loadSoroban()).getEvents(limit),
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

/**
 * The contract's top-5 donor leaderboard for a campaign. Anonymous donations
 * are aggregated on-chain under the zero address; callers should label that
 * entry rather than link to it.
 */
export function useTopDonors(campaignId: bigint) {
  return useQuery({
    queryKey: ["top-donors", campaignId.toString()],
    queryFn: () => getTopDonors(campaignId),
    staleTime: 30_000,
  });
}

export function useGetUpdates(campaignId: bigint) {
  return useQuery({
    queryKey: ["updates", campaignId.toString()],
    queryFn: async () => (await loadSoroban()).getUpdates(campaignId),
  });
}

export function useAddUpdate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { campaignId: bigint; content: string }) => {
      if (!address) throw new Error("Wallet not connected");
      const { nativeToScVal } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

      const args = [
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(params.content, { type: "string" }),
      ];

      return submitTransaction(address, "add_update", args);
    },
    onMutate: () => {
      const toastId = notify.loading();
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, variables, context) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["updates", variables.campaignId.toString()] });
    },
    onError: (error: unknown, _variables, context) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
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
      const { Address, nativeToScVal } = await loadSdk();
      const { estimateFee } = await loadSoroban();
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
      const { Address, nativeToScVal } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

      const args = [new Address(address).toScVal(), nativeToScVal(campaignId, { type: "u64" })];

      return submitTransaction(address, "cancel_campaign", args);
    },
    onMutate: () => {
      const toastId = notify.loading("Cancelling campaign...");
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, campaignId, context) => {
      notify.success("Campaign cancelled", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: unknown, _variables, context) => {
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
      const { Address, nativeToScVal, xdr } = await loadSdk();
      const { submitTransaction } = await loadSoroban();

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
    onSuccess: (data: SubmitTransactionResult, variables, context) => {
      notify.success("Address whitelisted", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({
        queryKey: ["campaign", variables.campaignId.toString()],
      });
    },
    onError: (error: unknown, _variables, context) => {
      const mappedError = mapTransactionError(error);
      notify.error(mappedError, { id: context?.toastId });
    },
  });
}

function usePauseToggle(method: "pause" | "unpause", pending: string, done: string) {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_: void) => {
      if (!address) throw new Error("Wallet not connected");
      const { submitTransaction } = await loadSoroban();
      return submitTransaction(address, method, []);
    },
    onMutate: () => {
      const toastId = notify.loading(pending);
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, _variables: void, context) => {
      notify.success(done, { id: context?.toastId, hash: data?.hash });
      queryClient.invalidateQueries({ queryKey: ["platform-config"] });
    },
    onError: (error: unknown, _variables: void, context) => {
      notify.error(mapTransactionError(error), { id: context?.toastId });
    },
  });
}

/** Admin-only: pauses all state-mutating contract calls. */
export function usePauseContract() {
  return usePauseToggle("pause", "Pausing contract...", "Contract paused");
}

/** Admin-only: resumes state-mutating contract calls. */
export function useUnpauseContract() {
  return usePauseToggle("unpause", "Unpausing contract...", "Contract unpaused");
}

/**
 * Owner-only: transfers contract ownership via `set_owner`. The contract checks
 * the current owner's auth; callers validate the new address before signing.
 * Platform config is refetched on success so the panel shows the new owner
 * (and the transfer form disappears for the old one).
 */
export function useSetOwner() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newOwner: string) => {
      if (!address) throw new Error("Wallet not connected");
      if (!isValidAccountAddress(newOwner)) throw new Error("Invalid Stellar address");
      const { Address } = await loadSdk();
      const { submitTransaction } = await loadSoroban();
      return submitTransaction(address, "set_owner", [new Address(newOwner).toScVal()]);
    },
    onMutate: () => {
      const toastId = notify.loading("Transferring ownership...");
      return { toastId };
    },
    onSuccess: (data: SubmitTransactionResult, _newOwner, context) => {
      notify.success("Ownership transferred", { id: context?.toastId, hash: data?.hash });
      queryClient.invalidateQueries({ queryKey: ["platform-config"] });
    },
    onError: (error: unknown, _newOwner, context) => {
      notify.error(mapTransactionError(error), { id: context?.toastId });
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
      return (await loadSoroban()).getSACBalance(tokenContractId, address);
    },
    enabled: !!tokenContractId && !!address,
    staleTime: 30_000,
    retry: false,
  });
}

/** XLM (stroops) the account must keep as its minimum reserve. */
export function useAccountReserve(address: string | null, enabled = true) {
  return useQuery({
    queryKey: ["account-reserve", address],
    queryFn: () => (address ? getAccountMinimumReserve(address) : null),
    enabled: enabled && !!address,
    staleTime: 30_000,
    retry: false,
  });
}

/** Amount (base units) the donor has already given to a campaign. */
export function useDonorContribution(campaignId: bigint, address: string | null, enabled = true) {
  return useQuery({
    queryKey: ["donor-contribution", campaignId.toString(), address],
    queryFn: () => (address ? getDonorContribution(campaignId, address) : null),
    enabled: enabled && !!address,
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
    queryFn: async () => (address ? (await loadSoroban()).resolveAddressName(address) : null),
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
      const { getTokenMetadata } = await loadSoroban();
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
      const { getTokenMetadata } = await loadSoroban();

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

/** Same-origin price proxy; see src/app/api/price/route.ts. */
export const XLM_PRICE_ENDPOINT = "/api/price";

/**
 * Fetches the live XLM/USD exchange rate from the app's own cached price route,
 * which queries CoinGecko (falling back to Stellar Expert) server-side. Browsers
 * never call those third parties directly. Resolves to null when no price is
 * available, so callers can simply hide USD values.
 */
export async function fetchXlmPriceInUsd(): Promise<number | null> {
  try {
    const res = await fetch(XLM_PRICE_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.usd === "number" ? data.usd : null;
  } catch {
    return null;
  }
}

/**
 * Hook to query live XLM/USD exchange rate with 5-minute cache stale time.
 */
export function useXlmPrice() {
  return useQuery({
    queryKey: ["xlm-price-usd"],
    queryFn: fetchXlmPriceInUsd,
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
    retry: 2,
  });
}
// Stable public entrypoint. Keep feature code in focused hook modules.
export * from "./campaignQueries";
export * from "./campaignMutations";
export * from "./events";
export * from "./tokens";
