import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GasWarning } from "./GasWarning";

// vi.mock is hoisted, so use the literal value inside the factory
vi.mock("@/lib/soroban", () => ({
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
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
    render(<GasWarning feeStroops={0} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // ratio = (0 / 10_000_000).toFixed(1) = "0.0"
    expect(screen.getByText(/0\.0×/)).toBeInTheDocument();
  });

  it("renders without crashing for a very small (below-threshold) fee", () => {
    render(<GasWarning feeStroops={100} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
