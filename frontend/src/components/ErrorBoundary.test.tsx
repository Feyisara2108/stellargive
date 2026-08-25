import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// Helper component that throws an error when trigger is set
function ProblemChild({ shouldThrow, message = "Test render crash" }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Child content rendered successfully</div>;
}

// Stateful wrapper to test retry / reset functionality
function ErrorBoundaryWrapper({ heading, fallback }: { heading?: string; fallback?: React.ReactNode }) {
  const [shouldThrow, setShouldThrow] = useState(true);

  return (
    <div>
      <button onClick={() => setShouldThrow(false)}>Fix Error</button>
      <ErrorBoundary heading={heading} fallback={fallback}>
        <ProblemChild shouldThrow={shouldThrow} message="Boom!" />
      </ErrorBoundary>
    </div>
  );
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Suppress React error boundary logs in test output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Child content rendered successfully")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("catches errors, calls componentDidCatch, and renders default fallback UI", () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} message="Crash in child" />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred in this section/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse campaigns/i })).toHaveAttribute(
      "href",
      "/explore"
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("renders custom heading when provided", () => {
    render(
      <ErrorBoundary heading="Campaign Details">
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Campaign Details couldn't load")).toBeInTheDocument();
  });

  it("renders custom fallback node when provided", () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error View</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(screen.getByText("Custom Error View")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("displays error details in development mode", () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} message="Detailed dev error message" />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error details (dev only)")).toBeInTheDocument();
    expect(screen.getByText(/Detailed dev error message/)).toBeInTheDocument();
  });

  it("resets error state when 'Try again' button is clicked", () => {
    render(<ErrorBoundaryWrapper />);

    // Initially crashed
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Fix the underlying condition
    fireEvent.click(screen.getByText("Fix Error"));

    // Click 'Try again' to trigger reset()
    const tryAgainButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainButton);

    // Should now render child content
    expect(screen.getByText("Child content rendered successfully")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
