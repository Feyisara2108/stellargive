"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CategoryKey } from "@/components/CategorySelector";
import { SORT_OPTIONS, type SortKey } from "@/components/SortSelector";
import { isCategoryKey, isStatusFilter, type StatusFilter } from "./exploreUtils";

/**
 * Explore filter state that round-trips through the URL query string, so a
 * filtered view can be shared, bookmarked and restored with back/forward.
 *
 * State is seeded from the current search params, re-synced whenever they
 * change externally, and written back with `router.replace` on every edit.
 */
export function useExploreUrlState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const status = searchParams.get("status");
    return isStatusFilter(status) ? status : "active";
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
  const [activeTagFilter, setActiveTagFilter] = useState<string>(
    () => searchParams.get("tag") ?? "",
  );

  /** Ref to track the last search term synced to URL to prevent hydration from clobbering active typing */
  const lastSyncedSearchRef = useRef<string>(searchParams.get("q") ?? "");

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== lastSyncedSearchRef.current) {
      lastSyncedSearchRef.current = q;
      setSearchTerm(q);
    }

    const status = searchParams.get("status");
    if (isStatusFilter(status)) {
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

    setTokenFilter(searchParams.get("token") ?? "");
  }, [searchParams]);

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
  }, [
    router,
    searchParams,
    statusFilter,
    sortBy,
    categoryFilter,
    tokenFilter,
    searchTerm,
    savedOnly,
    activeTagFilter,
  ]);

  return {
    /** Current query string, forwarded to campaign detail links so "back" restores filters. */
    detailHrefSearch: searchParams.toString(),
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    tokenFilter,
    setTokenFilter,
    savedOnly,
    setSavedOnly,
    activeTagFilter,
    setActiveTagFilter,
  };
}

export type ExploreUrlState = ReturnType<typeof useExploreUrlState>;
