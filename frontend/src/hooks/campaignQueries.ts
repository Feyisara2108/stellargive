import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Campaign,
  getCampaign,
  getPlatformConfig,
  getRecentCampaigns,
  getTotalCampaigns,
  SorobanEvent,
} from "@/lib/soroban";

export interface SorobanQueryOptions<TData, TQueryData> {
  select?: (data: TQueryData) => TData;
  enabled?: boolean;
  staleTime?: number;
}

export function parseQueryOptions<TData, TQueryData>(
  optionsOrSelect?: ((data: TQueryData) => TData) | SorobanQueryOptions<TData, TQueryData>,
): SorobanQueryOptions<TData, TQueryData> {
  return typeof optionsOrSelect === "function"
    ? { select: optionsOrSelect }
    : optionsOrSelect || {};
}

export function areArraysShallowEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function createMemoizedSelector<TInput, TItem>(selectorFn: (input: TInput) => TItem[]) {
  let lastInput: TInput | undefined;
  let lastResult: TItem[] | undefined;
  return (input: TInput): TItem[] => {
    if (input === lastInput && lastResult !== undefined) return lastResult;
    const nextResult = selectorFn(input);
    if (lastResult !== undefined && areArraysShallowEqual(lastResult, nextResult))
      return lastResult;
    lastInput = input;
    lastResult = nextResult;
    return nextResult;
  };
}

export type CampaignSortKey = "newest" | "ending-soon" | "near-goal" | "most-raised" | "oldest";
export interface CampaignFilterOptions {
  category?: string;
  status?: string;
  creator?: string;
  beneficiary?: string;
  searchTerm?: string;
  sortBy?: CampaignSortKey;
}

export const selectActiveCampaigns = createMemoizedSelector((campaigns: Campaign[]) =>
  campaigns.filter((campaign) => campaign.status === "Active"),
);
const userCampaignsCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();
export function getSelectUserCampaigns(address: string | null) {
  const key = (address ?? "__null__").toLowerCase();
  let selector = userCampaignsCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]) =>
      address
        ? campaigns.filter((campaign) => campaign.creator.toLowerCase() === address.toLowerCase())
        : [],
    );
    userCampaignsCache.set(key, selector);
  }
  return selector;
}
const categoryCampaignsCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();
export function getSelectCampaignsByCategory(category: string) {
  const key = category.toLowerCase().trim();
  let selector = categoryCampaignsCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]) =>
      !key || key === "all"
        ? campaigns
        : campaigns.filter((campaign) => campaign.category.toLowerCase() === key),
    );
    categoryCampaignsCache.set(key, selector);
  }
  return selector;
}
export function sortCampaignsList(campaigns: Campaign[], sortBy?: CampaignSortKey): Campaign[] {
  if (!sortBy) return campaigns;
  const sorted = [...campaigns];
  const progress = (campaign: Campaign) =>
    campaign.target_amount === 0n
      ? 0
      : Number((campaign.raised_amount * 10_000n) / campaign.target_amount);
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => Number(b.deadline) - Number(a.deadline));
    case "ending-soon":
    case "oldest":
      return sorted.sort((a, b) => Number(a.deadline) - Number(b.deadline));
    case "near-goal":
      return sorted.sort((a, b) => progress(b) - progress(a));
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
  }
}
const filterSortCache = new Map<string, (campaigns: Campaign[]) => Campaign[]>();
export function getSelectFilteredAndSortedCampaigns(options: CampaignFilterOptions) {
  const normalized = Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      typeof value === "string" ? value.toLowerCase().trim() : value,
    ]),
  );
  const key = JSON.stringify(normalized);
  let selector = filterSortCache.get(key);
  if (!selector) {
    selector = createMemoizedSelector((campaigns: Campaign[]) => {
      const result = campaigns.filter((campaign) => {
        const category = normalized.category as string | undefined;
        const status = normalized.status as string | undefined;
        const term = normalized.searchTerm as string | undefined;
        return (
          (!category || category === "all" || campaign.category.toLowerCase() === category) &&
          (!status || status === "all" || campaign.status.toLowerCase() === status) &&
          (!normalized.creator || campaign.creator.toLowerCase() === normalized.creator) &&
          (!normalized.beneficiary ||
            campaign.beneficiary.toLowerCase() === normalized.beneficiary) &&
          (!term ||
            [
              campaign.title,
              campaign.description,
              campaign.category,
              campaign.creator,
              campaign.beneficiary,
            ].some((value) => value.toLowerCase().includes(term)))
        );
      });
      return sortCampaignsList(result, options.sortBy);
    });
    filterSortCache.set(key, selector);
  }
  return selector;
}

export function useCampaign<TData = Campaign>(
  id: bigint,
  optionsOrSelect?: ((data: Campaign) => TData) | SorobanQueryOptions<TData, Campaign>,
) {
  const options = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaign", id.toString()],
    queryFn: () => getCampaign(id),
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled,
    select: options.select,
  });
}
export function useRecentCampaigns<TData = Campaign[]>(
  optionsOrSelect?: ((data: Campaign[]) => TData) | SorobanQueryOptions<TData, Campaign[]>,
) {
  const options = parseQueryOptions(optionsOrSelect);
  return useQuery({
    queryKey: ["campaigns", "recent"],
    queryFn: () => getRecentCampaigns(),
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled,
    select: options.select,
  });
}
export function useUserCampaigns(address: string | null) {
  return useRecentCampaigns(useMemo(() => getSelectUserCampaigns(address), [address]));
}
export function useActiveCampaigns() {
  return useRecentCampaigns(selectActiveCampaigns);
}
export function useCampaignsByCategory(category: string) {
  return useRecentCampaigns(useMemo(() => getSelectCampaignsByCategory(category), [category]));
}
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
export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const totalCampaigns = await getTotalCampaigns();
      let totalRaised = 0n;
      let activeCampaigns = 0;
      if (totalCampaigns > 0n)
        for (const campaign of await getRecentCampaigns(Number(totalCampaigns))) {
          totalRaised += campaign.raised_amount;
          if (campaign.status === "Active") activeCampaigns++;
        }
      return { totalCampaigns, totalRaised: totalRaised.toString(), activeCampaigns };
    },
    staleTime: 60_000,
  });
}
export function usePlatformConfig() {
  return useQuery({ queryKey: ["platform-config"], queryFn: getPlatformConfig, staleTime: 30_000 });
}
