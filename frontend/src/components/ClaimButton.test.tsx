import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClaimButton } from "./ClaimButton";
import type { Campaign } from "@/lib/soroban";

// Prevent module-level `new rpc.Server(...)` from throwing in tests
vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(function () {
        return {};
      }),
    },
  };
});

vi.mock("@/lib/soroban", () => ({
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
}));

vi.mock("@/hooks/useSoroban", () => ({
  useClaimFunds: vi.fn(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

import { useClaimFunds } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";

const CREATOR = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const BENEFICIARY = "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const STRANGER = "GCSTRANGERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const baseCampaign: Campaign = {
  id: 1n,
  creator: CREATOR,
  beneficiary: BENEFICIARY,
  title: "Test Campaign",
  category: "relief",
  target_amount: 1_000_000_000n,
  raised_amount: 500_000_000n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Funded",
};

const mockClaim = (overrides: Partial<ReturnType<typeof vi.fn>> = {}) => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  isSuccess: false,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(useWallet).mockReturnValue({ address: CREATOR } as any);
  vi.mocked(useClaimFunds).mockReturnValue(mockClaim() as any);
});

describe("ClaimButton — visibility", () => {
  it("renders 'Claim Funds' button for the campaign creator", () => {
    render(<ClaimButton campaign={baseCampaign} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeInTheDocument();
  });

  it("renders 'Claim Funds' button for the campaign beneficiary", () => {
    vi.mocked(useWallet).mockReturnValue({ address: BENEFICIARY } as any);
    render(<ClaimButton campaign={baseCampaign} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeInTheDocument();
  });

  it("renders nothing for a wallet that is neither creator nor beneficiary", () => {
    vi.mocked(useWallet).mockReturnValue({ address: STRANGER } as any);
    const { container } = render(<ClaimButton campaign={baseCampaign} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when wallet is not connected (address is null)", () => {
    vi.mocked(useWallet).mockReturnValue({ address: null } as any);
    const { container } = render(<ClaimButton campaign={baseCampaign} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClaimButton — canClaim logic", () => {
  it("enables the button for a Funded campaign with raised_amount > 0", () => {
    render(<ClaimButton campaign={{ ...baseCampaign, status: "Funded" }} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).not.toBeDisabled();
  });

  it("enables the button for an Expired campaign with raised_amount > 0", () => {
    render(<ClaimButton campaign={{ ...baseCampaign, status: "Expired" }} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).not.toBeDisabled();
  });

  it("disables the button for an Active campaign (not yet claimable)", () => {
    render(<ClaimButton campaign={{ ...baseCampaign, status: "Active" }} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeDisabled();
  });

  it("disables the button when raised_amount is 0 even if status is Funded", () => {
    render(<ClaimButton campaign={{ ...baseCampaign, status: "Funded", raised_amount: 0n }} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeDisabled();
  });
});

describe("ClaimButton — pending state", () => {
  it("disables the button while the claim mutation is pending", () => {
    vi.mocked(useClaimFunds).mockReturnValue(mockClaim({ isPending: true }) as any);
    render(<ClaimButton campaign={baseCampaign} />);
    expect(screen.getByRole("button", { name: /Claim Funds/i })).toBeDisabled();
  });

  it("shows a spinner icon while pending", () => {
    vi.mocked(useClaimFunds).mockReturnValue(mockClaim({ isPending: true }) as any);
    const { container } = render(<ClaimButton campaign={baseCampaign} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("hides the spinner when not pending", () => {
    vi.mocked(useClaimFunds).mockReturnValue(mockClaim({ isPending: false }) as any);
    const { container } = render(<ClaimButton campaign={baseCampaign} />);
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});

describe("ClaimButton — success path", () => {
  it("calls mutateAsync with the campaign id on click", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useClaimFunds).mockReturnValue(mockClaim({ mutateAsync }) as any);

    render(<ClaimButton campaign={baseCampaign} />);
    fireEvent.click(screen.getByRole("button", { name: /Claim Funds/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(baseCampaign.id);
    });
  });

  it("double-claim is prevented: Claimed status renders a locked disabled button", () => {
    // After a successful claim, the campaign status transitions to "Claimed",
    // rendering a ghost disabled button that prevents re-clicking.
    render(<ClaimButton campaign={{ ...baseCampaign, status: "Claimed" }} />);
    const claimedBtn = screen.getByRole("button", { name: /Claimed/i });
    expect(claimedBtn).toBeInTheDocument();
    expect(claimedBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Claim Funds/i })).not.toBeInTheDocument();
  });
});

describe("ClaimButton — error path", () => {
  it("logs the error via console.error when mutateAsync rejects", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mutateAsync = vi.fn().mockRejectedValue(new Error("claim failed"));
    vi.mocked(useClaimFunds).mockReturnValue(mockClaim({ mutateAsync }) as any);

    render(<ClaimButton campaign={baseCampaign} />);
    fireEvent.click(screen.getByRole("button", { name: /Claim Funds/i }));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });
});
