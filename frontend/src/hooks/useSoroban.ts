import { useMemo } from "react";
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
  getPlatformConfig,
  getSACBalance,
  resolveAddressName,
  Campaign,
} from "@/lib/soroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/WalletProvider";
import { toRawAmount } from "@/utils/format";

// ---------------------------------------------------------------------------
// Selector Memoization & Referential Stability Utilities
// ---------------------------------------------------------------------------

export interface SorobanQueryOptions<TData, TQueryData> {
  select?: (data: TQueryData) => TData;
  enabled?: boolean;
  staleTime?: number;
}

export function parseQueryOptions<TData, TQueryData>(
  optionsOrSelect?: ((data: TQueryData) => TData) | SorobanQueryOptions<TData, TQueryData>
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
  selectorFn: (input: TInput) => TItem[]
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

export function getSelectUserCampaigns(address: string | null): (campaigns: Campaign[]) => Campaign[] {
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

export function getSelectCampaignsByCategory(category: string): (campaigns: Campaign[]) => Campaign[] {
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
  options: CampaignFilterOptions
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
            c.beneficiary.toLowerCase().includes(term)
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
  optionsOrSelect?: ((data: Campaign) => TData) | SorobanQueryOptions<TData, Campaign>
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaign", id.toString()],
    queryFn: () => getCampaign(id),
    staleTime: opts.staleTime ?? 30_000,
    enabled: opts.enabled,
    select: opts.select,
  });
}

export function useRecentCampaigns<TData = Campaign[]>(
  optionsOrSelect?: ((data: Campaign[]) => TData) | SorobanQueryOptions<TData, Campaign[]>
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaigns", "recent"],
    queryFn: () => getRecentCampaigns(),
    staleTime: opts.staleTime ?? 30_000,
    enabled: opts.enabled,
    select: opts.select,
  });
}

export function useCampaignsPaged<TData = { campaigns: Campaign[]; hasMore: boolean }>(
  limit: number,
  optionsOrSelect?:
    | ((data: { campaigns: Campaign[]; hasMore: boolean }) => TData)
    | SorobanQueryOptions<TData, { campaigns: Campaign[]; hasMore: boolean }>
) {
  const opts = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaigns", "paged", limit],
    queryFn: () => getCampaignsPage(limit),
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
    ]
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
      queryClient.invalidateQueries({ queryKey: ["events"] });
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
      /** Optional dedication, passed to the contract's `comment: Option<String>` argument. */
      message?: string;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const args = [
        new Address(address).toScVal(),
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(toRawAmount(params.amount, params.decimals), { type: "i128" }),
        nativeToScVal(params.isAnonymous, { type: "bool" }),
        ...(params.message ? [nativeToScVal(params.message, { type: "string" })] : []),
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
      queryClient.invalidateQueries({
        queryKey: ["campaign", variables.campaignId.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
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

/** How many contract events to scan when counting distinct donors. */
export const DONOR_SCAN_EVENT_LIMIT = 200;

/** Anonymous donations are recorded against the contract's zero placeholder. */
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Counts the distinct donor addresses across the given donation events.
 *
 * Donation payloads are positional `[campaign_id, donor, amount, raised_amount,
 * accepted_token]`, so the donor is `data[1]`. Anonymous donations all share the
 * zero address on-chain and are dropped, so they count as no donor at all rather
 * than as one distinct placeholder.
 *
 * Exported so the pure aggregation can be exercised without the RPC, and so the
 * counting query below only has to wire it up.
 */
export function countUniqueDonors(events: any[] | undefined): number {
  const donors = new Set<string>();

  for (const event of events ?? []) {
    if (event?.topic !== "received" || !event.data) continue;

    const donor = event.data[1]?.toString();
    if (!donor || donor === ZERO_ADDRESS) continue;

    donors.add(donor);
  }

  return donors.size;
}

/**
 * Distinct donors across the scanned donation events.
 *
 * Kept apart from `usePlatformStats` on purpose: it reads a different RPC
 * resource (the event feed rather than the campaign list), and an unreachable
 * event feed shouldn't be able to take the campaign totals down with it.
 *
 * `getEvents` pages from ledger 0, so the count covers the contract's first
 * `DONOR_SCAN_EVENT_LIMIT` events — the same window the leaderboard ranks
 * donors from — and is a complete total only while the contract has emitted
 * that few events. No polling, like the campaign stats: this is hero copy, not
 * a live feed.
 */
export function useUniqueDonors() {
  return useQuery({
    queryKey: ["platform-stats", "unique-donors"],
    queryFn: async () => countUniqueDonors(await getEvents(DONOR_SCAN_EVENT_LIMIT)),
    staleTime: 60_000,
  });
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
    queryFn: getPlatformConfig,
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
    onMutate: () => {
      const toastId = notify.loading();
      return { toastId };
    },
    onSuccess: (data: any, variables: any, context: any) => {
      notify.success("Transaction confirmed", {
        id: context?.toastId,
        hash: data?.hash,
      });
      queryClient.invalidateQueries({ queryKey: ["updates", variables.campaignId.toString()] });
    },
    onError: (error: any, variables: any, context: any) => {
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

/**
 * Fetches the live XLM/USD exchange rate from CoinGecko, falling back to Stellar Expert.
 */
export async function fetchXlmPriceInUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd",
      { headers: { Accept: "application/json" } },
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.stellar?.usd && typeof data.stellar.usd === "number") {
        return data.stellar.usd;
      }
    }
  } catch {
    // Fall through to secondary API
  }

  try {
    const res = await fetch("https://api.stellar.expert/explorer/directory/price?asset=XLM");
    if (res.ok) {
      const data = await res.json();
      if (data?.price && typeof data.price === "number") {
        return data.price;
      }
    }
  } catch {
    // Return null if all endpoints fail
  }

  return null;
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
