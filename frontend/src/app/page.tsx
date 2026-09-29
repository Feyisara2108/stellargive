"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { CampaignList } from "@/components/CampaignList";
import dynamic from "next/dynamic";
const EventFeed = dynamic(() => import("@/components/EventFeed").then((mod) => mod.EventFeed), {
  ssr: false,
});
import { HeroCTA } from "@/components/HeroCTA";
import { PlatformStats } from "@/components/PlatformStats";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Heart, Megaphone, ShieldCheck, Trophy, Wallet, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type HowItWorksStep = {
  title: string;
  description: string;
  Icon: LucideIcon;
  href?: string;
  cta?: string;
};

// The three stages of the campaign lifecycle, in the order they happen on-chain.
// The closing step links into the create flow so a visitor who just read how
// claiming works can start their own campaign.
const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    title: "Create",
    description:
      "Describe the cause, set a funding goal and deadline, and name the beneficiary. Your campaign goes live as soon as your wallet signs.",
    Icon: Megaphone,
  },
  {
    title: "Fund",
    description:
      "Supporters connect a wallet and donate in a supported token. Funds move straight into the campaign's contract — no platform account holds them.",
    Icon: Wallet,
  },
  {
    title: "Claim",
    description:
      "Once the goal is met or the deadline passes, the beneficiary claims the raised funds in a single transaction.",
    Icon: Trophy,
    href: "/create",
    cta: "Start your own campaign",
  },
];
import { CampaignCard } from "@/components/CampaignCard";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentCampaigns } from "@/hooks/useSoroban";
import type { Campaign } from "@/lib/soroban";
import { Heart, ShieldCheck, Zap, ChevronLeft, ChevronRight } from "lucide-react";

/** Auto-advance interval for the featured carousel, in ms. */
const AUTO_ADVANCE_MS = 6000;
/** Minimum horizontal drag distance to count as a swipe, in px. */
const SWIPE_THRESHOLD_PX = 50;
/** How many campaigns of each kind to pull into the highlight reel. */
const HIGHLIGHTS_PER_CATEGORY = 4;
const MAX_HIGHLIGHTS = 6;

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return prefers;
}

type HighlightLabel = "Near Goal" | "Trending";
interface Highlight {
  campaign: Campaign;
  label: HighlightLabel;
}

/**
 * Curates the homepage highlight reel: active campaigns closest to their
 * funding goal, plus active campaigns raising fastest relative to time left.
 * Mirrors the "near-goal" / "trending" formulas used by the explore page's
 * sort options, kept local here since this reel's curation (capped, deduped,
 * two-category blend) is specific to this section.
 */
function curateHighlights(campaigns: Campaign[]): Highlight[] {
  const active = campaigns.filter((c) => c.status === "Active");
  const now = Date.now() / 1000;

  const progressBps = (c: Campaign) =>
    c.target_amount === 0n ? 0 : Number((c.raised_amount * 10_000n) / c.target_amount);

  const nearGoal = active
    .filter((c) => {
      const bps = progressBps(c);
      return bps >= 5000 && bps < 10000;
    })
    .sort((a, b) => progressBps(b) - progressBps(a))
    .slice(0, HIGHLIGHTS_PER_CATEGORY)
    .map((campaign): Highlight => ({ campaign, label: "Near Goal" }));

  const nearGoalIds = new Set(nearGoal.map((h) => h.campaign.id.toString()));

  const trendingScore = (c: Campaign) => {
    const progress = c.target_amount === 0n ? 0 : Number(c.raised_amount) / Number(c.target_amount);
    const daysLeft = Math.max((Number(c.deadline) - now) / 86400, 0.1);
    return progress / daysLeft;
  };

  const trending = active
    .filter((c) => !nearGoalIds.has(c.id.toString()))
    .sort((a, b) => trendingScore(b) - trendingScore(a))
    .slice(0, HIGHLIGHTS_PER_CATEGORY)
    .map((campaign): Highlight => ({ campaign, label: "Trending" }));

  return [...nearGoal, ...trending].slice(0, MAX_HIGHLIGHTS);
}

