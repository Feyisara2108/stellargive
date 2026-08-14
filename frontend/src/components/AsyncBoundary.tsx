"use client";

import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface AsyncBoundaryProps {
  /** True while the underlying data is being fetched. Takes priority over isError/isEmpty. */
  isLoading: boolean;
  /** True when the fetch failed. Takes priority over isEmpty. */
  isError: boolean;
  /** True when the fetch succeeded but returned nothing to show. */
  isEmpty?: boolean;
  /** Called when the user clicks retry in the default (or custom) error slot. */
  onRetry?: () => void;
  /** Rendered when none of isLoading/isError/isEmpty are true. */
  children: ReactNode;
  /** Overrides the default skeleton. */
  loadingSlot?: ReactNode;
  /** Overrides the default error panel. */
  errorSlot?: ReactNode;
  /** Overrides the default empty-state panel. */
  emptySlot?: ReactNode;
  /** Heading text for the default error panel. */
  errorTitle?: string;
  /** Body text for the default error panel. */
  errorMessage?: string;
}

function DefaultLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

function DefaultError({
  onRetry,
  title = "Failed to load data",
  message = "We encountered an error while fetching this data. Please check your connection and try again.",
}: {
  onRetry?: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <h3 className="font-semibold text-red-900 dark:text-red-200">{title}</h3>
          <p className="text-sm text-red-800 dark:text-red-300">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="w-full sm:w-auto">
          <RotateCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}

function DefaultEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground rounded-lg border border-dashed py-12 text-center">
      <p>Nothing to show yet.</p>
    </div>
  );
}

/**
 * Standardizes the isLoading / isError / isEmpty / content branching that
 * otherwise gets copy-pasted across every data-driven page. Each branch has
 * a sensible default but can be swapped out via the *Slot props.
 */
export function AsyncBoundary({
  isLoading,
  isError,
  isEmpty = false,
  onRetry,
  children,
  loadingSlot,
  errorSlot,
  emptySlot,
  errorTitle,
  errorMessage,
}: AsyncBoundaryProps) {
  if (isLoading) {
    return <>{loadingSlot ?? <DefaultLoading />}</>;
  }

  if (isError) {
    return (
      <>
        {errorSlot ?? <DefaultError onRetry={onRetry} title={errorTitle} message={errorMessage} />}
      </>
    );
  }

  if (isEmpty) {
    return <>{emptySlot ?? <DefaultEmpty />}</>;
  }

  return <>{children}</>;
}
