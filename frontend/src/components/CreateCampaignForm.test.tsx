import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { CreateCampaignForm } from "./CreateCampaignForm";

expect.extend(toHaveNoViolations);

// Mutable so individual tests can drive the mutation into a pending state
// without re-mocking the module.
const createCampaignState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("@/hooks/useSoroban", () => ({
  useCreateCampaign: () => createCampaignState,
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

import { WalletContext } from "@/lib/WalletProvider";

vi.mock("./TokenSelector", () => ({
  TokenSelector: ({ value, onChange }: any) => (
    <div data-testid="token-selector">
      <button onClick={() => onChange("NATIVE")}>Select Token</button>
      <span>Current: {value}</span>
    </div>
  ),
  PREDEFINED_TOKENS: [{ address: "NATIVE", symbol: "XLM" }],
}));

const VALID_BENEFICIARY = "G" + "A".repeat(55);

function renderForm() {
  return render(
    <WalletContext.Provider
      value={
        {
          address: "GBX...",
          isConnected: true,
          connect: vi.fn(),
          disconnect: vi.fn(),
          isWrongNetwork: false,
          walletNetwork: "TESTNET",
        } as any
      }
    >
      <CreateCampaignForm />
    </WalletContext.Provider>,
  );
}

async function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /Start a Campaign/i }));
  await screen.findByRole("dialog");
}

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText(/Flood Relief 2024/i), {
    target: { value: "Flood Relief 2024" },
  });
  fireEvent.change(screen.getByPlaceholderText(/Provide a detailed description/i), {
    target: { value: "A description that is long enough." },
  });
  fireEvent.change(screen.getByPlaceholderText("G..."), {
    target: { value: VALID_BENEFICIARY },
  });
  fireEvent.change(screen.getByPlaceholderText("1000"), { target: { value: "500" } });
}

describe("CreateCampaignForm", () => {
  beforeEach(() => {
    sessionStorage.clear();
    createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
    createCampaignState.isPending = false;
  });

  it("should have no accessibility violations in trigger state", async () => {
    const { container } = renderForm();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations in open state", async () => {
    renderForm();
    await openForm();

    const dialog = screen.getByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });

  describe("field validation", () => {
    it("rejects a title shorter than 5 characters", async () => {
      renderForm();
      await openForm();

      const title = screen.getByPlaceholderText(/Flood Relief 2024/i);
      fireEvent.change(title, { target: { value: "Ab" } });
      fireEvent.blur(title);

      expect(
        await screen.findByText(/Title must be at least 5 characters/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Launch Campaign/i })).toBeDisabled();
    });

    it("rejects a description shorter than 10 characters", async () => {
      renderForm();
      await openForm();

      const description = screen.getByPlaceholderText(/Provide a detailed description/i);
      fireEvent.change(description, { target: { value: "too short" } });
      fireEvent.blur(description);

      expect(
        await screen.findByText(/Description must be at least 10 characters/i),
      ).toBeInTheDocument();
    });

    it("rejects a target amount below the contract minimum", async () => {
      renderForm();
      await openForm();

      const target = screen.getByPlaceholderText("1000");
      fireEvent.change(target, { target: { value: "0" } });
      fireEvent.blur(target);

      expect(
        await screen.findByText(/Target must be at least 1\.0 \(the contract's minimum\)/i),
      ).toBeInTheDocument();
    });

    it("rejects a negative target amount", async () => {
      renderForm();
      await openForm();

      const target = screen.getByPlaceholderText("1000");
      fireEvent.change(target, { target: { value: "-50" } });
      fireEvent.blur(target);

      expect(
        await screen.findByText(/Target must be at least 1\.0 \(the contract's minimum\)/i),
      ).toBeInTheDocument();
    });

    it("rejects an invalid beneficiary address", async () => {
      renderForm();
      await openForm();

      const beneficiary = screen.getByPlaceholderText("G...");
      fireEvent.change(beneficiary, { target: { value: "not-a-stellar-address" } });
      fireEvent.blur(beneficiary);

      expect(await screen.findByText(/Invalid Stellar address/i)).toBeInTheDocument();
    });

    it("rejects a deadline duration of 0 days", async () => {
      renderForm();
      await openForm();

      const deadline = screen.getByLabelText(/Duration \(Days\)/i);
      fireEvent.change(deadline, { target: { value: "0" } });
      fireEvent.blur(deadline);

      expect(
        await screen.findByText(/Deadline must be between 1 and 365 days/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Launch Campaign/i })).toBeDisabled();
    });

    it("rejects a deadline duration beyond the 365-day maximum", async () => {
      renderForm();
      await openForm();

      const deadline = screen.getByLabelText(/Duration \(Days\)/i);
      fireEvent.change(deadline, { target: { value: "400" } });
      fireEvent.blur(deadline);

      expect(
        await screen.findByText(/Deadline must be between 1 and 365 days/i),
      ).toBeInTheDocument();
    });
  });

  describe("submission", () => {
    it("calls the contract create_campaign method with the form values on valid submission", async () => {
      renderForm();
      await openForm();
      fillValidForm();

      const submitBtn = await screen.findByRole("button", { name: /Launch Campaign/i });
      await waitFor(() => expect(submitBtn).toBeEnabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createCampaignState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Flood Relief 2024",
            description: "A description that is long enough.",
            beneficiary: VALID_BENEFICIARY,
            targetAmount: "500",
          }),
        );
      });
    });

    it("shows the loading state on the submit button while the mutation is pending", async () => {
      createCampaignState.isPending = true;

      render(
        <WalletContext.Provider
          value={
            {
              address: "GBX...",
              isConnected: true,
              connect: vi.fn(),
              disconnect: vi.fn(),
              isWrongNetwork: false,
              walletNetwork: "TESTNET",
            } as any
          }
        >
          <CreateCampaignForm inline />
        </WalletContext.Provider>,
      );

      expect(
        await screen.findByRole("button", { name: /Creating Campaign\.\.\./i }),
      ).toBeDisabled();
    });

    it("keeps the submit button disabled until the required fields are valid", async () => {
      renderForm();
      await openForm();

      expect(screen.getByRole("button", { name: /Launch Campaign/i })).toBeDisabled();
    });
  });
});
