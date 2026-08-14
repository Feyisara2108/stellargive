import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

import { useEvents } from "@/hooks/useSoroban";

const DONOR = "G" + "B".repeat(55);

describe("ActivityPage - malformed event payloads", () => {
  it("renders placeholders instead of crashing on short or garbage data arrays", () => {
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
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps ledger and tx-hash cells safe when those fields are missing", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [{ id: "e4", topic: "received", data: [] }],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    // No txHash → "N/A" rather than a substring call on undefined.
    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
    // Missing ledger renders the placeholder, not "Ledger undefined".
    expect(screen.queryByText(/Ledger undefined/)).not.toBeInTheDocument();
  });

  it("still renders well-formed events", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [{ id: "e5", topic: "received", ledger: 20, data: [3, DONOR, 5000000] }],
      isLoading: false,
      isError: false,
    } as any);

    render(<ActivityPage />);

    expect(screen.getAllByText("5000000 XLM").length).toBeGreaterThanOrEqual(1);
  });
});
