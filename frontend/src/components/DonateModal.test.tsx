import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { DonateModal } from "./DonateModal";
import type { Campaign } from "@/lib/soroban";

expect.extend(toHaveNoViolations);

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn().mockReturnValue({ address: "GABC...", isConnected: true }),
}));

// Mutable so individual tests can drive the mutation into a rejected or
// pending state without re-mocking the module.
const donateState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  isSuccess: false,
}));

const walletBalanceState = vi.hoisted(() => ({
  data: null as number | bigint | null,
  isLoading: false,
}));

const crossedMilestonesState = vi.hoisted(() => ({
  value: [] as number[],
}));

const tokenMetaState = vi.hoisted(() => ({
  data: { decimals: 7, symbol: "XLM" },
}));

// Minimum account reserve (stroops) for native XLM; null = not loaded.
const accountReserveState = vi.hoisted(() => ({ data: null as bigint | null }));

// What the connected donor has already given to the campaign (base units).
const donorContributionState = vi.hoisted(() => ({ data: null as bigint | null }));

const feeEstimateState = vi.hoisted(() => ({ data: null as number | null }));

// Async factory: vi.mock is hoisted above static imports, so the helper must
// be imported inside the factory rather than referenced from the top level.
vi.mock("@/hooks/useSoroban", async () => {
  const { createSorobanMock } = await import("@/test/mockSoroban");
  return createSorobanMock({
    useDonate: () => donateState,
    useDonateFeeEstimate: () => feeEstimateState,
    useWalletBalance: () => walletBalanceState,
    useAccountReserve: () => accountReserveState,
    useDonorContribution: () => donorContributionState,
    getCrossedMilestones: () => crossedMilestonesState.value,
    useTokenMetadata: () => tokenMetaState,
  });
});

// tokens.ts derives USDC contract IDs at import time, which throws under jsdom.
// The modal only needs the native SAC id, which the campaign factory uses.
vi.mock("@/lib/tokens", async () => {
  const { NATIVE_TOKEN_ADDRESS } = await import("@/test/factories");
  return { NATIVE_XLM_CONTRACT_ID: NATIVE_TOKEN_ADDRESS };
});

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));

import { makeCampaign } from "@/test/factories";

const baseCampaign = makeCampaign({
  title: "Flood Relief — Lagos",
});

