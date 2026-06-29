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

/**
 * Sidebar placeholder mirroring {@link RecentDonations}' own loading state so the
 * donor column keeps its shape while the campaign detail loads.
 */
function RecentDonationsSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        {/* "Recent Donations" title */}
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-1/4" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Full-page placeholder for the campaign detail route. It mirrors the layout of
 * {@link CampaignDetailsClient} — breadcrumbs, header, hero image, progress, and
 * the donor sidebar — using matching element dimensions so swapping in the real
 * content causes no layout shift (#357).
 */
export function CampaignDetailSkeleton() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6" aria-busy="true" aria-label="Loading campaign">
      {/* Breadcrumbs */}
      <Skeleton className="h-4 w-64" />

      {/* Header: title + status badge, then the meta row */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        {/* Share button */}
        <Skeleton className="h-9 w-9" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        {/* Main column: hero, status/category, progress, description */}
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="aspect-video w-full rounded-xl" />

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-8 w-28" />
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-4 w-12 ml-auto" />
                  <Skeleton className="h-6 w-20 ml-auto" />
                </div>
              </div>
              {/* progress bar */}
              <Skeleton className="h-3 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>

        {/* Donor sidebar */}
        <div className="lg:col-span-1">
          <RecentDonationsSkeleton />
        </div>
      </div>
    </div>
  );
}
