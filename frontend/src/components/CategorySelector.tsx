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

  const selectedDisplay =
    value === "uncategorized" ? "Uncategorized" : value === "all" ? "All Categories" : value;

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label ?? "Category"}</Label>
      <div className="relative">
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
                  <span className="font-medium text-left">
                    {cat === "uncategorized"
                      ? "Uncategorized"
                      : cat === "all"
                        ? "All Categories"
                        : cat}
                  </span>
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
