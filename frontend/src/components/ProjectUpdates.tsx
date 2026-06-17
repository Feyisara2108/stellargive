"use client";

import { useState } from "react";
import { useGetUpdates, useAddUpdate, useCampaign } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export function ProjectUpdates({ campaignId }: { campaignId: bigint }) {
  const { data: updates, isLoading } = useGetUpdates(campaignId);
  const { data: campaign } = useCampaign(campaignId);
  const { address } = useWallet();
  const addUpdate = useAddUpdate();
  const [content, setContent] = useState("");
  const [showForm, setShowForm] = useState(false);

  const isCreator = !!address && campaign?.creator === address;
  const sorted = [...(updates ?? [])].sort((a, b) => Number(b.timestamp - a.timestamp));

  const handleSubmit = async () => {
    if (!content.trim()) return;
    try {
      await addUpdate.mutateAsync({ campaignId, content: content.trim() });
      toast.success("Update posted!");
      setContent("");
      setShowForm(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to post update");
    }
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
          <div className="space-y-2 pb-4 border-b">
            <textarea
              placeholder="Share a campaign milestone or update… (max 500 chars)"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{content.length}/500</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setContent("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!content.trim() || addUpdate.isPending}
                >
                  {addUpdate.isPending ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No updates yet.</p>
        )}

        {sorted.map((update, i) => (
          <div key={i} className="space-y-1 pb-4 border-b last:border-0 last:pb-0">
            <p className="text-sm whitespace-pre-wrap">{update.content}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(Number(update.timestamp) * 1000), {
                addSuffix: true,
              })}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
