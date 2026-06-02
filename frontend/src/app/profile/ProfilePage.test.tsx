import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProfilePage from "./page";

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
    address: "GA...",
    isConnected: true,
  }),
}));

// Mock hooks
vi.mock("@/hooks/useSoroban", () => ({
  useRecentCampaigns: () => ({ data: [], isLoading: false }),
  useEvents: () => ({ data: [], isLoading: false }),
}));

// Mock components
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/CampaignCard", () => ({ CampaignCard: () => <div /> }));

describe("ProfilePage - Empty States", () => {
  it("displays empty state messages and action buttons when no campaigns created or supported", () => {
    render(<ProfilePage />);

    expect(screen.getByText(/You haven't created any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Create your first campaign/i)).toBeInTheDocument();

    expect(screen.getByText(/You haven't donated to any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Explore campaigns/i)).toBeInTheDocument();
  });
});
