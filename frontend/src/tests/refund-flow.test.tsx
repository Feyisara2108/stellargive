import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { scValToNative } from "@stellar/stellar-sdk";
import { DonateModal } from "@/components/DonateModal";
import { RefundButton } from "@/components/RefundButton";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeCampaign, WALLET_ADDRESS } from "@/test/factories";
import {
  useCampaign,
  useCancelCampaign,
  useWalletBalance,
  useRefundEligibility,
} from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import type { Campaign } from "@/lib/soroban";

/**
 * End-to-end integration test covering the complete refund journey:
 * 1. Donor connects mock wallet and donates to an active campaign.
 * 2. Campaign cancellation is triggered by creator, transitioning status to Cancelled.
 * 3. Refund eligibility gating is verified across stages (Active, Cancelled, disconnected, non-donor).
 * 4. Eligible donor claims refund, asserting on-chain contract args, pending state, UI unmounting,
 *    and cache/balance updates.
 */

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastLoading = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    loading: toastLoading,
  },
}));

const submitTransactionMock = vi.hoisted(() => vi.fn());
const estimateFeeMock = vi.hoisted(() => vi.fn());
const getSACBalanceMock = vi.hoisted(() => vi.fn());
const getCampaignMock = vi.hoisted(() => vi.fn());

const TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const OTHER_USER_ADDRESS = "GB7BVRZLMK3R5GY7GL7QG2PVIOW6NZWZNDQG5PPWQ63YZJ5X3G5M3ABC";

