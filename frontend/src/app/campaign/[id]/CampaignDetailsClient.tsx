/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCampaign, useCancelCampaign, useEvents } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { ShareButton } from "@/components/ShareButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ImageIcon, Zap, AlertTriangle, RotateCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { formatBasisPoints, ZERO_ADDRESS, formatTokenAmount } from "@/utils/format";
import { calculateProgress, getCampaignImageUrl, CAMPAIGN_IMAGE_BLUR_DATA_URL } from "@/lib/utils";
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
import { StickyDonateBar } from "@/components/StickyDonateBar";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { Badge } from "@/components/ui/badge";
import { useCountdown } from "@/hooks/useCountdown";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CampaignDetailSkeleton } from "@/components/CampaignSkeleton";

function TopDonors({ campaignId }: { campaignId: bigint }) {
  const { data: allEvents, isLoading } = useEvents();

  if (isLoading) return <Skeleton className="h-32 w-full mt-6" />;

  const donationsByDonor = allEvents
    ?.filter((e: any) => e.topic === "received" && e.data && BigInt(e.data[0]) === campaignId)
    .reduce(
      (acc: any, event: any) => {
        const donor = event.data[1]?.toString();
        const amount = BigInt(event.data[2]);
        if (donor && donor !== ZERO_ADDRESS) {
          acc[donor] = (acc[donor] || 0n) + amount;
        }
        return acc;
      },
      {} as Record<string, bigint>,
    );

  const topDonors = Object.entries((donationsByDonor as Record<string, bigint>) || {})
    .sort((a, b) => Number(b[1] - a[1]))
    .slice(0, 5);

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <h3 className="text-lg font-bold">Top Donors</h3>
      {topDonors.length > 0 ? (
        <div className="space-y-3">
          {topDonors.map(([donor, amount], index) => (
            <div
              key={donor}
              className="flex justify-between items-center bg-card p-3 rounded-lg border shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold">
                  {index + 1}
                </span>
                <AddressLink address={donor} />
              </div>
              <span className="font-bold text-primary">
                {formatTokenAmount(amount as bigint, 7)} XLM
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="text-center py-8 text-muted-foreground space-y-1 bg-muted/20 rounded-lg border border-dashed"
        >
          <p className="text-sm font-medium">No donations yet</p>
        </div>
      )}
    </div>
  );
}

function CampaignTimeline({ campaign }: { campaign: any }) {
  const { data: allEvents, isLoading } = useEvents();

  if (isLoading) return <Skeleton className="h-32 w-full mt-6" />;

  const createdEvent = allEvents?.find(
    (e: any) => e.topic === "created" && e.data && BigInt(e.data[0]) === campaign.id,
  );

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <h3 className="text-lg font-bold">Timeline</h3>
      <ol className="relative border-s border-muted ml-3 space-y-6">
        <li className="ms-4">
          <div className="absolute w-3 h-3 bg-primary rounded-full mt-1.5 -start-1.5 border border-background"></div>
          <time className="mb-1 text-xs font-normal leading-none text-muted-foreground">
            {createdEvent?.createdAt
              ? new Date(createdEvent.createdAt).toLocaleDateString()
              : "Unknown"}
          </time>
          <h4 className="text-sm font-semibold">Campaign Created</h4>
        </li>
        <li className="ms-4">
          <div className="absolute w-3 h-3 bg-muted rounded-full mt-1.5 -start-1.5 border border-background"></div>
          <time className="mb-1 text-xs font-normal leading-none text-muted-foreground">
            {new Date(Number(campaign.deadline) * 1000).toLocaleDateString()}
          </time>
          <h4 className="text-sm font-semibold">Deadline</h4>
        </li>
      </ol>
    </div>
  );
}

export function CampaignDetailsClient({ params }: { params: { id: string } }) {
  const [imgError, setImgError] = useState(false);
  const { address, isWrongNetwork } = useWallet();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(BigInt(params.id));
  const cancelCampaign = useCancelCampaign();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<string | undefined>(undefined);
  const countdown = useCountdown(campaign?.deadline || 0n);

  const isCreator = !!address && !!campaign && campaign.creator === address;
  const progressPercent = campaign
    ? Math.min(100, Math.max(0, calculateProgress(campaign.raised_amount, campaign.target_amount)))
    : 0;

  // IntersectionObserver: hide sticky bar when the main donate header is visible
  const headerDonateRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    const el = headerDonateRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [campaign]);
  const categoryLabel =
    campaign?.category && campaign.category !== "other" ? campaign.category : "Uncategorized";

  // Show a detail-shaped skeleton during the initial campaign fetch so the page
  // doesn't pop in abruptly and the layout doesn't shift when data arrives (#357).
  if (isLoading) {
    return <CampaignDetailSkeleton />;
  }

  // RPC failure: campaign data couldn't be fetched — show a friendly error with retry.
  if (isError || !campaign) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Explore", href: "/explore" },
            { label: `Campaign #${params.id}`, href: `/campaign/${params.id}` },
          ]}
        />
        <div
          role="alert"
          className="mt-8 flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center"
        >
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Unable to load campaign</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              We couldn&apos;t reach the Stellar network right now. Check your connection and try
              again.
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => refetch()}>
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
            <Button variant="outline" asChild>
              <Link href="/explore">Browse campaigns</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const gapRaw =
    campaign.target_amount > campaign.raised_amount
      ? campaign.target_amount - campaign.raised_amount
      : 0n;
  const gapXLM = Number(gapRaw) / 10 ** 7;
  const showFundTheGap =
    campaign.status === "Active" && progressPercent >= 90 && progressPercent < 100 && gapXLM > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Explore", href: "/explore" },
          { label: campaign?.title || `Campaign #${params.id}`, href: `/campaign/${params.id}` },
        ]}
      />
      <div ref={headerDonateRef} className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{campaign?.title || `Campaign #${params.id}`}</h1>
            {campaign && (
              <CampaignStatusBadge status={campaign.status} deadline={campaign.deadline} />
            )}
          </div>
          {campaign && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-2">
                Creator:
                <AddressLink address={campaign.creator} className="text-xs" />
              </span>
              <span className="inline-flex items-center gap-2">
                {campaign.beneficiaries && campaign.beneficiaries.length > 1
                  ? "Beneficiaries:"
                  : "Beneficiary:"}
                {campaign.beneficiaries && campaign.beneficiaries.length > 1 ? (
                  <span className="flex flex-col gap-1">
                    {campaign.beneficiaries.map((b, i) => (
                      <span key={b.address} className="inline-flex items-center gap-2 text-xs">
                        <AddressLink address={b.address} className="text-xs" />
                        <span className="font-medium tabular-nums text-foreground">
                          {formatBasisPoints(b.share)}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <AddressLink address={campaign.beneficiary} className="text-xs" />
                )}
              </span>
              {campaign.website && (
                <a
                  href={sanitizeUrl(campaign.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Campaign website (opens in new tab)"
                  className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
                >
                  <span aria-hidden="true">🌐</span> Website
                </a>
              )}
              {campaign.twitter && (
                <a
                  href={sanitizeUrl(campaign.twitter)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Campaign Twitter profile (opens in new tab)"
                  className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
                >
                  <span aria-hidden="true">🐦</span> Twitter
                </a>
              )}
              {campaign.status === "Active" && (
                <span
                  role="status"
                  aria-label={
                    countdown.isEnded
                      ? "Campaign has ended"
                      : `Time remaining: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes`
                  }
                  className="inline-flex items-center gap-1 font-medium text-orange-500"
                >
                  <span aria-hidden="true">⏱️</span>{" "}
                  {countdown.isEnded
                    ? "Ended"
                    : `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m left`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {campaign && <ShareButton campaign={campaign} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        <div className="lg:col-span-2 space-y-6">
          {campaign && (
            <div className="space-y-6">
              <div className="relative aspect-video w-full bg-muted rounded-xl overflow-hidden border">
                {getCampaignImageUrl(campaign.metadata_uri) && !imgError ? (
                  <Image
                    src={getCampaignImageUrl(campaign.metadata_uri)!}
                    alt={campaign.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 800px"
                    priority
                    placeholder="blur"
                    blurDataURL={CAMPAIGN_IMAGE_BLUR_DATA_URL}
                    className="object-cover"
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize text-[10px] font-bold px-2 py-1">
                    {categoryLabel}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-bold px-2 py-1">
                    {Math.round(progressPercent)}% funded
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Raised</p>
                      <p className="text-2xl font-bold">
                        {formatTokenAmount(campaign.raised_amount, 7)} XLM
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-sm text-muted-foreground">Target</p>
                      <p className="text-lg font-medium">
                        {formatTokenAmount(campaign.target_amount, 7)} XLM
                      </p>
                    </div>
                  </div>
                  <Progress
                    value={calculateProgress(campaign.raised_amount, campaign.target_amount)}
                    className="h-3"
                    aria-label="Campaign progress"
                    showValueLabel={true}
                  />
                </div>

                {showFundTheGap && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <Zap className="h-4 w-4 shrink-0" />
                      <span>Only {gapXLM.toFixed(2)} XLM left — fund the gap!</span>
                    </div>
                    <button
                      onClick={() => {
                        setDonateAmount(gapXLM.toFixed(7).replace(/\.?0+$/, ""));
                        setDonateOpen(true);
                      }}
                      disabled={!address || isWrongNetwork}
                      className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Quick donate to fund the remaining ${gapXLM.toFixed(2)} XLM`}
                    >
                      Donate
                    </button>
                  </div>
                )}

                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {campaign.description || "No description provided for this campaign."}
                  </p>
                </div>

                <TopDonors campaignId={BigInt(params.id)} />
                <CampaignTimeline campaign={campaign} />
              </div>
            </div>
          )}
          <ErrorBoundary heading="Project updates">
            <ProjectUpdates campaignId={BigInt(params.id)} />
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-1">
          <ErrorBoundary heading="Recent donations">
            <RecentDonations
              campaignId={BigInt(params.id)}
              onDonateAgain={
                campaign?.status === "Active"
                  ? (amount) => {
                      setDonateAmount(amount);
                      setDonateOpen(true);
                    }
                  : undefined
              }
            />
          </ErrorBoundary>
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
          <DonateModal
            campaign={campaign}
            open={donateOpen}
            onOpenChange={setDonateOpen}
            suggestedAmount={donateAmount}
          />
          <StickyDonateBar
            onOpen={() => {
              setDonateAmount(undefined);
              setDonateOpen(true);
            }}
            disabled={!address || isWrongNetwork}
            hidden={headerVisible}
            title={campaign.title}
            progressPercent={progressPercent}
          />
        </>
      )}
    </div>
  );
}
