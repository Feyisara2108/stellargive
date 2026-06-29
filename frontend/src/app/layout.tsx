import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "stellarGive | Relief Grant Platform",
  description: "A decentralized donation platform built on Stellar",
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
          <div id="main-content" tabIndex={-1} className="outline-none" />
          {children}
          <Footer />
          <ConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
