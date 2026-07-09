"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { WalletConnect } from "@/components/WalletConnect";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentCampaigns, useEvents } from "@/hooks/useSoroban";
import { fromStroops, type Campaign } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import {
  Loader2,
  UserCircle,
  Wallet,
  HandCoins,
  TrendingUp,
  Megaphone,
  AlertCircle,
  RotateCw,
} from "lucide-react";

const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function normalizeAddress(value: unknown): string | null {
  if (!value) return null;
  const str = value.toString();
  if (str === ZERO_ADDRESS) return null;
  return str.length === 56 && str.startsWith("G") ? str : null;
}

export default function ProfilePage() {
  const { address, isConnected } = useWallet();
  const {
    data: campaigns,
    isLoading: campaignsLoading,
    isError: campaignsError,
    refetch: refetchCampaigns,
  } = useRecentCampaigns();
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useEvents(100);

  const { created, supported, totalRaised, totalDonated, activeCount, myDonationsEvents } =
    useMemo(() => {
      const all: Campaign[] = campaigns ?? [];
      const created = address ? all.filter((c) => c.creator === address) : [];

      const myDonations = (events ?? []).filter(
        (e: any) => e.topic === "received" && normalizeAddress(e.data?.[1]) === address,
      );
      const supportedIds = new Set(
        myDonations.map((e: any) => {
          try {
            return BigInt(e.data[0]).toString();
          } catch {
            return "";
          }
        }),
      );
      const supported = all.filter((c) => supportedIds.has(c.id.toString()));

      const totalRaised = created.reduce((acc, c) => acc + c.raised_amount, 0n);
      const totalDonated = myDonations.reduce((acc: bigint, e: any) => {
        try {
          return acc + BigInt(e.data[2]);
        } catch {
          return acc;
        }
      }, 0n);
      const activeCount = created.filter((c) => c.status === "Active").length;

      return {
        created,
        supported,
        totalRaised,
        totalDonated,
        activeCount,
        myDonationsEvents: myDonations,
      };
    }, [campaigns, events, address]);

  // Auth guard — the dashboard is meaningless without a connected wallet.
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container py-12">
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
        </main>
      </div>
    );
  }

  const isLoading = campaignsLoading || eventsLoading;
  const isError = campaignsError || eventsError;

  const handleRetry = () => {
    refetchCampaigns();
    refetchEvents();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">My Campaigns</h1>
          </div>
          <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
        </div>

        {/* Error state */}
        {isError && !isLoading && (
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
            <Button onClick={handleRetry} variant="outline" size="sm" className="w-full sm:w-auto">
              <RotateCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : (
            <>
              <StatCard
                icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                label="Total Raised (created)"
                value={`${fromStroops(totalRaised)} XLM`}
              />
              <StatCard
                icon={<HandCoins className="h-4 w-4 text-green-500" />}
                label="Total Donated"
                value={`${fromStroops(totalDonated)} XLM`}
              />
              <StatCard
                icon={<Megaphone className="h-4 w-4 text-purple-500" />}
                label="Active Campaigns"
                value={activeCount.toString()}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-4 border-b border-border">
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "campaigns"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Campaigns
          </button>
          <button
            onClick={() => setActiveTab("donations")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "donations"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Donations
          </button>
        </div>

        {isLoading ? (
          <>
            <CampaignsSectionSkeleton />
            <CampaignsSectionSkeleton />
          </>
        ) : activeTab === "campaigns" ? (
          <>
            <Section
              title="Campaigns I Created"
              emptyText="You haven't created any campaigns yet."
              campaigns={created}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/create">Create your first campaign</Link>
                </Button>
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
          </>
        ) : (
          <DonationsSection
            donations={myDonationsEvents}
            campaigns={campaigns ?? []}
            emptyText="You haven't made any donations yet."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/explore">Explore campaigns</Link>
              </Button>
            }
          />
        )}
      </main>
    </div>
  );
}

function DonationsSection({
  donations,
  campaigns,
  emptyText,
  action,
}: {
  donations: any[];
  campaigns: Campaign[];
  emptyText: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      {donations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground rounded-lg border border-dashed py-12 text-center">
          <p>{emptyText}</p>
          {action}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {donations.map((event, idx) => {
            let campaignId = "";
            let amount = "";
            try {
              campaignId = BigInt(event.data[0]).toString();
              amount = fromStroops(event.data[2]);
            } catch {
              // ignore
            }
            const campaign = campaigns.find((c) => c.id.toString() === campaignId);

            return (
              <Card key={`${event.id}-${idx}`}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                  <div>
                    <p className="font-semibold">{amount} XLM Donated</p>
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
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        To campaign ID: <AddressLink address={campaignId} />
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
      )}
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-wider">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
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
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground rounded-lg border border-dashed py-12 text-center">
          <p>{emptyText}</p>
          {action}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((c) => (
            <CampaignCard key={c.id.toString()} campaign={c} />
          ))}
        </div>
      )}
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
