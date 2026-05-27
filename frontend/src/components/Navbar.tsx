"use client";

import Link from "next/link";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Heart } from "lucide-react";

export function Navbar() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Heart className="w-5 h-5 text-primary-foreground fill-current" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            stellar<span className="text-primary">Give</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/explore"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Explore
          </Link>
          <CreateCampaignForm />
          <div className="h-6 w-px bg-border mx-2" />
          <ThemeToggle />
          <div className="h-6 w-px bg-border mx-2" />
          <WalletConnect />
        </div>
      </div>
    </nav>
  );
}
