"use client";

import { useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { CampaignCard } from "@/components/CampaignCard";
import { WalletConnect } from "@/components/WalletConnect";
import { Card, CardContent } from "@/components/ui/card";
import { useRecentCampaigns, useEvents } from "@/hooks/useSoroban";
import { fromStroops, type Campaign } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { Loader2, UserCircle, Wallet, HandCoins, TrendingUp, Megaphone } from "lucide-react";

const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function normalizeAddress(value: unknown): string | null {
  if (!value) return null;
  const str = value.toString();
  if (str === ZERO_ADDRESS) return null;
  return str.length === 56 && str.startsWith("G") ? str : null;
}

export default function ProfilePage() {
  const { address, isConnected } = useWallet();
  const { data: campaigns, isLoading: campaignsLoading } = useRecentCampaigns();
  const { data: events, isLoading: eventsLoading } = useEvents(100);

  const { created, supported, totalRaised, totalDonated, activeCount } = useMemo(() => {
    const all: Campaign[] = campaigns ?? [];
    const created = address ? all.filter((c) => c.creator === address) : [];

    const myDonations = (events ?? []).filter(
      (e: any) => e.topic === "received" && normalizeAddress(e.data?.[1]) === address
    );
    const supportedIds = new Set(
      myDonations.map((e: any) => {
        try {
          return BigInt(e.data[0]).toString();
        } catch {
          return "";
        }
      })
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

    return { created, supported, totalRaised, totalDonated, activeCount };
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

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Section
              title="Campaigns I Created"
              emptyText="You haven't created any campaigns yet."
              campaigns={created}
            />
            <Section
              title="Campaigns I Supported"
              emptyText="You haven't donated to any campaigns yet."
              campaigns={supported}
            />
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
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
}: {
  title: string;
  emptyText: string;
  campaigns: Campaign[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {campaigns.length === 0 ? (
        <div className="text-sm text-muted-foreground rounded-lg border border-dashed py-10 text-center">
          {emptyText}
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
