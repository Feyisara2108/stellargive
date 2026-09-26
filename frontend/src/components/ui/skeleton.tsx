import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export type SkeletonVariant = "card" | "list" | "detail" | "stat";

type SkeletonPresetProps = {
  /** Number of repeated items (cards, rows, stat tiles). Ignored by `detail`. */
  count?: number;
  className?: string;
};

// Presets use fixed element heights that match the real components' line
// heights so swapping in resolved content does not shift surrounding layout.

function SkeletonCard({ count = 3, className }: SkeletonPresetProps) {
  return (
    <div
      className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", className)}
      data-skeleton-variant="card"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-3/4" />
          </div>
          <div className="px-6 pb-6 space-y-3">
            <Skeleton className="h-2 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ count = 5, className }: SkeletonPresetProps) {
  return (
    <ul className={cn("divide-y rounded-lg border", className)} data-skeleton-variant="list">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex h-16 items-center gap-3 px-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function SkeletonDetail({ className }: Omit<SkeletonPresetProps, "count">) {
  return (
    <div className={cn("space-y-6", className)} data-skeleton-variant="detail">
      <div className="space-y-2">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function SkeletonStat({ count = 4, className }: SkeletonPresetProps) {
  return (
    <div
      className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}
      data-skeleton-variant="stat"
    >
      {Array.from({ length: count }).map((_, i) => (
        // Mirrors StatCard: p-4, text-xs label (h-4), text-2xl value (h-8).
        <div key={i} className="rounded-xl border bg-card shadow-sm p-4 space-y-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

type SkeletonPresetComponentProps = SkeletonPresetProps & { variant: SkeletonVariant };

/** Renders one of the built-in content-shaped skeletons. */
function SkeletonPreset({ variant, ...props }: SkeletonPresetComponentProps) {
  switch (variant) {
    case "card":
      return <SkeletonCard {...props} />;
    case "list":
      return <SkeletonList {...props} />;
    case "detail":
      return <SkeletonDetail className={props.className} />;
    case "stat":
      return <SkeletonStat {...props} />;
  }
}

export { Skeleton, SkeletonCard, SkeletonList, SkeletonDetail, SkeletonStat, SkeletonPreset };
