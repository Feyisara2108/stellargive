import { describe, it, expect, vi, afterEach } from "vitest";
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

vi.mock("@/hooks/useSoroban", () => ({
  useDonate: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
  useDonateFeeEstimate: () => ({ data: null }),
  useWalletBalance: () => ({ data: null, isLoading: false }),
  getCrossedMilestones: () => [],
  useTokenMetadata: vi.fn().mockReturnValue({ data: { decimals: 7, symbol: "XLM" } }),
}));

import { makeCampaign } from "@/test/factories";

const baseCampaign = makeCampaign({
  title: "Flood Relief — Lagos",
});

describe("DonateModal", () => {
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
      expect(dialog).toContainElement(document.activeElement);

      // Cycle through all focusable elements — focus should never leave the dialog
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      for (let i = 0; i < focusable.length * 2; i++) {
        await user.tab();
        expect(dialog).toContainElement(document.activeElement);
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
        expect(dialog).toContainElement(document.activeElement);
      }
    });
  });
});
