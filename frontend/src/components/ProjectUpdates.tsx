"use client";

import { useMemo, useState } from "react";
import { useGetUpdates, useAddUpdate, useCampaign } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { PostUpdateForm } from "./PostUpdateForm";
import { notify } from "@/lib/toast";

type OptimisticUpdate = {
  id: string;
  content: string;
  timestamp: bigint;
  isOptimistic?: boolean;
};

export function ProjectUpdates({ campaignId }: { campaignId: bigint }) {
  const { data: updates, isLoading } = useGetUpdates(campaignId);
  const { data: campaign } = useCampaign(campaignId);
  const { address } = useWallet();
  const addUpdate = useAddUpdate();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([]);

  const isCreator = !!address && campaign?.creator === address;
  const sorted = useMemo(() => {
    const allUpdates = [...optimisticUpdates, ...(updates ?? [])];
    return allUpdates.sort((a, b) => Number(b.timestamp - a.timestamp));
  }, [optimisticUpdates, updates]);

  const handleSubmit = async (content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const optimisticUpdate: OptimisticUpdate = {
      id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: trimmedContent,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      isOptimistic: true,
    };

    setOptimisticUpdates((prev) => [optimisticUpdate, ...prev]);
    queryClient.setQueryData(["updates", campaignId.toString()], (old: any[] = []) => [
      optimisticUpdate,
      ...old,
    ]);

    try {
      await addUpdate.mutateAsync({ campaignId, content: trimmedContent });
      await queryClient.invalidateQueries({ queryKey: ["updates", campaignId.toString()] });
      setOptimisticUpdates((prev) => prev.filter((update) => update.id !== optimisticUpdate.id));
      notify.success("Update posted successfully");
      setShowForm(false);
    } catch (error: any) {
      setOptimisticUpdates((prev) => prev.filter((update) => update.id !== optimisticUpdate.id));
      queryClient.setQueryData(["updates", campaignId.toString()], (old: any[] = []) =>
        old.filter((update: any) => {
          if (typeof update?.id === "string" && update.id) {
            return update.id !== optimisticUpdate.id;
          }
          return true;
        }),
      );
      notify.error(error?.message || "Unable to post update. Please try again.");
      throw error;
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
          <PostUpdateForm
            campaignId={campaignId.toString()}
            onSuccess={() => setShowForm(false)}
            addUpdateMutation={async (id, content) => {
              await addUpdate.mutateAsync({ campaignId: BigInt(id), content });
            }}
            onSubmit={handleSubmit}
          />
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No updates yet.</p>
        )}

        {sorted.map((update, i) => (
          <div
            key={update.id ?? `${update.content}-${i}`}
            className="space-y-1 pb-4 border-b last:border-0 last:pb-0"
          >
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
