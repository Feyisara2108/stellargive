"use client";

import { useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AddressLink } from "@/components/AddressLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, useResolvedName } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { Trophy, ArrowDown, User } from "lucide-react";
import { useWallet } from "@/lib/WalletProvider";

/** How many on-chain events to aggregate the ranking from. */
const EVENT_LIMIT = 200;

/** Anonymous donations are recorded against the contract's zero placeholder. */
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

type TimeRange = "all" | "monthly" | "weekly";

interface DonorTotal {
  donor: string;
  total: bigint;
  donations: number;
  campaigns: number;
}

/**
 * Aggregates every `received` event into one row per donor, ranked by total
 * amount donated across all campaigns. Anonymous donations (the zero address)
 * are excluded so they can't occupy a rank.
 */
function aggregateDonors(events: any[] | undefined, timeRange: TimeRange): DonorTotal[] {
  const totals = new Map<string, { total: bigint; donations: number; campaigns: Set<string> }>();

  // Calculate time cutoff based on selected range
  const now = Date.now();
  let cutoffMs = 0;
  if (timeRange === "weekly") {
    cutoffMs = 7 * 24 * 60 * 60 * 1000;
  } else if (timeRange === "monthly") {
    cutoffMs = 30 * 24 * 60 * 60 * 1000;
  }
  const cutoff = cutoffMs > 0 ? now - cutoffMs : 0;

  for (const event of events ?? []) {
    if (event?.topic !== "received" || !event.data) continue;

    // Filter by time range if not "all"
    if (cutoff > 0 && event.timestamp) {
      const eventTime = new Date(event.timestamp).getTime();
      if (eventTime < cutoff) continue;
    }

    const donor = event.data[1]?.toString();
    if (!donor || donor === ZERO_ADDRESS) continue;

    let amount: bigint;
    try {
      amount = BigInt(event.data[2]);
    } catch {
      continue;
    }

    const entry = totals.get(donor) ?? { total: 0n, donations: 0, campaigns: new Set<string>() };
    entry.total += amount;
    entry.donations += 1;
    if (event.data[0] !== undefined && event.data[0] !== null) {
      entry.campaigns.add(event.data[0].toString());
    }
    totals.set(donor, entry);
  }

  return Array.from(totals.entries())
    .map(([donor, { total, donations, campaigns }]) => ({
      donor,
      total,
      donations,
      campaigns: campaigns.size,
    }))
    .sort((a, b) => (b.total === a.total ? 0 : b.total > a.total ? 1 : -1));
}

/** Medal colours for the podium; every other rank uses the muted badge. */
const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-400/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-400/40",
  2: "bg-slate-400/20 text-slate-600 dark:text-slate-300 ring-1 ring-slate-400/40",
  3: "bg-orange-500/20 text-orange-600 dark:text-orange-400 ring-1 ring-orange-400/40",
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${style}`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

function LeaderboardRow({
  entry,
  rank,
  isCurrentUser,
}: {
  entry: DonorTotal;
  rank: number;
  isCurrentUser: boolean;
}) {
  const { data: resolvedName } = useResolvedName(entry.donor);

  const donationLabel = `${entry.donations} donation${entry.donations === 1 ? "" : "s"}`;
  const campaignLabel = `${entry.campaigns} campaign${entry.campaigns === 1 ? "" : "s"}`;

  return (
    <li
      id={`rank-${rank}`}
      className={`flex items-center justify-between gap-4 px-4 py-3 ${
        isCurrentUser ? "bg-primary/10 border-l-4 border-primary" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <RankBadge rank={rank} />
        <div className="min-w-0 space-y-0.5">
          {resolvedName && (
            <p className="truncate text-sm font-medium text-foreground">{resolvedName}</p>
          )}
          <AddressLink address={entry.donor} className="text-xs text-muted-foreground" />
          {isCurrentUser && (
            <span className="text-xs text-primary font-medium">(You)</span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-primary tabular-nums">{fromStroops(entry.total)} XLM</p>
        <p className="text-xs text-muted-foreground">
          {donationLabel} · {campaignLabel}
        </p>
      </div>
    </li>
  );
}

export default function LeaderboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address } = useWallet();
  const { data: events, isLoading, isError } = useEvents(EVENT_LIMIT);

  const timeRange = (searchParams.get("range") as TimeRange) || "all";

  const donors = useMemo(() => aggregateDonors(events, timeRange), [events, timeRange]);

  const totalDonated = useMemo(() => donors.reduce((sum, d) => sum + d.total, 0n), [donors]);

  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      router.push(`/leaderboard?range=${range}`);
    },
    [router],
  );

  const scrollToMyRank = useCallback(() => {
    if (!address) return;
    const myIndex = donors.findIndex((d) => d.donor === address);
    if (myIndex >= 0) {
      const el = document.getElementById(`rank-${myIndex + 1}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [address, donors]);

  const myRank = address ? donors.findIndex((d) => d.donor === address) + 1 : null;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 container py-12 space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Donor Leaderboard</h1>
          </div>
          <p className="text-muted-foreground">
            Top supporters across every StellarGive campaign, ranked by total contribution.
            Anonymous donations aren&apos;t ranked.
          </p>
        </div>

        {/* Time Range Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Time range:</span>
          <div className="flex gap-1">
            {([
              { value: "all", label: "All Time" },
              { value: "monthly", label: "Monthly" },
              { value: "weekly", label: "Weekly" },
            ] as const).map(({ value, label }) => (
              <Button
                key={value}
                variant={timeRange === value ? "default" : "outline"}
                size="sm"
                onClick={() => handleRangeChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {myRank && (
            <Button variant="outline" size="sm" onClick={scrollToMyRank} className="ml-auto">
              <ArrowDown className="w-4 h-4 mr-1.5" />
              My Rank (#{myRank})
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Loading leaderboard</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError && donors.length === 0 ? (
          <div className="text-center py-20 text-red-500">Unable to load on-chain events.</div>
        ) : donors.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div>
              <p className="font-medium text-foreground">No donations yet</p>
              <p className="text-muted-foreground">
                Once the first donation lands on-chain, the leaderboard fills up here.
              </p>
            </div>
            <Button asChild>
              <Link href="/explore">Explore campaigns</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-muted-foreground">Donors ranked</p>
                <p className="text-2xl font-bold tabular-nums">{donors.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total donated</p>
                <p className="text-2xl font-bold tabular-nums">{fromStroops(totalDonated)} XLM</p>
              </div>
              {myRank && (
                <div>
                  <p className="text-muted-foreground">Your rank</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">#{myRank}</p>
                </div>
              )}
            </div>

            <Card>
              <ol className="divide-y divide-border" aria-label="Donor leaderboard">
                {donors.map((entry, index) => (
                  <LeaderboardRow
                    key={entry.donor}
                    entry={entry}
                    rank={index + 1}
                    isCurrentUser={address ? entry.donor === address : false}
                  />
                ))}
              </ol>
            </Card>

            <p className="text-xs text-muted-foreground">
              Aggregated from the most recent {EVENT_LIMIT} on-chain contract events.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
