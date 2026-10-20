import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/render";
import React from "react";

// Hoist mock state so it stays in sync across vi.mock closures
const { mockState } = vi.hoisted(() => ({
  mockState: {
    /** First page of campaigns. */
    campaigns: [] as any[],
    /** Pages after the first, served one per fetchNextPage call. */
    morePages: [] as any[][],
    fetchNextPageCalls: 0,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("../../hooks/useSoroban", async () => {
  const { useState, useCallback } = await vi.importActual<typeof import("react")>("react");
  return {
    useCampaignsPaged: () => {
      const [loaded, setLoaded] = useState(1);
      const allPages = [mockState.campaigns, ...mockState.morePages];
      const fetchNextPage = useCallback(() => {
        mockState.fetchNextPageCalls++;
        setLoaded((n) => n + 1);
      }, []);
      return {
        data: { pages: allPages.slice(0, loaded).map((campaigns) => ({ campaigns })) },
        hasNextPage: loaded < allPages.length,
        isFetchingNextPage: false,
        fetchNextPage,
        isLoading: mockState.isLoading,
        isError: mockState.isError,
        isFetching: false,
        refetch: vi.fn(),
      };
    },
    useCampaignsByIds: (ids: string[], { enabled }: { enabled?: boolean } = {}) => {
      const all = [mockState.campaigns, ...mockState.morePages].flat();
      return {
        data: enabled ? all.filter((c) => ids.includes(c.id.toString())) : undefined,
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      };
    },
    useTokenMetadataBatch: () => ({ data: new Map() }),
    useTokenMetadata: () => ({ data: undefined, isLoading: false }),
    useXlmPrice: () => ({ data: undefined, isLoading: false }),
  };
});

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

function renderPage() {
  return render(
    <MockWalletProvider>
      <ExplorePage />
    </MockWalletProvider>,
  );
}

beforeEach(() => {
  replaceMock.mockReset();
  currentParams = new URLSearchParams();
  mockState.campaigns = [];
  mockState.morePages = [];
  mockState.fetchNextPageCalls = 0;
  mockState.isLoading = false;
  mockState.isError = false;
});

describe("ExplorePage - Integrated Search & Hydration", () => {
  it("displays correct empty message and button when no campaigns exist", async () => {
    mockState.campaigns = [];
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No active campaigns right now/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Create Campaign/i })).toBeInTheDocument();
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
        expect(screen.getByRole("button", { name: /Clear Filters/i })).toBeInTheDocument();
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

describe("ExplorePage - Category counts (#1090)", () => {
  it("counts 'other' and empty categories under Uncategorized, matching its filter", async () => {
    mockState.campaigns = [
      buildCampaign({ id: 1n, title: "Other One", category: "other" }),
      buildCampaign({ id: 2n, title: "Blank One", category: "" }),
      buildCampaign({ id: 3n, title: "Shouty Other", category: " Other " }),
      buildCampaign({ id: 4n, title: "Food One", category: "food" }),
    ];
    renderPage();

    const select = (await screen.findByLabelText("Select Category")) as HTMLSelectElement;
    const option = (value: string) =>
      Array.from(select.options).find((o) => o.value === value)?.textContent;
    expect(option("uncategorized")).toBe("Uncategorized (3)");
    expect(option("food")).toBe("Food (1)");

    fireEvent.change(select, { target: { value: "uncategorized" } });
    await waitFor(() => {
      expect(screen.getAllByTestId("campaign-card")).toHaveLength(3);
    });
    expect(screen.queryByText("Food One")).not.toBeInTheDocument();
  });
});

describe("ExplorePage - Saved view", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows a discovery empty state when nothing is bookmarked", async () => {
    currentParams = new URLSearchParams("saved=1");
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Alpha" })];
    renderPage();

    expect(await screen.findByTestId("saved-empty-state")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discover campaigns/i })).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-card")).not.toBeInTheDocument();
  });

  it("lists only bookmarked campaigns in the Saved view", async () => {
    window.localStorage.setItem("stellargive:bookmarks", JSON.stringify(["2"]));
    const { resetBookmarksCache } = await import("../../hooks/useBookmarks");
    resetBookmarksCache();
    currentParams = new URLSearchParams("saved=1");
    mockState.campaigns = [
      buildCampaign({ id: 1n, title: "Alpha" }),
      buildCampaign({ id: 2n, title: "Beta" }),
    ];
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("campaign-card")).toHaveLength(1));
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});

describe("ExplorePage - full-set search and Saved (#1091)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("finds a campaign that is not on the first page", async () => {
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Alpha" })];
    mockState.morePages = [
      [buildCampaign({ id: 2n, title: "Beta" })],
      [buildCampaign({ id: 3n, title: "Needle Water" })],
    ];
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Search by title or creator/i), {
      target: { value: "Needle" },
    });

    await waitFor(() => {
      expect(screen.getByText("Needle Water")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("campaign-card")).toHaveLength(1);
    expect(mockState.fetchNextPageCalls).toBe(2);
  });

  it("does not load further pages while nothing narrows the list", async () => {
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Alpha" })];
    mockState.morePages = [[buildCampaign({ id: 2n, title: "Beta" })]];
    renderPage();

    await screen.findByText("Alpha");
    expect(mockState.fetchNextPageCalls).toBe(0);
    expect(screen.getByRole("button", { name: /Load more/i })).toBeInTheDocument();
  });

  it("shows bookmarked campaigns beyond the loaded pages under Saved", async () => {
    window.localStorage.setItem("stellargive:bookmarks", JSON.stringify(["1", "3"]));
    const { resetBookmarksCache } = await import("../../hooks/useBookmarks");
    resetBookmarksCache();
    currentParams = new URLSearchParams("saved=1");
    mockState.campaigns = [buildCampaign({ id: 1n, title: "Alpha" })];
    mockState.morePages = [[buildCampaign({ id: 3n, title: "Gamma" })]];
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("campaign-card")).toHaveLength(2));
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(mockState.fetchNextPageCalls).toBe(0);
  });
});