vi.mock("@/lib/soroban", () => ({
  CONTRACT_ID: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  submitTransaction: submitTransactionMock,
  estimateFee: estimateFeeMock,
  getSACBalance: getSACBalanceMock,
  getCampaign: getCampaignMock,
  getTokenMetadata: vi.fn().mockResolvedValue({ decimals: 7, symbol: "XLM" }),
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
  toStroops: (amount: string | number): bigint => {
    const parts = amount.toString().split(".");
    let stroops = BigInt(parts[0]) * 10_000_000n;
    if (parts.length > 1) {
      let decimals = parts[1];
      if (decimals.length > 7) decimals = decimals.substring(0, 7);
      else decimals = decimals.padEnd(7, "0");
      stroops += BigInt(decimals);
    }
    return stroops;
  },
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Integrated harness simulating campaign details page with wallet balance,
 * donation modal, campaign cancellation trigger, and refund button.
 */
function RefundFlowHarness({
  campaignId,
  initialCampaign,
  showCancelButton = true,
}: {
  campaignId: bigint;
  initialCampaign: Campaign;
  showCancelButton?: boolean;
}) {
  const { data: campaign = initialCampaign } = useCampaign(campaignId);
  const { address } = useWallet();
  const { data: balance, refetch: refetchBalance } = useWalletBalance(
    campaign?.accepted_token,
    address,
  );
  const cancelCampaign = useCancelCampaign();

  const isCancelled = campaign?.status === "Cancelled";

  return (
    <div data-testid="refund-flow-container">
      <div data-testid="wallet-address">{address || "none"}</div>
      <div data-testid="wallet-balance">{balance != null ? balance.toString() : "none"}</div>
      <button
        type="button"
        data-testid="refetch-balance-btn"
        onClick={() => refetchBalance()}
      >
        Refresh Balance
      </button>

      <div data-testid="campaign-status">{campaign?.status}</div>
      <div data-testid="campaign-raised">{campaign?.raised_amount.toString()}</div>

      {campaign && campaign.status === "Active" && (
        <div data-testid="donate-section">
          <DonateModal campaign={campaign} />
        </div>
      )}

      {showCancelButton && campaign && campaign.status === "Active" && (
        <button
          type="button"
          data-testid="cancel-campaign-btn"
          disabled={cancelCampaign.isPending}
          onClick={async () => {
            await cancelCampaign.mutateAsync(campaign.id);
          }}
        >
          {cancelCampaign.isPending ? "Cancelling..." : "Cancel Campaign"}
        </button>
      )}

      <div data-testid="refund-section">
        {campaign && (
          <RefundButton campaignId={campaign.id} isCancelled={isCancelled} />
        )}
      </div>
    </div>
  );
}

function renderRefundFlow(
  initialCampaign: Campaign,
  options: { queryClient?: QueryClient; showCancelButton?: boolean } = {},
) {
  const queryClient = options.queryClient || makeQueryClient();
  queryClient.setQueryData(["campaign", initialCampaign.id.toString()], initialCampaign);

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MockWalletProvider>
        <TooltipProvider delayDuration={0}>
          <RefundFlowHarness
            campaignId={initialCampaign.id}
            initialCampaign={initialCampaign}
            showCancelButton={options.showCancelButton}
          />
        </TooltipProvider>
      </MockWalletProvider>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}

describe("Integration: refund flow (donate -> cancel -> refund)", () => {
  beforeEach(() => {
    submitTransactionMock.mockReset();
    estimateFeeMock.mockReset();
    getSACBalanceMock.mockReset();
    getCampaignMock.mockReset();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastLoading.mockClear();

    // Default mock wallet address
    (window as any).__mockWalletAddress = WALLET_ADDRESS;

    // Default wallet balance: 100 XLM (1,000,000,000 stroops)
    getSACBalanceMock.mockResolvedValue(1_000_000_000n);

    // Default fee estimate returns null (unless configured for eligible probe)
    estimateFeeMock.mockResolvedValue(null);
  });

  afterEach(() => {
    delete (window as any).__mockWalletAddress;
  });

  it("completes full donate -> cancel -> refund flow, asserting on-chain args, cache updates, and UI transitions", async () => {
    let currentCampaign = makeCampaign({
      id: 77n,
      title: "Clean Water Initiative",
      target_amount: 100_0000000n, // 100 XLM
      raised_amount: 20_0000000n,  // 20 XLM
      accepted_token: TOKEN_CONTRACT,
      status: "Active",
    });

    getCampaignMock.mockImplementation(async () => currentCampaign);

    // Default successful transaction execution for donate, cancel, and refund
    submitTransactionMock.mockImplementation(async (sender, method, args) => {
      if (method === "donate") {
        return { hash: "donate-tx-hash-001", status: "SUCCESS" };
      }
      if (method === "cancel_campaign") {
        currentCampaign = { ...currentCampaign, status: "Cancelled" };
        return { hash: "cancel-tx-hash-002", status: "SUCCESS" };
      }
      if (method === "claim_refund") {
        return { hash: "refund-tx-hash-003", status: "SUCCESS" };
      }
      return { hash: "default-tx-hash", status: "SUCCESS" };
    });

    // When campaign is cancelled and donor probes claim_refund, return non-null fee
    estimateFeeMock.mockImplementation(async (sender, method) => {
      if (method === "claim_refund" && sender === WALLET_ADDRESS && currentCampaign.status === "Cancelled") {
        return 4500;
      }
      return null;
    });

    const { queryClient } = renderRefundFlow(currentCampaign);

    // --- PHASE 1: Initial Active State Gating ---
    expect(screen.getByTestId("campaign-status")).toHaveTextContent("Active");
    expect(screen.getByTestId("campaign-raised")).toHaveTextContent("200000000");

    // The refund button MUST NOT be rendered while campaign is Active
    expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();

    // --- PHASE 2: Simulate Donation ---
    const donateBtn = await screen.findByRole("button", { name: /Donate Now/i });
    expect(donateBtn).toBeEnabled();
    fireEvent.click(donateBtn);

    const amountInput = await screen.findByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "10" } });

    const confirmDonateBtn = screen.getByRole("button", { name: /Confirm Donation/i });
    await waitFor(() => expect(confirmDonateBtn).toBeEnabled());
    fireEvent.click(confirmDonateBtn);

    // Verify submitTransaction was called for "donate" with correct on-chain args
    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "donate",
        expect.any(Array),
      );
    });

    const donateCallArgs = submitTransactionMock.mock.calls.find(
      (call) => call[1] === "donate",
    )![2];
    expect(scValToNative(donateCallArgs[0])).toBe(WALLET_ADDRESS);
    expect(scValToNative(donateCallArgs[1])).toBe(77n);
    expect(scValToNative(donateCallArgs[2])).toBe(100_0000000n); // 10 XLM in stroops
    expect(scValToNative(donateCallArgs[3])).toBe(false); // not anonymous

    // Verify optimistic cache update for raised amount: 20 + 10 = 30 XLM
    await waitFor(() => {
      expect(screen.getByTestId("campaign-raised")).toHaveTextContent("300000000");
    });

    // Update mocked balance to reflect post-donation wallet balance (100 - 10 = 90 XLM)
    getSACBalanceMock.mockResolvedValue(900_0000000n);
    fireEvent.click(screen.getByTestId("refetch-balance-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("wallet-balance")).toHaveTextContent("9000000000");
    });

    // Close or dismiss the success modal dialog
    const closeButtons = screen.queryAllByRole("button", { name: /close/i });
    if (closeButtons.length > 0) {
      fireEvent.click(closeButtons[0]);
    }

    // --- PHASE 3: Simulate Campaign Cancellation ---
    const cancelBtn = screen.getByTestId("cancel-campaign-btn");
    expect(cancelBtn).toBeEnabled();
    fireEvent.click(cancelBtn);

    // Verify cancel_campaign mutation called on-chain
    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "cancel_campaign",
        expect.any(Array),
      );
    });

    const cancelCallArgs = submitTransactionMock.mock.calls.find(
      (call) => call[1] === "cancel_campaign",
    )![2];
    expect(scValToNative(cancelCallArgs[0])).toBe(WALLET_ADDRESS);
    expect(scValToNative(cancelCallArgs[1])).toBe(77n);

    // Verify toast confirmation for campaign cancellation
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Campaign cancelled",
        expect.objectContaining({ hash: "cancel-tx-hash-002" }),
      );
    });

    // Campaign status updates to Cancelled in cache and UI
    await waitFor(() => {
      expect(screen.getByTestId("campaign-status")).toHaveTextContent("Cancelled");
    });

    // --- PHASE 4: Refund Eligibility Gating Transition ---
    // Once campaign is Cancelled, useRefundEligibility probes estimateFee for claim_refund
    await waitFor(() => {
      expect(estimateFeeMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "claim_refund",
        expect.any(Array),
      );
    });

    // Since probe returned a valid fee (4500), RefundButton appears enabled
    const claimRefundBtn = await screen.findByRole("button", { name: /Claim refund/i });
    expect(claimRefundBtn).toBeInTheDocument();
    expect(claimRefundBtn).toBeEnabled();

    // --- PHASE 5: Simulate Claim Refund ---
    // Set up delayed resolution to verify in-flight pending state
    let resolveRefundTx: (val: any) => void;
    submitTransactionMock.mockImplementationOnce(
      (sender, method) =>
        new Promise((resolve) => {
          if (method === "claim_refund") {
            resolveRefundTx = () => resolve({ hash: "refund-tx-hash-003", status: "SUCCESS" });
          }
        }),
    );

    fireEvent.click(claimRefundBtn);

    // Button transitions to pending state with loading spinner & disabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Claiming refund\.\.\./i })).toBeDisabled();
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    // Balance restores upon refund settlement: back to 100 XLM
    getSACBalanceMock.mockResolvedValue(1_000_0000000n);

    // Resolve transaction submission
    resolveRefundTx!({ hash: "refund-tx-hash-003", status: "SUCCESS" });

    // Assert claim_refund contract arguments
    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "claim_refund",
        expect.any(Array),
      );
    });

    const refundCallArgs = submitTransactionMock.mock.calls.find(
      (call) => call[1] === "claim_refund",
    )![2];
    expect(scValToNative(refundCallArgs[0])).toBe(WALLET_ADDRESS);
    expect(scValToNative(refundCallArgs[1])).toBe(77n);

    // Assert celebratory / success toast notification
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Refund claimed successfully",
        expect.objectContaining({ hash: "refund-tx-hash-003" }),
      );
    });

    // Assert UI update: Claim refund button disappears (unmounts due to isSuccess / invalidation)
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Claiming refund\.\.\./i })).not.toBeInTheDocument();
    });

    // Assert wallet balance updates in the UI
    fireEvent.click(screen.getByTestId("refetch-balance-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("wallet-balance")).toHaveTextContent("1000000000");
    });

    // Verify cache invalidations occurred
    expect(queryClient.getQueryState(["campaign", "77"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["refund-eligibility", "77", WALLET_ADDRESS])?.isInvalidated).toBe(true);
  });

  describe("Refund eligibility gating across ineligible states", () => {
    it("gates refund button when campaign is Active", async () => {
      const activeCampaign = makeCampaign({
        id: 12n,
        status: "Active",
      });
      getCampaignMock.mockResolvedValue(activeCampaign);

      renderRefundFlow(activeCampaign, { showCancelButton: false });

      // Button is not in the DOM
      expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();

      // Fee estimation probe for claim_refund is never triggered
      expect(estimateFeeMock).not.toHaveBeenCalledWith(
        expect.anything(),
        "claim_refund",
        expect.anything(),
      );
    });

    it("gates refund button when campaign is Funded", async () => {
      const fundedCampaign = makeCampaign({
        id: 14n,
        status: "Funded",
      });
      getCampaignMock.mockResolvedValue(fundedCampaign);

      renderRefundFlow(fundedCampaign, { showCancelButton: false });

      // Button is not in the DOM
      expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();

      // Probe remains untriggered
      expect(estimateFeeMock).not.toHaveBeenCalledWith(
        expect.anything(),
        "claim_refund",
        expect.anything(),
      );
    });

    it("gates refund button when wallet is disconnected on a cancelled campaign", async () => {
      const cancelledCampaign = makeCampaign({
        id: 15n,
        status: "Cancelled",
      });
      getCampaignMock.mockResolvedValue(cancelledCampaign);

      // Simulate disconnected wallet
      (window as any).__mockWalletAddress = null;

      renderRefundFlow(cancelledCampaign, { showCancelButton: false });

      // Refund button is not in the DOM
      expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();
      expect(estimateFeeMock).not.toHaveBeenCalled();
    });

    it("gates refund button when user has no donation or contract simulation returns null", async () => {
      const cancelledCampaign = makeCampaign({
        id: 16n,
        status: "Cancelled",
      });
      getCampaignMock.mockResolvedValue(cancelledCampaign);

      // Connected user has no refundable amount (simulation reverts / returns null fee)
      estimateFeeMock.mockResolvedValue(null);

      renderRefundFlow(cancelledCampaign, { showCancelButton: false });

      // Probe is run
      await waitFor(() => {
        expect(estimateFeeMock).toHaveBeenCalledWith(
          WALLET_ADDRESS,
          "claim_refund",
          expect.any(Array),
        );
      });

      // Since estimateFee returned null, refund button stays hidden
      expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();
    });

    it("surfaces error feedback and re-enables button if claim_refund transaction fails", async () => {
      const cancelledCampaign = makeCampaign({
        id: 18n,
        status: "Cancelled",
      });
      getCampaignMock.mockResolvedValue(cancelledCampaign);
      estimateFeeMock.mockResolvedValue(4500);

      // Claim refund transaction fails on-chain
      submitTransactionMock.mockRejectedValue(new Error("HostError: Simulation error 101"));

      renderRefundFlow(cancelledCampaign, { showCancelButton: false });

      const claimBtn = await screen.findByRole("button", { name: /Claim refund/i });
      expect(claimBtn).toBeEnabled();

      fireEvent.click(claimBtn);

      // Verifies mapped error toast is surfaced
      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith(
          "Unable to claim refund. Please try again.",
          expect.any(Object),
        );
      });

      // Button recovers from pending state and re-enables for retry
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Claim refund/i })).toBeEnabled();
      });
    });
  });
});
