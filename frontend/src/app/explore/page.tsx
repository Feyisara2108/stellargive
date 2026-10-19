"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useCampaignsPaged, useTokenMetadataBatch } from "@/hooks/useSoroban";
import { useCampaignSearch } from "@/hooks/useCampaignSearch";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { CategoryKey } from "@/components/CategorySelector";
import { Compass, Loader2 } from "lucide-react";
import { CampaignSkeletonGrid } from "@/components/CampaignSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Campaign } from "@/lib/soroban";
import {
  PAGE_SIZE,
  STATUS_TABS,
  RESULTS_PANEL_ID,
  matchesCategory,
  sortCampaigns,
  type ViewMode,
} from "./exploreUtils";
import { useExploreUrlState } from "./useExploreUrlState";
import { ExploreFilters } from "./ExploreFilters";
import { CampaignGridView, CampaignListView } from "./CampaignVirtualViews";
import { ExploreErrorState, SavedEmptyState } from "./ExploreResultStates";

const EMPTY_CAMPAIGNS: Campaign[] = [];

function ExploreContent() {
  const filters = useExploreUrlState();
  const {
    detailHrefSearch,
    searchTerm,
    setSearchTerm,
    statusFilter,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    tokenFilter,
    savedOnly,
    setSavedOnly,
    activeTagFilter,
  } = filters;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { bookmarks } = useBookmarks();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isFetching, isError, refetch } = useCampaignsPaged(limit);
  const campaigns = data?.campaigns ?? EMPTY_CAMPAIGNS;
  const hasMore = data?.hasMore ?? false;

  // Per-category campaign counts for the CategorySelector (#817).
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryKey, number>> = { all: campaigns.length };
    for (const c of campaigns) {
      const cat = (c.category || "uncategorized") as CategoryKey;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [campaigns]);

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

  const filtered = useMemo(() => {
    const byStatus = searched.filter((campaign) => {
      if (savedOnly) return bookmarks.includes(campaign.id.toString());
      if (statusFilter === "all") return true;
      if (statusFilter === "active") {
        return campaign.status === "Active" && campaign.raised_amount < campaign.target_amount;
      }
      return campaign.raised_amount >= campaign.target_amount || campaign.status === "Funded";
    });

    const byTag = !activeTagFilter
      ? byStatus
      : byStatus.filter(
          (c) =>
            Array.isArray(c.tags) &&
            c.tags.some((t) => t.toLowerCase() === activeTagFilter.toLowerCase()),
        );

    const byToken = !tokenFilter ? byTag : byTag.filter((c) => c.accepted_token === tokenFilter);

    const byCategory = byToken.filter((c) => matchesCategory(c, categoryFilter));

    return sortCampaigns(byCategory, sortBy);
  }, [
    searched,
    statusFilter,
    sortBy,
    categoryFilter,
    tokenFilter,
    savedOnly,
    bookmarks,
    activeTagFilter,
  ]);

  const uniqueTokens = useMemo(() => {
    return Array.from(new Set(filtered.map((c) => c.accepted_token)));
  }, [filtered]);
  const { data: tokenMetas } = useTokenMetadataBatch(uniqueTokens);

  const items = filtered.map((campaign) => ({
    campaign,
    tokenMeta: tokenMetas?.[campaign.accepted_token] ?? undefined,
    detailHrefSearch,
  }));

  // Collect all unique tags from the loaded campaigns for the tag chips row.
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      if (Array.isArray(c.tags)) c.tags.forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [campaigns]);

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

        <ExploreFilters
          filters={filters}
          categoryCounts={categoryCounts}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          bookmarkCount={bookmarks.length}
          allUniqueTags={allUniqueTags}
        />

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
            <ExploreErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 && savedOnly && bookmarks.length === 0 ? (
            <SavedEmptyState onDiscover={() => setSavedOnly(false)} />
          ) : filtered.length === 0 ? (
            <EmptyState
              message={emptyMessage}
              onClear={
                debouncedSearch || categoryFilter !== "all"
                  ? () => {
                      setSearchTerm("");
                      setCategoryFilter("all");
                    }
                  : undefined
              }
            />
          ) : (
            // `relative` anchors the floating "Updating…" pill so showing it never
            // reflows the grid below.
            <div className="relative" aria-busy={isRefreshing}>
              {isRefreshing && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Updating...
                </div>
              )}

              {viewMode === "grid" ? (
                <CampaignGridView items={items} isRefreshing={isRefreshing} />
              ) : (
                <CampaignListView items={items} isRefreshing={isRefreshing} />
              )}
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
