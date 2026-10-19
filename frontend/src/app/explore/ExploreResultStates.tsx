"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw, Bookmark } from "lucide-react";

/** Shown when the campaign page fetch fails (RPC unreachable, simulation error). */
export function ExploreErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="font-semibold text-foreground">Unable to load campaigns</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          We couldn&apos;t reach the Stellar network. Check your connection and try again.
        </p>
      </div>
      <Button onClick={onRetry}>
        <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

/** Shown when the saved-only filter is on but nothing has been bookmarked yet. */
export function SavedEmptyState({ onDiscover }: { onDiscover: () => void }) {
  return (
    <div
      data-testid="saved-empty-state"
      className="flex flex-col items-center gap-4 py-20 text-center"
    >
      <div className="rounded-full bg-muted p-6">
        <Bookmark className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-foreground text-lg">No saved campaigns yet</p>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Tap the bookmark icon on any campaign to save it here for later.
        </p>
      </div>
      <Button onClick={onDiscover}>Discover campaigns</Button>
    </div>
  );
}
