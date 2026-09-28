"use client";

import { useEffect, useRef, useState } from "react";
import { usePlatformStats, useUniqueDonors } from "@/hooks/useSoroban";
import { usePlatformStats } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { AlertCircle, Flame, RotateCw, TrendingUp, UserRoundCheck, Users } from "lucide-react";

/** How long a total takes to count from zero up to its final value, in ms. */
const COUNT_UP_MS = 1100;

/** Decelerating ease so the number settles onto the total instead of stopping dead. */
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * Counts `value` up from zero the first time the card is scrolled into view, and
 * returns the ref to observe alongside the number to render.
 *
 * Until the browser reports the card on screen the real total is rendered as-is:
 * reduced-motion users, environments without `IntersectionObserver`, and totals
 * that arrive before anyone scrolls never get a bogus zero, and a total that
 * changes after the count (a Retry refetch, say) lands straight on screen.
 */
function useCountUpOnView(value: number, animate: boolean) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const countingRef = useRef(false);
  const [display, setDisplay] = useState(value);

  const stop = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  // Reduced motion renders the final value immediately, and a preference change
  // mid-count snaps the remaining frames to it.
  useEffect(() => {
    if (animate) return;
    stop();
    setDisplay(value);
  }, [animate, value]);

  // A new total is never re-animated — only the first view counts up.
  useEffect(() => {
    stop();
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    const card = cardRef.current;
    if (!animate || countingRef.current || !card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        countingRef.current = true;

        // Timed off the animation frame timestamps rather than performance.now():
        // the two can sit on different time origins, which would make the count
        // jump straight to the total or run backwards.
        let startedAt: number | null = null;
        const tick = (now: number) => {
          startedAt ??= now;
          const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
          setDisplay(value * easeOutCubic(progress));
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(tick);
          } else {
            frameRef.current = null;
            setDisplay(value);
          }
        };
        frameRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.25 },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [animate, value]);

  return { cardRef, display };
}
import { AlertCircle, Flame, RotateCw, TrendingUp, Users } from "lucide-react";

/** How long a total takes to count from zero up to its final value, in ms. */
const COUNT_UP_MS = 1100;

/** Decelerating ease so the number settles onto the total instead of stopping dead. */
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * Counts `value` up from zero the first time the card is scrolled into view, and
 * returns the ref to observe alongside the number to render.
 *
 * Until the browser reports the card on screen the real total is rendered as-is:
 * reduced-motion users, environments without `IntersectionObserver`, and totals
 * that arrive before anyone scrolls never get a bogus zero, and a total that
 * changes after the count (a Retry refetch, say) lands straight on screen.
 */
function useCountUpOnView(value: number, animate: boolean) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const countingRef = useRef(false);
  const [display, setDisplay] = useState(value);

  const stop = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  // Reduced motion renders the final value immediately, and a preference change
  // mid-count snaps the remaining frames to it.
  useEffect(() => {
    if (animate) return;
    stop();
    setDisplay(value);
  }, [animate, value]);

  // A new total is never re-animated — only the first view counts up.
  useEffect(() => {
    stop();
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    const card = cardRef.current;
    if (!animate || countingRef.current || !card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        countingRef.current = true;

        // Timed off the animation frame timestamps rather than performance.now():
        // the two can sit on different time origins, which would make the count
        // jump straight to the total or run backwards.
        let startedAt: number | null = null;
        const tick = (now: number) => {
          startedAt ??= now;
          const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
          setDisplay(value * easeOutCubic(progress));
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(tick);
          } else {
            frameRef.current = null;
            setDisplay(value);
          }
        };
        frameRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.25 },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [animate, value]);

  return { cardRef, display };
}

export function PlatformStats() {
  const { data: stats, isLoading, isError, refetch, isFetching } = usePlatformStats();
  const { data: uniqueDonors, isLoading: donorsLoading, isError: donorsError } = useUniqueDonors();
  const prefersReducedMotion = usePrefersReducedMotion();

  // Derived before the early returns below: the count-up hooks have to run on
  // every render, including the loading, error and empty ones.
  const totalCampaigns = Number(stats?.totalCampaigns ?? 0);
  const totalRaised = Number(fromStroops(BigInt(stats?.totalRaised ?? 0)));
  const activeCampaigns = Number(stats?.activeCampaigns ?? 0);

  const campaignsCount = useCountUpOnView(totalCampaigns, !prefersReducedMotion);
  const raisedCount = useCountUpOnView(totalRaised, !prefersReducedMotion);
  const activeCount = useCountUpOnView(activeCampaigns, !prefersReducedMotion);
  // Held back until the count is real, so the card can't spend its one count-up
  // climbing to a total it doesn't have yet and then snap to the real number.
  const donorsCount = useCountUpOnView(
    uniqueDonors ?? 0,
    !prefersReducedMotion && uniqueDonors !== undefined,
  );

  if (isLoading) {
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-8 pt-6 min-h-[3.5rem]"
        aria-busy="true"
        aria-live="polite"
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-3 pt-6 min-h-[3.5rem] text-sm"
        role="status"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-destructive" aria-hidden="true" />
          Couldn&apos;t load platform stats.
        </span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isFetching ? "Retrying..." : "Retry"}
        </Button>
      </div>
    );
  }

  if (totalCampaigns === 0) {
    return (
      <div className="flex items-center justify-center pt-6 min-h-[3.5rem]" role="status">
        <p className="text-sm text-muted-foreground">
          No campaigns yet — be the first to start one.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6" role="status">
      <StatCard
        ref={campaignsCount.cardRef}
        icon={<Users className="h-4 w-4 text-primary" />}
        title="Total Campaigns"
        value={campaignsCount.display.toString()}
      />
      <StatCard
        ref={raisedCount.cardRef}
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        title="Total Raised"
        value={`${raisedCount.display.toLocaleString()} XLM`}
      />
      <StatCard
        ref={activeCount.cardRef}
        icon={<Flame className="h-4 w-4 text-primary" />}
        title="Active Campaigns"
        value={activeCount.display.toString()}
      />
      {/* The donor count reads a different RPC resource, so it fails on its own:
          a dead event feed costs this card its number instead of taking the
          three campaign totals — and the Retry button — down with it. */}
      <StatCard
        ref={donorsCount.cardRef}
        icon={<UserRoundCheck className="h-4 w-4 text-primary" />}
        title="Unique Donors"
        value={donorsError ? "—" : donorsCount.display.toString()}
        loading={donorsLoading}
        tooltip="Distinct donor addresses across the donation events scanned from the start of the contract's history. Anonymous donations are excluded."
      />
    </div>
  );
}
