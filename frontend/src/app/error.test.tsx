import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/render";
import RouteError from "./error";

// captureRouteError is a side-effect; stub it out so no network call is made.
vi.mock("@/lib/sentry", () => ({
  captureRouteError: vi.fn(),
}));

// usePathname is already stubbed to "/" in the global setup, but we re-declare
// here so the import is explicit and readable.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/some/route",
  useSearchParams: () => new URLSearchParams(),
}));

function makeError(message = "Oops", digest?: string): Error & { digest?: string } {
  const err = new Error(message) as Error & { digest?: string };
  err.digest = digest;
  return err;
}

describe("RouteError (app/error.tsx)", () => {
  const resetMock = vi.fn();

  beforeEach(() => {
    resetMock.mockReset();
  });

  it("renders the error heading", () => {
    render(<RouteError error={makeError()} reset={resetMock} />);
    expect(screen.getByRole("heading", { name: /something went wrong on this page/i })).toBeInTheDocument();
  });

  it("renders the supporting copy", () => {
    render(<RouteError error={makeError()} reset={resetMock} />);
    expect(screen.getByText(/the error has been reported/i)).toBeInTheDocument();
  });

  it("renders a 'Try again' button that calls reset()", () => {
    render(<RouteError error={makeError()} reset={resetMock} />);
    const btn = screen.getByRole("button", { name: /try again/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("renders a 'Go home' navigation link pointing to '/'", () => {
    render(<RouteError error={makeError()} reset={resetMock} />);
    const link = screen.getByRole("link", { name: /go home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("has role='alert' on the root container", () => {
    render(<RouteError error={makeError()} reset={resetMock} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows dev-only error details in non-production", () => {
    // NODE_ENV is 'test', which is !== 'production', so the <details> block renders.
    const err = makeError("Something exploded", "digest-abc");
    render(<RouteError error={err} reset={resetMock} />);
    // The summary label is visible.
    expect(screen.getByText(/error details/i)).toBeInTheDocument();
    // The error message appears inside the <pre>.
    expect(screen.getByText(/Something exploded/)).toBeInTheDocument();
  });
});
