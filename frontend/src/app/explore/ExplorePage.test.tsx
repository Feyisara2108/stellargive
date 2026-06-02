import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExplorePage from "./page";

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

// Mock hooks
vi.mock("@/hooks/useSoroban", () => ({
  useCampaignsPaged: vi.fn(),
}));

// Mock navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock components
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/CampaignCard", () => ({ CampaignCard: () => <div /> }));

import { useCampaignsPaged } from "@/hooks/useSoroban";

describe("ExplorePage - Empty States", () => {
  it("displays correct empty message and button when no campaigns exist", () => {
    vi.mocked(useCampaignsPaged).mockReturnValue({
      data: { campaigns: [], hasMore: false },
      isLoading: false,
    } as any);

    render(<ExplorePage />);

    expect(screen.getByText(/No active campaigns right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create the first one/i })).toBeInTheDocument();
  });

  it("displays correct message when search has no results", async () => {
    vi.mocked(useCampaignsPaged).mockReturnValue({
      data: {
        campaigns: [
          { id: 1n, title: "Test", status: "Active", raised_amount: 0n, target_amount: 100n, creator: "GA" }
        ],
        hasMore: false
      },
      isLoading: false,
    } as any);

    render(<ExplorePage />);

    const searchInput = screen.getByPlaceholderText(/Search by title or creator/i);
    fireEvent.change(searchInput, { target: { value: "Nothing" } });

    await waitFor(() => {
      expect(screen.getByText(/No campaigns match your search/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Clear search/i })).toBeInTheDocument();
    });
  });
});
