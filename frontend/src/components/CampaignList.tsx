"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRecentCampaigns } from "@/hooks/useSoroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignSkeletonGrid } from "@/components/CampaignSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, X } from "lucide-react";
import type { Campaign } from "@/lib/soroban";

type SortKey = "newest" | "ending-soon" | "near-goal" | "most-raised";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "ending-soon", label: "Ending Soon" },
  { key: "near-goal", label: "Near Goal" },
  { key: "most-raised", label: "Most Raised" },
];

function sortCampaigns(campaigns: Campaign[], sortBy: SortKey): Campaign[] {
  const sorted = [...campaigns];
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => Number(b.deadline) - Number(a.deadline));
    case "ending-soon":
      return sorted.sort((a, b) => Number(a.deadline) - Number(b.deadline));
    case "near-goal": {
      const progress = (c: Campaign) =>
        c.target_amount === 0n
          ? 0
          : Number((c.raised_amount * 10_000n) / c.target_amount);
      return sorted.sort((a, b) => progress(b) - progress(a));
    }
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
    default:
      return sorted;
  }
}

function CampaignListContent() {
  const { data: campaigns, isLoading, error } = useRecentCampaigns();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Keep the debounced query in the URL (?q=) so searches are shareable and
  // survive a reload. Replace (not push) to avoid polluting the history stack.
  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (debouncedSearchTerm) {
      params.set("q", debouncedSearchTerm);
    } else {
      params.delete("q");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [debouncedSearchTerm, pathname, router, searchParams]);

  const displayedCampaigns = useMemo(() => {
    const campaignList = campaigns ?? [];

    const term = debouncedSearchTerm.trim().toLowerCase();
    const filtered = !term
      ? campaignList
      : campaignList.filter(
          (campaign) =>
            campaign.title.toLowerCase().includes(term) ||
            campaign.category.toLowerCase().includes(term) ||
            campaign.creator.toLowerCase().includes(term) ||
            campaign.beneficiary.toLowerCase().includes(term)
        );

    return sortCampaigns(filtered, sortBy);
  }, [campaigns, debouncedSearchTerm, sortBy]);

  if (isLoading && !campaigns) {
    return <CampaignSkeletonGrid count={6} />;
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        Failed to load campaigns. Please ensure you are on Testnet.
      </div>
    );
  }

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Search by campaign name, category, creator, or beneficiary address.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-48">
            <label htmlFor="campaign-sort" className="sr-only">
              Sort by
            </label>
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="campaign-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <label htmlFor="campaign-search" className="sr-only">
              Search campaigns
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="campaign-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search campaigns"
              autoComplete="off"
              className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedCampaigns.map((campaign) => (
          <CampaignCard key={campaign.id.toString()} campaign={campaign} />
        ))}
        {(campaigns?.length ?? 0) === 0 && (
          <div className="col-span-full flex flex-col items-center gap-4 py-12 text-center">
            <div>
              <p className="font-medium text-foreground">No campaigns found</p>
              <p className="text-sm text-muted-foreground">
                Why not create the first one?
              </p>
            </div>
            <Button asChild>
              <Link href="/create">Create campaign</Link>
            </Button>
          </div>
        )}
        {(campaigns?.length ?? 0) > 0 && displayedCampaigns.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-4 py-12 text-center">
            <div>
              <p className="font-medium text-foreground">No campaigns match your search</p>
              <p className="text-sm text-muted-foreground">
                Try a different term or clear your search.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Clear search
              </Button>
              <Button asChild>
                <Link href="/create">Create campaign</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CampaignList() {
  // useSearchParams (used in CampaignListContent) requires a Suspense boundary
  // above it so Next.js can render the route without bailing out to full CSR.
  return (
    <Suspense fallback={<CampaignSkeletonGrid count={6} />}>
      <CampaignListContent />
    </Suspense>
  );
}
