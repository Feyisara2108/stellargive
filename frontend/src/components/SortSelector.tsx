"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, ArrowDownUp } from "lucide-react";

export type SortKey = "newest" | "ending-soon" | "near-goal" | "most-raised";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "ending-soon", label: "Ending Soon" },
  { key: "near-goal", label: "Near Goal" },
  { key: "most-raised", label: "Most Raised" },
];

interface SortSelectorProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
  label?: string;
}

export function SortSelector({ value, onChange, label }: SortSelectorProps) {
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

  const handleSelect = (sort: SortKey) => {
    onChange(sort);
    setIsOpen(false);
  };

  const selectedDisplay = SORT_OPTIONS.find((s) => s.key === value)?.label || "Newest";

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label ?? "Sort By"}</Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-background border-border hover:bg-accent hover:text-accent-foreground text-left font-normal"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{selectedDisplay}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>

        {isOpen && (
          <div className="absolute left-0 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 p-2">
            <div className="space-y-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelect(opt.key)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <span className="font-medium text-left">{opt.label}</span>
                  {value === opt.key && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
