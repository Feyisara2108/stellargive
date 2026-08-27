import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { UIModule54, VerificationCheck } from "./UIModule54";

expect.extend(toHaveNoViolations);

const sampleChecks: VerificationCheck[] = [
  { id: "c1", label: "Identity Verified", passed: true, timestamp: "2026-01-10" },
  { id: "c2", label: "Non-Profit 501(c)(3) Audit", passed: true, timestamp: "2026-02-15" },
];

describe("UIModule54 Component", () => {
  it("renders loading state correctly", () => {
    render(<UIModule54 isLoading={true} />);
    expect(screen.getByTestId("uimodule54-loading")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders error state and triggers retry callback", () => {
    const handleRetry = vi.fn();
    render(<UIModule54 error="Verification service down" onRetry={handleRetry} />);

    expect(screen.getByTestId("uimodule54-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty unverified fallback state", () => {
    const handleRequest = vi.fn();
    render(<UIModule54 verificationLevel="unverified" checks={[]} onRequestVerification={handleRequest} />);

    expect(screen.getByTestId("uimodule54-empty")).toBeInTheDocument();
    expect(screen.getByText(/unverified beneficiary/i)).toBeInTheDocument();

    const requestBtn = screen.getByRole("button", { name: /request verification/i });
    fireEvent.click(requestBtn);
    expect(handleRequest).toHaveBeenCalledTimes(1);
  });

  it("renders beneficiary verification details and handles copy action", () => {
    render(
      <UIModule54
        beneficiaryName="Global Relief Fund"
        verificationLevel="audited"
        checks={sampleChecks}
        auditHash="0xabc123"
      />
    );

    expect(screen.getByTestId("uimodule54-content")).toBeInTheDocument();
    expect(screen.getByText("Global Relief Fund")).toBeInTheDocument();
    expect(screen.getByText("Identity Verified")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: /copy audit reference hash/i });
    expect(copyButton).toBeInTheDocument();
  });

  it("passes accessibility (axe) audit with zero violations", async () => {
    const { container } = render(
      <UIModule54 beneficiaryName="Global Relief Fund" checks={sampleChecks} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
