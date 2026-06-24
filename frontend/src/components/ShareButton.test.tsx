import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { ShareButton } from "./ShareButton";

expect.extend(toHaveNoViolations);

// Mock sonner's toast — irrelevant side-effect for these tests
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockCampaign = {
  id: 42n,
  title: "Save the Local Library",
};

describe("ShareButton", () => {
  beforeEach(() => {
    // jsdom doesn't implement clipboard — stub it
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    // Force the dialog fallback path (no native share sheet)
    // @ts-expect-error - intentional deletion for test isolation
    delete navigator.share;
  });

  it("should have no accessibility violations in trigger state", async () => {
    const { container } = render(<ShareButton campaign={mockCampaign} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations in open state", async () => {
    render(<ShareButton campaign={mockCampaign} />);

    const trigger = screen.getByRole("button", { name: /Share campaign/i });
    fireEvent.click(trigger);

    // Radix Dialog renders in a Portal — query via role, not container
    const dialog = await screen.findByRole("dialog");
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });

  it("copies the correct campaign URL to clipboard", async () => {
    render(<ShareButton campaign={mockCampaign} />);

    fireEvent.click(screen.getByRole("button", { name: /Share campaign/i }));
    const copyButton = await screen.findByRole("button", { name: /Copy campaign link/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/campaign/42`
      );
    });
  });

  it("shows 'Copied!' text after a successful copy", async () => {
    render(<ShareButton campaign={mockCampaign} />);

    fireEvent.click(screen.getByRole("button", { name: /Share campaign/i }));
    const copyButton = await screen.findByRole("button", { name: /Copy campaign link/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("builds a correctly-encoded Twitter intent URL", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<ShareButton campaign={mockCampaign} />);
    fireEvent.click(screen.getByRole("button", { name: /Share campaign/i }));
    const twitterButton = await screen.findByRole("button", { name: /Share on X/i });
    fireEvent.click(twitterButton);

    const expectedUrl = `${window.location.origin}/campaign/42`;
    const expectedText = `Check out "${mockCampaign.title}" on StellarGive: ${expectedUrl}`;
    const expectedTwitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(expectedText)}`;

    expect(openSpy).toHaveBeenCalledWith(expectedTwitterUrl, "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });
});