import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/render";
import CampaignError from "./error";

vi.mock("@/lib/sentry", () => ({
  captureRouteError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/campaign/1",
  useSearchParams: () => new URLSearchParams(),
}));

describe("CampaignError (app/campaign/[id]/error.tsx)", () => {
  const retryMock = vi.fn();

  beforeEach(() => {
    retryMock.mockReset();
  });

  it("explains the campaign failed to load rather than that it doesn't exist", () => {
    render(<CampaignError error={new Error("Simulation failed: timeout")} retry={retryMock} />);
    expect(
      screen.getByRole("heading", { name: /couldn.t load this campaign/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("re-fetches the campaign when the user retries", () => {
    render(<CampaignError error={new Error("fetch failed")} retry={retryMock} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it("links back to the explore page", () => {
    render(<CampaignError error={new Error("x")} retry={retryMock} />);
    expect(screen.getByRole("link", { name: /browse campaigns/i })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
