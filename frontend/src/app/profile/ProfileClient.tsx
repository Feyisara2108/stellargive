"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { WalletConnect } from "@/components/WalletConnect";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  useCampaignsByCreator,
  useRecentCampaigns,
  useEvents,
  useTokenMetadataBatch,
} from "@/hooks/useSoroban";
import { type Campaign, type SorobanEvent } from "@/lib/soroban";
import { MISSING_FIELD, parseDonationEvent } from "@/lib/eventData";
import { UNKNOWN_TOKEN, describeToken, tokensNeedingMetadata } from "@/lib/tokenTotals";
import { useWallet } from "@/lib/WalletProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatTokenAmount } from "@/utils/format";
import {
  AlertCircle,
  RotateCw,
  UserCircle,
  Wallet,
  HandCoins,
  TrendingUp,
  Megaphone,
} from "lucide-react";

const PROFILE_STATUS_FILTERS = ["all", "Active", "Funded"] as const;
type ProfileStatusFilter = (typeof PROFILE_STATUS_FILTERS)[number];

export default function ProfilePage() {
  const { address, isConnected } = useWallet();
  const {
    data: createdCampaigns,
    isLoading: createdCampaignsLoading,
    isError: createdCampaignsError,
    refetch: refetchCreatedCampaigns,
  } = useCampaignsByCreator(address);
  const {
    data: recentCampaigns,
    isLoading: recentCampaignsLoading,
    isError: recentCampaignsError,
    refetch: refetchRecentCampaigns,
  } = useRecentCampaigns();
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useEvents(100);

  const { created, supported, totalRaised, totalDonated, activeCount, myDonationsEvents } =
    useMemo(() => {
      const all: Campaign[] = recentCampaigns ?? [];
      const created: Campaign[] = address ? (createdCampaigns ?? []) : [];

      // Events are loosely-typed RPC payloads: a truncated or re-shaped `data`
      // array must be skipped, never indexed blindly.
      const allEvents: SorobanEvent[] = Array.isArray(events) ? events : [];
      const myDonations = allEvents.filter(
        (e) => !!address && parseDonationEvent(e)?.donor === address,
      );
      const supportedIds = new Set(
        myDonations.map((e) => parseDonationEvent(e)?.campaignId ?? "").filter(Boolean),
      );
      const supported = all.filter((c) => supportedIds.has(c.id.toString()));

      const totalRaised = created.reduce((acc, c) => acc + c.raised_amount, 0n);
      const totalDonated = myDonations.reduce(
        (acc: bigint, e) => acc + (parseDonationEvent(e)?.amount ?? 0n),
        0n,
      );
      const activeCount = created.filter((c) => c.status === "Active").length;

      return {
        created,
        supported,
        totalRaised,
        totalDonated,
        activeCount,
        myDonationsEvents: myDonations,
      };
    }, [createdCampaigns, recentCampaigns, events, address]);

  // Status filter for "My Campaigns" tab (#820).
  const [profileStatusFilter, setProfileStatusFilter] = useState<ProfileStatusFilter>("all");
  const filteredCreated = useMemo(
    () =>
      profileStatusFilter === "all"
        ? created
        : created.filter((c) => c.status === profileStatusFilter),
    [created, profileStatusFilter],
  );
  // Each chip counts exactly what selecting it shows, so "Funded" is not every
  // campaign that isn't Active (Cancelled, Expired and Claimed are neither).
  const statusCounts: Record<ProfileStatusFilter, number> = {
    all: created.length,
    Active: activeCount,
    Funded: created.filter((c) => c.status === "Funded").length,
  };

  // Auth guard — the dashboard is meaningless without a connected wallet.
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <div className="flex-1 container py-12">
          <div className="mx-auto max-w-md text-center space-y-6 py-20">
            <Wallet className="mx-auto h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Connect your wallet</h1>
              <p className="text-muted-foreground">
                Connect a Stellar wallet to view the campaigns you&apos;ve created and supported.
              </p>
            </div>
            <div className="flex justify-center">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const campaignsLoading = createdCampaignsLoading || recentCampaignsLoading;
  const campaignsError = createdCampaignsError || recentCampaignsError;
  const refetchCampaigns = () => {
    refetchCreatedCampaigns();
    refetchRecentCampaigns();
  };
  const bothLoading = campaignsLoading && eventsLoading;
  const bothError = campaignsError && eventsError;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">My Campaigns</h1>
          </div>
          <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
        </div>

        {bothLoading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <CampaignsSectionSkeleton />
            <CampaignsSectionSkeleton />
          </div>
        ) : bothError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-200">
                  Failed to load data
                </h3>
                <p className="text-sm text-red-800 dark:text-red-300">
                  We encountered an error while fetching your campaigns. Please check your
                  connection and try again.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                refetchCampaigns();
                refetchEvents();
              }}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          <>
            {campaignsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-sm text-red-900 dark:text-red-200">
                      Failed to load campaigns
                    </h3>
                    <p className="text-xs text-red-800 dark:text-red-300">
                      Campaign data is unavailable right now. Other sections may still work.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => refetchCampaigns()}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  Retry Campaigns
                </Button>
              </div>
            )}
            {eventsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-sm text-red-900 dark:text-red-200">
                      Failed to load donation history
                    </h3>
                    <p className="text-xs text-red-800 dark:text-red-300">
                      Donation data is unavailable right now. Other sections may still work.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => refetchEvents()}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  Retry Donations
                </Button>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                title="Total Raised (created)"
                value={`${formatTokenAmount(totalRaised, 7)} XLM`}
              />
              <StatCard
                icon={<HandCoins className="h-4 w-4 text-green-500" />}
                title="Total Donated"
                value={`${formatTokenAmount(totalDonated, 7)} XLM`}
              />
              <StatCard
                icon={<Megaphone className="h-4 w-4 text-purple-500" />}
                title="Active Campaigns"
                value={activeCount.toString()}
              />
            </div>

            <Tabs defaultValue="campaigns" className="mt-8">
              <TabsList aria-label="Profile sections">
                <TabsTrigger value="campaigns">My Campaigns</TabsTrigger>
                <TabsTrigger value="donations">My Donations</TabsTrigger>
              </TabsList>

              <TabsContent value="campaigns" className="mt-8 space-y-8">
                {/* Status filters for created campaigns (#820) */}
                <div
                  role="group"
                  aria-labelledby="profile-status-filter-label"
                  className="flex flex-wrap gap-2 items-center"
                >
                  <span
                    id="profile-status-filter-label"
                    className="text-sm text-muted-foreground mr-1"
                  >
                    Status:
                  </span>
                  {PROFILE_STATUS_FILTERS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={profileStatusFilter === status}
                      onClick={() => setProfileStatusFilter(status)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                        profileStatusFilter === status
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {status === "all" ? "All" : status}
                      {status !== "all" && (
                        <span className="ml-1 opacity-70">({statusCounts[status]})</span>
                      )}
                    </button>
                  ))}
                </div>
                <Section
                  title="Campaigns I Created"
                  emptyText={
                    created.length === 0 || profileStatusFilter === "all"
                      ? "You haven't created any campaigns yet."
                      : `None of your campaigns are ${profileStatusFilter}.`
                  }
                  campaigns={filteredCreated}
                  action={
                    created.length === 0 || profileStatusFilter === "all" ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href="/create">Create your first campaign</Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProfileStatusFilter("all")}
                      >
                        Show all campaigns
                      </Button>
                    )
                  }
                />
                <Section
                  title="Campaigns I Supported"
                  emptyText="You haven't donated to any campaigns yet."
                  campaigns={supported}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/explore">Explore campaigns</Link>
                    </Button>
                  }
                />
              </TabsContent>

              <TabsContent value="donations" className="mt-8">
                <DonationsSection
                  donations={myDonationsEvents}
                  campaigns={recentCampaigns ?? []}
                  emptyText="You haven't made any donations yet."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/explore">Explore campaigns</Link>
                    </Button>
                  }
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

