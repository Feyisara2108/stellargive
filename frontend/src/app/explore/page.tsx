"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaignsPaged, useTokenMetadataBatch } from "@/hooks/useSoroban";
import { useCampaignSearch } from "@/hooks/useCampaignSearch";
import { useBookmarks } from "@/hooks/useBookmarks";
import { TokenSelector } from "@/components/TokenSelector";
import { CategorySelector, CATEGORIES, type CategoryKey } from "@/components/CategorySelector";
import { SortSelector, SORT_OPTIONS, type SortKey } from "@/components/SortSelector";
import { Search, Compass, Loader2, AlertTriangle, RotateCw, LayoutGrid, List, Bookmark, Tag } from "lucide-react";
import { CampaignSkeletonGrid } from "@/components/CampaignSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Campaign } from "@/lib/soroban";

// ---------------------------------------------------------------------------
// Virtualisation constants
// ---------------------------------------------------------------------------
/** Estimated card height (grid mode). Generous to avoid clipping. */
const GRID_CARD_HEIGHT = 340;
/** Estimated row height (list mode). */
const LIST_CARD_HEIGHT = 160;
/** gap-6 = 1.5rem = 24px */
const GRID_GAP = 24;

// ---------------------------------------------------------------------------
// Responsive column count — mirrors Tailwind md/lg breakpoints.
// ---------------------------------------------------------------------------
function useColumnCount(): number {
  const getCount = useCallback(() => {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1024px)").matches) return 3;
    if (window.matchMedia("(min-width: 768px)").matches) return 2;
    return 1;
  }, []);

  const [columns, setColumns] = useState(getCount);

  useEffect(() => {
    const mdMq = window.matchMedia("(min-width: 768px)");
    const lgMq = window.matchMedia("(min-width: 1024px)");
    const update = () => setColumns(getCount());
    mdMq.addEventListener("change", update);
    lgMq.addEventListener("change", update);
    return () => {
      mdMq.removeEventListener("change", update);
      lgMq.removeEventListener("change", update);
    };
  }, [getCount]);

  return columns;
}

// ---------------------------------------------------------------------------
// ResizeObserver-based width measurement — avoids adding AutoSizer as a dep.
// ---------------------------------------------------------------------------
function useContainerWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

// ---------------------------------------------------------------------------
// Grid row renderer — up to `columnCount` cards per row.
// ---------------------------------------------------------------------------
interface GridRowData {
  rows: { campaign: Campaign; tokenMeta: any; detailHrefSearch: string }[][];
  columnCount: number;
  listWidth: number;
  isRefreshing: boolean;
}

