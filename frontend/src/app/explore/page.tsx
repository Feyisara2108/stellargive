"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaignsPaged, useTokenMetadataBatch } from "@/hooks/useSoroban";
import { useCampaignSearch } from "@/hooks/useCampaignSearch";
import { TokenSelector } from "@/components/TokenSelector";
import { CategorySelector, CATEGORIES, type CategoryKey } from "@/components/CategorySelector";
import { SortSelector, SORT_OPTIONS, type SortKey } from "@/components/SortSelector";
import { Search, Compass, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { CampaignSkeletonGrid } from "@/components/CampaignSkeleton";
import type { Campaign } from "@/lib/soroban";

const PAGE_SIZE = 9;

function isCategoryKey(value: string | null): value is CategoryKey {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Mirrors CampaignCard's badge logic: a campaign with an empty or "other"
 * category is labelled "Uncategorized", so that tab must match those too.
 */
function matchesCategory(campaign: Campaign, category: CategoryKey): boolean {
  if (category === "all") return true;
  const value = (campaign.category ?? "").trim().toLowerCase();
  if (category === "uncategorized") return value === "" || value === "other";
  return value === category;
}

function sortCampaigns(campaigns: Campaign[], sortBy: SortKey): Campaign[] {
  const sorted = [...campaigns];
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => Number(b.deadline) - Number(a.deadline));
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

const EMPTY_CAMPAIGNS: Campaign[] = [];

/** Stable IDs used to wire tabs → tabpanel with aria-controls/aria-labelledby */
const STATUS_TABS = [
  { value: "all", label: "All", id: "status-tab-all", badgeStatus: "All" as const },
  { value: "active", label: "Active", id: "status-tab-active", badgeStatus: "Active" as const },
  { value: "funded", label: "Funded", id: "status-tab-funded", badgeStatus: "Funded" as const },
] as const;

const RESULTS_PANEL_ID = "campaign-results-panel";

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "funded">(() => {
    const status = searchParams.get("status");
    return status === "all" || status === "active" || status === "funded" ? status : "active";
  });
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey>(() => {
    const category = searchParams.get("category");
    return isCategoryKey(category) ? category : "all";
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const sort = searchParams.get("sort");
    return SORT_OPTIONS.some((o) => o.key === sort) ? (sort as SortKey) : "newest";
  });
  const [tokenFilter, setTokenFilter] = useState(() => searchParams.get("token") ?? "");

  /** Ref to track the last search term synced to URL to prevent hydration from clobbering active typing */
  const lastSyncedSearchRef = useRef<string>(searchParams.get("q") ?? "");

  /** Roving tabIndex refs — one entry per STATUS_TABS item */
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([null, null, null]);

  /** Arrow-key roving focus within the tablist */
  const handleTabKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    const count = STATUS_TABS.length;
    let next = -1;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = (currentIndex + 1) % count;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = (currentIndex - 1 + count) % count;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = count - 1;
    }
    if (next !== -1) {
      tabRefs.current[next]?.focus();
      setStatusFilter(STATUS_TABS[next].value);
    }
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isFetching, isError, refetch } = useCampaignsPaged(limit);
  const campaigns = data?.campaigns ?? EMPTY_CAMPAIGNS;
  const hasMore = data?.hasMore ?? false;

  // useCampaignsPaged keeps the previous page as placeholderData, so a fetch is
  // either "growing the list" (limit went up — append skeletons) or "refreshing
  // what's on screen" (same limit — dim the grid and say so).
  const [loadedLimit, setLoadedLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    if (!isFetching) setLoadedLimit(limit);
  }, [isFetching, limit]);

  const isPaginating = isFetching && limit > loadedLimit;
  const isRefreshing = isFetching && !isLoading && !isPaginating;

  // Debouncing + title/creator/category/description matching lives in the hook.
  const {
    results: searched,
    term: debouncedSearch,
    isSearching,
  } = useCampaignSearch(campaigns, searchTerm);

  const loadMore = () => setLimit((prev) => prev + PAGE_SIZE);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== lastSyncedSearchRef.current) {
      lastSyncedSearchRef.current = q;
      setSearchTerm(q);
    }

    const status = searchParams.get("status");
    if (status === "all" || status === "active" || status === "funded") {
      setStatusFilter(status);
    } else if (status === null) {
      setStatusFilter("active");
    }

    const sort = searchParams.get("sort");
    if (SORT_OPTIONS.some((o) => o.key === sort)) {
      setSortBy(sort as SortKey);
    } else if (sort === null) {
      setSortBy("newest");
    }

    const category = searchParams.get("category");
    if (isCategoryKey(category)) {
      setCategoryFilter(category);
    } else if (category === null) {
      setCategoryFilter("all");
    }

    const token = searchParams.get("token");
    if (token !== null) {
      setTokenFilter(token);
    } else if (token === null) {
      setTokenFilter("");
    }
  }, [searchParams]);

  // Progressive enhancement only — the "Load more" button below is the
  // guaranteed path (keyboard, reduced motion, and during an active search).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching && !isSearching) {
          setLimit((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetching, isSearching]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (statusFilter !== "active") {
      next.set("status", statusFilter);
    } else {
      next.delete("status");
    }

    if (sortBy !== "newest") {
      next.set("sort", sortBy);
    } else {
      next.delete("sort");
    }

    if (searchTerm.trim()) {
      next.set("q", searchTerm);
    } else {
      next.delete("q");
    }

    if (categoryFilter !== "all") {
      next.set("category", categoryFilter);
    } else {
      next.delete("category");
    }

    if (tokenFilter) {
      next.set("token", tokenFilter);
    } else {
      next.delete("token");
    }

    const query = next.toString();
    const currentQuery = searchParams.toString();
    if (query !== currentQuery) {
      lastSyncedSearchRef.current = searchTerm;
      router.replace(query ? `/explore?${query}` : "/explore", { scroll: false });
    }
  }, [router, searchParams, statusFilter, sortBy, categoryFilter, tokenFilter, searchTerm]);

  const filtered = useMemo(() => {
    const byStatus = searched.filter((campaign) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") {
        return campaign.status === "Active" && campaign.raised_amount < campaign.target_amount;
      }
      return campaign.raised_amount >= campaign.target_amount || campaign.status === "Funded";
    });

    const byToken = !tokenFilter
      ? byStatus
      : byStatus.filter((c) => c.accepted_token === tokenFilter);

    const byCategory = byToken.filter((c) => matchesCategory(c, categoryFilter));

    return sortCampaigns(byCategory, sortBy);
  }, [searched, statusFilter, sortBy, categoryFilter, tokenFilter]);

  const uniqueTokens = useMemo(() => {
    return Array.from(new Set(filtered.map((c) => c.accepted_token)));
  }, [filtered]);
  const { data: tokenMetas } = useTokenMetadataBatch(uniqueTokens);

  const emptyMessage = useMemo(() => {
    const inCategory =
      categoryFilter === "all"
        ? ""
        : categoryFilter === "uncategorized"
          ? " in Uncategorized"
          : ` in ${categoryFilter}`;

    if (debouncedSearch) {
      return `No campaigns match your search${inCategory}.`;
    }
    if (inCategory) {
      return `No campaigns${inCategory} yet. Try another category.`;
    }
    if (statusFilter === "funded") {
      return "No funded campaigns yet.";
    }
    if (statusFilter === "active") {
      return "No active campaigns right now.";
    }
    return "No campaigns found. Be the first to create one!";
  }, [debouncedSearch, statusFilter, categoryFilter]);

  const moreLabel = hasMore ? " — more available" : "";
  const countLabel = `Showing ${filtered.length} of ${campaigns.length} campaigns${moreLabel}`;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Explore Campaigns</h1>
          </div>
          <p className="text-muted-foreground">
            Discover and support active relief campaigns on the Stellar network.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <label htmlFor="explore-search" className="sr-only">
              Search campaigns
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="explore-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or creator, category, description"
              autoComplete="off"
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-auto min-w-[160px]">
            <CategorySelector value={categoryFilter} onChange={setCategoryFilter} />
          </div>
          <div className="w-full sm:w-auto min-w-[160px]">
            <TokenSelector
              value={tokenFilter}
              onChange={setTokenFilter}
              label="Token"
              allowCustom={false}
            />
          </div>
          <div className="w-full sm:w-auto min-w-[160px]">
            <SortSelector value={sortBy} onChange={setSortBy} />
          </div>
        </div>

        {/* Status filters — proper ARIA tab pattern with roving tabIndex */}
        <div
          role="tablist"
          aria-label="Campaign status filters"
          className="flex flex-wrap gap-2 items-center"
        >
          {STATUS_TABS.map((tab, i) => {
            const isSelected = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                id={tab.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                aria-selected={isSelected}
                aria-controls={RESULTS_PANEL_ID}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setStatusFilter(tab.value)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
              >
                <CampaignStatusBadge
                  status={tab.badgeStatus}
                  className={`text-sm px-4 py-1.5 transition-opacity ${
                    isSelected
                      ? "ring-2 ring-primary ring-offset-2 opacity-100"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Results panel — wired to the tablist above via id/role/aria-labelledby */}
        <div
          id={RESULTS_PANEL_ID}
          role="tabpanel"
          aria-labelledby={STATUS_TABS.find((t) => t.value === statusFilter)?.id}
          aria-live="polite"
          className="space-y-6"
          tabIndex={0}
        >
          {!isLoading && (
            <p className="text-sm text-muted-foreground" role="status">
              {countLabel}
            </p>
          )}

          {isLoading ? (
            <CampaignSkeletonGrid count={PAGE_SIZE} />
          ) : isError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center"
            >
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-semibold text-foreground">Unable to load campaigns</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  We couldn&apos;t reach the Stellar network. Check your connection and try again.
                </p>
              </div>
              <Button onClick={() => refetch()}>
                <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <div>
                <p className="font-medium text-foreground">No campaigns found</p>
                <p className="text-muted-foreground">{emptyMessage}</p>
              </div>
              {debouncedSearch ? (
                <Button variant="outline" onClick={() => setSearchTerm("")}>
                  Clear search
                </Button>
              ) : categoryFilter !== "all" ? (
                <Button variant="outline" onClick={() => setCategoryFilter("all")}>
                  Show all categories
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/create">Create the first one</Link>
                </Button>
              )}
            </div>
          ) : (
            // `relative` anchors the floating "Updating…" pill so showing it never
            // reflows the grid below.
            <div className="relative">
              {isRefreshing && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Updating...
                </div>
              )}
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${
                  isRefreshing ? "opacity-50" : "opacity-100"
                }`}
                aria-busy={isRefreshing}
              >
                {filtered.map((campaign) => (
                  <CampaignCard
                    key={campaign.id.toString()}
                    campaign={campaign}
                    preloadedTokenMeta={tokenMetas?.[campaign.accepted_token]}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {isRefreshing ? "Updating campaigns" : ""}
          </p>

          {/* Skeletons are appended only while the list is growing, so a
              background refresh never makes the page jump. */}
          {isPaginating && <CampaignSkeletonGrid count={3} />}

          {/* Explicit fallback for the IntersectionObserver above: always available,
              including while a search term is narrowing the loaded results. */}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={isFetching}>
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}

          <div ref={sentinelRef} className="h-4" aria-hidden="true" />
        </div>
      </main>
    </div>
  );
}

export default function ExplorePage() {
  // useSearchParams (used in ExploreContent) requires a Suspense boundary above it
  // so Next.js can statically render the route without bailing out of CSR.
  return (
    <Suspense>
      <ExploreContent />
    </Suspense>
  );
}
