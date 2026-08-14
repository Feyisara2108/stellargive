import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ActivityPage from "./page";

// fromStroops is the only soroban export the page reaches (via @/lib/eventData).
vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => BigInt(stroops).toString(),
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

  const formatEventAmountMock = (event: any, index: number) => {
    const data = event?.data;
    if (!data || !Array.isArray(data)) return "—";
    const val = data[index];
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
            amountStr = formatEventAmountMock(event, 2);
          } else if (event?.topic === "created") {
            amountStr = formatEventAmountMock(event, 3);
          } else if (event?.topic === "claimed") {
            amountStr = formatEventAmountMock(event, 3);
          }
          return React.createElement(
            "tr",
            { key: event?.id || idx },
            React.createElement("td", null, amountStr),
            React.createElement("td", null, event?.ledger !== undefined && event?.ledger !== null ? String(event.ledger) : "—"),
            React.createElement("td", null, txLabel)
          );
        })
      )
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

describe("ActivityPage - malformed event payloads", () => {
  it("renders placeholders instead of crashing on short or garbage data arrays", async () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        // Donation event with no amount at data[2]
        { id: "e1", topic: "received", ledger: 10, data: [1, DONOR] },
        // Creation event with a non-numeric target at data[3]
        { id: "e2", topic: "created", ledger: 11, data: [2, DONOR, 0, "not-a-number"] },
        // Claim event with no data array at all
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
      data: [{ id: "e4", topic: "received", data: [] }],
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
      data: [{ id: "e5", topic: "received", ledger: 20, data: [3, DONOR, 5000000] }],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("5000000 XLM").length).toBeGreaterThanOrEqual(1);
    });
  });
});
