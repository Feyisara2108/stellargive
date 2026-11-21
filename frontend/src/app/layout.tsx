import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const inter = Inter({ subsets: ["latin"] });

const SITE_NAME = "StellarGive";

/**
 * Pages set only their own title (e.g. "Explore Relief Campaigns"); the
 * template adds the brand suffix, so it is written once, here.
 *
 * The openGraph and twitter defaults deliberately leave out title and
 * description: Next fills those from each page's resolved title and
 * description, so every page gets its own social preview. Setting them here
 * would make every page that doesn't override openGraph share the home title.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://stellargive.org"),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} | Relief Grant Platform`,
    template: `%s | ${SITE_NAME}`,
  },
  description: "A decentralized donation platform built on Stellar",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background antialiased`}>
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border rounded-md"
          >
            Skip to content
          </a>
          <main id="main-content" tabIndex={-1} className="outline-none">
            <ErrorBoundary heading="Application">{children}</ErrorBoundary>
          </main>
          <Footer />
          <ConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
