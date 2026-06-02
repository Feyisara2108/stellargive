import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { DonateModal } from "./DonateModal";
import type { Campaign } from "@/lib/soroban";

expect.extend(toHaveNoViolations);

// Mock useDonate hook
vi.mock("@/hooks/useSoroban", () => ({
  useDonate: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
}));

const baseCampaign: Campaign = {
  id: 1n,
  creator: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
  beneficiary: "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  title: "Flood Relief — Lagos",
  category: "relief",
  target_amount: 1000000000n, // 100 XLM
  raised_amount: 350000000n,  // 35 XLM
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
};

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
});
