import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TopDonors } from "./TopDonors";
import { ZERO_ADDRESS } from "@/utils/format";

// The factory is imported inside the (hoisted) mock so it is initialised
// before the factory runs.
vi.mock("@/hooks/useSoroban", async () => {
  const { createSorobanMock } = await import("@/test/mockSoroban");
  return createSorobanMock({
    useTopDonors: vi.fn(),
    useResolvedName: vi.fn().mockReturnValue({ data: undefined }),
  });
});

import { useTopDonors } from "@/hooks/useSoroban";

const CAMPAIGN_ID = 7n;
const DONOR_A = "GDONORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVWXY";
const DONOR_B = "GDONORBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBVWXY";

function mockTopDonors(result: Record<string, unknown>) {
  vi.mocked(useTopDonors).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...result,
  } as unknown as ReturnType<typeof useTopDonors>);
}

beforeEach(() => {
  vi.mocked(useTopDonors).mockReset();
});

describe("TopDonors", () => {
  it("queries the contract leaderboard for the given campaign", () => {
    mockTopDonors({ data: [] });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);
    expect(useTopDonors).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("renders a loading state while the leaderboard is fetching", () => {
    mockTopDonors({ isLoading: true });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);
    expect(screen.getByLabelText(/Loading top donors/i)).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/No donations yet/i)).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no donors", () => {
    mockTopDonors({ data: [] });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);
    expect(screen.getByRole("status")).toHaveTextContent(/No donations yet/i);
  });

  it("renders an error message when the query fails", () => {
    mockTopDonors({ isError: true });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn.t load top donors/i);
  });

  it("renders donors in contract order with ranks and formatted amounts", () => {
    mockTopDonors({
      data: [
        { address: DONOR_A, amount: 500_000_000n },
        { address: DONOR_B, amount: 125_000_000n },
      ],
    });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("1")).toBeInTheDocument();
    expect(within(rows[0]).getByText("50 XLM")).toBeInTheDocument();
    expect(within(rows[1]).getByText("2")).toBeInTheDocument();
    expect(within(rows[1]).getByText("12.5 XLM")).toBeInTheDocument();
  });

  it("labels the aggregated anonymous entry instead of linking the zero address", () => {
    mockTopDonors({
      data: [
        { address: ZERO_ADDRESS, amount: 900_000_000n },
        { address: DONOR_A, amount: 100_000_000n },
      ],
    });
    render(<TopDonors campaignId={CAMPAIGN_ID} />);

    const [anonRow, namedRow] = screen.getAllByRole("listitem");
    expect(within(anonRow).getByText("Anonymous")).toBeInTheDocument();
    expect(within(anonRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(namedRow).getByRole("link")).toBeInTheDocument();
  });

  it("uses the provided token symbol and decimals", () => {
    mockTopDonors({ data: [{ address: DONOR_A, amount: 1_500n }] });
    render(<TopDonors campaignId={CAMPAIGN_ID} decimals={3} symbol="USDC" />);
    expect(screen.getByText("1.5 USDC")).toBeInTheDocument();
  });
});
