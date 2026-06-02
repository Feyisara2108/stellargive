import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { CreateCampaignForm } from "./CreateCampaignForm";

expect.extend(toHaveNoViolations);

// Mock hooks and components
vi.mock("@/hooks/useSoroban", () => ({
  useCreateCampaign: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("./TokenSelector", () => ({
  TokenSelector: ({ value, onChange }: any) => (
    <div data-testid="token-selector">
      <button onClick={() => onChange("NATIVE")}>Select Token</button>
      <span>Current: {value}</span>
    </div>
  ),
  PREDEFINED_TOKENS: [{ address: "NATIVE", symbol: "XLM" }],
}));

describe("CreateCampaignForm", () => {
  it("should have no accessibility violations in trigger state", async () => {
    const { container } = render(<CreateCampaignForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations in open state", async () => {
    render(<CreateCampaignForm />);
    
    // Open the dialog
    const trigger = screen.getByRole("button", { name: /Start a Campaign/i });
    fireEvent.click(trigger);
    
    const dialog = await screen.findByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });
});
