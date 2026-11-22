"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  value: string;
  /** Directional change indicator, e.g. "+12.5%" or "-3.2%". */
  change?: string;
  /** Helper text shown in a tooltip on hover/focus. */
  tooltip?: string;
  /** Renders a Skeleton in place of the value while data loads. */
  loading?: boolean;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ icon, title, value, change, tooltip, loading, className, ...props }, ref) => {
    const changeValue = change?.trim();
    const isPositive = changeValue?.startsWith("+");
    const isNegative = changeValue?.startsWith("-");

    const card = (
      <Card ref={ref} className={className} {...props}>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-wider">
            {icon}
            {title}
            {tooltip && !loading && (
              <Tooltip>
                {/* A small icon button is the only tooltip trigger, so the card
                    content is not wrapped in a control that does nothing. */}
                <TooltipTrigger className="relative">
                  <button
                    type="button"
                    aria-label={`More information about ${title}`}
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{tooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-8 w-24" aria-hidden="true" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{value}</span>
              {changeValue && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-sm font-semibold",
                    isPositive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isNegative
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : isNegative ? (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {changeValue}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );

    return card;
  },
);
StatCard.displayName = "StatCard";

export { StatCard };
