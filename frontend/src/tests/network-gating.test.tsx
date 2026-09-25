import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as freighterApi from "@stellar/freighter-api";
import { WalletProvider } from "@/lib/WalletProvider";
import { DonateModal } from "@/components/DonateModal";
import { ClaimButton } from "@/components/ClaimButton";
import { RefundButton } from "@/components/RefundButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeCampaign, WALLET_ADDRESS } from "@/test/factories";
import type { Campaign } from "@/lib/soroban";

// Mock freighter extension API
vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  setAllowed: vi.fn(),
  getNetwork: vi.fn(),
}));

// Mock sentry
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

// Mock canvas-confetti
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

// Mock sonner toast
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastLoading = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, loading: toastLoading },
}));

// Mock Soroban RPC methods
const submitTransactionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/soroban", () => ({
  submitTransaction: submitTransactionMock,
  estimateFee: vi.fn().mockResolvedValue(1000n),
  getSACBalance: vi.fn().mockResolvedValue(1_000_0000000n),
  getTokenMetadata: vi.fn().mockResolvedValue({ decimals: 7, symbol: "XLM" }),
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
}));

const APP_NETWORK =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Standalone Network ; February 2017";
const UNSUPPORTED_NETWORK = "Public Global Stellar Network ; September 2015";
const WRONG_NETWORK_REASON = "Please switch wallet network to Stellar Testnet";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Harness rendering the three primary transactional actions:
 * 1. Donate (via DonateModal for an active campaign)
 * 2. Claim (via ClaimButton for a fully funded campaign where wallet is beneficiary)
 * 3. Refund (via RefundButton for a cancelled campaign where wallet is eligible)
 */
function ActionGatingHarness({
  activeCampaign,
  fundedCampaign,
  cancelledCampaignId,
}: {
  activeCampaign: Campaign;
  fundedCampaign: Campaign;
  cancelledCampaignId: bigint;
}) {
  return (
    <div data-testid="actions-harness">
      <div data-testid="donate-action">
        <DonateModal campaign={activeCampaign} />
      </div>
      <div data-testid="claim-action">
        <ClaimButton campaign={fundedCampaign} />
      </div>
      <div data-testid="refund-action">
        <RefundButton campaignId={cancelledCampaignId} isCancelled={true} />
      </div>
    </div>
  );
}

function renderGatedActions(options?: {
  activeCampaign?: Campaign;
  fundedCampaign?: Campaign;
  cancelledCampaignId?: bigint;
}) {
  const queryClient = makeQueryClient();
  const activeCampaign =
    options?.activeCampaign ??
    makeCampaign({
      id: 101n,
      title: "Clean Water Initiative",
      status: "Active",
      target_amount: 100_0000000n,
      raised_amount: 40_0000000n,
    });

  const fundedCampaign =
    options?.fundedCampaign ??
    makeCampaign({
      id: 202n,
      title: "Disaster Relief Fund",
      status: "Funded",
      target_amount: 50_0000000n,
      raised_amount: 50_0000000n,
      beneficiary: WALLET_ADDRESS,
    });

  const cancelledCampaignId = options?.cancelledCampaignId ?? 303n;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TooltipProvider delayDuration={0}>
          <ActionGatingHarness
            activeCampaign={activeCampaign}
            fundedCampaign={fundedCampaign}
            cancelledCampaignId={cancelledCampaignId}
          />
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>,
  );

  return { ...result, activeCampaign, fundedCampaign, cancelledCampaignId };
}

/**
 * Simulates switching the active network in the Freighter wallet extension.
 * Triggers the visibilitychange/focus handlers installed by WalletProvider to re-poll network.
 */
