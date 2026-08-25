import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DonateModal } from "@/components/DonateModal";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { makeCampaign, WALLET_ADDRESS } from "@/test/factories";
import type { Campaign } from "@/lib/soroban";

/**
 * End-to-end simulation of the donation journey: a connected (mocked)
 * Freighter wallet opens DonateModal, submits an amount, and the real
 * `useDonate` mutation (from useSoroban) drives its optimistic cache update
 * through a live QueryClient — the same cache campaign stat tiles and the
 * activity feed read from in the real app.
 *
 * Only the on-chain edges are mocked (submitTransaction / estimateFee /
 * getSACBalance / getTokenMetadata in @/lib/soroban) — everything above that
 * (the mutation's onMutate/onSuccess/onSettled cache logic, milestone
 * detection, the modal's own state machine) runs for real.
 */

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn(), loading: vi.fn() },
}));

const submitTransactionMock = vi.hoisted(() => vi.fn());
const TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

vi.mock("@/lib/soroban", () => ({
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

/** Reads the same cache entry useDonate's onMutate/onSettled write to — a
 *  stand-in for the campaign stats tile and the activity feed, both of which
 *  subscribe to the ["campaign", id] query in the real app. */
function CampaignCacheReadout({ campaign }: { campaign: Campaign }) {
  const { data } = useQuery({
    queryKey: ["campaign", campaign.id.toString()],
    queryFn: () => campaign,
    initialData: campaign,
    enabled: false,
  });
  return (
    <div data-testid="campaign-stats">Raised: {(data as Campaign).raised_amount.toString()}</div>
  );
}

function renderDonationFlow(campaign: Campaign) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(["campaign", campaign.id.toString()], campaign);

  return render(
    <QueryClientProvider client={queryClient}>
      <MockWalletProvider>
        <CampaignCacheReadout campaign={campaign} />
        <DonateModal campaign={campaign} />
      </MockWalletProvider>
    </QueryClientProvider>,
  );
}

describe("full donation flow with mock wallet provider", () => {
  beforeEach(() => {
    submitTransactionMock.mockReset();
    toastSuccess.mockClear();
    // MockWalletProvider's built-in default address isn't a valid StrKey, so
    // point it at a real one — the real `Address` class (unmocked here) is
    // used by the donation mutation itself.
    (window as any).__mockWalletAddress = WALLET_ADDRESS;
  });

  afterEach(() => {
    delete (window as any).__mockWalletAddress;
  });

  it("connects the mock wallet, submits a donation, and updates the cache and UI", async () => {
    submitTransactionMock.mockResolvedValue({ hash: "e2e-tx-hash", status: "SUCCESS" });

    // 20 XLM raised of a 100 XLM goal (20%).
    const campaign = makeCampaign({
      id: 42n,
      title: "Water for Ilesa",
      target_amount: 100_0000000n,
      raised_amount: 20_0000000n,
      accepted_token: TOKEN_CONTRACT,
    });

    renderDonationFlow(campaign);

    // Wallet is connected via the mock provider — the Donate button is enabled.
    const donateButton = await screen.findByRole("button", { name: /Donate Now/i });
    expect(donateButton).toBeEnabled();

    expect(screen.getByTestId("campaign-stats")).toHaveTextContent(
      `Raised: ${(20_0000000n).toString()}`,
    );

    // Simulate the user opening the donation modal.
    fireEvent.click(donateButton);

    const input = await screen.findByLabelText(/Amount/i);
    fireEvent.change(input, { target: { value: "10" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    fireEvent.click(confirmBtn);

    // Wallet "approval" (the mocked submitTransaction) resolves and the
    // donation succeeds end-to-end.
    await waitFor(() => expect(submitTransactionMock).toHaveBeenCalled());
    expect(await screen.findByText(/Donation Successful!/i)).toBeInTheDocument();
    expect(screen.getByText("e2e-tx-hash")).toBeInTheDocument();

    // The mutation's optimistic update landed in the shared QueryClient cache
    // — 20 XLM + 10 XLM raised, in raw stroop units (7 decimals).
    await waitFor(() => {
      expect(screen.getByTestId("campaign-stats")).toHaveTextContent(
        `Raised: ${(30_0000000n).toString()}`,
      );
    });

    // Crossing the 25% mark fires the celebratory milestone toast.
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("25% funded!"),
        expect.objectContaining({ description: expect.any(String) }),
      );
    });
  });

  it("surfaces a mapped error and leaves the cached raised total unchanged when the wallet rejects the transaction", async () => {
    submitTransactionMock.mockRejectedValue(new Error("Transaction failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const campaign = makeCampaign({
      id: 43n,
      title: "Shelter Fund",
      target_amount: 100_0000000n,
      raised_amount: 20_0000000n,
      accepted_token: TOKEN_CONTRACT,
    });

    renderDonationFlow(campaign);

    const donateButton = await screen.findByRole("button", { name: /Donate Now/i });
    fireEvent.click(donateButton);

    const input = await screen.findByLabelText(/Amount/i);
    fireEvent.change(input, { target: { value: "10" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(submitTransactionMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByText(/transaction was rejected on-chain/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Donation Successful!/i)).not.toBeInTheDocument();

    // Rolled back to the pre-mutation raised total once the error settles.
    await waitFor(() => {
      expect(screen.getByTestId("campaign-stats")).toHaveTextContent(
        `Raised: ${(20_0000000n).toString()}`,
      );
    });
  });
});
