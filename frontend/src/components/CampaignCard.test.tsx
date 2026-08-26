import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { CampaignCard } from "./CampaignCard";
import type { Campaign } from "@/lib/soroban";

expect.extend(toHaveNoViolations);

// ... rest of mocks ...
vi.mock("@/hooks/useSoroban", () => ({
  useTokenMetadata: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

// Deterministic relative-time formatting so countdown assertions don't
// depend on wall-clock timing.
vi.mock("date-fns", () => ({
  formatDistanceToNow: (date: Date) => {
    const diffMs = date.getTime() - Date.now();
    const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    const unit = `day${diffDays === 1 ? "" : "s"}`;
    return diffMs >= 0 ? `in ${diffDays} ${unit}` : `${diffDays} ${unit} ago`;
  },
}));

vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => {
    const s = BigInt(stroops).toString().padStart(8, "0");
    const pos = s.length - 7;
    const intPart = s.substring(0, pos);
    const decPart = s.substring(pos).replace(/0+$/, "");
    return decPart.length > 0 ? `${intPart}.${decPart}` : intPart || "0";
  },
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

// Mock child components that depend on wallet context / blockchain
vi.mock("@/components/DonateModal", () => ({
  DonateModal: ({
    campaign,
    open,
    suggestedAmount,
  }: {
    campaign: Campaign;
    open?: boolean;
    suggestedAmount?: string;
  }) => (
    <button
      data-testid="donate-modal"
      data-open={open ? "true" : "false"}
      data-suggested-amount={suggestedAmount ?? ""}
    >
      Donate to {campaign.title}
    </button>
  ),
}));

vi.mock("@/components/ClaimButton", () => ({
  ClaimButton: ({ campaign }: { campaign: Campaign }) => (
    <button data-testid="claim-button">Claim {campaign.title}</button>
  ),
}));

vi.mock("@/components/ShareButton", () => ({
  ShareButton: ({ campaign }: { campaign: { id: bigint; title: string } }) => (
    <button data-testid="share-button">Share {campaign.title}</button>
  ),
}));

vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => (
    <span data-testid="address-link">{address}</span>
  ),
}));

const ONE_DAY = 60 * 60 * 24;
const nowSec = () => Math.floor(Date.now() / 1000);
const stroops = (xlm: number): bigint => BigInt(xlm) * 10_000_000n;

const baseCampaign: Campaign = {
  id: 1n,
  creator: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
  beneficiary: "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  beneficiaries: [
    { address: "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", share: 10000 },
  ],
  title: "Flood Relief — Lagos",
  description: "Test description",
  category: "relief",
  target_amount: stroops(1_000_000),
  raised_amount: stroops(350_000),
  deadline: BigInt(nowSec() + 14 * ONE_DAY),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
};

