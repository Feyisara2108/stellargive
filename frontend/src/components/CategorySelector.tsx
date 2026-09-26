"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Folder } from "lucide-react";

export const CATEGORIES = [
  "all",
  "medical",
  "food",
  "shelter",
  "education",
  "relief",
  "uncategorized",
] as const;

export type CategoryKey = (typeof CATEGORIES)[number];

interface CategorySelectorProps {
  value: CategoryKey;
  onChange: (value: CategoryKey) => void;
  label?: string;
  /** Optional per-category counts to display next to each label. */
  counts?: Partial<Record<CategoryKey, number>>;
}

export function CategorySelector({ value, onChange, label, counts }: CategorySelectorProps) {
  const getCategoryLabel = (cat: CategoryKey) => {
    if (cat === "all") return "All Categories";
    if (cat === "uncategorized") return "Uncategorized";
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const formatCount = (cat: CategoryKey) => {
    if (!counts) return null;
    const n = counts[cat];
    if (n === undefined) return null;
    return (
      <span className="ml-1 text-[0.65rem] font-normal opacity-70">
        ({n})
      </span>
    );
  };

  return (
    <div className="space-y-2">
      <Label>{label ?? "Category"}</Label>

      {/* Mobile compact select dropdown (< md viewports) */}
      <div className="block md:hidden relative">
        <label htmlFor="mobile-category-select" className="sr-only">
          Select Category
        </label>
        <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        <select
          id="mobile-category-select"
          value={value}
          onChange={(e) => onChange(e.target.value as CategoryKey)}
          className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm capitalize ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {getCategoryLabel(cat)}{counts?.[cat] !== undefined ? ` (${counts[cat]})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop horizontal tab list (md+ viewports) */}
      <div
        className="hidden md:flex flex-wrap gap-2 items-center"
        role="tablist"
        aria-label="Category tabs"
      >
        {CATEGORIES.map((cat) => {
          const isSelected = value === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onChange(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors capitalize ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {getCategoryLabel(cat)}
              {formatCount(cat)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
