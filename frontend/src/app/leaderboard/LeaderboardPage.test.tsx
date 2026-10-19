import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { render, screen, fireEvent, within } from "@testing-library/react";
// mockSoroban is imported before the page so it is initialised by the time the
// page's import of @/hooks/useSoroban runs the mock factory below.
import { createSorobanMock } from "@/test/mockSoroban";
import LeaderboardPage from "./page";

vi.mock("@/lib/amounts", () => ({
  fromStroops: (stroops: bigint | string | number): string => BigInt(stroops).toString(),
}));

const { XLM, USDC } = vi.hoisted(() => ({
  XLM: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  USDC: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
}));

vi.mock("@/lib/tokens", () => ({ NATIVE_XLM_CONTRACT_ID: XLM }));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ address: null }),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}));

const pushMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useEventHistory: vi.fn(),
    useResolvedName: vi.fn(() => ({ data: null })),
    useTokenMetadataBatch: vi.fn(() => ({ data: { [USDC]: { symbol: "USDC", decimals: 7 } } })),
  }),
);

const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/utils/format", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/format")>();
  return { ...actual, downloadTextFile };
});

import { useEventHistory } from "@/hooks/useSoroban";

const DONOR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAA";
const DONOR_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWBB";

function receivedEvent(
  campaignId: number,
  donor: string,
  amount: number,
  id: string,
  token: string = XLM,
) {
  return {
    id,
    topic: "received",
    data: {
      campaign_id: BigInt(campaignId),
      donor,
      amount: BigInt(amount),
      total_raised: 0n,
      accepted_token: token,
      comment: null,
    },
    createdAt: new Date().toISOString(),
  };
}

const WINDOW_START = "2026-10-12T00:00:00Z";
const WINDOW_END = "2026-10-19T00:00:00Z";

function historyResult(events: unknown[], extra: Record<string, unknown> = {}) {
  return {
    data: { events, windowStart: WINDOW_START, windowEnd: WINDOW_END, truncated: false, ...extra },
    isLoading: false,
    isError: false,
  } as any;
}

beforeEach(() => {
  pushMock.mockReset();
  downloadTextFile.mockReset();
  currentParams = new URLSearchParams();
});

describe("LeaderboardPage - CSV export", () => {
  it("exports the currently ranked donors as a CSV, respecting the active time range", () => {
    vi.mocked(useEventHistory).mockReturnValue(
      historyResult([
        receivedEvent(1, DONOR_A, 300, "e1"),
        receivedEvent(2, DONOR_B, 100, "e2"),
        receivedEvent(1, DONOR_A, 50, "e3"),
      ]),
    );
    currentParams = new URLSearchParams("range=monthly");

    render(<LeaderboardPage />);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadTextFile.mock.calls[0];
    expect(filename).toMatch(/^stellargive-leaderboard-monthly-\d{4}-\d{2}-\d{2}\.csv$/);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Rank,Donor Address,Total Donated (XLM),Donations,Campaigns");
    // DONOR_A has the higher total (350 stroops) and ranks first.
    expect(lines[1]).toBe(`1,${DONOR_A},0.000035,2,1`);
    expect(lines[2]).toBe(`2,${DONOR_B},0.00001,1,1`);
  });

  it("hides the export control when there are no ranked donors", () => {
    vi.mocked(useEventHistory).mockReturnValue(historyResult([]));

    render(<LeaderboardPage />);

    expect(screen.queryByRole("button", { name: /Export CSV/i })).not.toBeInTheDocument();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
});

describe("LeaderboardPage - coverage", () => {
  it("states the period the rankings cover", () => {
    vi.mocked(useEventHistory).mockReturnValue(
      historyResult([receivedEvent(1, DONOR_A, 300, "e1")]),
    );

    render(<LeaderboardPage />);

    expect(screen.getByTestId("leaderboard-period")).toHaveTextContent(
      "Showing donations from Oct 12, 2026 – Oct 19, 2026.",
    );
  });

  it("ranks donations beyond the old 200-event cap", () => {
    const events = Array.from({ length: 450 }, (_, i) =>
      receivedEvent(1, i % 2 === 0 ? DONOR_A : DONOR_B, 1, `e${i}`),
    );
    vi.mocked(useEventHistory).mockReturnValue(historyResult(events));

    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    const lines = downloadTextFile.mock.calls[0][1].split("\r\n");
    expect(lines[1]).toBe(`1,${DONOR_A},225,225,1`);
    expect(lines[2]).toBe(`2,${DONOR_B},225,225,1`);
  });

  it("flags a truncated scan", () => {
    vi.mocked(useEventHistory).mockReturnValue(
      historyResult([receivedEvent(1, DONOR_A, 300, "e1")], { truncated: true }),
    );

    render(<LeaderboardPage />);

    expect(
      screen.getByText(/Only the oldest part of the window could be scanned/),
    ).toBeInTheDocument();
describe("LeaderboardPage - mixed tokens", () => {
  const mixedEvents = [
    receivedEvent(1, DONOR_A, 100_000_000, "e1", XLM), // 10 XLM
    receivedEvent(2, DONOR_B, 30_000_000, "e2", XLM), // 3 XLM
    receivedEvent(3, DONOR_B, 500_000_000, "e3", USDC), // 50 USDC
  ];

  it("shows a total per token instead of one XLM figure", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: mixedEvents,
      isLoading: false,
      isError: false,
    } as any);

    render(<LeaderboardPage />);

    const totals = screen.getByRole("list", { name: "Total donated per token" });
    expect(totals).toHaveTextContent("13 XLM");
    expect(totals).toHaveTextContent("50 USDC");
    // 13 XLM + 50 USDC must never be reported as 63 XLM.
    expect(screen.queryByText(/63/)).toBeNull();
  });

  it("ranks donors within the selected token only", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: mixedEvents,
      isLoading: false,
      isError: false,
    } as any);

    render(<LeaderboardPage />);

    // Defaults to XLM, where DONOR_A (10) outranks DONOR_B (3); B's USDC doesn't count.
    const ranking = screen.getByRole("list", { name: "Donor leaderboard" });
    const rows = within(ranking).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(DONOR_A);
    expect(rows[0]).toHaveTextContent("10 XLM");
    expect(rows[1]).toHaveTextContent(DONOR_B);
    expect(rows[1]).toHaveTextContent("3 XLM");

    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    expect(pushMock).toHaveBeenCalledWith(`/leaderboard?range=all&token=${USDC}`);
  });

  it("labels the USDC ranking and its CSV in USDC", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: mixedEvents,
      isLoading: false,
      isError: false,
    } as any);
    currentParams = new URLSearchParams(`token=${USDC}`);

    render(<LeaderboardPage />);

    const rows = within(screen.getByRole("list", { name: "Donor leaderboard" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("50 USDC");

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));
    const [, csv] = downloadTextFile.mock.calls[0];
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Rank,Donor Address,Total Donated (USDC),Donations,Campaigns");
    expect(lines[1]).toBe(`1,${DONOR_B},50,1,1`);
  });
});
