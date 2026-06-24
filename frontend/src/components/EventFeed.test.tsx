import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventFeed } from "./EventFeed";

vi.mock("@/hooks/useSoroban", () => ({
  useEvents: vi.fn(),
}));

vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => {
    return (BigInt(stroops) / 10_000_000n).toString();
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}));

import { useEvents } from "@/hooks/useSoroban";

const makeEvent = (
  id: string,
  topic: "received" | "created" | "claimed",
  data: (bigint | string | number)[],
  ledger = 100,
) => ({ id, topic, data, ledger });

beforeEach(() => {
  vi.mocked(useEvents).mockReset();
});

describe("EventFeed — loading state", () => {
  it("shows a spinner while events are loading", () => {
    vi.mocked(useEvents).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = render(<EventFeed />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("does not render the card in the loading state", () => {
    vi.mocked(useEvents).mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<EventFeed />);
    expect(screen.queryByText(/Recent Activity/i)).not.toBeInTheDocument();
  });
});

describe("EventFeed — empty state", () => {
  it("shows 'Waiting for on-chain events…' when events array is empty", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false } as any);
    render(<EventFeed />);
    expect(screen.getByText(/Waiting for on-chain events/i)).toBeInTheDocument();
  });

  it("shows 'Waiting for on-chain events…' when events data is undefined", () => {
    vi.mocked(useEvents).mockReturnValue({ data: undefined, isLoading: false } as any);
    render(<EventFeed />);
    expect(screen.getByText(/Waiting for on-chain events/i)).toBeInTheDocument();
  });

  it("renders the card heading in the empty state", () => {
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false } as any);
    render(<EventFeed />);
    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument();
  });
});

describe("EventFeed — populated state", () => {
  it("renders a 'received' donation event with amount and campaign id", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeEvent("0-1", "received", [1n, "GABC", 10_000_000n])],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    // "1 XLM donated to Campaign #1"
    expect(screen.getByText(/donated to/i)).toBeInTheDocument();
    expect(screen.getByText(/1 XLM/)).toBeInTheDocument();
    expect(screen.getByText(/Campaign #1/)).toBeInTheDocument();
  });

  it("renders a 'created' campaign event with target amount", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeEvent("0-2", "created", [2n, "title", "cat", 100_000_000n])],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    // "New campaign created with a target of 10 XLM"
    expect(screen.getByText(/New campaign created/i)).toBeInTheDocument();
    expect(screen.getByText(/10 XLM/)).toBeInTheDocument();
  });

  it("renders a 'claimed' event with claimed amount", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeEvent("0-3", "claimed", [3n, "creator", "beneficiary", 50_000_000n])],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    // "5 XLM claimed by beneficiary"
    expect(screen.getByText(/claimed by/i)).toBeInTheDocument();
    expect(screen.getByText(/5 XLM/)).toBeInTheDocument();
  });

  it("renders the ledger number for each event", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeEvent("0-1", "received", [1n, "GABC", 10_000_000n], 123456)],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    expect(screen.getByText(/Ledger 123456/i)).toBeInTheDocument();
  });

  it("renders multiple events without deduplication", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [
        makeEvent("0-1", "received", [1n, "GABC", 10_000_000n]),
        makeEvent("0-2", "created", [2n, "title", "cat", 100_000_000n]),
        makeEvent("0-3", "claimed", [3n, "creator", "beneficiary", 50_000_000n]),
      ],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    expect(screen.getByText(/donated to/i)).toBeInTheDocument();
    expect(screen.getByText(/New campaign created/i)).toBeInTheDocument();
    expect(screen.getByText(/claimed by/i)).toBeInTheDocument();
  });

  it("does not show the empty-state message when events are present", () => {
    vi.mocked(useEvents).mockReturnValue({
      data: [makeEvent("0-1", "received", [1n, "GABC", 10_000_000n])],
      isLoading: false,
    } as any);
    render(<EventFeed />);
    expect(screen.queryByText(/Waiting for on-chain events/i)).not.toBeInTheDocument();
  });
});
