import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Compass, Home, SearchX } from "lucide-react";

/**
 * Global 404. Mirrors the visual language of CampaignNotFound so an unknown
 * route and an unknown campaign feel like the same product, and renders the
 * app shell (Navbar here, Footer from the root layout) instead of the bare
 * Next.js default page.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1 container py-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">404</p>
            <h1 className="text-3xl font-bold tracking-tight">Page Not Found</h1>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              The page you&apos;re looking for doesn&apos;t exist or has moved. Head back home or
              browse the campaigns raising funds right now.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Go Home
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/explore">
                <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
                Explore Campaigns
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
