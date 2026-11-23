"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface StickyDonateBarProps {
  onOpen: () => void;
  disabled?: boolean;
  /** Hide the bar entirely (e.g. when the main donate button is visible). */
  hidden?: boolean;
  /** Campaign title snippet shown on the bar. */
  title?: string;
  /** Funding progress percentage (0-100). */
  progressPercent?: number;
}

export function StickyDonateBar({
  onOpen,
  disabled,
  hidden,
  title,
  progressPercent,
}: StickyDonateBarProps) {
  if (hidden) return null;

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-50 animate-in slide-in-from-bottom duration-200"
      style={{ bottom: "var(--consent-banner-height, 0px)" }}
    >
      <div
        className="max-w-4xl mx-auto p-3 bg-background border-t border-border shadow-md"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          {title && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-foreground">{title}</p>
              {progressPercent !== undefined && (
                <Progress value={progressPercent} className="h-1.5 mt-1" />
              )}
            </div>
          )}
          <Button onClick={onOpen} disabled={disabled} size="sm" className="shrink-0">
            Donate
          </Button>
        </div>
      </div>
    </div>
  );
}
