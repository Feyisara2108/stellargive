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
