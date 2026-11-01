import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "./global-error";

// Sentry is imported as a side-effect by global-error; stub it so no network
// calls escape under test.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function makeError(message = "Root layout crashed"): Error & { digest?: string } {
  return new Error(message) as Error & { digest?: string };
}

describe("GlobalError (app/global-error.tsx)", () => {
  const resetMock = vi.fn();

  beforeEach(() => {
    resetMock.mockReset();
  });

  it("renders the error heading", () => {
    render(<GlobalError error={makeError()} reset={resetMock} />);
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
  });

  it("renders the supporting copy about the team being notified", () => {
    render(<GlobalError error={makeError()} reset={resetMock} />);
    expect(screen.getByText(/we have been notified/i)).toBeInTheDocument();
  });

  it("renders a 'Try again' button that calls reset()", () => {
    render(<GlobalError error={makeError()} reset={resetMock} />);
    const btn = screen.getByRole("button", { name: /try again/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("renders its own <html> and <body> tags (standalone shell)", () => {
    const { container } = render(<GlobalError error={makeError()} reset={resetMock} />);
    // global-error owns the full document shell — verify key shell elements.
    expect(container.querySelector("html")).toBeInTheDocument();
    expect(container.querySelector("body")).toBeInTheDocument();
  });
});
