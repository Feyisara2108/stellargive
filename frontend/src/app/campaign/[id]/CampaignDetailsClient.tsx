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
const DonateModal = dynamic(
  () => import("@/components/DonateModal").then((mod) => mod.DonateModal),
  { ssr: false },
);
import { AddressLink } from "@/components/AddressLink";
import { sanitizeUrl } from "@/lib/sanitize";
import { RefundButton } from "@/components/RefundButton";
import { TopDonors } from "@/components/TopDonors";
import { StickyDonateBar } from "@/components/StickyDonateBar";
import { Progress } from "@/components/ui/progress";
import { fromStroops } from "@/lib/soroban";
import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

function calculateProgress(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  const scaled = (raised * 10_000n) / target;
  return Math.min(Number(scaled) / 100, 100);
}

function getCampaignImageUrl(uri?: string) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  if (uri.startsWith("https://")) {
    return uri;
  }
  return null;
}

export function CampaignDetailsClient({ params }: { params: { id: string } }) {
  const [imgError, setImgError] = useState(false);
  const { address, isWrongNetwork } = useWallet();
  const { data: campaign, isLoading } = useCampaign(BigInt(params.id));
  const cancelCampaign = useCancelCampaign();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);

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
          {!isLoading && campaign && (
            <div className="space-y-6">
              <div className="relative aspect-video w-full bg-muted rounded-xl overflow-hidden border">
                {getCampaignImageUrl(campaign.metadata_uri) && !imgError ? (
                  <img
                    src={getCampaignImageUrl(campaign.metadata_uri)}
                    alt={campaign.title}
                    className="object-cover w-full h-full"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <ImageIcon className="w-12 h-12 opacity-20" />
                    <span className="text-sm opacity-40">No campaign image available</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                      campaign.status === "Active"
                        ? "bg-green-500/20 text-green-500"
                        : campaign.status === "Funded"
                          ? "bg-blue-500/20 text-blue-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {campaign.status}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Category: {campaign.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Raised</p>
                      <p className="text-2xl font-bold">{fromStroops(campaign.raised_amount)} XLM</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-sm text-muted-foreground">Target</p>
                      <p className="text-lg font-medium">{fromStroops(campaign.target_amount)} XLM</p>
                    </div>
                  </div>
                  <Progress
                    value={calculateProgress(campaign.raised_amount, campaign.target_amount)}
                    className="h-3"
                    aria-label="Campaign progress"
                  />
                </div>

                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {campaign.description || "No description provided for this campaign."}
                  </p>
                </div>
              </div>
            </div>
          )}
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
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

      {/* Donate modal (controlled) and sticky mobile CTA */}
      {campaign?.status === "Active" && (
        <>
          <DonateModal campaign={campaign} open={donateOpen} onOpenChange={setDonateOpen} />
          <StickyDonateBar onOpen={() => setDonateOpen(true)} disabled={isWrongNetwork} />
        </>
      )}
    </div>
  );
}
