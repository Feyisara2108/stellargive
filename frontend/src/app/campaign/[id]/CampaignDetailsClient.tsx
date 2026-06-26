"use client";

import { useState } from "react";
import { useCampaign, useCancelCampaign } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { ShareButton } from "@/components/ShareButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
const RecentDonations = dynamic(
  () => import("@/components/RecentDonations").then((mod) => mod.RecentDonations),
  { ssr: false },
);
const ProjectUpdates = dynamic(
  () => import("@/components/ProjectUpdates").then((mod) => mod.ProjectUpdates),
  { ssr: false },
);
import { AddressLink } from "@/components/AddressLink";
import { sanitizeUrl } from "@/lib/sanitize";
import { RefundButton } from "@/components/RefundButton";
import { TopDonors } from "@/components/TopDonors";

export function CampaignDetailsClient({ params }: { params: { id: string } }) {
  const { address } = useWallet();
  const { data: campaign, isLoading } = useCampaign(BigInt(params.id));
  const cancelCampaign = useCancelCampaign();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const isCreator = !!address && !!campaign && campaign.creator === address;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">
            {isLoading ? (
              <Skeleton className="h-9 w-64" />
            ) : (
              campaign?.title || `Campaign #${params.id}`
            )}
          </h1>
          {!isLoading && campaign && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-2">
                Creator:
                <AddressLink address={campaign.creator} className="text-xs" />
              </span>
              <span className="inline-flex items-center gap-2">
                Beneficiary:
                <AddressLink address={campaign.beneficiary} className="text-xs" />
              </span>
              {campaign.website && (
                <a
                  href={sanitizeUrl(campaign.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
                >
                  🌐 Website
                </a>
              )}
              {campaign.twitter && (
                <a
                  href={sanitizeUrl(campaign.twitter)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
                >
                  🐦 Twitter
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {campaign?.status === "Cancelled" && (
            <RefundButton campaignId={campaign.id} isCancelled={true} />
          )}
          {campaign && <ShareButton campaign={campaign} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        <div className="lg:col-span-2 space-y-6">
          {/* Main campaign info placeholder */}
          <div className="h-64 bg-muted/20 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground text-sm">
            Campaign Content Area
          </div>
          <ProjectUpdates campaignId={BigInt(params.id)} />
        </div>

        <div className="lg:col-span-1">
          <RecentDonations campaignId={BigInt(params.id)} />
        </div>
      </div>

      {isCreator && campaign?.status === "Active" && (
        <div className="border-t pt-6 flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmCancelOpen(true)}
            disabled={cancelCampaign.isPending}
          >
            Cancel Campaign
          </Button>
        </div>
      )}

      <Dialog
        open={confirmCancelOpen}
        onOpenChange={(open) => {
          if (!cancelCampaign.isPending) setConfirmCancelOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this campaign?</DialogTitle>
            <DialogDescription>
              This will permanently end the campaign and open refunds for all donors. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmCancelOpen(false)}
              disabled={cancelCampaign.isPending}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              disabled={cancelCampaign.isPending}
              onClick={async () => {
                if (!campaign) return;
                await cancelCampaign.mutateAsync(campaign.id);
                setConfirmCancelOpen(false);
              }}
            >
              {cancelCampaign.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Yes, Cancel Campaign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
