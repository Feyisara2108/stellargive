"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaignsPaged } from "@/hooks/useSoroban";
import { Search, Compass, ArrowUpDown } from "lucide-react";
import type { Campaign } from "@/lib/soroban";

const PAGE_SIZE = 9;

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
        c.target_amount === 0n ? 0 : Number((c.raised_amount * 10_000n) / c.target_amount);
      return sorted.sort((a, b) => progress(b) - progress(a));
    }
    case "most-raised":
      return sorted.sort((a, b) => Number(b.raised_amount) - Number(a.raised_amount));
    default:
      return sorted;
  }
}

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "funded">("active");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isFetching } = useCampaignsPaged(limit);
  const campaigns = data?.campaigns ?? [];
  const hasMore = data?.hasMore ?? false;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "all" || status === "active" || status === "funded") {
      setStatusFilter(status);
    }
    const sort = searchParams.get("sort");
    if (SORT_OPTIONS.some((o) => o.key === sort)) {
      setSortBy(sort as SortKey);
    }
  }, [searchParams]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching && !debouncedSearch) {
          setLimit((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetching, debouncedSearch]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("status", statusFilter);
    next.set("sort", sortBy);
    const query = next.toString();
    router.replace(query ? `/explore?${query}` : "/explore", { scroll: false });
  }, [router, searchParams, statusFilter, sortBy]);

  const filtered = useMemo(() => {
    const byStatus = campaigns.filter((campaign) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "active") {
        return campaign.status === "Active" && campaign.raised_amount < campaign.target_amount;
      }
      return campaign.raised_amount >= campaign.target_amount || campaign.status === "Funded";
    });

    const term = debouncedSearch.trim().toLowerCase();
    const searched = !term
      ? byStatus
      : byStatus.filter(
          (c) => c.title.toLowerCase().includes(term) || c.creator.toLowerCase().includes(term),
        );

    return sortCampaigns(searched, sortBy);
  }, [campaigns, debouncedSearch, statusFilter, sortBy]);

  const emptyMessage = useMemo(() => {
    if (debouncedSearch) {
      return "No campaigns match your search.";
    }
    if (statusFilter === "funded") {
      return "No funded campaigns yet.";
    }
    if (statusFilter === "active") {
      return "No active campaigns right now.";
    }
    return "No campaigns found. Be the first to create one!";
  }, [debouncedSearch, statusFilter]);

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

        <div className="flex flex-wrap items-center gap-3">
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
              placeholder="Search by title or creator"
              autoComplete="off"
              className="pl-9"
            />
          </div>
          <div className="relative w-full sm:w-44">
            <label htmlFor="explore-sort" className="sr-only">
              Sort by
            </label>
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="explore-sort"
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
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Campaign status filters">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
            role="tab"
            aria-selected={statusFilter === "all"}
          >
            All
          </Button>
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            onClick={() => setStatusFilter("active")}
            role="tab"
            aria-selected={statusFilter === "active"}
          >
            Active
          </Button>
          <Button
            variant={statusFilter === "funded" ? "default" : "outline"}
            onClick={() => setStatusFilter("funded")}
            role="tab"
            aria-selected={statusFilter === "funded"}
          >
            Funded
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="h-[300px] rounded-xl bg-muted animate-pulse" />
            ))}
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
            ) : (
              <Button asChild>
                <Link href="/create">Create the first one</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((campaign) => (
              <CampaignCard key={campaign.id.toString()} campaign={campaign} />
            ))}
          </div>
        )}

        {!isLoading && isFetching && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[300px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-4" aria-hidden="true" />
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
