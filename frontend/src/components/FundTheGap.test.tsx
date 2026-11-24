import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FundTheGap } from "./FundTheGap";

describe("FundTheGap", () => {
  it("shows the exact remainder with no rounding error and pre-fills the same amount on donate", async () => {
    const onDonate = vi.fn();
    const user = userEvent.setup();
    render(
      <FundTheGap remaining={1_234_567n} decimals={7} symbol="XLM" onDonate={onDonate} />,
    );

    expect(screen.getByText(/Only 0\.1234567 XLM left — fund the gap!/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Quick donate to fund the remaining/i }));
    expect(onDonate).toHaveBeenCalledWith("0.1234567");
  });

  it("formats a whole-number remainder without trailing zeros", () => {
    render(
      <FundTheGap remaining={1_000_000_000_000n} decimals={7} symbol="XLM" onDonate={vi.fn()} />,
    );
    expect(screen.getByText(/Only 100000 XLM left — fund the gap!/i)).toBeInTheDocument();
  });

  it("respects a different token's decimals", () => {
    render(<FundTheGap remaining={123n} decimals={2} symbol="USDC" onDonate={vi.fn()} />);
    expect(screen.getByText(/Only 1\.23 USDC left — fund the gap!/i)).toBeInTheDocument();
  });

  it("disables the donate button when disabled is passed", () => {
    render(
      <FundTheGap remaining={1_000n} decimals={7} symbol="XLM" onDonate={vi.fn()} disabled />,
    );
    expect(
      screen.getByRole("button", { name: /Quick donate to fund the remaining/i }),
    ).toBeDisabled();
  });
});
