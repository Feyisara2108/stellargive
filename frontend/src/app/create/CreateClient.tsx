"use client";

import { useState } from "react";
import { PlusCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/WalletProvider";

export default function CreateCampaign() {
  const { isConnected, connect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // False when the user closed the wallet picker or the wallet refused access.
      if (await connect()) {
        toast.success("Wallet connected!");
      }
    } catch {
      toast.error("Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Create a Campaign</h1>
          </div>
          <p className="text-muted-foreground">
            Fill in the details for your relief grant. Ensure the beneficiary address is correct.
          </p>
        </div>

        {!isConnected && (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-muted-foreground">
              Connect your wallet to publish a campaign. You can fill in the form in the meantime.
            </p>
            <Button type="button" className="gap-2" onClick={handleConnect} disabled={isConnecting}>
              <Wallet className="w-4 h-4" />
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </Button>
          </div>
        )}

        <CreateCampaignForm inline />
      </main>
    </div>
  );
}
