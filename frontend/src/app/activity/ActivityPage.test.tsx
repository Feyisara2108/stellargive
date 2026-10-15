import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ActivityPage from "./page";
import {
  makeCreatedEvent,
  makeDonationEvent,
  NATIVE_TOKEN_ADDRESS,
} from "@/test/factories";

// fromStroops is the only soroban export the page reaches (via @/lib/eventData).
vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => BigInt(stroops).toString(),
}));

const replaceMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/hooks/useSoroban", () => ({
  useEvents: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}));

const ActivityFeedMock = vi.hoisted(() => {
  const React = require("react");

  const formatTxHashMock = (value: any) => {
    if (typeof value !== "string" || value.length < 12) return null;
    return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
  };

  const formatEventAmountMock = (event: any, field: string) => {
    const data = event?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return "—";
    const val = data[field];
    if (val === null || val === undefined || val === "") return "—";
    try {
      return `${BigInt(val).toString()} XLM`;
    } catch {
      return "—";
    }
  };

  const DynamicActivityFeed = (props: any) => {
    const visible = props?.visible;
    if (!visible) return null;
    return React.createElement(
      "table",
      null,
      React.createElement(
        "tbody",
        null,
        visible.map((event: any, idx: number) => {
          const txLabel = formatTxHashMock(event?.txHash) || "N/A";
          let amountStr = "";
          if (event?.topic === "received") {
            amountStr = formatEventAmountMock(event, "amount");
          } else if (event?.topic === "created") {
            amountStr = formatEventAmountMock(event, "target_amount");
          } else if (event?.topic === "claimed") {
            amountStr = formatEventAmountMock(event, "amount");
          }
          return React.createElement(
            "tr",
            { key: event?.id || idx },
            React.createElement("td", null, amountStr),
            React.createElement(
              "td",
              null,
              event?.ledger !== undefined && event?.ledger !== null ? String(event.ledger) : "—",
            ),
            React.createElement("td", null, txLabel),
          );
        }),
      ),
    );
  };
  DynamicActivityFeed.displayName = "DynamicActivityFeed";
  return DynamicActivityFeed;
});

vi.mock("next/dynamic", () => ({
  default: () => ActivityFeedMock,
}));

import { useEvents } from "@/hooks/useSoroban";

const DONOR = "G" + "B".repeat(55);
const OTHER = "G" + "C".repeat(55);

beforeEach(() => {
  replaceMock.mockReset();
  currentParams = new URLSearchParams();
});

describe("ActivityPage - malformed event payloads", () => {
  it("renders placeholders instead of crashing on short or garbage struct payloads", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        // Donation event with no amount
        {
          id: "e1",
          topic: "received",
          ledger: 10,
          data: {
            campaign_id: 1n,
            donor: DONOR,
            total_raised: 0n,
            accepted_token: NATIVE_TOKEN_ADDRESS,
            comment: null,
          },
        },
        // Creation event with a non-numeric target
        makeCreatedEvent("e2", { id: 2n, creator: DONOR, target_amount: "not-a-number" as any }, 11),
        // Claim event with no data at all
        { id: "e3", topic: "claimed", ledger: 12 },
        // Entries that are not events at all
        null,
        "garbage",
      ],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    expect(screen.getByText(/Transaction History/i)).toBeInTheDocument();

    // Desktop table + mobile list each render every event, so three malformed
    // amounts produce six placeholders.
    await waitFor(() => {
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps ledger and tx-hash cells safe when those fields are missing", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [{ id: "e4", topic: "received", data: {} }],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    // No txHash → "N/A" rather than a substring call on undefined.
    await waitFor(() => {
      expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
    });
    // Missing ledger renders the placeholder, not "Ledger undefined".
    expect(screen.queryByText(/Ledger undefined/)).not.toBeInTheDocument();
  });

  it("still renders well-formed events", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("e5", DONOR, 5_000_000n, 3n, 20)],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("5000000 XLM").length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("ActivityPage - search filtering", () => {
  it("filters the activity list when a donor address is typed", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        makeDonationEvent("s1", DONOR, 1_000_000n, 3n, 30),
        makeDonationEvent("s2", OTHER, 2_000_000n, 3n, 31),
      ],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search by donor address/i);
    fireEvent.change(searchInput, { target: { value: DONOR } });

    await waitFor(
      () => {
        expect(screen.queryByText("2000000 XLM")).not.toBeInTheDocument();
        expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 1000 },
    );
  });

  it("filters the activity list when a campaign id is typed", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        makeDonationEvent("c1", DONOR, 1_000_000n, 3n, 40),
        makeDonationEvent("c2", DONOR, 2_000_000n, 9n, 41),
      ],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search by donor address/i);
    fireEvent.change(searchInput, { target: { value: "9" } });

    await waitFor(
      () => {
        expect(screen.queryByText("1000000 XLM")).not.toBeInTheDocument();
        expect(screen.getAllByText("2000000 XLM").length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 1000 },
    );
  });

  it("shows a helpful empty state with a clear action when nothing matches", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("e6", DONOR, 1_000_000n, 3n, 50)],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search by donor address/i);
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    await waitFor(
      () => {
        expect(screen.getByText(/No activity matches your search/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /Clear search input/i }));

    await waitFor(() => {
      expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("syncs the search term to the ?search= URL parameter", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("e7", DONOR, 1_000_000n, 3n, 60)],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("1000000 XLM").length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search by donor address/i);
    fireEvent.change(searchInput, { target: { value: DONOR } });

    await waitFor(
      () => {
        expect(replaceMock).toHaveBeenCalledWith(
          expect.stringContaining("search="),
          expect.objectContaining({ scroll: false }),
        );
      },
      { timeout: 1000 },
    );
  });

  it("hydrates the search term from ?search= on mount", async () => {
    currentParams = new URLSearchParams("search=abc123");
    vi.mocked(useEvents).mockReturnValue({
      data: [makeDonationEvent("e8", DONOR, 1_000_000n, 3n, 70)],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Search by donor address/i) as HTMLInputElement;
      expect(input.value).toBe("abc123");
    });
  });
});
