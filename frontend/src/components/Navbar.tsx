"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import dynamic from "next/dynamic";
const CreateCampaignForm = dynamic(
  () => import("@/components/CreateCampaignForm").then((mod) => mod.CreateCampaignForm),
  { ssr: false },
);
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconButton } from "@/components/ui/icon-button";
import { Heart, Menu, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/activity", label: "Activity" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "My Campaigns" },
  { href: "/faq", label: "FAQ" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const hadOpen = useRef(false);
  const pathname = usePathname();

  // Focus trap + ESC close
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    focusable[0]?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileMenuOpen]);

  // Return focus to the menu button when the drawer closes
  useEffect(() => {
    if (!mobileMenuOpen && hadOpen.current) {
      menuButtonRef.current?.focus();
    }
    hadOpen.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  const closeMenu = () => setMobileMenuOpen(false);
  const motionClass = prefersReducedMotion ? "" : "transition-transform duration-300 ease-in-out";
  const backdropMotionClass = prefersReducedMotion ? "" : "transition-opacity duration-300";

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
          {NAV_LINKS.map((link) => {
            const isActive = pathname
              ? pathname === link.href || pathname.startsWith(`${link.href}/`)
              : false;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`text-sm font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <CreateCampaignForm />
          <div className="h-6 w-px bg-border mx-2" />
          <ThemeToggle />
          <div className="h-6 w-px bg-border mx-2" />
          <WalletConnect />
        </div>

        {/* Mobile menu button */}
        <IconButton
          ref={menuButtonRef}
          className="md:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-drawer"
        >
          <Menu size={24} />
        </IconButton>
      </div>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 ${backdropMotionClass} ${
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
        onClick={closeMenu}
      />

      {/* Mobile drawer */}
      <div
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-background shadow-xl ${motionClass} ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-lg font-semibold">Menu</span>
          <IconButton onClick={closeMenu} aria-label="Close menu">
            <X size={20} />
          </IconButton>
        </div>
        <nav className="flex flex-col p-4 space-y-4" aria-label="Mobile navigation">
          {NAV_LINKS.map((link) => {
            const isActive = pathname
              ? pathname === link.href || pathname.startsWith(`${link.href}/`)
              : false;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`text-base font-medium transition-colors py-1 ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t">
            <CreateCampaignForm />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
          <div>
            <WalletConnect />
          </div>
        </nav>
      </div>
    </nav>
  );
}
