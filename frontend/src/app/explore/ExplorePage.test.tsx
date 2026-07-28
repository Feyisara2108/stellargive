import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Hoist mock state so it stays in sync across vi.mock closures
const { mockState } = vi.hoisted(() => ({
  mockState: {
    campaigns: [] as any[],
    isLoading: false,
    isError: false,
  },
}));

vi.mock("../../hooks/useSoroban", () => ({
  useCampaignsPaged: () => ({
    get data() {
      return { campaigns: mockState.campaigns, hasMore: false };
    },
    get isLoading() {
      return mockState.isLoading;
    },
    get isError() {
      return mockState.isError;
    },
    refetch: vi.fn(),
  }),
  useTokenMetadataBatch: () => ({ data: new Map() }),
}));

vi.mock("../../hooks/useCampaignSearch", () => ({
  useCampaignSearch: (campaigns: any[], term: string) => {
    const normalized = term.trim().toLowerCase();
    const results = normalized
      ? campaigns.filter((c) =>
          [c.title, c.creator, c.category, c.description].some((field) =>
            String(field ?? "")
              .toLowerCase()
              .includes(normalized),
          ),
        )
      : campaigns;
    return { results, term: normalized, isSearching: normalized.length > 0 };
  },
}));

import ExplorePage from "./page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { buildCampaign } from "@/test/factories";
const replaceMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => currentParams,
  usePathname: () => "/explore",
}));

// Mock UI components to keep tests focused
vi.mock("../../components/Navbar", () => ({ Navbar: () => <div data-testid="navbar" /> }));
vi.mock("../../components/CampaignCard", () => ({
  CampaignCard: ({ campaign }: any) => <div data-testid="campaign-card">{campaign.title}</div>,
}));
vi.mock("../../components/Footer", () => ({ Footer: () => <div data-testid="footer" /> }));

let queryClient: QueryClient;

function renderPage() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MockWalletProvider>
        <ExplorePage />
      </MockWalletProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  replaceMock.mockReset();
  currentParams = new URLSearchParams();
  mockState.campaigns = [];
  mockState.isLoading = false;
  mockState.isError = false;
  if (queryClient) {
    queryClient.clear();
  }
});

describe("ExplorePage - Integrated Search & Hydration", () => {
  it("displays correct empty message and button when no campaigns exist", async () => {
    mockState.campaigns = [];
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No active campaigns right now/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Create the first one/i })).toBeInTheDocument();
  });

  it("displays correct campaign cards when multiple exist", async () => {
    mockState.campaigns = [
      buildCampaign({ id: 1n, title: "Campaign A" }),
      buildCampaign({ id: 2n, title: "Campaign B" }),
    ];
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Campaign A")).toBeInTheDocument();
      expect(screen.getByText("Campaign B")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("campaign-card")).toHaveLength(2);
  });

  it("displays correct message when search has no results", async () => {
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Test Campaign" })];
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Campaign")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by title or creator/i);
    fireEvent.change(searchInput, { target: { value: "Nothing" } });

    await waitFor(
      () => {
        expect(screen.getByText(/No campaigns match your search/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Clear search/i })).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it("displays error message on RPC failure", async () => {
    mockState.isError = true;
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Unable to load campaigns/i)).toBeInTheDocument();
    });
  });

  it("hydrates search term and category from searchParams on mount", async () => {
    currentParams = new URLSearchParams("q=Water&category=relief");
    mockState.campaigns = [
      buildCampaign({ id: 1n, title: "Water Relief", category: "relief" }),
      buildCampaign({ id: 2n, title: "Food Supply", category: "food" }),
    ];
    renderPage();

    await waitFor(
      () => {
        const cards = screen.getAllByTestId("campaign-card");
        expect(cards.length).toBe(1);
        expect(cards[0]).toHaveTextContent("Water Relief");
      },
      { timeout: 1000 },
    );

    const searchInput = screen.getByPlaceholderText(
      /Search by title or creator/i,
    ) as HTMLInputElement;
    expect(searchInput.value).toBe("Water");
  });

  it("updates URL searchParams with q when search input changes", async () => {
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Medical Aid", category: "health" })];
    renderPage();

    const searchInput = screen.getByPlaceholderText(/Search by title or creator/i);
    fireEvent.change(searchInput, { target: { value: "Medical" } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining("q=Medical"),
        expect.objectContaining({ scroll: false }),
      );
    });
  });
});
