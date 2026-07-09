import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectUpdates } from "./ProjectUpdates";

vi.mock("@/hooks/useSoroban", () => ({
  useGetUpdates: vi.fn(),
  useCampaign: vi.fn(),
  useAddUpdate: vi.fn(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn().mockReturnValue({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useGetUpdates, useCampaign, useAddUpdate } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";

const CAMPAIGN_ID = 1n;
const CREATOR = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

// Lock "now" so date-fns' formatDistanceToNow produces deterministic text.
const SYSTEM_TIME = new Date("2026-06-24T12:00:00Z");

/** Builds a CampaignUpdate fixture at a given offset before SYSTEM_TIME. */
function makeUpdate(content: string, secondsAgo: number) {
  return {
    content,
    timestamp: BigInt(Math.floor((SYSTEM_TIME.getTime() - secondsAgo * 1000) / 1000)),
  };
}

function mockUpdates(data: ReturnType<typeof makeUpdate>[] | undefined, isLoading = false) {
  vi.mocked(useGetUpdates).mockReturnValue({ data, isLoading } as any);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SYSTEM_TIME);

  // Default: not the campaign creator, wallet disconnected. Tests that care
  // about the creator-only "Post Update" form set this explicitly.
  vi.mocked(useCampaign).mockReturnValue({ data: { creator: CREATOR } } as any);
  vi.mocked(useWallet).mockReturnValue({ address: null } as any);
  vi.mocked(useAddUpdate).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ProjectUpdates — loading state", () => {
  it("shows a loading message while updates are loading", () => {
    mockUpdates(undefined, true);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Loading updates/i)).toBeInTheDocument();
  });

  it("does not show the empty-state message while loading", () => {
    mockUpdates(undefined, true);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByText(/No updates yet/i)).not.toBeInTheDocument();
  });
});

describe("ProjectUpdates — empty state", () => {
  it("shows 'No updates yet.' when there are no updates", () => {
    mockUpdates([], false);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/No updates yet\./i)).toBeInTheDocument();
  });

  it("shows 'No updates yet.' when the query returns undefined", () => {
    mockUpdates(undefined, false);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/No updates yet\./i)).toBeInTheDocument();
  });

  it("renders the card heading in the empty state", () => {
    mockUpdates([], false);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Project Updates/i)).toBeInTheDocument();
  });
});

describe("ProjectUpdates — populated state", () => {
  it("renders an update's content and a formatted relative timestamp", () => {
    mockUpdates([makeUpdate("We hit our first milestone!", 2 * 60 * 60)]); // 2 hours ago
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText("We hit our first milestone!")).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
  });

  it("renders a timestamp for an update several days old", () => {
    mockUpdates([makeUpdate("Shipping update", 3 * 24 * 60 * 60)]); // 3 days ago
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });

  it("does not show the empty-state message when updates are present", () => {
    mockUpdates([makeUpdate("Hello", 60)]);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByText(/No updates yet/i)).not.toBeInTheDocument();
  });

  it("renders every update's content", () => {
    mockUpdates([
      makeUpdate("First update", 3 * 24 * 60 * 60),
      makeUpdate("Second update", 2 * 24 * 60 * 60),
      makeUpdate("Third update", 1 * 24 * 60 * 60),
    ]);
    render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText("First update")).toBeInTheDocument();
    expect(screen.getByText("Second update")).toBeInTheDocument();
    expect(screen.getByText("Third update")).toBeInTheDocument();
  });
});

describe("ProjectUpdates — ordering", () => {
  function renderedContentInOrder(container: HTMLElement): string[] {
    // Each update is rendered in its own "div.space-y-1.pb-4" wrapper; querying
    // them in DOM order and reading the first <p> gives us the render order.
    return Array.from(container.querySelectorAll(".space-y-1.pb-4")).map(
      (el) => el.querySelector("p")?.textContent ?? "",
    );
  }

  it("sorts updates newest-first regardless of the order returned by the query", () => {
    // Deliberately fed in a non-sorted order: oldest, newest, middle.
    mockUpdates([
      makeUpdate("Oldest update", 5 * 24 * 60 * 60),
      makeUpdate("Newest update", 1 * 24 * 60 * 60),
      makeUpdate("Middle update", 3 * 24 * 60 * 60),
    ]);
    const { container } = render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);

    expect(renderedContentInOrder(container)).toEqual([
      "Newest update",
      "Middle update",
      "Oldest update",
    ]);
  });

  it("keeps newest-first ordering even when updates already arrive pre-sorted", () => {
    mockUpdates([makeUpdate("Newest update", 60), makeUpdate("Older update", 3600)]);
    const { container } = render(<ProjectUpdates campaignId={CAMPAIGN_ID} />);

    expect(renderedContentInOrder(container)).toEqual(["Newest update", "Older update"]);
  });
});