function FeaturedCarousel() {
  const { data: campaigns, isLoading } = useRecentCampaigns();
  const prefersReducedMotion = usePrefersReducedMotion();
  const highlights = useMemo(() => curateHighlights(campaigns ?? []), [campaigns]);

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Clamp the index if the highlight set shrinks (e.g. after a refetch).
  useEffect(() => {
    if (index >= highlights.length) setIndex(0);
  }, [highlights.length, index]);

  const goTo = useCallback(
    (next: number) => {
      if (highlights.length === 0) return;
      setIndex(((next % highlights.length) + highlights.length) % highlights.length);
    },
    [highlights.length],
  );
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-advance: off entirely for reduced-motion users, and paused on
  // hover/focus so a reader isn't fighting the slide out from under them.
  useEffect(() => {
    if (prefersReducedMotion || isPaused || highlights.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % highlights.length), AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, isPaused, highlights.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center">
        <Skeleton className="h-[420px] w-full max-w-md rounded-xl" />
      </div>
    );
  }

  if (highlights.length === 0) return null;

  // Reduced-motion fallback: no autoplay, no sliding animation, just the
  // same curated campaigns laid out as a static grid.
  if (prefersReducedMotion) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {highlights.map(({ campaign, label }) => (
          <CampaignCard key={campaign.id.toString()} campaign={campaign} highlightLabel={label} />
        ))}
      </div>
    );
  }

  const current = highlights[index];

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sr-only" aria-live="polite">
        Showing featured campaign {index + 1} of {highlights.length}: {current.campaign.title} (
        {current.label})
      </div>

      <div className="mx-auto max-w-md">
        <div key={current.campaign.id.toString()} className="animate-in fade-in duration-500">
          <CampaignCard campaign={current.campaign} highlightLabel={current.label} />
        </div>
      </div>

      {highlights.length > 1 && (
        <>
          <IconButton
            aria-label="Previous featured campaign"
            variant="outline"
            className="absolute left-0 top-1/3 -translate-y-1/2 -translate-x-1/2 bg-background shadow-md hidden sm:inline-flex"
            onClick={goPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Next featured campaign"
            variant="outline"
            className="absolute right-0 top-1/3 -translate-y-1/2 translate-x-1/2 bg-background shadow-md hidden sm:inline-flex"
            onClick={goNext}
          >
            <ChevronRight className="h-4 w-4" />
          </IconButton>

          <div className="flex justify-center gap-1.5 pt-4">
            {highlights.map((h, i) => (
              <button
                key={h.campaign.id.toString()}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to featured campaign ${i + 1} of ${highlights.length}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? "w-6 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 bg-gradient-to-b from-primary/5 to-background border-b">
          <div className="container text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-[800px] mx-auto leading-tight">
              Direct Relief, <span className="text-gradient">Powered by Stellar</span>
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-[600px] mx-auto">
              Transparent, fast, and secure relief grants. Connect your wallet to start making a
              real impact today.
            </p>

            <div className="flex flex-wrap justify-center gap-8 pt-8 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Instant Settlements
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> Verified Beneficiaries
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary" /> 100% Direct Impact
              </div>
            </div>

            <HeroCTA />
            <PlatformStats />
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-16 container" aria-labelledby="how-it-works-title">
          <div className="max-w-2xl mx-auto text-center space-y-2">
            <h2 id="how-it-works-title" className="text-3xl font-bold tracking-tight">
              How It Works
            </h2>
            <p className="text-muted-foreground">
              Every campaign moves through the same three steps, enforced by the smart contract
              rather than by StellarGive.
            </p>
          </div>

          <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => {
              const { Icon } = step;
              return (
                <li
                  key={step.title}
                  className="flex flex-col rounded-xl border bg-card text-card-foreground p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Step {index + 1}
                    </span>
                  </div>

                  <h3 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>

                  {step.href && step.cta ? (
                    <Button asChild size="sm" className="mt-6 self-start">
                      <Link href={step.href}>
                        {step.cta}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        {/* Featured Campaigns */}
        <section className="py-16 container border-b">
          <div className="space-y-1 text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Featured Campaigns</h2>
            <p className="text-muted-foreground">
              Near-goal and trending campaigns making the most impact right now.
            </p>
          </div>
          <FeaturedCarousel />
        </section>

        {/* Campaigns Section */}
        <section id="explore-campaigns" className="py-16 container">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
            <div className="lg:col-span-3 space-y-8">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight">Active Campaigns</h2>
                  <p className="text-muted-foreground">
                    Browse and support current relief efforts around the world.
                  </p>
                </div>
              </div>
              <CampaignList />
            </div>

            <div className="lg:col-span-1">
              <EventFeed />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
