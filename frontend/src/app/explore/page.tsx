"use client";

import { useState, useMemo, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaignsPaged } from "@/hooks/useSoroban";
import { Loader2, Search, Compass } from "lucide-react";

const PAGE_SIZE = 9;

export default function ExplorePage() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, isFetching } = useCampaignsPaged(limit);
  const campaigns = data?.campaigns ?? [];
  const hasMore = data?.hasMore ?? false;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return campaigns;
    return campaigns.filter(
      (c) =>
        c.title.toLowerCase().includes(term) ||
        c.creator.toLowerCase().includes(term)
    );
  }, [campaigns, debouncedSearch]);

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

        <div className="relative max-w-sm">
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

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="h-[300px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {debouncedSearch
              ? "No campaigns match your search."
              : "No campaigns found. Be the first to create one!"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((campaign) => (
              <CampaignCard key={campaign.id.toString()} campaign={campaign} />
            ))}
          </div>
        )}

        {!isLoading && hasMore && !debouncedSearch && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
              disabled={isFetching}
              className="min-w-[140px]"
            >
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
