import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/render";
import { axe, toHaveNoViolations } from "jest-axe";
import { CreateCampaignForm } from "./CreateCampaignForm";

expect.extend(toHaveNoViolations);

// Mutable so individual tests can drive the mutation into a pending state
// without re-mocking the module.
const createCampaignState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));

const resolvedNameState = vi.hoisted(() => ({
  data: null as string | null,
  isFetching: false,
}));

vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
vi.mock("@/hooks/useSoroban", async () => {
  const { createSorobanMock } = await import("@/test/mockSoroban");
  return createSorobanMock({
    useCreateCampaign: () => createCampaignState,
    useResolvedName: () => resolvedNameState,
  });
});

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

// A real, checksum-valid Ed25519 Stellar public key (StrKey.isValidEd25519PublicKey === true).
const VALID_BENEFICIARY = "GCJIQPIC4TD33PSVHU42IOJS4FVPBBAQHWWOWHUDDMQDVZ2HVTD3OXKS";
// Same shape/length as VALID_BENEFICIARY but with the last character flipped, so it fails
// checksum validation despite matching a naive `^G[A-Z0-9]{55}$` regex.
const BAD_CHECKSUM_BENEFICIARY = "GCJIQPIC4TD33PSVHU42IOJS4FVPBBAQHWWOWHUDDMQDVZ2HVTD3OXKA";

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

/** Walks the wizard from Details through Funding to the Review step, where submit lives. */
async function goToReviewStep() {
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  await screen.findByText(/Step 2 of 3/i);
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  await screen.findByText(/Step 3 of 3/i);
}

/** Clicking Continue on an invalid step must leave the wizard where it is. */
async function expectStuckOnStep(n: number) {
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  await waitFor(() =>
    expect(screen.getByText(new RegExp(`Step ${n} of 3`, "i"))).toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: /Launch Campaign/i })).not.toBeInTheDocument();
}

