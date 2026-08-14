"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAddToWhitelist, useCancelCampaign, useAddUpdate } from "@/hooks/useSoroban";
import { toast } from "sonner";
import { Campaign } from "@/lib/soroban";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { PostUpdateForm } from "@/components/PostUpdateForm";
import { Shield, CheckCircle, AlertCircle, Loader2, Eye, FileText, XCircle } from "lucide-react";

interface AdminPanelProps {
  ownedCampaigns: Campaign[];
}

export function AdminPanel({ ownedCampaigns }: AdminPanelProps) {
  const addToWhitelist = useAddToWhitelist();
  const cancelCampaign = useCancelCampaign();
  const addUpdate = useAddUpdate();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [addressToWhitelist, setAddressToWhitelist] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const [whitelistedAddresses, setWhitelistedAddresses] = useState<Record<string, string[]>>({});

  const [campaignToCancel, setCampaignToCancel] = useState<Campaign | null>(null);
  const [updateCampaign, setUpdateCampaign] = useState<Campaign | null>(null);

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setSuccessMessage("");
  };

  const handleAddressChange = (val: string) => {
    setAddressToWhitelist(val);
    setSuccessMessage("");
    if (val && !/^G[A-Z0-9]{55}$/.test(val)) {
      setValidationError("Invalid Stellar address format (must start with G and be 56 characters)");
    } else {
      setValidationError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) {
      toast.error("Please select a campaign.");
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
      setSuccessMessage(
        `Successfully whitelisted ${addressToWhitelist} for campaign #${selectedCampaignId}`,
      );
      setWhitelistedAddresses((prev) => ({
        ...prev,
        [selectedCampaignId]: [...(prev[selectedCampaignId] || []), addressToWhitelist],
      }));
      setAddressToWhitelist("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to whitelist address.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Campaign Management */}
      <div className="border rounded-xl bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Campaign Management</h2>
          <p className="text-sm text-muted-foreground">
            View your campaigns, post updates to backers, or cancel active campaigns.
          </p>
        </div>

        <div className="divide-y rounded-lg border bg-background overflow-hidden">
          {ownedCampaigns.map((c) => (
            <div
              key={c.id.toString()}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base">{c.title}</h3>
                  <CampaignStatusBadge status={c.status} deadline={c.deadline} />
                </div>
                <p className="text-xs text-muted-foreground">ID: {c.id.toString()}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/campaign/${c.id.toString()}`}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> View
                  </Link>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUpdateCampaign(c)}
                  disabled={addUpdate.isPending}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> Post Update
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCampaignToCancel(c)}
                  disabled={c.status !== "Active" || cancelCampaign.isPending}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Whitelist Management */}
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
            <Select value={selectedCampaignId} onValueChange={handleSelectCampaign}>
              <SelectTrigger id="campaign-select">
                <SelectValue placeholder="-- Choose a Campaign --" />
              </SelectTrigger>
              <SelectContent>
                {ownedCampaigns.map((c) => (
                  <SelectItem key={c.id.toString()} value={c.id.toString()}>
                    {c.title} (ID: {c.id.toString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {selectedCampaignId && whitelistedAddresses[selectedCampaignId]?.length > 0 && (
            <div className="pt-4 border-t space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Whitelisted
              </h3>
              <ul className="space-y-1.5">
                {whitelistedAddresses[selectedCampaignId].map((addr) => (
                  <li
                    key={addr}
                    className="flex items-center gap-2 text-sm font-mono text-foreground bg-muted/30 px-3 py-1.5 rounded-md"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {addr}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={!!campaignToCancel}
        onOpenChange={(open) => {
          if (!cancelCampaign.isPending && !open) setCampaignToCancel(null);
        }}
      >
        <DialogContent aria-labelledby="cancel-dialog-title">
          <DialogHeader>
            <DialogTitle id="cancel-dialog-title">Cancel this campaign?</DialogTitle>
            <DialogDescription>
              This will permanently end <strong>{campaignToCancel?.title}</strong> and open refunds
              for all donors. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCampaignToCancel(null)}
              disabled={cancelCampaign.isPending}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              disabled={cancelCampaign.isPending}
              onClick={async () => {
                if (!campaignToCancel) return;
                try {
                  await cancelCampaign.mutateAsync(campaignToCancel.id);
                  setCampaignToCancel(null);
                } catch (err) {
                  console.error("Failed to cancel campaign:", err);
                }
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

      {/* Post Update Dialog */}
      <Dialog
        open={!!updateCampaign}
        onOpenChange={(open) => {
          if (!addUpdate.isPending && !open) setUpdateCampaign(null);
        }}
      >
        <DialogContent aria-labelledby="update-dialog-title">
          <DialogHeader>
            <DialogTitle id="update-dialog-title">
              Post Update for {updateCampaign?.title}
            </DialogTitle>
            <DialogDescription>
              Tell your backers what&apos;s happening with this campaign.
            </DialogDescription>
          </DialogHeader>
          {updateCampaign && (
            <PostUpdateForm
              campaignId={updateCampaign.id.toString()}
              onSuccess={() => setUpdateCampaign(null)}
              addUpdateMutation={async (id, content) => {
                await addUpdate.mutateAsync({ campaignId: BigInt(id), content });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
