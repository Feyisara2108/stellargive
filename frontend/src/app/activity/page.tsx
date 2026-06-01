"use client";

import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddressLink } from "@/components/AddressLink";
import { useEvents } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { RelativeTime } from "@/components/RelativeTime";
import {
  Activity,
  ArrowUpRight,
  Loader2,
  Megaphone,
  Trophy,
} from "lucide-react";

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
  const { data: events, isLoading, isError } = useEvents(HISTORY_LIMIT);
  const [filter, setFilter] = useState<FilterKey>("all");

  const sorted = useMemo(
    () =>
      (events ?? [])
        .slice()
        .sort((a: any, b: any) => Number(b.ledger) - Number(a.ledger)),
    [events]
  );

  const visible = useMemo(
    () => (filter === "all" ? sorted : sorted.filter((e: any) => e.topic === filter)),
    [sorted, filter]
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

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="text-center py-20 text-red-500">Unable to load on-chain events.</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No {filter === "all" ? "" : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}{" "}
            events found yet.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {visible.map((event: any) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function ActivityRow({ event }: { event: any }) {
  const id = campaignId(event.data?.[0]);
  const when = event.createdAt
    ? <RelativeTime date={new Date(event.createdAt)} fallback={`Ledger ${event.ledger}`} />
    : `Ledger ${event.ledger}`;

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
            {" "}by <AddressLink address={donor} className="text-muted-foreground" />
          </>
        ) : (
          <> by <span className="text-muted-foreground">Anonymous</span></>
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
          <> by <AddressLink address={beneficiary} className="text-muted-foreground" /></>
        ) : (
          <> by beneficiary</>
        )}
        {id && <> from Campaign #{id}</>}
      </>
    );
  } else {
    body = <span className="text-muted-foreground">{event.topic}</span>;
  }

  return (
    <div className="flex gap-4 items-start p-4">
      <div className={`mt-0.5 p-2 rounded-full shrink-0 ${iconBg}`}>{icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm">{body}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
          <span>{label}</span>
          <span>•</span>
          <span>{when}</span>
          <span>•</span>
          <span>Ledger {event.ledger}</span>
        </div>
      </div>
    </div>
  );
}
