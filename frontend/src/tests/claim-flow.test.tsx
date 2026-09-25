import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DonateModal } from "@/components/DonateModal";
import { ClaimButton } from "@/components/ClaimButton";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeCampaign, WALLET_ADDRESS } from "@/test/factories";
import type { Campaign } from "@/lib/soroban";

/**
 * End-to-end integration test of the campaign lifecycle:
 * 1. An Active campaign starts under-funded where the beneficiary's claim is blocked.
 * 2. Donations reach 100% of the funding goal via DonateModal, triggering milestone celebratory feedback.
 * 3. The goal-reaching donation enables the beneficiary's Claim Funds action.
 * 4. The beneficiary claims funds, transaction submits and confirms.
 * 5. UI transitions to the claimed state and confirms all celebratory & claim feedback.
 */

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

const confettiMock = vi.hoisted(() => vi.fn());
vi.mock("canvas-confetti", () => ({ default: confettiMock }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastLoading = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, loading: toastLoading },
}));

const submitTransactionMock = vi.hoisted(() => vi.fn());
const getCampaignMock = vi.hoisted(() => vi.fn());
const TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const OTHER_USER = "GBYV4MD5BCVRCTANP5EDIU5PFGQOFX4NQ5266ER4FDRPXN7QUR7AE2LO";

vi.mock("@/lib/soroban", () => ({
  getCampaign: getCampaignMock,
  submitTransaction: submitTransactionMock,
  estimateFee: vi.fn().mockResolvedValue(null),
  getSACBalance: vi.fn().mockResolvedValue(1_000_0000000n),
  getTokenMetadata: vi.fn().mockResolvedValue({ decimals: 7, symbol: "XLM" }),
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Integrated campaign view combining stats, status badge, donate modal,
 * and claim button driven by the live React Query cache.
 */
function CampaignClaimFlowView({ campaignId }: { campaignId: bigint }) {
  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["campaign", campaignId.toString()],
    queryFn: () => getCampaignMock(campaignId),
  });

  if (!campaign) return <div>Loading campaign...</div>;

  return (
    <div data-testid="campaign-claim-flow">
      <div data-testid="campaign-status">Status: {campaign.status}</div>
      <div data-testid="campaign-raised">Raised: {campaign.raised_amount.toString()}</div>
      <div data-testid="campaign-target">Target: {campaign.target_amount.toString()}</div>

      <CampaignStatusBadge
        status={campaign.status}
        deadline={campaign.deadline}
        raisedAmount={campaign.raised_amount}
        targetAmount={campaign.target_amount}
      />

      {campaign.status === "Active" && <DonateModal campaign={campaign} />}
      <ClaimButton campaign={campaign} />
    </div>
  );
}

function renderClaimFlow(initialCampaign: Campaign) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(["campaign", initialCampaign.id.toString()], initialCampaign);

  return render(
    <QueryClientProvider client={queryClient}>
      <MockWalletProvider>
        <TooltipProvider delayDuration={0}>
          <CampaignClaimFlowView campaignId={initialCampaign.id} />
        </TooltipProvider>
      </MockWalletProvider>
    </QueryClientProvider>,
  );
}

