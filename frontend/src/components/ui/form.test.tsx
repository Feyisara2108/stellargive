import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";

// Minimal schema that exercises string validation and a numeric coercion step,
// mirroring the patterns used in CreateCampaignForm and DonateModal.
const testSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  amount: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
});

type TestValues = z.infer<typeof testSchema>;

interface TestFormProps {
  onSubmit?: (values: TestValues) => void;
  defaultValues?: Partial<TestValues>;
}

function TestForm({ onSubmit = vi.fn(), defaultValues }: TestFormProps) {
  const form = useForm<TestValues>({
    resolver: zodResolver(testSchema),
    defaultValues: { username: "", amount: "", ...defaultValues },
    mode: "onSubmit",
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormDescription>At least 3 characters.</FormDescription>
              <FormControl>
                <input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function fillAndSubmit(values: { username?: string; amount?: string } = {}) {
  const user = userEvent.setup();
  if (values.username !== undefined) {
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), values.username);
  }
  if (values.amount !== undefined) {
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), values.amount);
  }
  await user.click(screen.getByRole("button", { name: /submit/i }));
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("Form (react-hook-form + zod)", () => {
  // ── open/invalid scenarios ─────────────────────────────────────────────

  it("shows required errors when submitting empty fields", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit();

    expect(await screen.findByText("Username must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Must be a positive number")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error when username is too short", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "ab", amount: "10" });

    expect(
      await screen.findByText("Username must be at least 3 characters"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error when amount is non-numeric", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "alice", amount: "abc" });

    expect(await screen.findByText("Must be a positive number")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error when amount is zero", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "alice", amount: "0" });

    expect(await screen.findByText("Must be a positive number")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error when amount is negative", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "alice", amount: "-5" });

    expect(await screen.findByText("Must be a positive number")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── valid submit ───────────────────────────────────────────────────────

  it("calls onSubmit with parsed values when input is valid", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "alice", amount: "42" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      { username: "alice", amount: "42" },
      expect.anything(), // submit event
    );
  });

  it("does not surface errors for a valid submission", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await fillAndSubmit({ username: "alice", amount: "1" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText("Username must be at least 3 characters")).not.toBeInTheDocument();
    expect(screen.queryByText("Must be a positive number")).not.toBeInTheDocument();
  });

  // ── a11y: error association ────────────────────────────────────────────

  it("marks invalid inputs with aria-invalid after failed submit", async () => {
    render(<TestForm />);

    await fillAndSubmit({ username: "ab", amount: "bad" });

    await screen.findByText("Username must be at least 3 characters");

    const usernameInput = screen.getByLabelText("Username");
    const amountInput = screen.getByLabelText("Amount");
    expect(usernameInput).toHaveAttribute("aria-invalid", "true");
    expect(amountInput).toHaveAttribute("aria-invalid", "true");
  });

  it("associates error messages with inputs via aria-describedby", async () => {
    render(<TestForm />);

    await fillAndSubmit({ username: "ab", amount: "bad" });

    const usernameError = await screen.findByText("Username must be at least 3 characters");
    const amountError = screen.getByText("Must be a positive number");

    const usernameInput = screen.getByLabelText("Username");
    const amountInput = screen.getByLabelText("Amount");

    // aria-describedby must include the error message element's id
    expect(usernameInput.getAttribute("aria-describedby")).toContain(usernameError.id);
    expect(amountInput.getAttribute("aria-describedby")).toContain(amountError.id);
  });

  it("labels point to their inputs via htmlFor", async () => {
    render(<TestForm />);

    const usernameLabel = screen.getByText("Username");
    const amountLabel = screen.getByText("Amount");

    const usernameInput = screen.getByLabelText("Username");
    const amountInput = screen.getByLabelText("Amount");

    expect(usernameLabel.getAttribute("for")).toBe(usernameInput.id);
    expect(amountLabel.getAttribute("for")).toBe(amountInput.id);
  });

  it("clears errors after the field is corrected and resubmitted", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TestForm onSubmit={onSubmit} />);

    // First submit — invalid
    await fillAndSubmit({ username: "ab", amount: "10" });
    await screen.findByText("Username must be at least 3 characters");

    // Correct the field and resubmit
    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "alice");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() =>
      expect(
        screen.queryByText("Username must be at least 3 characters"),
      ).not.toBeInTheDocument(),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("description text is in aria-describedby when there is no error", () => {
    render(<TestForm />);

    const usernameInput = screen.getByLabelText("Username");
    const description = screen.getByText("At least 3 characters.");

    expect(usernameInput.getAttribute("aria-describedby")).toContain(description.id);
    expect(usernameInput).not.toHaveAttribute("aria-invalid", "true");
  });
});
