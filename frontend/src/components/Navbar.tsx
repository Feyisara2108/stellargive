"use client";

import Link from "next/link";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Heart, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Heart className="w-5 h-5 text-primary-foreground fill-current" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            stellar<span className="text-primary">Give</span>
          </span>
        </div>

        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/explore"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Explore
          </Link>
          <Link
            href="/activity"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Activity
          </Link>
          <Link
            href="/profile"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            My Campaigns
          </Link>
          <Link
            href="/faq"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            FAQ
          </Link>
          <CreateCampaignForm />
          <div className="h-6 w-px bg-border mx-2" />
          <ThemeToggle />
          <div className="h-6 w-px bg-border mx-2" />
          <WalletConnect />
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>

        {/* Mobile drawer */}
        <div
          className={`fixed inset-y-0 left-0 w-64 bg-background shadow-lg transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between p-4 border-b">
            <span className="text-lg font-semibold">Menu</span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>
          <nav className="flex flex-col p-4 space-y-4">
            <Link
              href="/explore"
              className="text-base font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Explore
            </Link>
            <Link
              href="/activity"
              className="text-base font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Activity
            </Link>
            <Link
              href="/profile"
              className="text-base font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              My Campaigns
            </Link>
            <Link
              href="/faq"
              className="text-base font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
            <CreateCampaignForm />
            <ThemeToggle />
            <WalletConnect />
          </nav>
        </div>
      </div>
    </nav>
  );
}
