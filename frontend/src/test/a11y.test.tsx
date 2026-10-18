import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@/test/render";
import { axe, toHaveNoViolations } from "jest-axe";
import { createSorobanMock } from "@/test/mockSoroban";
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
      Server: vi.fn(function () {
        return {};
      }),
    },
    Address: vi.fn().mockImplementation(() => ({
      toScVal: () => ({}),
    })),
  };
});

// Mock hooks. Each hook is a `vi.fn` so individual accessibility tests can
// supply page-specific mocked data while sharing a single module mock.
vi.mock("@/hooks/useSoroban", () =>
  createSorobanMock({
    useCampaignsPaged: vi.fn(() => ({
      data: { campaigns: [], hasMore: false },
      isLoading: false,
      isFetching: false,
    })),
    useRecentCampaigns: vi.fn(() => ({
      data: [],
      isLoading: false,
    })),
    useCampaign: vi.fn(() => ({
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
    })),
    useCancelCampaign: vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    })),
    useEvents: vi.fn(() => ({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
    useCreateCampaign: vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    })),
    useWalletBalance: vi.fn(() => ({
      data: "100",
      isLoading: false,
    })),
    useTokenMetadataBatch: vi.fn(() => ({
      data: {},
      isLoading: false,
    })),
    useResolvedName: vi.fn(() => ({ data: null, isFetching: false })),
    useTokenMetadata: vi.fn(() => ({ data: undefined, isLoading: false })),
    useXlmPrice: vi.fn(() => ({ data: undefined, isLoading: false })),
    // Consumed by the lazy-loaded AdminPanel.
    usePlatformConfig: vi.fn(() => ({
      data: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    })),
    useAddToWhitelist: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useAddUpdate: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    usePauseContract: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUnpauseContract: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }),
);

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
vi.mock("@/components/PlatformStats", () => ({
  PlatformStats: () => <div data-testid="platform-stats" />,
}));
vi.mock("@/components/CampaignList", () => ({
  CampaignList: () => <div data-testid="campaign-list" />,
}));
vi.mock("@/components/EventFeed", () => ({ EventFeed: () => <div data-testid="event-feed" /> }));
vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: () => <div data-testid="campaign-card" />,
}));
vi.mock("@/components/RecentDonations", () => ({
  RecentDonations: () => <div data-testid="recent-donations" />,
}));
vi.mock("@/components/ProjectUpdates", () => ({
  ProjectUpdates: () => <div data-testid="project-updates" />,
}));
vi.mock("@/components/DonateModal", () => ({
  DonateModal: () => <div data-testid="donate-modal" />,
}));
vi.mock("@/components/TokenSelector", () => ({
  TokenSelector: () => <div data-testid="token-selector" />,
  PREDEFINED_TOKENS: [],
}));
vi.mock("@/components/Breadcrumbs", () => ({
  Breadcrumbs: () => <div data-testid="breadcrumbs" />,
}));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: () => <span data-testid="address-link" />,
}));
vi.mock("@/components/RefundButton", () => ({
  RefundButton: () => <div data-testid="refund-button" />,
}));
vi.mock("@/components/StickyDonateBar", () => ({
  StickyDonateBar: () => <div data-testid="sticky-donate-bar" />,
}));
vi.mock("@/components/CampaignStatusBadge", () => ({
  CampaignStatusBadge: ({ status }: { status?: string }) => (
    <div data-testid="campaign-status-badge">{status}</div>
  ),
}));

import Home from "@/app/page";
import ExplorePage from "@/app/explore/page";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { CampaignDetailsClient } from "@/app/campaign/[id]/CampaignDetailsClient";
import ProfilePage from "@/app/profile/page";
import LeaderboardPage from "@/app/leaderboard/page";
import ActivityPage from "@/app/activity/page";
import AdminPage from "@/app/admin/page";
import FaqPage from "@/app/faq/page";
import { useEvents, useRecentCampaigns, useResolvedName } from "@/hooks/useSoroban";

// A valid 56-char G-address so address helpers treat it as a real donor.
const DONOR_ADDRESS = `G${"A".repeat(55)}`;

/** A `donation`/`received` event shaped like the decoded RPC payload. */
const RECEIVED_EVENT = {
  id: "event-1",
  topic: "received",
  ledger: 1000,
  createdAt: "2026-01-01T00:00:00Z",
  txHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  data: [1n, DONOR_ADDRESS, 50_000_000n],
};

/** A campaign owned by the mocked wallet, used to reach the AdminPanel. */
const OWNED_CAMPAIGN = {
  id: 1n,
  title: "Test Campaign",
  creator: "GA",
  beneficiary: "GB",
  status: "Active",
  deadline: 0n,
  raised_amount: 0n,
  target_amount: 100n,
  accepted_token: "GC",
};

// Reset the shared hook mocks to their empty defaults before each test, so a
// test that supplies page-specific data never leaks into the next one.
beforeEach(() => {
  vi.mocked(useEvents).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as any);
  vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
  vi.mocked(useResolvedName).mockReturnValue({ data: null, isFetching: false } as any);
});

/**
 * Flush the async resolution of lazily loaded route chunks (`next/dynamic`)
 * inside `act`, so axe audits the fully mounted page rather than the empty
 * Suspense fallback.
 */
async function flushLazyRoute() {
  // The chunk import resolves across several macrotasks; give each one an
  // `act`-wrapped flush so React commits the mounted component.
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

/**
 * Helper to run axe-core against a rendered container, filtering for
 * only serious or critical violations as requested.
 */
async function checkAccessibility(container: HTMLElement) {
  const results = await axe(container);
  const violations = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
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
    const { container } = render(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);
    await checkAccessibility(container);
  });

  it("Profile page accessibility", async () => {
    const { container } = render(<ProfilePage />);
    await checkAccessibility(container);
  });

  it("Leaderboard page accessibility", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [RECEIVED_EVENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<LeaderboardPage />);
    // The ranked table renders once the mocked events are aggregated.
    expect(screen.getByText("Donors ranked")).toBeInTheDocument();
    await checkAccessibility(container);
  });

  it("Activity page accessibility", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [RECEIVED_EVENT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<ActivityPage />);
    await flushLazyRoute();
    expect(screen.getByRole("heading", { name: "Transaction History" })).toBeInTheDocument();
    await checkAccessibility(container);
  });

  it("Admin page accessibility", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: [OWNED_CAMPAIGN],
      isLoading: false,
    } as any);

    const { container } = render(<AdminPage />);
    // The ownership gate resolves and the lazy AdminPanel mounts.
    await flushLazyRoute();
    expect(screen.getByText("Campaign Management")).toBeInTheDocument();
    await checkAccessibility(container);
  });

  it("FAQ page accessibility", async () => {
    const { container } = render(<FaqPage />);
    await checkAccessibility(container);
  });
});
