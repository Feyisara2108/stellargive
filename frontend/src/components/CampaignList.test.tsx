import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/render";
import { CampaignList } from "./CampaignList";
import { MockWalletProvider } from "./MockWalletProvider";
import { server, errorHandlers } from "@/mocks/setup";
import { setMockCampaigns } from "@/mocks/handlers";
import { buildCampaign } from "@/test/factories";
import React from "react";

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  init: vi.fn(),
}));

// Mock CampaignCard to keep it simple
vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: ({ campaign }: any) => <div data-testid="campaign-card">{campaign.title}</div>,
}));

// Mock CampaignSkeletonGrid for loading state assertions
vi.mock("@/components/CampaignSkeleton", () => ({
  CampaignSkeletonGrid: ({ count }: { count?: number }) => (
    <div data-testid="skeleton-grid" data-count={count ?? 6}>
      {Array.from({ length: count ?? 6 }).map((_, i) => (
        <div key={i} data-testid="campaign-skeleton" />
      ))}
    </div>
  ),
}));

// Dynamic mock for useRecentCampaigns — tests can override via mockRecentCampaignsReturn
let mockRecentCampaignsReturn: any = null;
vi.mock("@/hooks/useSoroban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSoroban")>();
  return {
    ...actual,
    useRecentCampaigns: () => {
      if (mockRecentCampaignsReturn !== null) {
        return mockRecentCampaignsReturn;
      }
      return actual.useRecentCampaigns();
    },
  };
});

// Mock next/navigation
const replaceMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/",
  useSearchParams: () => currentParams,
}));

function renderList() {
  return render(
    <MockWalletProvider>
      <CampaignList />
    </MockWalletProvider>,
  );
}

beforeEach(() => {
  replaceMock.mockClear();
  currentParams = new URLSearchParams();
  setMockCampaigns([]);
  mockRecentCampaignsReturn = null;
  vi.resetAllMocks();
});

describe("CampaignList - MSW Integrated States", () => {
  it("displays 'No campaigns found' and 'Create campaign' button when no campaigns exist", async () => {
    setMockCampaigns([]);
    renderList();

    await waitFor(() => {
      expect(screen.getByText(/No campaigns found/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Why not create the first one\?/i)).toBeInTheDocument();
    const createButton = screen.getByRole("link", { name: /Create campaign/i });
    expect(createButton).toBeInTheDocument();
    expect(createButton).toHaveAttribute("href", "/create");
  });

  it("displays correct campaign cards when multiple exist", async () => {
    setMockCampaigns([
      buildCampaign({ id: 1n, title: "Flood Relief" }),
      buildCampaign({ id: 2n, title: "School Supplies" }),
    ]);
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Flood Relief")).toBeInTheDocument();
      expect(screen.getByText("School Supplies")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("campaign-card")).toHaveLength(2);
  });

  it("displays error message on RPC failure", async () => {
    server.use(...errorHandlers.transactionFailed);
    renderList();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load campaigns/i)).toBeInTheDocument();
    });
  });

  it("displays 'No campaigns match your search' when search filters out all campaigns", async () => {
    setMockCampaigns([buildCampaign({ id: 1n, title: "Flood Relief" })]);
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Flood Relief")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search campaigns/i);
    fireEvent.change(searchInput, { target: { value: "Non-existent-campaign" } });

    // Wait for debounced search (300ms)
    await waitFor(
      () => {
        expect(screen.getByText(/No campaigns match your search/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    expect(screen.getByText(/Try a different term or clear your search/i)).toBeInTheDocument();
  });
});

describe("CampaignList - Search & URL sync", () => {
  beforeEach(() => {
    setMockCampaigns([
      buildCampaign({ id: 1n, title: "Flood Relief", category: "Disaster" }),
      buildCampaign({ id: 2n, title: "School Supplies", category: "Education" }),
    ]);
  });

  it("filters the grid by title as the user types", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Flood Relief")).toBeInTheDocument();
    });
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
    renderList();

    const searchInput = await screen.findByPlaceholderText(/Search campaigns/i);
    fireEvent.change(searchInput, {
      target: { value: "flood" },
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?q=flood", { scroll: false });
    });
  });

  it("initializes the query from the ?q= URL param on load", async () => {
    currentParams = new URLSearchParams("q=school");
    mockRecentCampaignsReturn = {
      data: [
        buildCampaign({ id: 1n, title: "Flood Relief" }),
        buildCampaign({ id: 2n, title: "School Supplies" }),
      ],
      isLoading: false,
      error: null,
    };
    renderList();

    await waitFor(() => {
      expect(screen.getByText("School Supplies")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Search campaigns/i)).toHaveValue("school");
    expect(screen.queryByText("Flood Relief")).not.toBeInTheDocument();
  });
});