describe("DonateModal", () => {
  beforeEach(() => {
    donateState.mutateAsync = vi.fn().mockResolvedValue({ hash: "abc123" });
    donateState.isPending = false;
    donateState.isSuccess = false;
    walletBalanceState.data = null;
    walletBalanceState.isLoading = false;
    crossedMilestonesState.value = [];
    tokenMetaState.data = { decimals: 7, symbol: "XLM" };
    accountReserveState.data = null;
    donorContributionState.data = null;
    feeEstimateState.data = null;
    toastSuccess.mockClear();
    // Successful donations persist the last amount, which pre-fills later renders.
    localStorage.removeItem("stellargive_last_donated_amount");
  });

  it("should have no accessibility violations in trigger state", async () => {
    const { container } = render(<DonateModal campaign={baseCampaign} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations in open state", async () => {
    const { container } = render(<DonateModal campaign={baseCampaign} />);

    // Open the dialog
    const trigger = screen.getByRole("button", { name: /Donate Now/i });
    fireEvent.click(trigger);

    // Radix Dialog renders in a Portal by default, so axe(container) might not see it.
    // We can use screen.getByRole("dialog") to get the dialog element.
    const dialog = await screen.findByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations with error messages", async () => {
    render(<DonateModal campaign={baseCampaign} />);

    // Open the dialog
    const trigger = screen.getByRole("button", { name: /Donate Now/i });
    fireEvent.click(trigger);

    const input = await screen.findByLabelText(/Amount/i);
    // Trigger validation error
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    const errorMessage = await screen.findByText(/Enter a valid number/i);
    expect(errorMessage).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby", "amount-error");
    expect(errorMessage).toHaveAttribute("id", "amount-error");

    const dialog = screen.getByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });

  it("disables submit when amount is below minimum donation", async () => {
    render(<DonateModal campaign={baseCampaign} />);
    fireEvent.click(screen.getByRole("button", { name: /Donate Now/i }));

    const input = await screen.findByLabelText(/Amount/i);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    await waitFor(() => {
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      expect(confirmBtn).toBeDisabled();
    });
  });

  it("shows an error when amount exceeds remaining goal", async () => {
    render(<DonateModal campaign={baseCampaign} />);
    fireEvent.click(screen.getByRole("button", { name: /Donate Now/i }));

    const input = await screen.findByLabelText(/Amount/i);
    // remaining = 100 - 35 = 65 XLM; enter 200
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText(/exceeds the remaining goal/i)).toBeInTheDocument();
    });
  });

  describe("campaign status", () => {
    it.each(["Funded", "Expired", "Claimed", "Cancelled"] as const)(
      "renders no donate trigger for %s campaigns",
      (status) => {
        render(<DonateModal campaign={{ ...baseCampaign, status }} />);
        expect(screen.queryByRole("button", { name: /Donate Now/i })).not.toBeInTheDocument();
      },
    );
  });

  describe("dedication message", () => {
    it("shows a live counter and enforces the 140 character limit", async () => {
      render(<DonateModal campaign={baseCampaign} />);
      fireEvent.click(screen.getByRole("button", { name: /Donate Now/i }));

      const input = await screen.findByLabelText(/Dedication message/i);
      expect(input).toHaveAttribute("maxlength", "140");
      expect(screen.getByText("0/140")).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "y".repeat(200) } });
      expect((input as HTMLInputElement).value).toHaveLength(140);
      expect(screen.getByText("140/140")).toBeInTheDocument();
    });

    it("sends the sanitized message with the donation", async () => {
      render(<DonateModal campaign={baseCampaign} />);
      fireEvent.click(screen.getByRole("button", { name: /Donate Now/i }));

      fireEvent.change(await screen.findByLabelText(/^Amount/i), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText(/Dedication message/i), {
        target: { value: "<b>For Ada</b><script>alert(1)</script>" },
      });
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(donateState.mutateAsync).toHaveBeenCalledTimes(1));
      expect(donateState.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ message: "For Ada" }),
      );
    });

    it("omits the message when the field is left empty", async () => {
      render(<DonateModal campaign={baseCampaign} />);
      fireEvent.click(screen.getByRole("button", { name: /Donate Now/i }));

      fireEvent.change(await screen.findByLabelText(/^Amount/i), { target: { value: "10" } });
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(donateState.mutateAsync).toHaveBeenCalledTimes(1));
      expect(donateState.mutateAsync.mock.calls[0][0].message).toBeUndefined();
    });
  });

  describe("mutation error state", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("surfaces the mapped error and never opens the success dialog when the donation rejects", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      donateState.mutateAsync = vi.fn().mockRejectedValue(new Error("Network Error"));

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(donateState.mutateAsync).toHaveBeenCalled());

      // Rendered inline and again in the assertive live region.
      await waitFor(() => {
        expect(
          screen.getAllByText(/Network error — please check your connection and try again\./i)
            .length,
        ).toBeGreaterThan(0);
      });

      expect(screen.queryByText(/Donation Successful!/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /View on StellarExpert/i }),
      ).not.toBeInTheDocument();
    });

    it("blocks submit for a non-numeric amount", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
      });
      expect(screen.getByText(/Enter a valid number/i)).toBeInTheDocument();
      expect(donateState.mutateAsync).not.toHaveBeenCalled();
    });

    it("blocks submit for an amount below the minimum donation", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "0" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
      });
      expect(screen.getByText(/Minimum donation is/i)).toBeInTheDocument();
      expect(donateState.mutateAsync).not.toHaveBeenCalled();
    });

    it("disables the confirm button while the mutation is pending", async () => {
      donateState.isPending = true;

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const confirmBtn = await screen.findByRole("button", { name: /Donating\.\.\./i });
      expect(confirmBtn).toBeDisabled();
      expect(await screen.findByLabelText(/Amount/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled();
    });

    it("rejects an amount with too many decimal places for the token", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "1.12345678" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/Maximum 7 decimal places/i)).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
    });
  });

  describe("preset amount and manual sync", () => {
    it("shows preset chips (10 XLM, 50 XLM, 100 XLM, Fund Remaining) and populates input on click", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const chip10 = await screen.findByRole("button", { name: "10 XLM" });
      const chip50 = screen.getByRole("button", { name: "50 XLM" });
      const chip100 = screen.getByRole("button", { name: "100 XLM" });
      const fundRemainingChip = screen.getByRole("button", { name: /Fund Remaining/i });

      expect(chip10).toBeInTheDocument();
      expect(chip50).toBeInTheDocument();
      expect(chip100).toBeInTheDocument();
      expect(fundRemainingChip).toBeInTheDocument();

      const input = screen.getByLabelText(/Amount/i);

      // Click preset 10 XLM chip
      fireEvent.click(chip10);
      await waitFor(() => {
        expect(input).toHaveValue("10");
      });

      // Click preset Fund Remaining chip (remaining = 100 - 35 = 65)
      fireEvent.click(fundRemainingChip);
      await waitFor(() => {
        expect(input).toHaveValue("65");
      });
    });

    it("highlights active chip when input matches preset amount", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "50" } });

      await waitFor(() => {
        const chip50 = screen.getByRole("button", { name: "50 XLM" });
        expect(chip50.className).toContain("bg-primary");
      });
    });

    it("remembers user's last donated amount in localStorage and pre-fills on return visits", async () => {
      localStorage.setItem("stellargive_last_donated_amount", "50");

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      await waitFor(() => {
        expect(input).toHaveValue("50");
      });

      localStorage.removeItem("stellargive_last_donated_amount");
    });
  });

  describe("successful submission", () => {
    it("shows the success dialog with the tx hash and closes the donate dialog", async () => {
      const onOpenChange = vi.fn();
      donateState.mutateAsync = vi.fn().mockResolvedValue({ hash: "deadbeef" });

      render(<DonateModal campaign={baseCampaign} open onOpenChange={onOpenChange} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(donateState.mutateAsync).toHaveBeenCalled());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      expect(await screen.findByText(/Donation Successful!/i)).toBeInTheDocument();
      expect(screen.getByText("deadbeef")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /View on StellarExpert/i })).toHaveAttribute(
        "href",
        expect.stringContaining("deadbeef"),
      );
    });

    it("dismisses the success dialog when Close is clicked", async () => {
      donateState.mutateAsync = vi.fn().mockResolvedValue({ hash: "abc123" });

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      const successDialog = await screen.findByText(/Donation Successful!/i);
      expect(successDialog).toBeInTheDocument();

      const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
      fireEvent.click(closeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText(/Donation Successful!/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("other interactions", () => {
    it("toggles the anonymous checkbox and passes it through to the mutation", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const checkbox = screen.getByLabelText(/Donate anonymously/i);
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(donateState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ isAnonymous: true }),
        );
      });
    });

    it("closes the modal via the Cancel button", async () => {
      const onOpenChange = vi.fn();
      render(<DonateModal campaign={baseCampaign} open onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("flags an amount that exceeds the wallet balance", async () => {
      // 5 XLM available (raw units, 7 decimals)
      walletBalanceState.data = 5_0000000;

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      expect(await screen.findByText(/Balance: 5 XLM/i)).toBeInTheDocument();

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(/Insufficient balance — you have 5 XLM/i)).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
    });

    it("shows a loading skeleton while the wallet balance is resolving", async () => {
      walletBalanceState.isLoading = true;

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      expect(await screen.findByLabelText(/Loading balance/i)).toBeInTheDocument();
    });

    it("fires a milestone celebration toast when the donation crosses a threshold", async () => {
      crossedMilestonesState.value = [50];

      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });
      const confirmBtn = screen.getByRole("button", { name: /Confirm Donation/i });
      await waitFor(() => expect(confirmBtn).toBeEnabled());
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(toastSuccess).toHaveBeenCalledWith(
          expect.stringContaining("Halfway there!"),
          expect.objectContaining({ description: expect.any(String) }),
        );
      });
    });

    it("pre-fills the amount from suggestedAmount when the modal opens", async () => {
      const { rerender } = render(
        <DonateModal
          campaign={baseCampaign}
          open={false}
          onOpenChange={() => {}}
          suggestedAmount="25"
        />,
      );

      rerender(
        <DonateModal campaign={baseCampaign} open onOpenChange={() => {}} suggestedAmount="25" />,
      );

      const input = await screen.findByLabelText(/Amount/i);
      await waitFor(() => expect(input).toHaveValue("25"));
    });
  });

  describe("keyboard navigation", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("traps focus within the open dialog", async () => {
      const user = userEvent.setup();
      render(<DonateModal campaign={baseCampaign} />);

      const trigger = screen.getByRole("button", { name: /Donate Now/i });
      await user.click(trigger);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toContainElement(document.activeElement as HTMLElement | null);

      // Cycle through all focusable elements — focus should never leave the dialog
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      for (let i = 0; i < focusable.length * 2; i++) {
        await user.tab();
        expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
      }
    });

    it("closes the dialog and returns focus to the trigger on Escape", async () => {
      const user = userEvent.setup();
      render(<DonateModal campaign={baseCampaign} />);

      const trigger = screen.getByRole("button", { name: /Donate Now/i });
      trigger.focus();
      await user.click(trigger);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(trigger);
    });

    it("traps Shift+Tab cycling backwards within the dialog", async () => {
      const user = userEvent.setup();
      render(<DonateModal campaign={baseCampaign} />);

      const trigger = screen.getByRole("button", { name: /Donate Now/i });
      await user.click(trigger);

      const dialog = await screen.findByRole("dialog");

      // Shift+Tab through all focusable elements — focus should never leave the dialog
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      for (let i = 0; i < focusable.length * 2; i++) {
        await user.tab({ shift: true });
        expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
      }
    });
  });

  describe("contract minimum (MIN_DONATION)", () => {
    const enterAmount = async (value: string) => {
      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      return input;
    };

    it("rejects one stroop below the 0.1 XLM contract minimum", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);
      await enterAmount("0.0999999");

      expect(await screen.findByText("Minimum donation is 0.1 XLM")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
    });

    it("accepts exactly the 0.1 XLM contract minimum", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);
      await enterAmount("0.1");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("never suggests funding the rest with less than the minimum", async () => {
      // 0.05 XLM left: the contract would reject 0.05, so suggest 0.1 instead.
      const almostFunded = makeCampaign({
        target_amount: 1_000_000_000n,
        raised_amount: 999_500_000n,
      });
      render(<DonateModal campaign={almostFunded} open onOpenChange={() => {}} />);

      fireEvent.click(await screen.findByRole("button", { name: /Fund the rest/i }));

      const input = screen.getByLabelText(/Amount/i);
      await waitFor(() => expect(input).toHaveValue("0.1"));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
    });
  });

  describe("per-donor cap (max_per_donor)", () => {
    // 20 XLM per donor
    const cappedCampaign = makeCampaign({ max_per_donor: 200_000_000n });

    it("shows the cap in the modal", async () => {
      render(<DonateModal campaign={cappedCampaign} open onOpenChange={() => {}} />);
      expect(await screen.findByText(/Limit: 20 XLM per donor/i)).toBeInTheDocument();
    });

    it("rejects an amount above the cap", async () => {
      render(<DonateModal campaign={cappedCampaign} open onOpenChange={() => {}} />);
      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "25" } });

      expect(
        await screen.findByText("This campaign allows at most 20 XLM per donor"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
    });

    it("subtracts what the donor has already given", async () => {
      donorContributionState.data = 150_000_000n; // 15 XLM already given
      render(<DonateModal campaign={cappedCampaign} open onOpenChange={() => {}} />);

      expect(await screen.findByText(/you've given 15 XLM/i)).toBeInTheDocument();

      const input = screen.getByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });
      expect(await screen.findByText(/you can give up to 5 XLM more/i)).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "5" } });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
    });

    it("tells the donor when they have reached the cap", async () => {
      donorContributionState.data = 200_000_000n;
      render(<DonateModal campaign={cappedCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "1" } });

      expect(
        await screen.findByText(/You've reached this campaign's limit of 20 XLM per donor/i),
      ).toBeInTheDocument();
    });
  });

  describe("native XLM reserve and fees", () => {
    beforeEach(() => {
      walletBalanceState.data = 100_000_000n; // 10 XLM
      accountReserveState.data = 10_000_000n; // 1 XLM minimum reserve
      feeEstimateState.data = null; // falls back to the 0.1 XLM default fee holdback
    });

    it("explains the reserve in the balance hint", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);
      expect(
        await screen.findByText(
          /You can donate up to 8.9 XLM — 1.1 XLM stays in your wallet for the minimum account reserve and network fees/i,
        ),
      ).toBeInTheDocument();
    });

    it("rejects donating the full balance", async () => {
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);
      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });

      expect(
        await screen.findByText(
          "Insufficient balance — 8.9 XLM is available after keeping 1.1 XLM for the account reserve and network fees",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeDisabled();
    });

    it("Max fills the spendable balance, which passes validation", async () => {
      feeEstimateState.data = 400_000; // 0.04 XLM resource fee + 0.01 inclusion buffer
      render(<DonateModal campaign={baseCampaign} open onOpenChange={() => {}} />);

      fireEvent.click(await screen.findByRole("button", { name: "Max" }));

      const input = screen.getByLabelText(/Amount/i);
      await waitFor(() => expect(input).toHaveValue("8.95"));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
    });

    it("does not hold back a reserve for non-native tokens", async () => {
      const usdcCampaign = makeCampaign({
        accepted_token: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      });
      render(<DonateModal campaign={usdcCampaign} open onOpenChange={() => {}} />);

      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "10" } });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
      expect(screen.queryByText(/stays in your wallet/i)).not.toBeInTheDocument();
    });
  });

  describe("exact integer amounts (18-decimal token)", () => {
    // 1e12 tokens + 1 base unit — not representable as a float.
    const target = 10n ** 30n + 1n;
    const exactRemaining = "1000000000000.000000000000000001";
    const bigCampaign = makeCampaign({
      accepted_token: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      target_amount: target,
      raised_amount: 0n,
    });

    beforeEach(() => {
      tokenMetaState.data = { decimals: 18, symbol: "TKN" };
    });

    it("shows and fills the exact remaining goal", async () => {
      render(<DonateModal campaign={bigCampaign} open onOpenChange={() => {}} />);

      expect(
        await screen.findByText(`${exactRemaining} TKN left to reach the goal`),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Fund Remaining/i }));
      const input = screen.getByLabelText(/Amount/i);
      await waitFor(() => expect(input).toHaveValue(exactRemaining));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm Donation/i })).toBeEnabled();
      });
    });

    it("rejects one base unit over the remaining goal", async () => {
      render(<DonateModal campaign={bigCampaign} open onOpenChange={() => {}} />);
      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: "1000000000000.000000000000000002" } });

      expect(await screen.findByText(/exceeds the remaining goal/i)).toBeInTheDocument();
    });

    it("rejects one base unit over the wallet balance", async () => {
      walletBalanceState.data = target - 1n;
      render(<DonateModal campaign={bigCampaign} open onOpenChange={() => {}} />);
      const input = await screen.findByLabelText(/Amount/i);
      fireEvent.change(input, { target: { value: exactRemaining } });

      expect(
        await screen.findByText("Insufficient balance — you have 1000000000000 TKN"),
      ).toBeInTheDocument();
    });
  });
});
