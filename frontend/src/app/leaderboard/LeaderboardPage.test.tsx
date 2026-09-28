import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LeaderboardPage from "./page";

vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => BigInt(stroops).toString(),
}));

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

vi.mock("@/hooks/useSoroban", () => ({
  useEvents: vi.fn(),
  useResolvedName: vi.fn(() => ({ data: null })),
}));

const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/utils/format", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/format")>();
  return { ...actual, downloadTextFile };
});

import { useEvents } from "@/hooks/useSoroban";

const DONOR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAA";
const DONOR_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWBB";

function receivedEvent(campaignId: number, donor: string, amount: number, id: string) {
  return {
    id,
    topic: "received",
    data: [campaignId, donor, amount],
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  pushMock.mockReset();
  downloadTextFile.mockReset();
  currentParams = new URLSearchParams();
});

describe("LeaderboardPage - CSV export", () => {
  it("exports the currently ranked donors as a CSV, respecting the active time range", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        receivedEvent(1, DONOR_A, 300, "e1"),
        receivedEvent(2, DONOR_B, 100, "e2"),
        receivedEvent(1, DONOR_A, 50, "e3"),
      ],
      isLoading: false,
      isError: false,
    } as any);
    currentParams = new URLSearchParams("range=monthly");

    render(<LeaderboardPage />);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadTextFile.mock.calls[0];
    expect(filename).toMatch(/^stellargive-leaderboard-monthly-\d{4}-\d{2}-\d{2}\.csv$/);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Rank,Donor Address,Total Donated (XLM),Donations,Campaigns");
    // DONOR_A has the higher total (350) and ranks first.
    expect(lines[1]).toBe(`1,${DONOR_A},350,2,1`);
    expect(lines[2]).toBe(`2,${DONOR_B},100,1,1`);
  });

  it("hides the export control when there are no ranked donors", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false, isError: false } as any);

    render(<LeaderboardPage />);

    expect(screen.queryByRole("button", { name: /Export CSV/i })).not.toBeInTheDocument();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
});
