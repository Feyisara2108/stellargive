"use client";

import { useState } from "react";
import { useGetUpdates, useAddUpdate, useCampaign } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { PostUpdateForm } from "./PostUpdateForm";

export function ProjectUpdates({ campaignId }: { campaignId: bigint }) {
  const { data: updates, isLoading } = useGetUpdates(campaignId);
  const { data: campaign } = useCampaign(campaignId);
  const { address } = useWallet();
  const addUpdate = useAddUpdate();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);

  const isCreator = !!address && campaign?.creator === address;
  const sorted = [...(updates ?? [])].sort((a, b) => Number(b.timestamp - a.timestamp));

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["updates", campaignId.toString()] });
    setShowForm(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" /> Project Updates
        </CardTitle>
        {isCreator && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm((v) => !v)}
            className="gap-1"
          >
            <Plus className="w-3 h-3" /> Post Update
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {showForm && (
          <PostUpdateForm
            campaignId={campaignId}
            onSuccess={handleSuccess}
            addUpdateMutation={addUpdate.mutateAsync}
          />
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No updates yet.</p>
        )}

        {sorted.map((update, i) => (
          <div key={i} className="space-y-1 pb-4 border-b last:border-0 last:pb-0">
            <p className="text-sm whitespace-pre-wrap">{update.content}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(Number(update.timestamp) * 1000), { addSuffix: true })}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
