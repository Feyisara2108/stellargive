import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecentDonations } from "./RecentDonations";

vi.mock("@/hooks/useSoroban", () => ({
  useEvents: vi.fn(),
  useResolvedName: vi.fn().mockReturnValue({ data: undefined }),
}));

vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => {
    return (BigInt(stroops) / 10_000_000n).toString();
  },
}));

import { useEvents } from "@/hooks/useSoroban";

const CAMPAIGN_ID = 1n;
const ANONYMOUS_DONOR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const REAL_DONOR = "GDONORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVWXY";

import { makeDonationEvent } from "@/test/factories";

beforeEach(() => {
  vi.mocked(useEvents).mockReset();
});

describe("RecentDonations — loading state", () => {
  it("renders skeleton placeholders while events are loading", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByLabelText(/Loading recent donations/i)).toHaveAttribute("aria-busy", "true");
  });

  it("renders the card heading in the loading state", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Recent Donations/i)).toBeInTheDocument();
  });

  it("does not render the empty-state copy in the loading state", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByText(/No donations yet/i)).not.toBeInTheDocument();
  });
});

describe("RecentDonations — empty state", () => {
  it("shows 'No donations yet' when there are no events at all", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/No donations yet/i)).toBeInTheDocument();
  });

  it("shows 'No donations yet' when events exist but none match this campaign", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n, 999n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/No donations yet/i)).toBeInTheDocument();
  });

  it("announces the empty state via role=status and aria-live=polite", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/No donations yet/i);
  });

  it("renders the card heading in the empty state", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Recent Donations/i)).toBeInTheDocument();
  });
});

describe("RecentDonations — populated state", () => {
  it("renders a donation with its formatted amount", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    // fromStroops(50_000_000n) -> "5"
    expect(screen.getByText(/5 XLM/)).toBeInTheDocument();
    expect(screen.getByText(/donated by/i)).toBeInTheDocument();
  });

  it("only renders donations matching the given campaignId", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        makeDonationEvent("0-1", REAL_DONOR, 50_000_000n, CAMPAIGN_ID),
        makeDonationEvent("0-2", REAL_DONOR, 90_000_000n, 999n),
      ],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/5 XLM/)).toBeInTheDocument();
    expect(screen.queryByText(/9 XLM/)).not.toBeInTheDocument();
  });

  it("sorts donations by ledger descending and caps the list at 10", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      makeDonationEvent(`0-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), CAMPAIGN_ID, i),
    );
    vi.mocked(useEvents).mockReturnValue({ data: events, isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    // Highest ledger (11) had amount (12 * 10_000_000) -> "12 XLM", should be present;
    // the lowest two ledgers (0, 1) should be dropped by the slice(0, 10) cap.
    expect(screen.getByText(/12 XLM/)).toBeInTheDocument();
    expect(screen.queryByText(/^1 XLM$/)).not.toBeInTheDocument();
  });

  it("shows the ledger number when the event has no createdAt timestamp", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n, CAMPAIGN_ID, 777)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Ledger 777/)).toBeInTheDocument();
  });

  it("does not show the empty-state message when donations are present", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByText(/No donations yet/i)).not.toBeInTheDocument();
  });
});

describe("RecentDonations — address links", () => {
  it("renders a real donor address as a link to the Stellar Explorer account page", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${REAL_DONOR}`,
    );
  });

  it("truncates the donor address via utils/format.ts's formatAddress (through AddressLink)", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", REAL_DONOR, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    // formatAddress("GDONOR...VWXY") -> "GDON...VWXY"
    expect(
      screen.getByText(`${REAL_DONOR.slice(0, 4)}...${REAL_DONOR.slice(-4)}`),
    ).toBeInTheDocument();
  });

  it("shows 'Anonymous' instead of a link for the canonical zero address", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", ANONYMOUS_DONOR, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Anonymous/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows 'Anonymous' when there is no donor address at all", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("0-1", null, 50_000_000n)],
      isLoading: false,
      isError: false,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Anonymous/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("RecentDonations — error state", () => {
  it("shows an error message when the events query fails", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.getByText(/Unable to load recent donations/i)).toBeInTheDocument();
  });
});

describe("RecentDonations — load more pagination", () => {
  it("does not show 'Load more' button when donations are 10 or fewer", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeDonationEvent(`0-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), CAMPAIGN_ID, i),
    );
    vi.mocked(useEvents).mockReturnValue({ data: events, isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows 'Load more' button when there are more than 10 donations", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeDonationEvent(`0-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), CAMPAIGN_ID, i),
    );
    vi.mocked(useEvents).mockReturnValue({ data: events, isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);

    // Initially capped at 10 items
    expect(screen.getByText(/15 XLM/)).toBeInTheDocument();
    expect(screen.queryByText(/^5 XLM$/)).not.toBeInTheDocument();
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i });
    expect(loadMoreBtn).toBeInTheDocument();

    // Clicking reveals additional items
    fireEvent.click(loadMoreBtn);
    expect(screen.getByText(/^5 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/^1 XLM$/)).toBeInTheDocument();

    // When exhausted, button hides
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("reveals donations in batches of 10 for larger lists", () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      makeDonationEvent(`0-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), CAMPAIGN_ID, i),
    );
    vi.mocked(useEvents).mockReturnValue({ data: events, isLoading: false, isError: false } as any);
    render(<RecentDonations campaignId={CAMPAIGN_ID} />);

    // Initial batch: 10 items (ledgers 24 down to 15)
    expect(screen.getByText(/25 XLM/)).toBeInTheDocument();
    expect(screen.queryByText(/^15 XLM$/)).not.toBeInTheDocument();

    // First click: reveals next 10 items (up to 20 total)
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(loadMoreBtn);
    expect(screen.getByText(/^15 XLM$/)).toBeInTheDocument();
    expect(screen.queryByText(/^5 XLM$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    // Second click: reveals remaining 5 items (25 total) and hides button
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.getByText(/^5 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/^1 XLM$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("resets visible count back to initial cap when campaignId changes", () => {
    const events = [
      ...Array.from({ length: 15 }, (_, i) =>
        makeDonationEvent(`c1-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), 1n, i),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        makeDonationEvent(`c2-${i}`, REAL_DONOR, BigInt((i + 1) * 10_000_000), 2n, i),
      ),
    ];
    vi.mocked(useEvents).mockReturnValue({ data: events, isLoading: false, isError: false } as any);
    const { rerender } = render(<RecentDonations campaignId={1n} />);

    // Expand campaign 1
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();

    // Switch to campaign 2 -> should reset visible count to 10
    rerender(<RecentDonations campaignId={2n} />);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });
});