async function simulateNetworkSwitch(newNetwork: string) {
  vi.mocked(freighterApi.getNetwork).mockResolvedValue({
    network: newNetwork,
  } as any);

  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

describe("Integration: wrong-network action gating across actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTransactionMock.mockReset();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastLoading.mockClear();

    // Default: connected wallet on an unsupported network
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: WALLET_ADDRESS });
    vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: true });
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({
      network: UNSUPPORTED_NETWORK,
    } as any);
  });

  it("disables donate, claim, and refund actions with surfaced reasons on wrong network, then enables all after network switch", async () => {
    renderGatedActions();

    // Find all three action buttons
    const donateButton = await screen.findByRole("button", { name: /Donate Now/i });
    const claimButton = await screen.findByRole("button", { name: /Claim Funds/i });
    const refundButton = await screen.findByRole("button", { name: /Claim refund/i });

    // 1. Assert all actions are disabled on the wrong network
    expect(donateButton).toBeDisabled();
    expect(claimButton).toBeDisabled();
    expect(refundButton).toBeDisabled();

    // 2. Assert disabled reasons are surfaced via aria-describedby attributes
    expect(donateButton).toHaveAttribute("aria-describedby", "donate-disabled-reason");
    expect(claimButton).toHaveAttribute("aria-describedby", "claim-disabled-reason");
    expect(refundButton).toHaveAttribute("aria-describedby", "refund-disabled-reason");

    // 3. Assert disabled reason text is surfaced to the user on hover
    fireEvent.mouseEnter(donateButton.parentElement as HTMLElement);
    expect(await screen.findByText(WRONG_NETWORK_REASON)).toBeInTheDocument();

    fireEvent.mouseEnter(claimButton.parentElement as HTMLElement);
    expect(await screen.findByText(WRONG_NETWORK_REASON)).toBeInTheDocument();

    fireEvent.mouseEnter(refundButton.parentElement as HTMLElement);
    expect(await screen.findByText(WRONG_NETWORK_REASON)).toBeInTheDocument();

    // 4. Assert clicking disabled actions does not trigger mutations or dialogs
    fireEvent.click(donateButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(claimButton);
    expect(submitTransactionMock).not.toHaveBeenCalled();

    fireEvent.click(refundButton);
    expect(submitTransactionMock).not.toHaveBeenCalled();

    // 5. Simulate network switch to the supported app network
    await simulateNetworkSwitch(APP_NETWORK);

    // 6. Assert all actions become enabled after network switch
    await waitFor(() => {
      expect(donateButton).toBeEnabled();
    });
    await waitFor(() => {
      expect(claimButton).toBeEnabled();
    });
    await waitFor(() => {
      expect(refundButton).toBeEnabled();
    });

    // 7. Assert disabled reason attributes are removed
    expect(donateButton).not.toHaveAttribute("aria-describedby", "donate-disabled-reason");
    expect(claimButton).not.toHaveAttribute("aria-describedby", "claim-disabled-reason");
    expect(refundButton).not.toHaveAttribute("aria-describedby", "refund-disabled-reason");

    // 8. Assert donate action can now be opened
    fireEvent.click(donateButton);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("dynamically re-disables all actions if user switches back to an unsupported network", async () => {
    renderGatedActions();

    const donateButton = await screen.findByRole("button", { name: /Donate Now/i });
    const claimButton = await screen.findByRole("button", { name: /Claim Funds/i });
    const refundButton = await screen.findByRole("button", { name: /Claim refund/i });

    // Initially disabled on wrong network
    expect(donateButton).toBeDisabled();
    expect(claimButton).toBeDisabled();
    expect(refundButton).toBeDisabled();

    // Switch to supported network -> actions enable
    await simulateNetworkSwitch(APP_NETWORK);
    await waitFor(() => expect(donateButton).toBeEnabled());
    await waitFor(() => expect(claimButton).toBeEnabled());
    await waitFor(() => expect(refundButton).toBeEnabled());

    // Switch back to unsupported network -> actions re-disable
    await simulateNetworkSwitch(UNSUPPORTED_NETWORK);
    await waitFor(() => expect(donateButton).toBeDisabled());
    await waitFor(() => expect(claimButton).toBeDisabled());
    await waitFor(() => expect(refundButton).toBeDisabled());

    // Reasons are surfaced again
    expect(donateButton).toHaveAttribute("aria-describedby", "donate-disabled-reason");
    expect(claimButton).toHaveAttribute("aria-describedby", "claim-disabled-reason");
    expect(refundButton).toHaveAttribute("aria-describedby", "refund-disabled-reason");
  });
});