describe("CreateCampaignForm", () => {
  beforeEach(() => {
    sessionStorage.clear();
    createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
    createCampaignState.isPending = false;
    resolvedNameState.data = null;
    resolvedNameState.isFetching = false;
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

      expect(await screen.findByText(/Title must be at least 5 characters/i)).toBeInTheDocument();
      await expectStuckOnStep(1);
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

    it("rejects a well-formed address with an invalid checksum", async () => {
      renderForm();
      await openForm();

      const beneficiary = screen.getByPlaceholderText("G...");
      fireEvent.change(beneficiary, { target: { value: BAD_CHECKSUM_BENEFICIARY } });
      fireEvent.blur(beneficiary);

      expect(await screen.findByText(/Invalid Stellar address/i)).toBeInTheDocument();
    });

    it("blocks progression past the funding step when the beneficiary is invalid", async () => {
      renderForm();
      await openForm();

      // Step 1: fill in the minimum required fields and advance.
      fireEvent.change(screen.getByPlaceholderText(/Flood Relief 2024/i), {
        target: { value: "Flood Relief 2024" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Provide a detailed description/i), {
        target: { value: "A description that is long enough." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 2: valid target amount, but an invalid-checksum beneficiary.
      await screen.findByText(/Step 2 of 3/i);
      fireEvent.change(screen.getByPlaceholderText("G..."), {
        target: { value: BAD_CHECKSUM_BENEFICIARY },
      });
      fireEvent.change(screen.getByPlaceholderText("1000"), { target: { value: "500" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Still stuck on step 2 — the review/submit step is never reached.
      expect(await screen.findByText(/Invalid Stellar address/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Launch Campaign/i })).not.toBeInTheDocument();
    });

    it("shows a resolved name for a valid beneficiary address once resolution completes", async () => {
      resolvedNameState.data = "relief.stellar.org";
      renderForm();
      await openForm();

      const beneficiary = screen.getByPlaceholderText("G...");
      fireEvent.change(beneficiary, { target: { value: VALID_BENEFICIARY } });

      expect(
        await screen.findByText("Resolved: relief.stellar.org", {}, { timeout: 1000 }),
      ).toBeInTheDocument();
    });

    it("shows no resolved-name hint for a valid address that has no directory match", async () => {
      resolvedNameState.data = null;
      renderForm();
      await openForm();

      const beneficiary = screen.getByPlaceholderText("G...");
      fireEvent.change(beneficiary, { target: { value: VALID_BENEFICIARY } });
      fireEvent.blur(beneficiary);

      await waitFor(() => expect(screen.queryByText(/^Resolved:/)).not.toBeInTheDocument(), {
        timeout: 1000,
      });
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
    });

    it("updates character counter in real time, applies warning style near cap, and disables submit when over 500 characters", async () => {
      renderForm();
      await openForm();

      const description = screen.getByPlaceholderText(/Provide a detailed description/i);

      // Real-time counter update
      fireEvent.change(description, { target: { value: "Short description" } });
      expect(screen.getByText("17 / 500 characters")).toBeInTheDocument();

      // Warning style near cap (remaining < 20, e.g. 485 characters)
      const warningText = "A".repeat(485);
      fireEvent.change(description, { target: { value: warningText } });
      const counterEl = screen.getByText("485 / 500 characters");
      expect(counterEl).toBeInTheDocument();
      expect(counterEl.className).toContain("text-amber-600");

      // Over limit (e.g. 505 characters)
      const overLimitText = "A".repeat(505);
      fireEvent.change(description, { target: { value: overLimitText } });
      const overLimitCounter = screen.getByText("505 / 500 characters");
      expect(overLimitCounter).toBeInTheDocument();
      expect(overLimitCounter.className).toContain("text-destructive");
      await expectStuckOnStep(1);
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

  describe("multiple beneficiaries", () => {
    const SECOND_BENEFICIARY = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

    async function addSecondBeneficiary(primaryShare: string, secondShare: string) {
      fireEvent.click(screen.getByRole("button", { name: /Add beneficiary/i }));
      fireEvent.change(await screen.findByLabelText(/Beneficiary 1 Share/i), {
        target: { value: primaryShare },
      });
      fireEvent.change(screen.getByPlaceholderText("G... (beneficiary 2)"), {
        target: { value: SECOND_BENEFICIARY },
      });
      fireEvent.change(screen.getByLabelText(/^Share \(%\)$/i), {
        target: { value: secondShare },
      });
    }

    it("blocks the funding step with a clear message when shares don't total 100%", async () => {
      renderForm();
      await openForm();
      fillValidForm();
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      await screen.findByText(/Step 2 of 3/i);

      await addSecondBeneficiary("60", "30");

      expect(
        await screen.findByText(/Beneficiary shares must add up to exactly 100%\. Currently 90%/i),
      ).toBeInTheDocument();
      await expectStuckOnStep(2);
    });

    it("rejects listing the same address twice", async () => {
      renderForm();
      await openForm();
      fillValidForm();
      fireEvent.click(screen.getByRole("button", { name: /Add beneficiary/i }));
      const second = screen.getByPlaceholderText("G... (beneficiary 2)");
      fireEvent.change(second, { target: { value: VALID_BENEFICIARY } });
      fireEvent.blur(second);

      expect(await screen.findByText(/This beneficiary is already listed/i)).toBeInTheDocument();
    });

    it("submits the split as basis-point shares", async () => {
      createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
      renderForm();
      await openForm();
      fillValidForm();
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      await screen.findByText(/Step 2 of 3/i);
      await addSecondBeneficiary("62.5", "37.5");
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      await screen.findByText(/Step 3 of 3/i);

      expect(screen.getByText("62.5%")).toBeInTheDocument();
      expect(screen.getByText("37.5%")).toBeInTheDocument();

      const submitBtn = screen.getByRole("button", { name: /Launch Campaign/i });
      await waitFor(() => expect(submitBtn).toBeEnabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createCampaignState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            beneficiary: VALID_BENEFICIARY,
            beneficiaries: [
              { address: VALID_BENEFICIARY, share: 6250 },
              { address: SECOND_BENEFICIARY, share: 3750 },
            ],
          }),
        );
      });
    });

    it("gives a lone beneficiary the full 100% share", async () => {
      createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
      renderForm();
      await openForm();
      fillValidForm();
      await goToReviewStep();
      const submitBtn = screen.getByRole("button", { name: /Launch Campaign/i });
      await waitFor(() => expect(submitBtn).toBeEnabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createCampaignState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            beneficiaries: [{ address: VALID_BENEFICIARY, share: 10000 }],
          }),
        );
      });
    });
  });

  describe("maximum per donor", () => {
    it("passes the cap through and shows it on the review step", async () => {
      createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
      renderForm();
      await openForm();
      fillValidForm();
      fireEvent.change(screen.getByLabelText(/Maximum per donor/i), { target: { value: "25" } });
      await goToReviewStep();

      expect(screen.getByText(/^25 /)).toBeInTheDocument();
      const submitBtn = screen.getByRole("button", { name: /Launch Campaign/i });
      await waitFor(() => expect(submitBtn).toBeEnabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createCampaignState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ maxPerDonor: "25" }),
        );
      });
    });

    it("sends no cap when the field is left empty", async () => {
      createCampaignState.mutateAsync = vi.fn().mockResolvedValue({ campaignId: "1" });
      renderForm();
      await openForm();
      fillValidForm();
      await goToReviewStep();

      expect(screen.getByText("No cap")).toBeInTheDocument();
      const submitBtn = screen.getByRole("button", { name: /Launch Campaign/i });
      await waitFor(() => expect(submitBtn).toBeEnabled());
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createCampaignState.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ maxPerDonor: null }),
        );
      });
    });

    it("rejects a non-positive cap", async () => {
      renderForm();
      await openForm();
      const cap = screen.getByLabelText(/Maximum per donor/i);
      fireEvent.change(cap, { target: { value: "0" } });
      fireEvent.blur(cap);

      expect(
        await screen.findByText(/Maximum per donor must be a positive amount/i),
      ).toBeInTheDocument();
    });
  });

  describe("submission", () => {
    it("calls the contract create_campaign method with the form values on valid submission", async () => {
      renderForm();
      await openForm();
      fillValidForm();
      await goToReviewStep();

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
      fillValidForm();
      await goToReviewStep();

      expect(await screen.findByRole("button", { name: /Creating\.\.\./i })).toBeDisabled();
    });

    it("does not reach the submit step until the required fields are valid", async () => {
      renderForm();
      await openForm();

      await expectStuckOnStep(1);
    });
  });
});
