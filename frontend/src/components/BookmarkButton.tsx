"use client";

import { Bookmark } from "lucide-react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  campaignId,
  title,
  className,
}: {
  campaignId: bigint | string;
  title: string;
  className?: string;
}) {
  const { isBookmarked, toggle } = useBookmarks();
  const saved = isBookmarked(campaignId);

  return (
    <button
      type="button"
      onClick={() => toggle(campaignId)}
      aria-pressed={saved}
      aria-label={saved ? `Remove bookmark for ${title}` : `Bookmark ${title}`}
      title={saved ? "Remove bookmark" : "Save for later"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        saved && "text-primary border-primary",
        className,
      )}
    >
      <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
