import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProfilePage from "./page";

// Valid 56-char G-address so the page's donor matching accepts it.
const { TEST_ADDRESS } = vi.hoisted(() => ({ TEST_ADDRESS: "G" + "B".repeat(55) }));

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
  };
});

// Mock @/lib/soroban
vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => "0",
}));

// Mock useWallet
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    address: TEST_ADDRESS,
    isConnected: true,
  }),
}));

// Mock hooks
vi.mock("@/hooks/useSoroban", () => ({
  useRecentCampaigns: vi.fn(() => ({ data: [], isLoading: false })),
  useEvents: vi.fn(() => ({ data: [], isLoading: false })),
}));

// Mock components
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/CampaignCard", () => ({ CampaignCard: () => <div /> }));
vi.mock("@/components/WalletConnect", () => ({ WalletConnect: () => <div /> }));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}));

import { useRecentCampaigns, useEvents } from "@/hooks/useSoroban";

describe("ProfilePage - Empty States", () => {
  it("displays empty state messages and action buttons when no campaigns created or supported", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false } as any);

    render(<ProfilePage />);

    expect(screen.getByText(/You haven't created any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Create your first campaign/i)).toBeInTheDocument();

    expect(screen.getByText(/You haven't donated to any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Explore campaigns/i)[0]).toBeInTheDocument();
  });
});

describe("ProfilePage - malformed event payloads", () => {
  it("renders placeholders for missing fields and ignores non-event entries", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({
      data: [
        // Donor present but no campaign_id / amount
        {
          id: "d1",
          topic: "received",
          data: {
            donor: TEST_ADDRESS,
            total_raised: 0n,
            accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            comment: null,
          },
        },
        // Garbage campaign_id, still no amount
        {
          id: "d2",
          topic: "received",
          data: {
            campaign_id: "oops",
            donor: TEST_ADDRESS,
            total_raised: 0n,
            accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            comment: null,
          },
        },
        null,
        "garbage",
      ],
      isLoading: false,
    } as any);

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    expect(screen.getAllByText(/— Donated/)).toHaveLength(2);
    expect(screen.getAllByText(/To campaign ID: —/)).toHaveLength(2);
  });

  it("does not crash when the events payload is not an array", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({ data: { nope: true }, isLoading: false } as any);

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    expect(screen.getByText(/You haven't made any donations yet/i)).toBeInTheDocument();
  });
});