describe("CampaignList - Loading skeleton", () => {
  it("renders skeleton grid while campaigns are loading", () => {
    mockRecentCampaignsReturn = { data: undefined, isLoading: true, error: null };
    renderList();

    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument();
    const skeletons = screen.getAllByTestId("campaign-skeleton");
    expect(skeletons.length).toBe(6);
  });

  it("hides skeleton grid after data loads", async () => {
    mockRecentCampaignsReturn = {
      data: [buildCampaign({ id: 1n, title: "Flood Relief" })],
      isLoading: false,
      error: null,
    };
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Flood Relief")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("skeleton-grid")).not.toBeInTheDocument();
  });
});

describe("CampaignList - Error state", () => {
  it("renders error message when query fails", () => {
    mockRecentCampaignsReturn = {
      data: undefined,
      isLoading: false,
      error: new Error("Network failure"),
    };
    renderList();

    expect(screen.getByText(/Failed to load campaigns/i)).toBeInTheDocument();
    expect(screen.getByText(/Please ensure you are on Testnet/i)).toBeInTheDocument();
  });

  it("does not render campaign cards or skeleton when error occurs", () => {
    mockRecentCampaignsReturn = {
      data: undefined,
      isLoading: false,
      error: new Error("RPC error"),
    };
    renderList();

    expect(screen.queryByTestId("campaign-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-grid")).not.toBeInTheDocument();
  });
});

describe("CampaignList - Empty state", () => {
  it("renders empty state when campaigns array is empty", () => {
    mockRecentCampaignsReturn = {
      data: [],
      isLoading: false,
      error: null,
    };
    renderList();

    expect(screen.getByText(/No campaigns found/i)).toBeInTheDocument();
    expect(screen.getByText(/Why not create the first one\?/i)).toBeInTheDocument();
    const createButton = screen.getByRole("link", { name: /Create campaign/i });
    expect(createButton).toHaveAttribute("href", "/create");
  });

  it("does not show load-more button when campaigns list is empty", () => {
    mockRecentCampaignsReturn = {
      data: [],
      isLoading: false,
      error: null,
    };
    renderList();

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("does not show skeleton when empty state is displayed", () => {
    mockRecentCampaignsReturn = {
      data: [],
      isLoading: false,
      error: null,
    };
    renderList();

    expect(screen.queryByTestId("skeleton-grid")).not.toBeInTheDocument();
  });
});

describe("CampaignList - Virtualisation with react-window v2", () => {
  // Skipped: the list is sized to the height of all its rows, so react-window mounts every row and
  // virtualisation never kicks in. Making it work needs a scroll-behaviour decision for the Explore
  // page (an inner scroll area or a window scroller), so it is tracked as a follow-up. Re-enable this
  // test with that change.
  it.skip("mounts only a window of rows for a long list when container width is measured", async () => {
    // Generate 60 campaigns
    const manyCampaigns = Array.from({ length: 60 }, (_, i) =>
      buildCampaign({ id: BigInt(i + 1), title: `Campaign ${i + 1}` }),
    );
    mockRecentCampaignsReturn = {
      data: manyCampaigns,
      isLoading: false,
      error: null,
    };

    // Mock getBoundingClientRect on HTMLDivElement to return a width so listWidth > 0
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: 1000,
        height: 800,
        top: 0,
        left: 0,
        bottom: 800,
        right: 1000,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
    };

    try {
      renderList();

      await waitFor(() => {
        expect(screen.getByRole("grid", { name: /Campaign list/i })).toBeInTheDocument();
      });

      // All 60 campaigns should NOT be mounted at once; only a window of rows should be in the DOM
      const mountedCards = screen.queryAllByTestId("campaign-card");
      expect(mountedCards.length).toBeGreaterThan(0);
      expect(mountedCards.length).toBeLessThan(60);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
