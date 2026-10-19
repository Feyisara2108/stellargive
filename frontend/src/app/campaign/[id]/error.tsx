"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureRouteError } from "@/lib/sentry";

// Campaign-page error boundary. page.tsx only 404s when the contract reports the
// campaign doesn't exist; RPC and network failures land here instead, so a valid
// campaign never looks deleted just because the read failed.
//
// `retry()` re-fetches the segment, so the campaign is read from the RPC again
// (unlike `reset()`, which would only re-render the failed result).
export default function CampaignError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    captureRouteError(error, {
      pathname,
      digest: error.digest,
      boundary: "app/campaign/[id]/error.tsx",
    });
  }, [error, pathname]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-16 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-2">We couldn&apos;t load this campaign.</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        This is usually a temporary problem reaching the Stellar network. The campaign itself is
        fine — please try again in a moment.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/explore">Browse campaigns</Link>
        </Button>
      </div>
    </div>
  );
}
