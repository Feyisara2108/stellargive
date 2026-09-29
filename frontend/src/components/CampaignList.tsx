"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
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

// ---------------------------------------------------------------------------
// Layout constants — must match the Tailwind classes used in the grid.
// ---------------------------------------------------------------------------
/** Estimated card height in px. Intentionally generous to avoid clipping. */
const CARD_HEIGHT = 340;
/** gap-6 = 1.5rem = 24px */
const GRID_GAP = 24;

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

// ---------------------------------------------------------------------------
// Responsive column count — mirrors Tailwind md/lg breakpoints via matchMedia.
// ---------------------------------------------------------------------------
function useColumnCount(): number {
  const getCount = useCallback(() => {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1024px)").matches) return 3; // lg
    if (window.matchMedia("(min-width: 768px)").matches) return 2; // md
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
// Lightweight ResizeObserver hook — measures the container width so the
// virtualised list can fill it exactly without a separate AutoSizer package.
// ---------------------------------------------------------------------------
function useContainerWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Initialise synchronously so the first render has valid dimensions.
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
// Row renderer for react-window — renders up to `columnCount` cards per row.
// ---------------------------------------------------------------------------
interface RowData {
  rows: Campaign[][];
  columnCount: number;
  listWidth: number;
}

function CampaignRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const { rows, columnCount, listWidth } = data;
  const row = rows[index];
  if (!row) return null;

  const cellWidth =
    listWidth > 0
      ? (listWidth - GRID_GAP * (columnCount - 1)) / columnCount
      : 0;

  return (
    <div
      role="row"
      style={{ ...style, display: "flex", gap: GRID_GAP, paddingBottom: GRID_GAP }}
    >
      {row.map((campaign) => (
        <div
          key={campaign.id.toString()}
          role="gridcell"
          style={{ width: cellWidth, flexShrink: 0 }}
        >
          <CampaignCard campaign={campaign} />
        </div>
      ))}
      {/* Phantom cells so the last row keeps the same width as others */}
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
// Inner component — owns all state and rendering logic.
// ---------------------------------------------------------------------------
function CampaignListContent() {
  const { data: campaigns, isLoading, error } = useRecentCampaigns();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const columnCount = useColumnCount();
  const containerRef = useRef<HTMLDivElement>(null);
  const listWidth = useContainerWidth(containerRef);

  // Sync debounced search term to the URL ?q= param.
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
            campaign.beneficiary.toLowerCase().includes(term),
        );

    return sortCampaigns(filtered, sortBy);
  }, [campaigns, debouncedSearchTerm, sortBy]);

  // Chunk the flat campaign list into rows of `columnCount` items each.
  const rows = useMemo(() => {
    const chunks: Campaign[][] = [];
    for (let i = 0; i < displayedCampaigns.length; i += columnCount) {
      chunks.push(displayedCampaigns.slice(i, i + columnCount));
    }
    return chunks;
  }, [displayedCampaigns, columnCount]);

  const rowHeight = CARD_HEIGHT + GRID_GAP;
  const listHeight = rows.length * rowHeight;

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
  const totalCampaigns = campaigns?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Toolbar: sort selector + search input                             */}
      {/* ---------------------------------------------------------------- */}
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

      {/* ---------------------------------------------------------------- */}
      {/* Empty state: no campaigns exist at all                            */}
      {/* ---------------------------------------------------------------- */}
      {totalCampaigns === 0 && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div>
            <p className="font-medium text-foreground">No campaigns found</p>
            <p className="text-sm text-muted-foreground">Why not create the first one?</p>
          </div>
          <Button asChild>
            <Link href="/create">Create campaign</Link>
          </Button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* No-results state: campaigns exist but search filtered them all out */}
      {/* ---------------------------------------------------------------- */}
      {totalCampaigns > 0 && displayedCampaigns.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
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

      {/* ---------------------------------------------------------------- */}
      {/* Virtualised grid                                                  */}
      {/*                                                                   */}
      {/* role="grid" + role="row" + role="gridcell" fulfil the WAI-ARIA   */}
      {/* grid pattern so screen readers can navigate by row/column and     */}
      {/* keyboard users can Tab into each card normally.                   */}
      {/* ---------------------------------------------------------------- */}
      {displayedCampaigns.length > 0 && (
        <div
          ref={containerRef}
          role="grid"
          aria-label="Campaign list"
          aria-rowcount={rows.length}
          aria-colcount={columnCount}
          style={listWidth > 0 ? { height: listHeight } : undefined}
        >
          {/* When width is not yet measured (SSR / JSDOM), fall back to a          */}
          {/* plain CSS grid so the cards are always in the DOM for tests and      */}
          {/* first-paint. The virtualised path kicks in as soon as the            */}
          {/* ResizeObserver fires in a real browser.                              */}
          {listWidth === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedCampaigns.map((campaign) => (
                <div key={campaign.id.toString()} role="gridcell">
                  <CampaignCard campaign={campaign} />
                </div>
              ))}
            </div>
          ) : (
            <FixedSizeList
              height={listHeight}
              width={listWidth}
              itemCount={rows.length}
              itemSize={rowHeight}
              itemData={{ rows, columnCount, listWidth }}
              overscanCount={2}
              style={{ outline: "none", overflow: "visible" }}
            >
              {CampaignRow}
            </FixedSizeList>
          )}
        </div>
      )}
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
