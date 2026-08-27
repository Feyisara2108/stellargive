import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { UIModule56 } from "./UIModule56";

expect.extend(toHaveNoViolations);

describe("UIModule56 Component", () => {
  it("renders loading state correctly", () => {
    render(<UIModule56 isLoading={true} />);
    expect(screen.getByTestId("uimodule56-loading")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders error state and triggers retry callback", () => {
    const handleRetry = vi.fn();
    render(<UIModule56 error="Streaming setup failed" onRetry={handleRetry} />);

    expect(screen.getByTestId("uimodule56-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when streaming is disabled", () => {
    render(<UIModule56 isStreamingEnabled={false} />);
    expect(screen.getByTestId("uimodule56-empty")).toBeInTheDocument();
    expect(screen.getByText(/recurring giving disabled/i)).toBeInTheDocument();
  });

  it("renders streaming configurator and submits stream options", () => {
    const handleStartStream = vi.fn();
    render(<UIModule56 onStartStream={handleStartStream} />);

    expect(screen.getByTestId("uimodule56-content")).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/amount per period/i);
    fireEvent.change(amountInput, { target: { value: "15" } });

    const weeklyButton = screen.getByRole("button", { name: "weekly" });
    fireEvent.click(weeklyButton);

    const submitBtn = screen.getByRole("button", { name: /start stream/i });
    fireEvent.click(submitBtn);

    expect(handleStartStream).toHaveBeenCalledWith({
      rateAmount: 15,
      frequency: "weekly",
    });
  });

  it("passes accessibility (axe) audit with zero violations", async () => {
    const { container } = render(<UIModule56 />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
