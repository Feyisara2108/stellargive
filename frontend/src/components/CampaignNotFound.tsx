"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";
import type { Campaign } from "@/lib/soroban";

export type SuggestedCampaign = Pick<Campaign, "id" | "title">;

export function CampaignNotFound({ suggestions = [] }: { suggestions?: SuggestedCampaign[] }) {
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
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button asChild>
          <Link href="/explore">Browse Campaigns</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/create">Create a Campaign</Link>
        </Button>
      </div>
      {suggestions.length > 0 && (
        <section aria-labelledby="suggested-campaigns-heading" className="w-full max-w-md pt-4">
          <h3 id="suggested-campaigns-heading" className="text-lg font-semibold mb-3">
            You might be interested in
          </h3>
          <ul className="space-y-2 text-left">
            {suggestions.map((c) => (
              <li key={c.id.toString()}>
                <Link
                  href={`/campaign/${c.id.toString()}`}
                  className="block rounded-md border px-4 py-3 hover:bg-muted"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
