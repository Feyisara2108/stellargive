/**
 * #1143 — Test that the donation success dialog survives the Funded status flip.
 *
 * When a donation completes a campaign's goal, the status flips to Funded on
 * refetch. The success dialog must remain visible (not unmount) at that point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the wallet context
vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GTEST",
    connect: vi.fn().mockResolvedValue("GTEST"),
    connecting: false,
    isNetworkMismatch: false,
  }),
}));

// Mock the donation hook
const mockUseDonation = vi.fn();
vi.mock("@/hooks/useDonation", () => ({
  useDonation: () => mockUseDonation(),
}));

// Mock the campaign hook
const mockUseCampaign = vi.fn();
vi.mock("@/hooks/useCampaign", () => ({
  useCampaign: () => mockUseCampaign(),
}));

import CampaignDetailsClient from "./CampaignDetailsClient";

const activeCampaign = {
  id: "campaign-1",
  title: "Test Campaign",
  description: "A test campaign",
  goalAmount: 1000,
  raisedAmount: 500,
  status: "Active",
  creator: "GCREATOR",
  beneficiary: "GBENEF",
  tokenAddress: "GTOKEN",
  deadline: Date.now() + 86400000,
};

const fundedCampaign = {
  ...activeCampaign,
  raisedAmount: 1000,
  status: "Funded",
};

describe("CampaignDetailsClient donation success dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCampaign.mockReturnValue({
      campaign: activeCampaign,
      refetch: vi.fn(),
      isLoading: false,
    });
    mockUseDonation.mockReturnValue({
      donate: vi.fn().mockResolvedValue(undefined),
      isDonating: false,
      error: null,
    });
  });

  it("keeps the success dialog visible when status flips to Funded after donation", async () => {
    const refetch = vi.fn();
    mockUseCampaign.mockReturnValue({
      campaign: activeCampaign,
      refetch,
      isLoading: false,
    });

    render(<CampaignDetailsClient campaignId="campaign-1" />);

    // Click donate button
    const donateButton = screen.getByRole("button", { name: /donate/i });
    await userEvent.click(donateButton);

    // Fill in donation amount that reaches the goal
    const amountInput = screen.getByLabelText(/amount/i);
    await userEvent.type(amountInput, "500");

    // Submit donation
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    // Wait for success dialog
    await waitFor(() => {
      expect(screen.getByText(/donation successful/i)).toBeInTheDocument();
    });

    // Simulate refetch with Funded status
    mockUseCampaign.mockReturnValue({
      campaign: fundedCampaign,
      refetch,
      isLoading: false,
    });

    // Success dialog should still be visible
    await waitFor(() => {
      expect(screen.getByText(/donation successful/i)).toBeInTheDocument();
    });

    // Donate trigger should be gone (campaign is funded)
    expect(screen.queryByRole("button", { name: /donate/i })).not.toBeInTheDocument();
  });

  it("fails if DonateModal is gated on campaign status", async () => {
    // This test will fail if the modal unmounts when status changes to Funded
    const refetch = vi.fn();
    mockUseCampaign.mockReturnValue({
      campaign: activeCampaign,
      refetch,
      isLoading: false,
    });

    const { rerender } = render(<CampaignDetailsClient campaignId="campaign-1" />);

    // Trigger donation
    const donateButton = screen.getByRole("button", { name: /donate/i });
    await userEvent.click(donateButton);

    // Simulate status flip to Funded
    mockUseCampaign.mockReturnValue({
      campaign: fundedCampaign,
      refetch,
      isLoading: false,
    });
    rerender(<CampaignDetailsClient campaignId="campaign-1" />);

    // If the modal is gated on status, this assertion will fail
    // because the dialog will have unmounted
    await waitFor(() => {
      expect(screen.queryByText(/donation successful/i)).not.toBeNull();
    });
  });
});
