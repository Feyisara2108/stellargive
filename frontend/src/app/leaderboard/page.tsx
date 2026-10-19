"use client";

import { useMemo, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AddressLink } from "@/components/AddressLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, useResolvedName, useTokenMetadataBatch } from "@/hooks/useSoroban";
import { toCSV, downloadTextFile, formatTokenAmount } from "@/utils/format";
import { Trophy, ArrowDown, Download } from "lucide-react";
import { useWallet } from "@/lib/WalletProvider";
import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import {
  describeToken,
  formatTokenTotals,
  tokensNeedingMetadata,
  type TokenDisplay,
} from "@/lib/tokenTotals";
import {
  aggregateDonorsByToken,
  pickLeaderboardToken,
  type DonorTotal,
  type TimeRange,
} from "./aggregateDonors";

/** How many on-chain events to aggregate the ranking from. */
const EVENT_LIMIT = 200;

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
  token,
}: {
  entry: DonorTotal;
  rank: number;
  isCurrentUser: boolean;
  token: TokenDisplay;
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
          {isCurrentUser && <span className="text-xs text-primary font-medium">(You)</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-primary tabular-nums">
          {formatTokenAmount(entry.total, token.decimals)} {token.symbol}
        </p>
        <p className="text-xs text-muted-foreground">
          {donationLabel} · {campaignLabel}
        </p>
      </div>
    </li>
  );
}

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address } = useWallet();
  const { data: events, isLoading, isError } = useEvents(EVENT_LIMIT);

  const timeRange = (searchParams.get("range") as TimeRange) || "all";

  const donorsByToken = useMemo(
    () => aggregateDonorsByToken(events, timeRange),
    [events, timeRange],
  );
  const tokenIds = useMemo(() => Array.from(donorsByToken.keys()), [donorsByToken]);
  const { data: tokenMetas } = useTokenMetadataBatch(tokensNeedingMetadata(tokenIds));

  // Amounts in different tokens can't be compared, so donors are ranked within one token.
  const selectedToken = pickLeaderboardToken(
    donorsByToken,
    searchParams.get("token"),
    NATIVE_XLM_CONTRACT_ID,
  );
  const donors = useMemo(
    () => (selectedToken === null ? [] : (donorsByToken.get(selectedToken) ?? [])),
    [donorsByToken, selectedToken],
  );
  const tokenDisplay = describeToken(selectedToken ?? "", tokenMetas?.[selectedToken ?? ""]);

  // One figure per token; never a combined total.
  const totalsByToken = useMemo(
    () =>
      formatTokenTotals(
        new Map(
          Array.from(donorsByToken, ([token, ranked]) => [
            token,
            ranked.reduce((sum, d) => sum + d.total, 0n),
          ]),
        ),
        tokenMetas ?? {},
      ),
    [donorsByToken, tokenMetas],
  );

  const navigate = useCallback(
    (range: TimeRange, token: string | null) => {
      const params = new URLSearchParams({ range });
      if (token) params.set("token", token);
      router.push(`/leaderboard?${params.toString()}`);
    },
    [router],
  );

  const handleRangeChange = useCallback(
    (range: TimeRange) => navigate(range, searchParams.get("token")),
    [navigate, searchParams],
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

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Rank",
      "Donor Address",
      `Total Donated (${tokenDisplay.symbol})`,
      "Donations",
      "Campaigns",
    ];
    const rows = donors.map((d, index) => [
      index + 1,
      d.donor,
      formatTokenAmount(d.total, tokenDisplay.decimals),
      d.donations,
      d.campaigns,
    ]);
    const csv = toCSV(headers, rows);
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`stellargive-leaderboard-${timeRange}-${date}.csv`, csv);
  }, [donors, timeRange, tokenDisplay.symbol, tokenDisplay.decimals]);

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
            {(
              [
                { value: "all", label: "All Time" },
                { value: "monthly", label: "Monthly" },
                { value: "weekly", label: "Weekly" },
              ] as const
            ).map(({ value, label }) => (
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
          {tokenIds.length > 1 && (
            <>
              <span className="ml-2 text-sm text-muted-foreground">Token:</span>
              <div className="flex gap-1" role="group" aria-label="Rank by token">
                {tokenIds.map((token) => (
                  <Button
                    key={token}
                    variant={token === selectedToken ? "default" : "outline"}
                    size="sm"
                    aria-pressed={token === selectedToken}
                    onClick={() => navigate(timeRange, token)}
                  >
                    {describeToken(token, tokenMetas?.[token]).symbol}
                  </Button>
                ))}
              </div>
            </>
          )}
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
            <div className="flex flex-wrap items-end justify-between gap-6 text-sm">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-muted-foreground">Donors ranked</p>
                  <p className="text-2xl font-bold tabular-nums">{donors.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total donated</p>
                  <ul
                    className="text-2xl font-bold tabular-nums"
                    aria-label="Total donated per token"
                  >
                    {totalsByToken.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
                {myRank && (
                  <div>
                    <p className="text-muted-foreground">Your rank</p>
                    <p className="text-2xl font-bold tabular-nums text-primary">#{myRank}</p>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-1.5" />
                Export CSV
              </Button>
            </div>

            <Card>
              <ol className="divide-y divide-border" aria-label="Donor leaderboard">
                {donors.map((entry, index) => (
                  <LeaderboardRow
                    key={entry.donor}
                    entry={entry}
                    rank={index + 1}
                    isCurrentUser={address ? entry.donor === address : false}
                    token={tokenDisplay}
                  />
                ))}
              </ol>
            </Card>

            <p className="text-xs text-muted-foreground">
              Aggregated from the most recent {EVENT_LIMIT} on-chain contract events.
              {tokenIds.length > 1 &&
                ` Ranked by donations in ${tokenDisplay.symbol}; amounts in different tokens aren't added together.`}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function LeaderboardPage() {
  // useSearchParams (used in LeaderboardContent) requires a Suspense boundary above
  // it so Next.js can statically render the route without bailing out of CSR.
  return (
    <Suspense>
      <LeaderboardContent />
    </Suspense>
  );
}
