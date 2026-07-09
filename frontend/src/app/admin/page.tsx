"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/WalletProvider";
import { useRecentCampaigns, useAddToWhitelist } from "@/hooks/useSoroban";
import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function AdminPage() {
  const { address, isWrongNetwork } = useWallet();
  const { data: campaigns, isLoading: isLoadingCampaigns } = useRecentCampaigns();
  const addToWhitelist = useAddToWhitelist();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [addressToWhitelist, setAddressToWhitelist] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Filter campaigns owned by the connected user (creator)
  const ownedCampaigns = campaigns?.filter(
    (c) => c.creator.toLowerCase() === address?.toLowerCase()
  ) || [];

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleAddressChange = (val: string) => {
    setAddressToWhitelist(val);
    setSuccessMessage("");
    setErrorMessage("");
    if (val && !/^G[A-Z0-9]{55}$/.test(val)) {
      setValidationError("Invalid Stellar address format (must start with G and be 56 characters)");
    } else {
      setValidationError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) {
      setErrorMessage("Please select a campaign.");
      return;
    }
    if (!addressToWhitelist || !/^G[A-Z0-9]{55}$/.test(addressToWhitelist)) {
      setValidationError("A valid Stellar address is required.");
      return;
    }

    try {
      await addToWhitelist.mutateAsync({
        campaignId: BigInt(selectedCampaignId),
        addressToWhitelist,
      });
      setSuccessMessage(`Successfully whitelisted ${addressToWhitelist} for campaign #${selectedCampaignId}`);
      setAddressToWhitelist("");
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to whitelist address.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 container max-w-2xl py-12 space-y-8">
        <div className="space-y-2 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage whitelists and access controls for your campaigns.
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
          <div className="border rounded-xl bg-card p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Whitelist Management</h2>
              <p className="text-sm text-muted-foreground">
                Authorize specific addresses to contribute to your campaigns.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="campaign-select" className="text-sm font-medium">
                  Select Campaign
                </label>
                <select
                  id="campaign-select"
                  value={selectedCampaignId}
                  onChange={(e) => handleSelectCampaign(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">-- Choose a Campaign --</option>
                  {ownedCampaigns.map((c) => (
                    <option key={c.id.toString()} value={c.id.toString()}>
                      {c.title} (ID: {c.id.toString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="address-input" className="text-sm font-medium">
                  Stellar Address to Whitelist
                </label>
                <Input
                  id="address-input"
                  placeholder="G..."
                  value={addressToWhitelist}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  disabled={addToWhitelist.isPending}
                  required
                />
                {validationError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {validationError}
                  </p>
                )}
              </div>

              {successMessage && (
                <div className="p-3 bg-green-500/15 text-green-500 text-sm rounded-md flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-destructive/15 text-destructive text-sm rounded-md flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  addToWhitelist.isPending ||
                  !!validationError ||
                  !selectedCampaignId ||
                  !addressToWhitelist
                }
              >
                {addToWhitelist.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Whitelisting Address...
                  </>
                ) : (
                  "Whitelist Address"
                )}
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