describe("Integration: claim funds flow from goal funding to beneficiary claim", () => {
  let currentCampaign: Campaign;

  beforeEach(() => {
    submitTransactionMock.mockReset();
    confettiMock.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastLoading.mockClear();

    // Connected mock wallet acts as beneficiary
    (window as any).__mockWalletAddress = WALLET_ADDRESS;
  });

  afterEach(() => {
    delete (window as any).__mockWalletAddress;
  });

  it("simulates funding to goal, enables claim for beneficiary, claims funds successfully, and asserts celebratory feedback & claimed state", async () => {
    // 80 XLM raised of 100 XLM goal (80% funded, Active)
    currentCampaign = makeCampaign({
      id: 42n,
      title: "Clean Water Well Project",
      status: "Active",
      target_amount: 100_0000000n,
      raised_amount: 80_0000000n,
      creator: WALLET_ADDRESS,
      beneficiary: WALLET_ADDRESS,
      accepted_token: TOKEN_CONTRACT,
    });

    getCampaignMock.mockImplementation((id: bigint) => Promise.resolve(currentCampaign));

    submitTransactionMock.mockImplementation((address: string, method: string) => {
      if (method === "donate") {
        currentCampaign = {
          ...currentCampaign,
          raised_amount: 100_0000000n,
          status: "Funded",
        };
        return Promise.resolve({ hash: "donate-goal-tx-hash", status: "SUCCESS" });
      }
      if (method === "claim_funds") {
        currentCampaign = {
          ...currentCampaign,
          status: "Claimed",
        };
        return Promise.resolve({ hash: "claim-tx-hash", status: "SUCCESS" });
      }
      return Promise.resolve({ hash: "generic-tx-hash", status: "SUCCESS" });
    });

    renderClaimFlow(currentCampaign);

    // Initial state: Campaign is Active and 80% funded
    expect(screen.getByTestId("campaign-status")).toHaveTextContent("Status: Active");
    expect(screen.getByTestId("campaign-raised")).toHaveTextContent(
      `Raised: ${80_0000000n.toString()}`,
    );

    // Donate button is available
    const donateButton = await screen.findByRole("button", { name: /Donate Now/i });
    expect(donateButton).toBeEnabled();

    // Claim button is initially disabled because campaign is Active (not yet Funded or Expired)
    const claimButton = await screen.findByRole("button", { name: /Claim Funds/i });
    expect(claimButton).toBeDisabled();
    expect(claimButton).toHaveAttribute("aria-describedby", "claim-disabled-reason");

    // Hovering surfaces the disabled reason to the user
    fireEvent.mouseEnter(claimButton.parentElement as HTMLElement);
    expect(
      await screen.findByText("Campaign must be fully funded or expired before claiming"),
    ).toBeInTheDocument();

    // 1. Simulate donations reaching the funding goal (donate the remaining 20 XLM)
    fireEvent.click(donateButton);

    const amountInput = await screen.findByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "20" } });

    const confirmDonateBtn = screen.getByRole("button", { name: /Confirm Donation/i });
    await waitFor(() => expect(confirmDonateBtn).toBeEnabled());
    fireEvent.click(confirmDonateBtn);

    // Verify donation on-chain submission
    await waitFor(() => expect(submitTransactionMock).toHaveBeenCalledWith(
      WALLET_ADDRESS,
      "donate",
      expect.any(Array),
    ));

    // Verify donation success dialog renders
    expect(await screen.findByText(/Donation Successful!/i)).toBeInTheDocument();
    expect(screen.getByText("donate-goal-tx-hash")).toBeInTheDocument();

    // Assert celebratory feedback for reaching 100% funding goal:
    // (a) Celebratory milestone toast fired
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Fully funded!"),
        expect.objectContaining({ description: "100% of the goal raised." }),
      );
    });

    // (b) Confetti celebration triggered
    expect(confettiMock).toHaveBeenCalledWith(expect.objectContaining({ particleCount: 100 }));

    // 2. Goal-reaching donations enable claim
    // Wait for the campaign query invalidation to update state to Funded
    await waitFor(() => {
      expect(screen.getByTestId("campaign-status")).toHaveTextContent("Status: Funded");
    });
    expect(screen.getByTestId("campaign-raised")).toHaveTextContent(
      `Raised: ${100_0000000n.toString()}`,
    );

    // Celebratory badge "🎉 Goal Reached" is rendered
    expect(screen.getByText("🎉 Goal Reached")).toBeInTheDocument();

    // Beneficiary Claim Funds button is now enabled
    await waitFor(() => {
      expect(claimButton).toBeEnabled();
    });
    expect(claimButton).not.toHaveAttribute("aria-describedby", "claim-disabled-reason");

    // 3. Simulate the beneficiary claiming funds successfully
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "claim_funds",
        expect.any(Array),
      );
    });

    // 4. Assert claimed state and feedback render:
    // (a) Confirmation toast feedback with transaction hash & explorer action
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Transaction confirmed",
        expect.objectContaining({ action: expect.any(Object) }),
      );
    });

    // (b) Button transitions to "Claimed" and is disabled
    const claimedButton = await screen.findByRole("button", { name: /Claimed/i });
    expect(claimedButton).toBeDisabled();

    // (c) Refetched campaign reflects Claimed status
    await waitFor(() => {
      expect(screen.getByTestId("campaign-status")).toHaveTextContent("Status: Claimed");
    });

    // (d) Tooltip surfaces that funds have already been claimed
    fireEvent.mouseEnter(claimedButton.parentElement as HTMLElement);
    expect(await screen.findByText("Funds have already been claimed")).toBeInTheDocument();
  });

  it("prevents non-beneficiary users from claiming campaign funds", async () => {
    // Campaign is Funded, but beneficiary is a different address
    currentCampaign = makeCampaign({
      id: 43n,
      title: "Solar Grid Project",
      status: "Funded",
      target_amount: 50_0000000n,
      raised_amount: 50_0000000n,
      creator: OTHER_USER,
      beneficiary: OTHER_USER,
      accepted_token: TOKEN_CONTRACT,
    });

    getCampaignMock.mockImplementation((id: bigint) => Promise.resolve(currentCampaign));

    renderClaimFlow(currentCampaign);

    // Connected user is WALLET_ADDRESS (neither creator nor beneficiary)
    // ClaimButton returns null for unauthorized non-beneficiaries
    await waitFor(() => {
      expect(screen.getByTestId("campaign-status")).toHaveTextContent("Status: Funded");
    });
    expect(screen.queryByRole("button", { name: /Claim Funds/i })).not.toBeInTheDocument();
  });

  it("handles claim transaction failure gracefully and preserves ability to retry", async () => {
    currentCampaign = makeCampaign({
      id: 44n,
      title: "Emergency Shelter Initiative",
      status: "Funded",
      target_amount: 50_0000000n,
      raised_amount: 50_0000000n,
      creator: WALLET_ADDRESS,
      beneficiary: WALLET_ADDRESS,
      accepted_token: TOKEN_CONTRACT,
    });

    getCampaignMock.mockImplementation((id: bigint) => Promise.resolve(currentCampaign));
    submitTransactionMock.mockRejectedValueOnce(new Error("Simulation failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderClaimFlow(currentCampaign);

    const claimButton = await screen.findByRole("button", { name: /Claim Funds/i });
    expect(claimButton).toBeEnabled();

    // Attempt claim which fails on-chain
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "claim_funds",
        expect.any(Array),
      );
    });

    // Error toast feedback is surfaced
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });

    // Button remains enabled for retry, does not falsely transition to Claimed
    expect(claimButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claimed$/i })).not.toBeInTheDocument();
  });
});