function DonationsSection({
  donations,
  campaigns,
  emptyText,
  action,
}: {
  donations: SorobanEvent[];
  campaigns: Campaign[];
  emptyText: string;
  action?: React.ReactNode;
}) {
  const parsed = donations.map((event) => ({ event, donation: parseDonationEvent(event) }));
  // Each amount is in raw units of that donation's accepted_token, so its
  // symbol and decimals come from the token instead of being assumed XLM.
  const { data: tokenMetas } = useTokenMetadataBatch(
    tokensNeedingMetadata(
      new Set(parsed.map(({ donation }) => donation?.acceptedToken ?? UNKNOWN_TOKEN)),
    ),
  );

  return (
    <section className="space-y-4">
      <AsyncBoundary
        isLoading={false}
        isError={false}
        isEmpty={donations.length === 0}
        emptySlot={
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground rounded-lg border border-dashed py-12 text-center">
            <p>{emptyText}</p>
            {action}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {parsed.map(({ event, donation }, idx) => {
            const campaignId = donation?.campaignId ?? null;
            const tokenId = donation?.acceptedToken ?? UNKNOWN_TOKEN;
            const { symbol, decimals } = describeToken(tokenId, tokenMetas?.[tokenId]);
            const amount =
              donation?.amount == null
                ? MISSING_FIELD
                : `${formatTokenAmount(donation.amount, decimals)} ${symbol}`;
            const campaign = campaignId
              ? campaigns.find((c) => c.id.toString() === campaignId)
              : undefined;

            return (
              <Card key={`${event?.id ?? "event"}-${idx}`}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                  <div>
                    <p className="font-semibold">{amount} Donated</p>
                    {campaign ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        To campaign:{" "}
                        <Link
                          href={`/campaign/${campaignId}`}
                          className="text-primary hover:underline"
                        >
                          {campaign.title}
                        </Link>
                      </p>
                    ) : campaignId ? (
                      // Not in the recent-campaigns list, so the title is unknown. A campaign
                      // id is a small integer, not a Stellar address: link to its page.
                      <p className="text-sm text-muted-foreground mt-1">
                        To campaign:{" "}
                        <Link
                          href={`/campaign/${campaignId}`}
                          className="text-primary hover:underline"
                        >
                          Campaign #{campaignId}
                        </Link>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        To campaign ID: {MISSING_FIELD}
                      </p>
                    )}
                  </div>
                  {campaign && (
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Status: </span>
                        <span className="font-medium">{campaign.status}</span>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/campaign/${campaignId}`}>View Campaign</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>
    </section>
  );
}

function Section({
  title,
  emptyText,
  campaigns,
  action,
}: {
  title: string;
  emptyText: string;
  campaigns: Campaign[];
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <AsyncBoundary
        isLoading={false}
        isError={false}
        isEmpty={campaigns.length === 0}
        emptySlot={
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground rounded-lg border border-dashed py-12 text-center">
            <p>{emptyText}</p>
            {action}
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((c) => (
            <CampaignCard key={c.id.toString()} campaign={c} />
          ))}
        </div>
      </AsyncBoundary>
    </section>
  );
}

function CampaignsSectionSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </section>
  );
}
