import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { AddressLink } from "@/components/AddressLink";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { UserCircle, TrendingUp, HandCoins, Megaphone } from "lucide-react";

interface PublicProfileProps {
  params: { address: string };
}

export async function generateMetadata({ params }: PublicProfileProps): Promise<Metadata> {
  const { address } = params;
  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `Profile ${truncatedAddress} - StellarGive`,
    description: `View the StellarGive profile for ${truncatedAddress}. See campaigns created and supported.`,
    openGraph: {
      title: `Profile ${truncatedAddress} - StellarGive`,
      description: `View the StellarGive profile for ${truncatedAddress}. See campaigns created and supported.`,
      type: "profile",
      siteName: "StellarGive",
    },
    twitter: {
      card: "summary",
      title: `Profile ${truncatedAddress} - StellarGive`,
      description: `View the StellarGive profile for ${truncatedAddress}. See campaigns created and supported.`,
    },
  };
}

export default function PublicProfilePage({ params }: PublicProfileProps) {
  const { address } = params;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Public Profile</h1>
          </div>
          <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
        </div>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              Public profile data will be loaded from on-chain events.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
