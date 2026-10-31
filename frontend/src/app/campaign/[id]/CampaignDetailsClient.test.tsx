/**
 * #1143 — the donation success dialog must survive the Active → Funded flip.
 *
 * When a donation completes a campaign's goal, the campaign refetches as
 * Funded. DonateModal hides its form unless the campaign is Active, but the
 * success dialog has to stay on screen at that point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { Campaign } from "@/lib/soroban";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const walletState = vi.hoisted(() => ({
  address: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ" as string | null,
  isWrongNetwork: false,
}));

const campaignState = vi.hoisted(() => ({ campaign: null as unknown }));
const donateMutation = vi.hoisted(() => ({ mutateAsync: undefined as unknown }));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => walletState,
}));

vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useCampaign: () => ({
      data: campaignState.campaign,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useCancelCampaign: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEvents: () => ({ data: [], isLoading: false }),
    useDonate: () => ({
      mutateAsync: donateMutation.mutateAsync,
      isPending: false,
      isSuccess: false,
    }),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Side panels that fetch their own data and have nothing to do with the donate flow.
vi.mock("@/components/RecentDonations", () => ({ RecentDonations: () => null }));
vi.mock("@/components/ProjectUpdates", () => ({ ProjectUpdates: () => null }));
vi.mock("@/components/TopDonors", () => ({ TopDonors: () => null }));

import { CampaignDetailsClient } from "./CampaignDetailsClient";

const TARGET = 1_000_000_000n; // 100 XLM
const RAISED = 580_000_000n; // 58 XLM

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Clean Water Initiative",
    description: "Wells for three villages",
    category: "relief",
    target_amount: TARGET,
    raised_amount: RAISED,
    deadline: 0n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

function renderPage() {
  return render(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);
}

describe("CampaignDetailsClient donation success dialog", () => {
  beforeEach(() => {
    localStorage.clear();
    walletState.address = WALLET;
    walletState.isWrongNetwork = false;
    campaignState.campaign = makeCampaign();
    donateMutation.mutateAsync = vi.fn().mockResolvedValue({ hash: "TXHASH123" });
  });

  it("keeps the success dialog visible when the donation flips the campaign to Funded", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage();

    await user.click(await screen.findByRole("button", { name: "Donate Now" }));
    // 58 XLM raised of 100: a 42 XLM donation reaches the goal exactly.
    await user.type(await screen.findByPlaceholderText("10.0"), "42");
    await user.click(await screen.findByRole("button", { name: "Confirm Donation" }));

    expect(await screen.findByText("Donation Successful!")).toBeInTheDocument();
    expect(donateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 1n, amount: "42" }),
    );

    // The refetch after the donation reports the campaign as Funded.
    campaignState.campaign = makeCampaign({ raised_amount: TARGET, status: "Funded" });
    rerender(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);

    expect(screen.getByText("Donation Successful!")).toBeInTheDocument();
    expect(screen.getByText("TXHASH123")).toBeInTheDocument();
    // The campaign no longer accepts donations, so the form and its trigger are gone.
    expect(screen.queryByRole("button", { name: "Donate Now" })).not.toBeInTheDocument();
  });

  it("does not offer the donate form for a campaign that is already Funded", async () => {
    campaignState.campaign = makeCampaign({ raised_amount: TARGET, status: "Funded" });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Clean Water Initiative" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Donate Now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Donation Successful!")).not.toBeInTheDocument();
  });
});
