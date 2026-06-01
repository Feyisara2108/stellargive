import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder that mirrors the structure of {@link CampaignCard} so the grid
 * keeps its shape (no layout shift) while campaign data is loading.
 */
export function CampaignSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        {/* status badge */}
        <Skeleton className="h-4 w-16 mb-2" />
        {/* title */}
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          {/* progress bar */}
          <Skeleton className="h-2 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        {/* deadline */}
        <Skeleton className="h-3 w-32" />
        {/* creator / beneficiary */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-9 ml-auto" />
      </CardFooter>
    </Card>
  );
}

/** Renders a grid of {@link CampaignSkeleton}s (defaults to 6). */
export function CampaignSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <CampaignSkeleton key={i} />
      ))}
    </div>
  );
}
