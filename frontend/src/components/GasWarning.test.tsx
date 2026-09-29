import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GasWarning, splitFee } from "./GasWarning";

// vi.mock is hoisted, so use the literal value inside the factory
vi.mock("@/lib/soroban", () => ({
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
  fromStroops: (v: any) => (Number(v) / 1e7).toString(),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ address: null, network: "testnet" }),
}));

const walletBalance = vi.hoisted(() => ({ value: null as bigint | null }));

vi.mock("@/hooks/useSoroban", () => ({
  useWalletBalance: () => ({ data: walletBalance.value }),
}));

const MAX_SIMULATION_FEE_STROOPS = 10_000_000;

const ABOVE_THRESHOLD = MAX_SIMULATION_FEE_STROOPS * 2; // 20_000_000

describe("GasWarning", () => {
  // --- Renders warning content ---

  it("renders the alert role when feeStroops exceeds the threshold", () => {
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the 'High transaction cost detected' heading", () => {
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} />);
    expect(screen.getByText(/High transaction cost detected/i)).toBeInTheDocument();
  });

  it("shows the correct 2.0× ratio for 2× the threshold", () => {
    render(<GasWarning feeStroops={MAX_SIMULATION_FEE_STROOPS * 2} />);
    // ratio = (20_000_000 / 10_000_000).toFixed(1) = "2.0"
    expect(screen.getByText(/2\.0×/)).toBeInTheDocument();
  });

  it("shows the correct 1.5× ratio for 1.5× the threshold", () => {
    render(<GasWarning feeStroops={MAX_SIMULATION_FEE_STROOPS * 1.5} />);
    // ratio = (15_000_000 / 10_000_000).toFixed(1) = "1.5"
    expect(screen.getByText(/1\.5×/)).toBeInTheDocument();
  });

  it("shows the correct 10.0× ratio for 10× the threshold", () => {
    render(<GasWarning feeStroops={MAX_SIMULATION_FEE_STROOPS * 10} />);
    expect(screen.getByText(/10\.0×/)).toBeInTheDocument();
  });

  it("includes cautionary review text", () => {
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} />);
    expect(screen.getByText(/review the transaction details carefully/i)).toBeInTheDocument();
  });

  // --- Dismiss button ---

  it("renders a dismiss button when onDismiss is provided", () => {
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: /dismiss gas warning/i })).toBeInTheDocument();
  });

  it("calls onDismiss once when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss gas warning/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render a dismiss button when onDismiss is omitted", () => {
    render(<GasWarning feeStroops={ABOVE_THRESHOLD} />);
    expect(screen.queryByRole("button", { name: /dismiss gas warning/i })).not.toBeInTheDocument();
  });

  // --- Graceful behavior when fee data is unavailable (0) ---

  it("renders without crashing when feeStroops is 0", () => {
    const { container } = render(<GasWarning feeStroops={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders without crashing for a very small (below-threshold) fee", () => {
    const { container } = render(<GasWarning feeStroops={100} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GasWarning — fee breakdown popover", () => {
  beforeEach(() => {
    walletBalance.value = 10_000_000_000n;
  });
  afterEach(() => {
    walletBalance.value = null;
  });

  it("splits fees so base + resource equals the total", () => {
    expect(splitFee(1_234_567)).toEqual({ base: 100, resource: 1_234_467 });
    expect(splitFee(40)).toEqual({ base: 40, resource: 0 });
  });

  it("lists base and resource fees to 7 decimals and closes with Escape", () => {
    render(<GasWarning estimatedFeeStroops={1_234_567} />);
    const trigger = screen.getByRole("button", { name: "Fee breakdown" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Fee breakdown" });
    expect(dialog).toHaveTextContent("Base fee0.0000100 XLM");
    expect(dialog).toHaveTextContent("Resource fee (est.)0.1234467 XLM");
    expect(dialog).toHaveTextContent("Total0.1234567 XLM");
    expect(screen.getByRole("link", { name: /resource fees/i })).toHaveAttribute(
      "href",
      expect.stringContaining("developers.stellar.org"),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
