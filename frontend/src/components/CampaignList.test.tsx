import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignList } from "./CampaignList";

// Mock useWallet
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    address: "GA...",
    isConnected: true,
  }),
}));

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  init: vi.fn(),
}));

// Mock @stellar/stellar-sdk to prevent RpcServer errors
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

// Mock @/lib/soroban to provide necessary types and helpers
vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => {
    return (BigInt(stroops) / 10_000_000n).toString();
  },
  toStroops: (amount: string | number): bigint => {
    return BigInt(amount) * 10_000_000n;
  },
}));

// Mock CampaignCard
vi.mock("./CampaignCard", () => ({
  CampaignCard: ({ campaign }: any) => <div data-testid="campaign-card">{campaign.title}</div>,
}));

// Mock the useRecentCampaigns hook
vi.mock("@/hooks/useSoroban", () => ({
  useRecentCampaigns: vi.fn(),
}));

// Mock next/navigation. `replace` is captured so tests can assert URL sync.
const replaceMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/",
  useSearchParams: () => currentParams,
}));

import { useRecentCampaigns } from "@/hooks/useSoroban";

beforeEach(() => {
  replaceMock.mockClear();
  currentParams = new URLSearchParams();
});

describe("CampaignList - Empty States", () => {
  it("displays 'No campaigns found' and 'Create campaign' button when no campaigns exist", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    expect(screen.getByText(/No campaigns found/i)).toBeInTheDocument();
    expect(screen.getByText(/Why not create the first one\?/i)).toBeInTheDocument();
    const createButton = screen.getByRole("link", { name: /Create campaign/i });
    expect(createButton).toBeInTheDocument();
    expect(createButton).toHaveAttribute("href", "/create");
  });

  it("displays 'No campaigns match your search' when search filters out all campaigns", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: [
        {
          id: 1n,
          title: "Flood Relief",
          category: "Disaster",
          creator: "GA...",
          beneficiary: "GB...",
          raised_amount: 0n,
          target_amount: 100n,
          deadline: 123n,
          status: "Active",
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    const searchInput = screen.getByPlaceholderText(/Search campaigns/i);
    fireEvent.change(searchInput, { target: { value: "Non-existent-campaign" } });

    // Wait for debounced search (300ms)
    await waitFor(() => {
      expect(screen.getByText(/No campaigns match your search/i)).toBeInTheDocument();
    }, { timeout: 1000 });

    expect(screen.getByText(/Try a different term or clear your search/i)).toBeInTheDocument();
    // Both the inline "x" and the empty-state button can clear the search.
    expect(screen.getAllByRole("button", { name: /Clear search/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Create campaign/i })).toBeInTheDocument();
  });

  it("clears search results when 'Clear search' button is clicked", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: [
        {
          id: 1n,
          title: "Flood Relief",
          category: "Disaster",
          creator: "GA...",
          beneficiary: "GB...",
          raised_amount: 0n,
          target_amount: 100n,
          deadline: 123n,
          status: "Active",
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    const searchInput = screen.getByPlaceholderText(/Search campaigns/i);
    fireEvent.change(searchInput, { target: { value: "Non-existent-campaign" } });

    await waitFor(() => {
      expect(screen.getByText(/No campaigns match your search/i)).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByRole("button", { name: /Clear search/i });
    fireEvent.click(clearButtons[clearButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText(/No campaigns match your search/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Flood Relief/i)).toBeInTheDocument();
    });
  });
});

describe("CampaignList - Search & URL sync", () => {
  const campaignFixtures = [
    {
      id: 1n,
      title: "Flood Relief",
      category: "Disaster",
      creator: "GAAA",
      beneficiary: "GBBB",
      raised_amount: 0n,
      target_amount: 100n,
      deadline: 123n,
      status: "Active",
    },
    {
      id: 2n,
      title: "School Supplies",
      category: "Education",
      creator: "GCCC",
      beneficiary: "GDDD",
      raised_amount: 0n,
      target_amount: 100n,
      deadline: 456n,
      status: "Active",
    },
  ];

  it("filters the grid by title as the user types", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: campaignFixtures,
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    expect(screen.getByText("Flood Relief")).toBeInTheDocument();
    expect(screen.getByText("School Supplies")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search campaigns/i), {
      target: { value: "flood" },
    });

    await waitFor(() => {
      expect(screen.getByText("Flood Relief")).toBeInTheDocument();
      expect(screen.queryByText("School Supplies")).not.toBeInTheDocument();
    });
  });

  it("syncs the debounced query into the ?q= URL param", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: campaignFixtures,
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    fireEvent.change(screen.getByPlaceholderText(/Search campaigns/i), {
      target: { value: "flood" },
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?q=flood", { scroll: false });
    });
  });

  it("initializes the query from the ?q= URL param on load", () => {
    currentParams = new URLSearchParams("q=school");
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: campaignFixtures,
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    expect(screen.getByPlaceholderText(/Search campaigns/i)).toHaveValue("school");
    expect(screen.getByText("School Supplies")).toBeInTheDocument();
    expect(screen.queryByText("Flood Relief")).not.toBeInTheDocument();
  });

  it("shows an inline clear (x) button that resets the query", async () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({
      data: campaignFixtures,
      isLoading: false,
      error: null,
    } as any);

    render(<CampaignList />);

    const input = screen.getByPlaceholderText(/Search campaigns/i);
    fireEvent.change(input, { target: { value: "flood" } });

    const clearButton = screen.getByRole("button", { name: /Clear search/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
    await waitFor(() => {
      expect(screen.getByText("School Supplies")).toBeInTheDocument();
    });
  });
});