function GridRow({ index, style, data }: ListChildComponentProps<GridRowData>) {
  const { rows, columnCount, listWidth, isRefreshing } = data;
  const row = rows[index];
  if (!row) return null;

  const cellWidth =
    listWidth > 0 ? (listWidth - GRID_GAP * (columnCount - 1)) / columnCount : 0;

  return (
    <div
      role="row"
      style={{ ...style, display: "flex", gap: GRID_GAP, paddingBottom: GRID_GAP }}
    >
      {row.map(({ campaign, tokenMeta, detailHrefSearch }) => (
        <div
          key={campaign.id.toString()}
          role="gridcell"
          style={{
            width: cellWidth,
            flexShrink: 0,
            opacity: isRefreshing ? 0.5 : 1,
            transition: "opacity 200ms",
          }}
        >
          <CampaignCard
            campaign={campaign}
            preloadedTokenMeta={tokenMeta}
            detailHrefSearch={detailHrefSearch}
          />
        </div>
      ))}
      {Array.from({ length: columnCount - row.length }).map((_, i) => (
        <div
          key={`phantom-${i}`}
          role="presentation"
          aria-hidden="true"
          style={{ width: cellWidth, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row renderer — single card per row.
// ---------------------------------------------------------------------------
interface ListRowData {
  campaigns: { campaign: Campaign; tokenMeta: any; detailHrefSearch: string }[];
  isRefreshing: boolean;
}

function ListRow({ index, style, data }: ListChildComponentProps<ListRowData>) {
  const { campaigns, isRefreshing } = data;
  const item = campaigns[index];
  if (!item) return null;
  return (
    <div
      role="row"
      style={{
        ...style,
        paddingBottom: GRID_GAP,
        opacity: isRefreshing ? 0.5 : 1,
        transition: "opacity 200ms",
      }}
    >
      <div role="gridcell">
        <CampaignCard
          campaign={item.campaign}
          preloadedTokenMeta={item.tokenMeta}
          detailHrefSearch={item.detailHrefSearch}
        />
      </div>
    </div>
  );
}

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
    case "most-funded":
    case "near-goal": {
      const progress = (c: Campaign) =>
        c.target_amount === 0n ? 0 : Number((c.raised_amount * 10_000n) / c.target_amount);
      return sorted.sort((a, b) => progress(b) - progress(a));
    }
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
    case "trending": {
      const now = Date.now() / 1000;
      const trendingScore = (c: Campaign) => {
        const progress = c.target_amount === 0n ? 0 : Number(c.raised_amount) / Number(c.target_amount);
        const daysLeft = Math.max((Number(c.deadline) - now) / 86400, 0.1);
        return progress / daysLeft;
      };
      return sorted.sort((a, b) => trendingScore(b) - trendingScore(a));
    }
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
  const columnCount = useColumnCount();
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const detailHrefSearch = searchParams.toString();
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
  const [savedOnly, setSavedOnly] = useState(() => searchParams.get("saved") === "1");
  const { bookmarks } = useBookmarks();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTagFilter, setActiveTagFilter] = useState<string>(
    () => searchParams.get("tag") ?? "",
  );

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

    setSavedOnly(searchParams.get("saved") === "1");

    const tag = searchParams.get("tag");
    setActiveTagFilter(tag ?? "");

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

    if (savedOnly) {
      next.set("saved", "1");
    } else {
      next.delete("saved");
    }

    if (activeTagFilter) {
      next.set("tag", activeTagFilter);
    } else {
      next.delete("tag");
    }

    const query = next.toString();
    const currentQuery = searchParams.toString();
    if (query !== currentQuery) {
      lastSyncedSearchRef.current = searchTerm;
      router.replace(query ? `/explore?${query}` : "/explore", { scroll: false });
    }
  }, [router, searchParams, statusFilter, sortBy, categoryFilter, tokenFilter, searchTerm, savedOnly, activeTagFilter]);


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

    const byToken = !tokenFilter
      ? byTag
      : byTag.filter((c) => c.accepted_token === tokenFilter);

    const byCategory = byToken.filter((c) => matchesCategory(c, categoryFilter));

    return sortCampaigns(byCategory, sortBy);
  }, [searched, statusFilter, sortBy, categoryFilter, tokenFilter, savedOnly, bookmarks, activeTagFilter]);

  const uniqueTokens = useMemo(() => {
    return Array.from(new Set(filtered.map((c) => c.accepted_token)));
  }, [filtered]);
  const { data: tokenMetas } = useTokenMetadataBatch(uniqueTokens);

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
            <CategorySelector
              value={categoryFilter}
              onChange={setCategoryFilter}
              counts={categoryCounts}
            />
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
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setSavedOnly((v) => !v)}
            aria-pressed={savedOnly}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              savedOnly
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark
              className="h-4 w-4"
              fill={savedOnly ? "currentColor" : "none"}
              aria-hidden="true"
            />
            Saved{bookmarks.length > 0 ? ` (${bookmarks.length})` : ""}
          </button>
        </div>

        {/* Tag filter chips (#848) — only shown when campaigns carry tags */}
        {allUniqueTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" aria-hidden="true" /> Tags:
            </span>
            {activeTagFilter && (
              <button
                type="button"
                onClick={() => setActiveTagFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                aria-label="Clear tag filter"
              >
                Clear: #{activeTagFilter} ×
              </button>
            )}
            {allUniqueTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTagFilter((prev) => (prev === tag ? "" : tag))}
                aria-pressed={activeTagFilter === tag}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeTagFilter === tag
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                }`}
              >
                <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                #{tag}
              </button>
            ))}
          </div>
        )}

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
                className="focus:outline-none focus-visible:outline-none ring-offset-background focus:ring-2 focus:ring-primary focus:ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded transition-all"
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
          ) : filtered.length === 0 && savedOnly && bookmarks.length === 0 ? (
            <div
              data-testid="saved-empty-state"
              className="flex flex-col items-center gap-4 py-20 text-center"
            >
              <div className="rounded-full bg-muted p-6">
                <Bookmark className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-foreground text-lg">No saved campaigns yet</p>
                <p className="text-muted-foreground text-sm max-w-sm mt-1">
                  Tap the bookmark icon on any campaign to save it here for later.
                </p>
              </div>
              <Button onClick={() => setSavedOnly(false)}>Discover campaigns</Button>
            </div>
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

              {/* -------------------------------------------------------- */}
              {/* Virtualised grid view                                      */}
              {/* role="grid" + role="row" + role="gridcell" preserve the    */}
              {/* WAI-ARIA grid pattern for screen-reader and keyboard nav.  */}
              {/* -------------------------------------------------------- */}
              {viewMode === "grid" && (() => {
                // Build row chunks here so the closure captures `filtered`
                // and `columnCount` reactively.
                const items = filtered.map((campaign) => ({
                  campaign,
                  tokenMeta: tokenMetas?.[campaign.accepted_token],
                  detailHrefSearch,
                }));
                const gridRows: typeof items[] = [];
                for (let i = 0; i < items.length; i += columnCount) {
                  gridRows.push(items.slice(i, i + columnCount));
                }
                const rowH = GRID_CARD_HEIGHT + GRID_GAP;
                const totalH = gridRows.length * rowH;
                return (
                  <GridVirtualContainer
                    containerRef={gridContainerRef}
                    totalHeight={totalH}
                    rows={gridRows}
                    columnCount={columnCount}
                    rowHeight={rowH}
                    isRefreshing={isRefreshing}
                  />
                );
              })()}

              {/* -------------------------------------------------------- */}
              {/* Virtualised list view                                      */}
              {/* -------------------------------------------------------- */}
              {viewMode === "list" && (() => {
                const items = filtered.map((campaign) => ({
                  campaign,
                  tokenMeta: tokenMetas?.[campaign.accepted_token],
                  detailHrefSearch,
                }));
                const rowH = LIST_CARD_HEIGHT + GRID_GAP;
                const totalH = items.length * rowH;
                return (
                  <ListVirtualContainer
                    containerRef={listContainerRef}
                    totalHeight={totalH}
                    items={items}
                    rowHeight={rowH}
                    isRefreshing={isRefreshing}
                  />
                );
              })()}
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

// ---------------------------------------------------------------------------
// Container wrappers — measure their own width then hand it to FixedSizeList.
// ---------------------------------------------------------------------------
interface GridVirtualContainerProps {
  containerRef: React.RefObject<HTMLDivElement>;
  totalHeight: number;
  rows: { campaign: Campaign; tokenMeta: any; detailHrefSearch: string }[][];
  columnCount: number;
  rowHeight: number;
  isRefreshing: boolean;
}

function GridVirtualContainer({
  containerRef,
  totalHeight,
  rows,
  columnCount,
  rowHeight,
  isRefreshing,
}: GridVirtualContainerProps) {
  const listWidth = useContainerWidth(containerRef);

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Campaign grid"
      aria-rowcount={rows.length}
      aria-colcount={columnCount}
      style={listWidth > 0 ? { height: totalHeight } : undefined}
    >
      {/* JSDOM / SSR fallback — flat grid until the ResizeObserver fires. */}
      {listWidth === 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          style={{ opacity: isRefreshing ? 0.5 : 1, transition: "opacity 200ms" }}
        >
          {rows.flat().map(({ campaign, tokenMeta, detailHrefSearch }) => (
            <div key={campaign.id.toString()} role="gridcell">
              <CampaignCard
                campaign={campaign}
                preloadedTokenMeta={tokenMeta}
                detailHrefSearch={detailHrefSearch}
              />
            </div>
          ))}
        </div>
      ) : (
        <FixedSizeList
          height={totalHeight}
          width={listWidth}
          itemCount={rows.length}
          itemSize={rowHeight}
          itemData={{ rows, columnCount, listWidth, isRefreshing }}
          overscanCount={2}
          style={{ outline: "none", overflow: "visible" }}
        >
          {GridRow}
        </FixedSizeList>
      )}
    </div>
  );
}

interface ListVirtualContainerProps {
  containerRef: React.RefObject<HTMLDivElement>;
  totalHeight: number;
  items: { campaign: Campaign; tokenMeta: any; detailHrefSearch: string }[];
  rowHeight: number;
  isRefreshing: boolean;
}

function ListVirtualContainer({
  containerRef,
  totalHeight,
  items,
  rowHeight,
  isRefreshing,
}: ListVirtualContainerProps) {
  const listWidth = useContainerWidth(containerRef);

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Campaign list"
      aria-rowcount={items.length}
      aria-colcount={1}
      style={listWidth > 0 ? { height: totalHeight } : undefined}
    >
      {/* JSDOM / SSR fallback — flat list until the ResizeObserver fires. */}
      {listWidth === 0 ? (
        <div
          className="flex flex-col gap-4"
          style={{ opacity: isRefreshing ? 0.5 : 1, transition: "opacity 200ms" }}
        >
          {items.map(({ campaign, tokenMeta, detailHrefSearch }) => (
            <div key={campaign.id.toString()} role="gridcell">
              <CampaignCard
                campaign={campaign}
                preloadedTokenMeta={tokenMeta}
                detailHrefSearch={detailHrefSearch}
              />
            </div>
          ))}
        </div>
      ) : (
        <FixedSizeList
          height={totalHeight}
          width={listWidth}
          itemCount={items.length}
          itemSize={rowHeight}
          itemData={{ campaigns: items, isRefreshing }}
          overscanCount={3}
          style={{ outline: "none", overflow: "visible" }}
        >
          {ListRow}
        </FixedSizeList>
      )}
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

