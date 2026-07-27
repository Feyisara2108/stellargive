"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { AddressLink } from "@/components/AddressLink";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  MISSING_FIELD,
  formatEventAmount,
  formatTxHash,
  getCampaignId,
  getEventField,
} from "@/lib/eventData";
import { RelativeTime } from "@/components/RelativeTime";
import { normalizeAddress } from "@/utils/format";
import { ArrowUpRight, Megaphone, Trophy } from "lucide-react";

function ledgerLabel(ledger: unknown): string {
  return ledger === null || ledger === undefined || ledger === "" ? MISSING_FIELD : String(ledger);
}

// ---------------------------------------------------------------------------
// Shared data-preparation hook — keeps row components thin
// ---------------------------------------------------------------------------

function useActivityData(event: any) {
  const id = getCampaignId(event);
  const ledger = ledgerLabel(event?.ledger);
  const createdAt = event?.createdAt ? new Date(event.createdAt) : null;
  const when =
    createdAt && !Number.isNaN(createdAt.getTime()) ? (
      <RelativeTime date={createdAt} fallback={`Ledger ${ledger}`} />
    ) : (
      `Ledger ${ledger}`
    );

  let icon = <Megaphone className="w-4 h-4 text-blue-500" />;
  let iconBg = "bg-blue-500/10";
  let label = event?.topic ?? MISSING_FIELD;
  let body: React.ReactNode = null;

  if (event?.topic === "received") {
    const donor = normalizeAddress(getEventField(event, 1));
    icon = <ArrowUpRight className="w-4 h-4 text-green-500" />;
    iconBg = "bg-green-500/10";
    label = "Donated";
    body = (
      <>
        <span className="font-bold">{formatEventAmount(event, 2)}</span> donated
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
  } else if (event?.topic === "created") {
    label = "Created";
    body = (
      <>
        New campaign{id && <> #{id}</>} created with a target of{" "}
        <span className="font-bold">{formatEventAmount(event, 3)}</span>
      </>
    );
  } else if (event?.topic === "claimed") {
    const beneficiary = normalizeAddress(getEventField(event, 1));
    icon = <Trophy className="w-4 h-4 text-purple-500" />;
    iconBg = "bg-purple-500/10";
    label = "Claimed";
    body = (
      <>
        <span className="font-bold">{formatEventAmount(event, 3)}</span> claimed
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
    body = <span className="text-muted-foreground">{label}</span>;
  }

  return {
    id,
    when,
    ledger,
    icon,
    iconBg,
    label,
    body,
    txHash: event?.txHash,
    txLabel: formatTxHash(event?.txHash),
  };
}

// ---------------------------------------------------------------------------
// Row renderers
// ---------------------------------------------------------------------------

function ActivityRowDesktop({ event }: { event: any }) {
  const { icon, iconBg, label, body, when, ledger, txHash, txLabel } = useActivityData(event);

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
        {when} <span className="hidden lg:inline-block"> • Ledger {ledger}</span>
      </td>
      <td className="px-4 py-3 text-right">
        {txLabel ? (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-primary hover:underline"
          >
            {txLabel}
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">N/A</span>
        )}
      </td>
    </tr>
  );
}

function ActivityRowMobile({ event }: { event: any }) {
  const { icon, iconBg, label, body, when, txHash, txLabel } = useActivityData(event);

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
        {txLabel ? (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {txLabel}
          </a>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeed — the exported split point
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  visible: any[];
  showIndicator: boolean;
}

export function ActivityFeed({ visible, showIndicator }: ActivityFeedProps) {
  return (
    <ErrorBoundary heading="Activity feed">
      {/* Desktop table */}
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
              {visible.map((event: any, idx: number) => (
                <ActivityRowDesktop key={event?.id ?? `event-${idx}`} event={event} />
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="relative md:hidden space-y-4">
        {showIndicator && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-medium shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
            New activity
          </div>
        )}
        {visible.map((event: any, idx: number) => (
          <ActivityRowMobile key={event?.id ?? `event-${idx}`} event={event} />
        ))}
      </div>
    </ErrorBoundary>
  );
}
