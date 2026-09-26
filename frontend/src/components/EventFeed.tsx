"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEvents } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { getStellarExpertTxUrl } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowUpRight, Megaphone, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// Throttle announcements to avoid overwhelming screen reader users
const ANNOUNCEMENT_THROTTLE_MS = 5000;

export function EventFeed() {
  const { data: events, isLoading } = useEvents();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const lastAnnouncementTimeRef = useRef<number>(0);

  // Throttled announcement function for screen readers
  const announceNewEvents = useCallback((count: number) => {
    const now = Date.now();
    if (now - lastAnnouncementTimeRef.current < ANNOUNCEMENT_THROTTLE_MS) return;

    lastAnnouncementTimeRef.current = now;
    const message = count === 1
      ? "New donation received"
      : `${count} new donations received`;
    setAnnouncement(message);
  }, []);

  useEffect(() => {
    if (!events?.length) return;

    const newDonations = events.filter(
      (e: any) => e.topic === "received" && !prevIdsRef.current.has(e.id),
    );

    const currentIds = new Set<string>(events.map((e: any) => e.id as string));

    if (prevIdsRef.current.size > 0 && newDonations.length > 0) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        toast.info(
          newDonations.length === 1
            ? "New donation received!"
            : `${newDonations.length} new donations received!`,
        );
        // Announce to screen readers
        announceNewEvents(newDonations.length);
      }, 500);
    }

    prevIdsRef.current = currentIds;
  }, [events, announceNewEvents]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6" aria-busy="true" aria-label="Loading recent activity">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-start">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2 w-1/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      {/* ARIA live region for announcing new events to screen readers (#833) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/20">
              <tr>
                <th className="px-4 py-3 rounded-tl-md">Status</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Ledger</th>
                <th className="px-4 py-3 rounded-tr-md text-right">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events?.map((event: any) => (
                <tr key={event.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-full ${
                          event.topic === "received"
                            ? "bg-green-500/10 text-green-500"
                            : event.topic === "created"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-purple-500/10 text-purple-500"
                        }`}
                      >
                        {event.topic === "received" && <ArrowUpRight className="w-3 h-3" />}
                        {event.topic === "created" && <Megaphone className="w-3 h-3" />}
                        {event.topic === "claimed" && <Trophy className="w-3 h-3" />}
                      </div>
                      <span className="uppercase text-[10px] font-bold tracking-wider">
                        {event.topic}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {event.topic === "received" && (
                      <>
                        <span className="font-bold">{fromStroops(event.data[2])} XLM</span> donated
                        to Campaign #{event.data[0].toString()}
                      </>
                    )}
                    {event.topic === "created" && (
                      <>
                        New campaign created with a target of{" "}
                        <span className="font-bold">{fromStroops(event.data[3])} XLM</span>
                      </>
                    )}
                    {event.topic === "claimed" && (
                      <>
                        <span className="font-bold">{fromStroops(event.data[3])} XLM</span> claimed
                        by beneficiary
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{event.ledger}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary hover:underline"
                    >
                      {event.txHash.substring(0, 8)}...
                      {event.txHash.substring(event.txHash.length - 4)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden space-y-4">
          {events?.map((event: any) => (
            <div key={event.id} className="flex flex-col gap-3 p-4 border rounded-lg bg-card">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-full ${
                      event.topic === "received"
                        ? "bg-green-500/10 text-green-500"
                        : event.topic === "created"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-purple-500/10 text-purple-500"
                    }`}
                  >
                    {event.topic === "received" && <ArrowUpRight className="w-3 h-3" />}
                    {event.topic === "created" && <Megaphone className="w-3 h-3" />}
                    {event.topic === "claimed" && <Trophy className="w-3 h-3" />}
                  </div>
                  <span className="uppercase text-[10px] font-bold tracking-wider text-muted-foreground">
                    {event.topic}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">Ledger {event.ledger}</span>
              </div>

              <p className="text-sm">
                {event.topic === "received" && (
                  <>
                    <span className="font-bold">{fromStroops(event.data[2])} XLM</span> donated to
                    Campaign #{event.data[0].toString()}
                  </>
                )}
                {event.topic === "created" && (
                  <>
                    New campaign created with a target of{" "}
                    <span className="font-bold">{fromStroops(event.data[3])} XLM</span>
                  </>
                )}
                {event.topic === "claimed" && (
                  <>
                    <span className="font-bold">{fromStroops(event.data[3])} XLM</span> claimed by
                    beneficiary
                  </>
                )}
              </p>

              <div className="pt-3 border-t flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Tx Hash</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {event.txHash.substring(0, 8)}...{event.txHash.substring(event.txHash.length - 4)}
                </a>
              </div>
            </div>
          ))}
        </div>
        {!events?.length && (
          <div
            role="status"
            aria-live="polite"
            className="text-center py-10 text-muted-foreground space-y-1 bg-muted/20 rounded-lg border border-dashed"
          >
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs">
              New donations, campaigns, and claims will appear here in real time.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
