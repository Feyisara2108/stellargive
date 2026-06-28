"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export function CampaignNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Campaign Not Found</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          The campaign you&apos;re looking for doesn&apos;t exist or has been removed. Check the
          link and try again.
        </p>
      </div>
      <Button asChild>
        <Link href="/explore">Browse Campaigns</Link>
      </Button>
    </div>
  );
}
