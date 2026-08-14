import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminPage from "./page";
import type { Campaign } from "@/lib/soroban";

const mockUseWallet = vi.fn();
const mockUseRecentCampaigns = vi.fn();
const mockUseAddToWhitelist = vi.fn();
const mockUseCancelCampaign = vi.fn();
const mockUseAddUpdate = vi.fn();

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

vi.mock("@/hooks/useSoroban", () => ({
  useRecentCampaigns: () => mockUseRecentCampaigns(),
  useAddToWhitelist: () => mockUseAddToWhitelist(),
  useCancelCampaign: () => mockUseCancelCampaign(),
  useAddUpdate: () => mockUseAddUpdate(),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

const creatorAddress = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const activeCampaign: Campaign = {
  id: 1n,
  creator: creatorAddress,
  beneficiary: "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  beneficiaries: [],
  title: "Flood Relief",
  description: "Help flood victims",
  category: "relief",
  target_amount: 1000000000n,
  raised_amount: 500000000n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
};

const fundedCampaign: Campaign = {
  ...activeCampaign,
  id: 2n,
  title: "School Rebuild",
  status: "Funded",
};

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({ address: creatorAddress, isWrongNetwork: false });
    mockUseRecentCampaigns.mockReturnValue({
      data: [activeCampaign, fundedCampaign],
      isLoading: false,
    });
    mockUseAddToWhitelist.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    mockUseCancelCampaign.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    mockUseAddUpdate.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  });

  it("renders owned campaigns list with View, Post Update, and Cancel buttons", () => {
    render(<AdminPage />);
    expect(screen.getByText("Campaign Management")).toBeInTheDocument();
    expect(screen.getByText("Flood Relief")).toBeInTheDocument();
    expect(screen.getByText("School Rebuild")).toBeInTheDocument();

    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    expect(cancelButtons).toHaveLength(2);
    // Active campaign cancel button is enabled
    expect(cancelButtons[0]).not.toBeDisabled();
    // Funded campaign cancel button is disabled
    expect(cancelButtons[1]).toBeDisabled();
  });

  it("opens cancel confirmation dialog when Cancel is clicked on active campaign", () => {
    render(<AdminPage />);
    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButtons[0]);

    expect(screen.getByText("Cancel this campaign?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, cancel campaign/i })).toBeInTheDocument();
  });

  it("triggers cancelCampaign mutation when confirming cancel dialog", async () => {
    const mutateAsyncMock = vi.fn().mockResolvedValue({});
    mockUseCancelCampaign.mockReturnValue({ isPending: false, mutateAsync: mutateAsyncMock });

    render(<AdminPage />);
    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButtons[0]);

    const confirmBtn = screen.getByRole("button", { name: /yes, cancel campaign/i });
    fireEvent.click(confirmBtn);

    expect(mutateAsyncMock).toHaveBeenCalledWith(1n);
  });

  it("opens post update dialog when Post Update button is clicked", () => {
    render(<AdminPage />);
    const postUpdateButtons = screen.getAllByRole("button", { name: /post update/i });
    fireEvent.click(postUpdateButtons[0]);

    expect(screen.getByText("Post Update for Flood Relief")).toBeInTheDocument();
  });
});
