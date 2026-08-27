"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Folder } from "lucide-react";

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
}

export function CategorySelector({ value, onChange, label }: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (category: CategoryKey) => {
    onChange(category);
    setIsOpen(false);
  };

  const getCategoryLabel = (cat: CategoryKey) => {
    if (cat === "all") return "All Categories";
    if (cat === "uncategorized") return "Uncategorized";
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const selectedDisplay = getCategoryLabel(value);

  return (
    <div className="space-y-2" ref={containerRef}>
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
              {getCategoryLabel(cat)}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop horizontal tab list (md+ viewports) */}
      <div className="hidden md:flex flex-wrap gap-2 items-center" role="tablist" aria-label="Category tabs">
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
            </button>
          );
        })}
      </div>

      {/* Dropdown component container maintained for dropdown button interaction */}
      <div className="relative hidden sm:block md:hidden">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-background border-border hover:bg-accent hover:text-accent-foreground text-left font-normal"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground capitalize">{selectedDisplay}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>

        {isOpen && (
          <div className="absolute left-0 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 p-2">
            <div className="space-y-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleSelect(cat)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors capitalize"
                >
                  <span className="font-medium text-left">{getCategoryLabel(cat)}</span>
                  {value === cat && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
