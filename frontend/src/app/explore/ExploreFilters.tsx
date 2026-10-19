"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { TokenSelector } from "@/components/TokenSelector";
import { CategorySelector, type CategoryKey } from "@/components/CategorySelector";
import { SortSelector } from "@/components/SortSelector";
import { Search, LayoutGrid, List, Bookmark, Tag } from "lucide-react";
import { STATUS_TABS, RESULTS_PANEL_ID, type ViewMode } from "./exploreUtils";
import type { ExploreUrlState } from "./useExploreUrlState";

interface ExploreFiltersProps {
  filters: ExploreUrlState;
  categoryCounts: Partial<Record<CategoryKey, number>>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  bookmarkCount: number;
  allUniqueTags: string[];
}

/**
 * Explore toolbar: search, category/token/sort selectors, grid/list toggle,
 * saved-only toggle, tag chips and the status tablist.
 */
export function ExploreFilters({
  filters,
  categoryCounts,
  viewMode,
  onViewModeChange,
  bookmarkCount,
  allUniqueTags,
}: ExploreFiltersProps) {
  const {
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
  } = filters;

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

  return (
    <>
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
            onClick={() => onViewModeChange("grid")}
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
            onClick={() => onViewModeChange("list")}
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
          Saved{bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}
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
              <Tag className="h-2.5 w-2.5" aria-hidden="true" />#{tag}
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
    </>
  );
}
