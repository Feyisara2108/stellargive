"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/hooks/useSoroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Activity, Loader2, AlertTriangle, RotateCw, Search, X } from "lucide-react";
import { getCampaignId, getEventField } from "@/lib/eventData";
import { normalizeAddress } from "@/utils/format";
import dynamic from "next/dynamic";

const HISTORY_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

type FilterKey = "all" | "created" | "received" | "claimed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "received", label: "Donated" },
  { key: "claimed", label: "Claimed" },
];

/** True when the event's donor/beneficiary address or campaign id contains `query`. */
function eventMatchesSearch(event: any, query: string): boolean {
  if (!query) return true;
  const campaignId = getCampaignId(event);
  if (campaignId && campaignId.includes(query)) return true;
  const participant = normalizeAddress(getEventField(event, 1));
  if (participant && participant.toLowerCase().includes(query)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Code-split: the table + card renderers are the heaviest part of this route.
// They pull in AddressLink, RelativeTime, ErrorBoundary, Card, and all the
// lucide icons used only here. Splitting them shaves those modules from the
// initial JS bundle; the fallback skeleton matches the table's min-height so
// there is no layout shift.
// ---------------------------------------------------------------------------

const ActivityFeed = dynamic(() => import("./ActivityFeed").then((mod) => mod.ActivityFeed), {
  ssr: false,
  loading: () => <ActivityFeedSkeleton />,
});

function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading activity feed">
      {/* Desktop table skeleton — hidden on mobile to mirror the real layout */}
      <div className="hidden md:block">
        <Skeleton className="h-10 w-full rounded-t-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full mt-px" />
        ))}
      </div>
      {/* Mobile card skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState(HISTORY_LIMIT);
  const { data: fetchedEvents, isLoading, isError, refetch } = useEvents(limit);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "");
  const [events, setEvents] = useState<any[]>([]);
  const [showIndicator, setShowIndicator] = useState(false);

  const debouncedSearch = useDebouncedValue(searchTerm.trim().toLowerCase(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (Array.isArray(fetchedEvents)) {
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        // Drop non-object entries up front so the render path only ever deals
        // with (possibly incomplete) event objects.
        const newEvents = fetchedEvents.filter(
          (e: any) => e && typeof e === "object" && !existingIds.has(e.id),
        );
        if (newEvents.length > 0) {
          if (prev.length > 0) {
            setShowIndicator(true);
            setTimeout(() => setShowIndicator(false), 4000);
          }
          return [...newEvents, ...prev];
        }
        return prev;
      });
    }
  }, [fetchedEvents]);

  // Keep the ?search= URL parameter in sync with the input (without a reload).
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (searchTerm.trim()) {
      next.set("search", searchTerm);
    } else {
      next.delete("search");
    }
    const query = next.toString();
    if (query !== searchParams.toString()) {
      router.replace(query ? `/activity?${query}` : "/activity", { scroll: false });
    }
  }, [router, searchParams, searchTerm]);

  const sorted = useMemo(
    () => events.slice().sort((a: any, b: any) => Number(b.ledger) - Number(a.ledger)),
    [events],
  );

  const visible = useMemo(() => {
    const byFilter = filter === "all" ? sorted : sorted.filter((e: any) => e.topic === filter);
    if (!debouncedSearch) return byFilter;
    return byFilter.filter((e: any) => eventMatchesSearch(e, debouncedSearch));
  }, [sorted, filter, debouncedSearch]);

  const canLoadMore =
    Array.isArray(fetchedEvents) && fetchedEvents.length >= limit && limit >= HISTORY_LIMIT;

  const isSearching = debouncedSearch.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
          </div>
          <p className="text-muted-foreground">
            The most recent {limit} on-chain events from the StellarGive contract.
          </p>
        </div>

        <div className="relative max-w-sm">
          <label htmlFor="activity-search" className="sr-only">
            Search activity by donor address or campaign ID
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="activity-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by donor address or campaign ID"
            autoComplete="off"
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search input"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event type filters">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              role="tab"
              aria-selected={filter === f.key}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading && events.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && events.length === 0 ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center"
          >
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Unable to load activity</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                We couldn&apos;t fetch on-chain events right now. Check your connection and try
                again.
              </p>
            </div>
            <Button onClick={() => refetch()}>
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="text-muted-foreground">
              {isSearching
                ? "No activity matches your search."
                : `No ${
                    filter === "all"
                      ? ""
                      : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()
                  } events found yet.`}
            </p>
            {isSearching && (
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <>
            <ActivityFeed visible={visible} showIndicator={showIndicator} />
            {canLoadMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setLimit((current) => current + HISTORY_LIMIT)}
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Load older"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function ActivityPage() {
  // useSearchParams (used in ActivityContent) requires a Suspense boundary above
  // it so Next.js can statically render the route without bailing out of CSR.
  return (
    <Suspense>
      <ActivityContent />
    </Suspense>
  );
}
