"use client";

import { useMemo, useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddressLink } from "@/components/AddressLink";
import { useEvents } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { RelativeTime } from "@/components/RelativeTime";
import { Activity, ArrowUpRight, Loader2, Megaphone, Trophy } from "lucide-react";

const HISTORY_LIMIT = 50;
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

type FilterKey = "all" | "created" | "received" | "claimed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "received", label: "Donated" },
  { key: "claimed", label: "Claimed" },
];

/** Returns a 56-char G-address or null (filtering the contract's zero placeholder). */
function normalizeAddress(value: unknown): string | null {
  if (!value) return null;
  const str = value.toString();
  if (str === ZERO_ADDRESS) return null;
  return str.length === 56 && str.startsWith("G") ? str : null;
}

function campaignId(value: unknown): string | null {
  try {
    return BigInt(value as any).toString();
  } catch {
    return null;
  }
}

export default function ActivityPage() {
  const { data: fetchedEvents, isLoading, isError } = useEvents(HISTORY_LIMIT);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [events, setEvents] = useState<any[]>([]);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    if (fetchedEvents) {
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = fetchedEvents.filter((e: any) => !existingIds.has(e.id));
        if (newEvents.length > 0) {
          if (prev.length > 0) {
            setShowIndicator(true);
            setTimeout(() => setShowIndicator(false), 4000);
          }
          return [...newEvents, ...prev];
        }
        return prev;
      });
    }
  }, [fetchedEvents]);

  const sorted = useMemo(
    () => events.slice().sort((a: any, b: any) => Number(b.ledger) - Number(a.ledger)),
    [events],
  );

  const visible = useMemo(
    () => (filter === "all" ? sorted : sorted.filter((e: any) => e.topic === filter)),
    [sorted, filter],
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
          </div>
          <p className="text-muted-foreground">
            The most recent {HISTORY_LIMIT} on-chain events from the StellarGive contract.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event type filters">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              role="tab"
              aria-selected={filter === f.key}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading && events.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && events.length === 0 ? (
          <div className="text-center py-20 text-red-500">Unable to load on-chain events.</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No {filter === "all" ? "" : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}{" "}
            events found yet.
          </div>
        ) : (
          <>
            <div className="relative hidden md:block overflow-x-auto">
              {showIndicator && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-medium shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
                  New activity
                </div>
              )}
              <Card>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/20">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-md">Status</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3 rounded-tr-md text-right">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((event: any) => (
                      <ActivityRowDesktop key={event.id} event={event} />
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="relative md:hidden space-y-4">
              {showIndicator && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-medium shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
                  New activity
                </div>
              )}
              {visible.map((event: any) => (
                <ActivityRowMobile key={event.id} event={event} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function useActivityData(event: any) {
  const id = campaignId(event.data?.[0]);
  const when = event.createdAt ? (
    <RelativeTime date={new Date(event.createdAt)} fallback={`Ledger ${event.ledger}`} />
  ) : (
    `Ledger ${event.ledger}`
  );

  let icon = <Megaphone className="w-4 h-4 text-blue-500" />;
  let iconBg = "bg-blue-500/10";
  let label = event.topic;
  let body: React.ReactNode = null;

  if (event.topic === "received") {
    const donor = normalizeAddress(event.data?.[1]);
    icon = <ArrowUpRight className="w-4 h-4 text-green-500" />;
    iconBg = "bg-green-500/10";
    label = "Donated";
    body = (
      <>
        <span className="font-bold">{fromStroops(event.data[2])} XLM</span> donated
        {donor ? (
          <>
            {" "}
            by <AddressLink address={donor} className="text-muted-foreground" />
          </>
        ) : (
          <>
            {" "}
            by <span className="text-muted-foreground">Anonymous</span>
          </>
        )}
        {id && <> to Campaign #{id}</>}
      </>
    );
  } else if (event.topic === "created") {
    label = "Created";
    body = (
      <>
        New campaign{id && <> #{id}</>} created with a target of{" "}
        <span className="font-bold">{fromStroops(event.data[3])} XLM</span>
      </>
    );
  } else if (event.topic === "claimed") {
    const beneficiary = normalizeAddress(event.data?.[1]);
    icon = <Trophy className="w-4 h-4 text-purple-500" />;
    iconBg = "bg-purple-500/10";
    label = "Claimed";
    body = (
      <>
        <span className="font-bold">{fromStroops(event.data[3])} XLM</span> claimed
        {beneficiary ? (
          <>
            {" "}
            by <AddressLink address={beneficiary} className="text-muted-foreground" />
          </>
        ) : (
          <> by beneficiary</>
        )}
        {id && <> from Campaign #{id}</>}
      </>
    );
  } else {
    body = <span className="text-muted-foreground">{event.topic}</span>;
  }

  return { id, when, icon, iconBg, label, body, txHash: event.txHash };
}

function ActivityRowDesktop({ event }: { event: any }) {
  const { icon, iconBg, label, body, when, txHash } = useActivityData(event);

  return (
    <tr className="hover:bg-muted/10 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-full shrink-0 ${iconBg}`}>{icon}</div>
          <span className="uppercase text-[10px] font-bold tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm">{body}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {when} <span className="hidden lg:inline-block"> • Ledger {event.ledger}</span>
      </td>
      <td className="px-4 py-3 text-right">
        {txHash ? (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-primary hover:underline"
          >
            {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 4)}
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">N/A</span>
        )}
      </td>
    </tr>
  );
}

function ActivityRowMobile({ event }: { event: any }) {
  const { icon, iconBg, label, body, when, txHash } = useActivityData(event);

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-card">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-full shrink-0 ${iconBg}`}>{icon}</div>
          <span className="uppercase text-[10px] font-bold tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      <p className="text-sm">{body}</p>

      <div className="pt-3 border-t flex justify-between items-center text-xs">
        <span className="text-muted-foreground">Tx Hash</span>
        {txHash ? (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 4)}
          </a>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        )}
      </div>
    </div>
  );
}
