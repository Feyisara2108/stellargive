import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";

// Extend Vitest's expect with the toHaveNoViolations matcher
expect.extend(toHaveNoViolations);

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  init: vi.fn(),
}));

// Mock @stellar/stellar-sdk
vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(() => ({})),
    },
    Address: vi.fn().mockImplementation(() => ({
      toScVal: () => ({}),
    })),
  };
});

// Mock hooks
vi.mock("@/hooks/useSoroban", () => ({
  useCampaignsPaged: () => ({
    data: { campaigns: [], hasMore: false },
    isLoading: false,
    isFetching: false,
  }),
  useRecentCampaigns: () => ({
    data: [],
    isLoading: false,
  }),
  useCampaign: () => ({
    data: {
      id: 1n,
      title: "Test Campaign",
      description: "A test description",
      creator: "GB",
      beneficiary: "GC",
      status: "Active",
      raised_amount: 0n,
      target_amount: 100n,
      deadline: 0n,
    },
    isLoading: false,
  }),
  useCancelCampaign: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCreateCampaign: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useWalletBalance: () => ({
    data: "100",
    isLoading: false,
  }),
}));

// Mock WalletProvider
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    address: "GA",
    isWrongNetwork: false,
  }),
}));

// Mock dynamic and complex components to avoid network/rendering side-effects
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div data-testid="navbar" /> }));
vi.mock("@/components/HeroCTA", () => ({ HeroCTA: () => <div data-testid="hero-cta" /> }));
vi.mock("@/components/PlatformStats", () => ({ PlatformStats: () => <div data-testid="platform-stats" /> }));
vi.mock("@/components/CampaignList", () => ({ CampaignList: () => <div data-testid="campaign-list" /> }));
vi.mock("@/components/EventFeed", () => ({ EventFeed: () => <div data-testid="event-feed" /> }));
vi.mock("@/components/CampaignCard", () => ({ CampaignCard: () => <div data-testid="campaign-card" /> }));
vi.mock("@/components/RecentDonations", () => ({ RecentDonations: () => <div data-testid="recent-donations" /> }));
vi.mock("@/components/ProjectUpdates", () => ({ ProjectUpdates: () => <div data-testid="project-updates" /> }));
vi.mock("@/components/DonateModal", () => ({ DonateModal: () => <div data-testid="donate-modal" /> }));
vi.mock("@/components/TokenSelector", () => ({
  TokenSelector: () => <div data-testid="token-selector" />,
  PREDEFINED_TOKENS: [],
}));
vi.mock("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => <div data-testid="breadcrumbs" /> }));
vi.mock("@/components/AddressLink", () => ({ AddressLink: () => <div data-testid="address-link" /> }));
vi.mock("@/components/RefundButton", () => ({ RefundButton: () => <div data-testid="refund-button" /> }));
vi.mock("@/components/StickyDonateBar", () => ({ StickyDonateBar: () => <div data-testid="sticky-donate-bar" /> }));
vi.mock("@/components/CampaignStatusBadge", () => ({ CampaignStatusBadge: () => <div data-testid="campaign-status-badge" /> }));

import Home from "@/app/page";
import ExplorePage from "@/app/explore/page";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { CampaignDetailsClient } from "@/app/campaign/[id]/CampaignDetailsClient";

/**
 * Helper to run axe-core against a rendered container, filtering for
 * only serious or critical violations as requested.
 */
async function checkAccessibility(container: HTMLElement) {
  const results = await axe(container);
  const violations = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  if (violations.length > 0) {
    console.error("Accessibility Violations:", JSON.stringify(violations, null, 2));
  }
  expect(violations).toHaveLength(0);
}

describe("Core Pages Accessibility Suite", () => {
  it("Home page accessibility", async () => {
    const { container } = render(<Home />);
    await checkAccessibility(container);
  });

  it("Explore page accessibility", async () => {
    const { container } = render(<ExplorePage />);
    await checkAccessibility(container);
  });

  it("Create Campaign Form accessibility", async () => {
    const { container } = render(<CreateCampaignForm inline={true} />);
    await checkAccessibility(container);
  });

  it("Campaign Detail page accessibility", async () => {
    const { container } = render(<CampaignDetailsClient params={{ id: "1" }} />);
    await checkAccessibility(container);
  });
});
