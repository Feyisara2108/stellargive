import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RefundButton } from "./RefundButton";

vi.mock("@/hooks/useSoroban", () => ({
  useRefundEligibility: vi.fn(),
  useClaimRefund: vi.fn(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

import { useRefundEligibility, useClaimRefund } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";

const CAMPAIGN_ID = 1n;

type MockEligibilityReturn = {
  data: boolean | undefined;
  isLoading: boolean;
};

type MockClaimReturn = {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
};

const mockEligibility = (
  overrides: Partial<MockEligibilityReturn> = {},
): MockEligibilityReturn => ({
  data: undefined,
  isLoading: false,
  ...overrides,
});

const mockClaim = (overrides: Partial<MockClaimReturn> = {}): MockClaimReturn => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  isSuccess: false,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(useWallet).mockReturnValue({ address: "GTESTADDRESS" } as any);
  vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility() as any);
  vi.mocked(useClaimRefund).mockReturnValue(mockClaim() as any);
});

describe("RefundButton — visibility", () => {
  it("renders nothing when eligibility is loading", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ isLoading: true }) as any);
    const { container } = render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when eligibility is unknown (query not run)", () => {
    const { container } = render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a disabled button with a reason tooltip when not eligible", async () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: false }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    const button = screen.getByRole("button", { name: /Refund unavailable/i });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Claim refund/i })).not.toBeInTheDocument();

    fireEvent.mouseEnter(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/cancelled or expired unfunded/i);
  });

  it("shows the eligibility explainer inline", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(screen.getByText(/cancelled, or when it expired without reaching/i)).toBeInTheDocument();
  });

  it("renders button when eligible", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(screen.getByRole("button", { name: /Claim refund/i })).toBeInTheDocument();
  });

  it("renders nothing when claim refund already succeeded", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ isSuccess: true }) as any);
    const { container } = render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RefundButton — interaction", () => {
  it("opens a confirmation dialog instead of refunding immediately", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ mutateAsync }) as any);

    render(
      <RefundButton
        campaignId={CAMPAIGN_ID}
        isCancelled
        campaignTitle="Flood Relief"
        refundAmount="12.5 XLM"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Claim refund/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Flood Relief");
    expect(dialog).toHaveTextContent("12.5 XLM");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not refund when the dialog is cancelled", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ mutateAsync }) as any);

    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    fireEvent.click(screen.getByRole("button", { name: /Claim refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls mutateAsync with campaign id exactly once after confirming", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ mutateAsync }) as any);

    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    fireEvent.click(screen.getByRole("button", { name: /Claim refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm refund/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(CAMPAIGN_ID);
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RefundButton — pending state", () => {
  it("disables button while pending", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ isPending: true }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(screen.getByRole("button", { name: /Claiming refund/i })).toBeDisabled();
  });

  it("shows loading text while pending", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ isPending: true }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(screen.getByText("Claiming refund...")).toBeInTheDocument();
  });

  it("shows spinner icon while pending", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ isPending: true }) as any);
    const { container } = render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("button is enabled when not pending", () => {
    vi.mocked(useRefundEligibility).mockReturnValue(mockEligibility({ data: true }) as any);
    vi.mocked(useClaimRefund).mockReturnValue(mockClaim({ isPending: false }) as any);
    render(<RefundButton campaignId={CAMPAIGN_ID} isCancelled />);
    expect(screen.getByRole("button", { name: /Claim refund/i })).not.toBeDisabled();
  });
});
