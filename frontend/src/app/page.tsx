import { Navbar } from "@/components/Navbar";
import { CampaignList } from "@/components/CampaignList";
import dynamic from "next/dynamic";
const EventFeed = dynamic(() => import("@/components/EventFeed").then(mod => mod.EventFeed), { ssr: false });
import { HeroCTA } from "@/components/HeroCTA";
import { Heart, ShieldCheck, Zap } from "lucide-react";

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
              Transparent, fast, and secure relief grants. Connect your wallet to start making a real impact today.
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
          </div>
        </section>

        {/* Campaigns Section */}
        <section id="explore-campaigns" className="py-16 container">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
            <div className="lg:col-span-3 space-y-8">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight">Active Campaigns</h2>
                  <p className="text-muted-foreground">Browse and support current relief efforts around the world.</p>
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

      {/* Footer */}
      <footer className="border-t py-12 bg-muted/30">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            <span>Built on Stellar Testnet for the community.</span>
          </div>
          <div className="flex gap-8">
            <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
            <a href="#" className="hover:text-foreground transition-colors">Contracts</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
          <p>© 2024 stellarGive. Open source relief.</p>
        </div>
      </footer>
    </div>
  );
}
