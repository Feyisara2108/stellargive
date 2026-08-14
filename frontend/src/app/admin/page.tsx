"use client";

import { Navbar } from "@/components/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/lib/WalletProvider";
import { useRecentCampaigns } from "@/hooks/useSoroban";
import { Shield, AlertCircle, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// Code-split: AdminPanel contains both management sections, both dialogs,
// all mutation hooks, Select/Dialog/Input, PostUpdateForm, CampaignStatusBadge,
// and a dozen lucide icons — none of which are needed until the user is
// confirmed to be a campaign owner. Splitting them out keeps the initial JS
// for the auth/loading gate minimal.
// ---------------------------------------------------------------------------

const AdminPanel = dynamic(() => import("./AdminPanel").then((mod) => mod.AdminPanel), {
  ssr: false,
  loading: () => <AdminPanelSkeleton />,
});

function AdminPanelSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading admin panel">
      {/* Campaign Management card */}
      <div className="border rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-px">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
      {/* Whitelist Management card */}
      <div className="border rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { address, isWrongNetwork } = useWallet();
  const { data: campaigns, isLoading: isLoadingCampaigns } = useRecentCampaigns();

  const ownedCampaigns =
    campaigns?.filter((c) => c.creator.toLowerCase() === address?.toLowerCase()) ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 container max-w-4xl py-12 space-y-8">
        <div className="space-y-2 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage campaigns, post updates, cancel active campaigns, and configure whitelists.
          </p>
        </div>

        {!address ? (
          <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-card/50 backdrop-blur-sm space-y-4 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Wallet Not Connected</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Please connect your Stellar wallet to verify ownership and access the admin panel.
              </p>
            </div>
          </div>
        ) : isWrongNetwork ? (
          <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-card/50 backdrop-blur-sm space-y-4 text-center">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Incorrect Network</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Please switch your wallet network to the correct network to manage your campaigns.
              </p>
            </div>
          </div>
        ) : isLoadingCampaigns ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Verifying campaign ownership...</p>
          </div>
        ) : ownedCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-card/50 backdrop-blur-sm space-y-4 text-center">
            <Shield className="w-12 h-12 text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-destructive">Access Denied</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Only campaign owners can access this page. You do not currently own any campaigns.
              </p>
            </div>
          </div>
        ) : (
          <AdminPanel ownedCampaigns={ownedCampaigns} />
        )}
      </main>
    </div>
  );
}