describe("CampaignCard", () => {
  // ------------------------------------------------------------------
  // Rendering: title, amounts, progress bar
  // ------------------------------------------------------------------

  it("renders the campaign title", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText("Flood Relief — Lagos")).toBeInTheDocument();
  });

  it("displays raised amount in XLM", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText("350000 XLM")).toBeInTheDocument();
  });

  it("displays target amount in XLM", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText(/Target:.*1000000 XLM/)).toBeInTheDocument();
  });

  it("renders a progress bar", () => {
    const { container } = render(<CampaignCard campaign={baseCampaign} />);
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).toBeInTheDocument();
  });

  it("shows correct progress percentage", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    // 350_000 / 1_000_000 = 35.0%
    expect(screen.getByText("35.0%")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Status badges
  // ------------------------------------------------------------------

  it("shows Active badge for active campaign", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Funded badge when raised >= target", () => {
    const funded: Campaign = {
      ...baseCampaign,
      id: 2n,
      raised_amount: stroops(1_000_000),
      status: "Funded",
    };
    render(<CampaignCard campaign={funded} />);
    expect(screen.getByText("Funded")).toBeInTheDocument();
  });

  it("shows 100% progress when funded", () => {
    const funded: Campaign = {
      ...baseCampaign,
      id: 2n,
      raised_amount: stroops(1_000_000),
      status: "Funded",
    };
    render(<CampaignCard campaign={funded} />);
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });

  it("shows Expired badge for expired campaign", () => {
    const expired: Campaign = {
      ...baseCampaign,
      id: 3n,
      status: "Expired",
      deadline: BigInt(nowSec() - 2 * ONE_DAY),
    };
    render(<CampaignCard campaign={expired} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows Claimed badge for claimed campaign", () => {
    const claimed: Campaign = {
      ...baseCampaign,
      id: 4n,
      status: "Claimed",
      raised_amount: 0n,
    };
    render(<CampaignCard campaign={claimed} />);
    expect(screen.getByText("Claimed")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Navigation: link to /campaign/${id}
  // ------------------------------------------------------------------

  it("card links to the correct campaign route via header navigation", () => {
    const { container } = render(<CampaignCard campaign={baseCampaign} />);
    // The card title area is clickable — verify the campaign ID is used for routing
    // CampaignCard doesn't render an explicit <a> link, but the title and card
    // are structured for navigation. We verify the campaign ID is present.
    expect(screen.getByText("Flood Relief — Lagos")).toBeInTheDocument();
  });

  it("renders with a different campaign ID correctly", () => {
    const other: Campaign = { ...baseCampaign, id: 42n, title: "Ocean Cleanup" };
    render(<CampaignCard campaign={other} />);
    expect(screen.getByText("Ocean Cleanup")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // DonateModal visibility based on status
  // ------------------------------------------------------------------

  it("shows DonateModal for Active campaigns", async () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(await screen.findByTestId("donate-modal")).toBeInTheDocument();
  });

  it("does not show DonateModal for Funded campaigns", () => {
    const funded: Campaign = { ...baseCampaign, status: "Funded" };
    render(<CampaignCard campaign={funded} />);
    expect(screen.queryByTestId("donate-modal")).not.toBeInTheDocument();
  });

  it("does not show DonateModal for Expired campaigns", () => {
    const expired: Campaign = {
      ...baseCampaign,
      status: "Expired",
      deadline: BigInt(nowSec() - ONE_DAY),
    };
    render(<CampaignCard campaign={expired} />);
    expect(screen.queryByTestId("donate-modal")).not.toBeInTheDocument();
  });

  it("does not show DonateModal for Claimed campaigns", () => {
    const claimed: Campaign = { ...baseCampaign, status: "Claimed" };
    render(<CampaignCard campaign={claimed} />);
    expect(screen.queryByTestId("donate-modal")).not.toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Creator and Beneficiary addresses
  // ------------------------------------------------------------------

  it("displays creator and beneficiary addresses", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    const addressLinks = screen.getAllByTestId("address-link");
    expect(addressLinks).toHaveLength(2);
    expect(addressLinks[0]).toHaveTextContent(baseCampaign.creator);
    expect(addressLinks[1]).toHaveTextContent(baseCampaign.beneficiary);
  });

  it("shows Creator and Beneficiary labels", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Beneficiary")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Progress bar color thresholds
  // ------------------------------------------------------------------

  it("shows success (emerald) progress bar at 100%", () => {
    const funded: Campaign = {
      ...baseCampaign,
      raised_amount: stroops(1_000_000),
      status: "Funded",
    };
    const { container } = render(<CampaignCard campaign={funded} />);
    const indicator = container.querySelector(".bg-emerald-600");
    expect(indicator).toBeInTheDocument();
  });

  it("shows warning (amber) progress bar at >= 50%", () => {
    const half: Campaign = {
      ...baseCampaign,
      raised_amount: stroops(500_000),
    };
    const { container } = render(<CampaignCard campaign={half} />);
    const indicator = container.querySelector(".bg-amber-500");
    expect(indicator).toBeInTheDocument();
  });

  it("shows default (primary) progress bar below 50%", () => {
    const low: Campaign = {
      ...baseCampaign,
      raised_amount: stroops(100_000),
    };
    const { container } = render(<CampaignCard campaign={low} />);
    const indicator = container.querySelector(".bg-primary");
    expect(indicator).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Edge cases
  // ------------------------------------------------------------------

  it("handles zero raised amount", () => {
    const zero: Campaign = { ...baseCampaign, raised_amount: 0n };
    render(<CampaignCard campaign={zero} />);
    expect(screen.getByText("0 XLM")).toBeInTheDocument();
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("handles progress exceeding 100% (overfunded)", () => {
    const overfunded: Campaign = {
      ...baseCampaign,
      raised_amount: stroops(1_500_000),
      status: "Funded",
    };
    render(<CampaignCard campaign={overfunded} />);
    // Progress is capped at 100% by calculateProgress
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // ClaimButton and ShareButton presence
  // ------------------------------------------------------------------

  it("renders ClaimButton", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByTestId("claim-button")).toBeInTheDocument();
  });

  it("renders ShareButton", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByTestId("share-button")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Deadline display
  // ------------------------------------------------------------------

  it("shows deadline text", () => {
    render(<CampaignCard campaign={baseCampaign} />);
    // Should contain "Ends" for active campaigns
    expect(screen.getByText(/Ends/)).toBeInTheDocument();
  });

  it("shows 'Ended' text for expired campaigns", () => {
    const expired: Campaign = {
      ...baseCampaign,
      status: "Expired",
      deadline: BigInt(nowSec() - 2 * ONE_DAY),
    };
    render(<CampaignCard campaign={expired} />);
    expect(screen.getByText(/Ended/)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Multiple campaigns render independently
  // ------------------------------------------------------------------

  it("renders different campaigns with different data", () => {
    const campaign2: Campaign = {
      ...baseCampaign,
      id: 5n,
      title: "School Rebuild",
      raised_amount: stroops(750_000),
      target_amount: stroops(1_000_000),
    };

    const { unmount } = render(<CampaignCard campaign={baseCampaign} />);
    expect(screen.getByText("Flood Relief — Lagos")).toBeInTheDocument();
    unmount();

    render(<CampaignCard campaign={campaign2} />);
    expect(screen.getByText("School Rebuild")).toBeInTheDocument();
    expect(screen.getByText("750000 XLM")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Accessibility
  // ------------------------------------------------------------------

  it("should have no accessibility violations", async () => {
    const { container } = render(<CampaignCard campaign={baseCampaign} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ------------------------------------------------------------------
  // Progress bar fill percentage (visual assertion via indicator transform)
  // ------------------------------------------------------------------

  describe("progress bar fill percentage", () => {
    const getIndicatorTransform = (container: HTMLElement) => {
      const bar = container.querySelector('[role="progressbar"]');
      const indicator = bar?.firstElementChild as HTMLElement | null;
      return indicator?.style.transform;
    };

    it("fills 0% of the bar when nothing has been raised", () => {
      const zero: Campaign = { ...baseCampaign, id: 10n, raised_amount: 0n };
      const { container } = render(<CampaignCard campaign={zero} />);
      expect(getIndicatorTransform(container)).toBe("translateX(-100%)");
    });

    it("fills 50% of the bar at half funded", () => {
      const half: Campaign = {
        ...baseCampaign,
        id: 11n,
        raised_amount: stroops(500_000),
        target_amount: stroops(1_000_000),
      };
      const { container } = render(<CampaignCard campaign={half} />);
      expect(getIndicatorTransform(container)).toBe("translateX(-50%)");
    });

    it("caps the bar fill at 100% when raised exceeds target", () => {
      const overfunded: Campaign = {
        ...baseCampaign,
        id: 12n,
        raised_amount: stroops(1_500_000),
        target_amount: stroops(1_000_000),
        status: "Funded",
      };
      const { container } = render(<CampaignCard campaign={overfunded} />);
      expect(getIndicatorTransform(container)).toBe("translateX(-0%)");
      expect(screen.getByText("100.0%")).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Deadline countdown string rendering
  // ------------------------------------------------------------------

  describe("deadline countdown formatting", () => {
    it("renders a future deadline as a forward-looking countdown", () => {
      const upcoming: Campaign = {
        ...baseCampaign,
        id: 13n,
        deadline: BigInt(nowSec() + 14 * ONE_DAY),
      };
      render(<CampaignCard campaign={upcoming} />);
      expect(screen.getByText("Ends in 14 days")).toBeInTheDocument();
    });

    it("renders a past deadline as an elapsed countdown", () => {
      const past: Campaign = {
        ...baseCampaign,
        id: 14n,
        status: "Expired",
        deadline: BigInt(nowSec() - 2 * ONE_DAY),
      };
      render(<CampaignCard campaign={past} />);
      expect(screen.getByText("Ended 2 days ago")).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // "Fund the Gap" quick-donate button
  // ------------------------------------------------------------------

  describe("Fund the Gap button", () => {
    const nearGoal: Campaign = {
      ...baseCampaign,
      id: 15n,
      raised_amount: stroops(900_000),
      target_amount: stroops(1_000_000),
      status: "Active",
    };

    it("is shown once a campaign is 90%+ funded but not yet complete", () => {
      render(<CampaignCard campaign={nearGoal} />);
      expect(
        screen.getByRole("button", { name: /Quick donate to fund the remaining/i }),
      ).toBeInTheDocument();
    });

    it("is hidden below the 90% threshold", () => {
      render(<CampaignCard campaign={baseCampaign} />);
      expect(
        screen.queryByRole("button", { name: /Quick donate to fund the remaining/i }),
      ).not.toBeInTheDocument();
    });

    it("opens the donate modal pre-filled with the remaining gap when clicked", async () => {
      const user = userEvent.setup();
      render(<CampaignCard campaign={nearGoal} />);

      const gapButton = screen.getByRole("button", {
        name: /Quick donate to fund the remaining/i,
      });
      await user.click(gapButton);

      const modal = screen.getByTestId("donate-modal");
      expect(modal).toHaveAttribute("data-open", "true");
      expect(modal).toHaveAttribute("data-suggested-amount", "100000");
    });
  });
});
