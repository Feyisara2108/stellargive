import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  onClear?: () => void;
  message?: string;
}

export function EmptyState({ onClear, message = "No campaigns found" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted p-6">
        <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-foreground text-lg">{message}</p>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Try adjusting your search or filters to find what you're looking for, or create a new campaign.
        </p>
      </div>
      <div className="flex items-center gap-4 mt-2">
        {onClear && (
          <Button variant="outline" onClick={onClear}>
            Clear Filters
          </Button>
        )}
        <Button asChild>
          <Link href="/create">Create Campaign</Link>
        </Button>
      </div>
    </div>
  );
}
