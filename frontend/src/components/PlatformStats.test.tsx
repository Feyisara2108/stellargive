import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import type { Campaign } from "@/lib/soroban";

// Drive the real usePlatformStats hook through its two contract reads; keep
// fromStroops real so the formatting under test is the production path.
vi.mock("@/lib/soroban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/soroban")>();
  return {
    ...actual,
    getTotalCampaigns: vi.fn(),
    getRecentCampaigns: vi.fn(),
  };
});

import { PlatformStats } from "./PlatformStats";
import { getTotalCampaigns, getRecentCampaigns } from "@/lib/soroban";

const mockGetTotalCampaigns = vi.mocked(getTotalCampaigns);
const mockGetRecentCampaigns = vi.mocked(getRecentCampaigns);

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Test Campaign",
    description: "Test description",
    category: "relief",
    target_amount: 1_000_000_000n,
    raised_amount: 0n,
    deadline: 1_900_000_000n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

function renderStats() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlatformStats />
    </QueryClientProvider>,
  );
}

/** The StatCard content block containing `title`, for scoping value lookups. */
function statCard(title: string) {
  return screen.getByText(title).parentElement as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlatformStats — loading", () => {
  it("renders three busy skeleton stat placeholders while stats load", () => {
    mockGetTotalCampaigns.mockReturnValue(new Promise<bigint>(() => {}));

    const { container } = renderStats();

    const busy = container.querySelector('[aria-busy="true"]') as HTMLElement;
    expect(busy).not.toBeNull();
    // Each placeholder stat is a value bar + a label bar.
    expect(busy.querySelectorAll(".animate-pulse")).toHaveLength(6);
    expect(screen.queryByText("Total Campaigns")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

describe("PlatformStats — populated", () => {
  it("renders formatted totals for typical values", async () => {
    mockGetTotalCampaigns.mockResolvedValue(3n);
    mockGetRecentCampaigns.mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: 12_500_000_000n, status: "Active" }), // 1250 XLM
      makeCampaign({ id: 2n, raised_amount: 5_000_000n, status: "Active" }), // 0.5 XLM
      makeCampaign({ id: 3n, raised_amount: 0n, status: "Funded" }),
    ]);

    renderStats();

    await screen.findByText("Total Campaigns");
    expect(within(statCard("Total Campaigns")).getByText("3")).toBeInTheDocument();
    expect(within(statCard("Total Raised")).getByText("1,250.5 XLM")).toBeInTheDocument();
    expect(within(statCard("Active Campaigns")).getByText("2")).toBeInTheDocument();
  });

  it("groups and rounds large raised totals", async () => {
    mockGetTotalCampaigns.mockResolvedValue(2n);
    mockGetRecentCampaigns.mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: 9_876_543_210_000_000n }), // 987,654,321 XLM
      makeCampaign({ id: 2n, raised_amount: 1_234_567n }), // 0.1234567 XLM
    ]);

    renderStats();

    await screen.findByText("Total Raised");
    // Grouped thousands, fractional part rounded to toLocaleString's 3 digits.
    expect(within(statCard("Total Raised")).getByText("987,654,321.123 XLM")).toBeInTheDocument();
  });

  it("renders zero raised and zero active when campaigns exist but none are funded or active", async () => {
    mockGetTotalCampaigns.mockResolvedValue(2n);
    mockGetRecentCampaigns.mockResolvedValue([
      makeCampaign({ id: 1n, raised_amount: 0n, status: "Expired" }),
      makeCampaign({ id: 2n, raised_amount: 0n, status: "Expired" }),
    ]);

    renderStats();

    await screen.findByText("Total Raised");
    expect(within(statCard("Total Campaigns")).getByText("2")).toBeInTheDocument();
    expect(within(statCard("Total Raised")).getByText("0 XLM")).toBeInTheDocument();
    expect(within(statCard("Active Campaigns")).getByText("0")).toBeInTheDocument();
  });
});

describe("PlatformStats — zero campaigns", () => {
  it("renders the empty-state message instead of zeroed stat cards", async () => {
    mockGetTotalCampaigns.mockResolvedValue(0n);

    renderStats();

    expect(
      await screen.findByText("No campaigns yet — be the first to start one."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Total Raised")).toBeNull();
    expect(mockGetRecentCampaigns).not.toHaveBeenCalled();
  });
});

describe("PlatformStats — error and retry", () => {
  it("renders the error message with an enabled Retry button", async () => {
    mockGetTotalCampaigns.mockRejectedValue(new Error("rpc down"));

    renderStats();

    expect(await screen.findByText(/couldn.t load platform stats/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByText("Total Campaigns")).toBeNull();
  });

  it("re-queries the stats on Retry and renders them once they load", async () => {
    const user = userEvent.setup();
    mockGetTotalCampaigns.mockRejectedValueOnce(new Error("rpc down")).mockResolvedValueOnce(1n);
    mockGetRecentCampaigns.mockResolvedValue([makeCampaign({ raised_amount: 10_000_000n })]);

    renderStats();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await screen.findByText("Total Raised");
    expect(mockGetTotalCampaigns).toHaveBeenCalledTimes(2);
    expect(within(statCard("Total Raised")).getByText("1 XLM")).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load platform stats/i)).toBeNull();
  });

  it("disables the button and shows Retrying... while the retry is in flight", async () => {
    const user = userEvent.setup();
    let resolveRetry!: (value: bigint) => void;
    mockGetTotalCampaigns
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockReturnValueOnce(new Promise<bigint>((resolve) => (resolveRetry = resolve)));

    renderStats();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    const retrying = await screen.findByRole("button", { name: "Retrying..." });
    expect(retrying).toBeDisabled();

    resolveRetry(0n);
    await waitFor(() =>
      expect(screen.getByText("No campaigns yet — be the first to start one.")).toBeInTheDocument(),
    );
  });

  it("stays in the error state when the retry also fails", async () => {
    const user = userEvent.setup();
    mockGetTotalCampaigns.mockRejectedValue(new Error("rpc down"));

    renderStats();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockGetTotalCampaigns).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText(/couldn.t load platform stats/i)).toBeInTheDocument();
  });
});
