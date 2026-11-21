import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ShareButton } from "./ShareButton";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { toast } from "sonner";
import { logger } from "@/lib/logger";

const CAMPAIGN = { id: 5n, title: "Clean Water Project" };
const EXPECTED_URL = `${window.location.origin}/campaign/5`;

/** Opens the share dialog. jsdom has no navigator.share by default, so the
 * main button always falls back to opening our own dialog - this mirrors
 * exactly what happens for any user whose browser lacks the Web Share API.
 *
 * Deliberately uses fireEvent rather than @testing-library/user-event here:
 * userEvent.setup() unconditionally installs its own clipboard stub on
 * navigator.clipboard (to simulate real copy/paste), which silently
 * overwrites our mock below the moment it's called - fireEvent has no such
 * side effect. */
async function openShareDialog() {
  fireEvent.click(screen.getByRole("button", { name: /share campaign/i }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  // navigator.clipboard doesn't exist in jsdom by default.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error - cleaning up our own test-only stub
  delete navigator.clipboard;
});

describe("ShareButton — accessible labels", () => {
  it("the main trigger button has an accessible 'Share campaign' label", () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    expect(screen.getByRole("button", { name: /share campaign/i })).toBeInTheDocument();
  });

  it("the copy button has an accessible 'Copy campaign link' label once the dialog is open", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();
    expect(screen.getByRole("button", { name: /copy campaign link/i })).toBeInTheDocument();
  });

  it("the X/Twitter button has an accessible 'Share on X' label once the dialog is open", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();
    expect(screen.getByRole("button", { name: /share on x/i })).toBeInTheDocument();
  });
});

describe("ShareButton — copy to clipboard", () => {
  it("writes the campaign's share URL to the clipboard", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(EXPECTED_URL);
  });

  it("writes a URL built from the given campaign's id, not a hardcoded one", async () => {
    render(<ShareButton campaign={{ id: 999n, title: "Another Campaign" }} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/campaign/999`,
      );
    });
  });

  it("shows 'Copied!' feedback and a success toast after a successful copy", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Link copied!");
  });

  it("shows an error toast and does not show 'Copied!' if the clipboard write fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Unable to copy link");
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});

describe("ShareButton — social intents", () => {
  it("opens a correctly-encoded Twitter/X intent URL", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /share on x/i }));

    const expectedText = `Check out "Clean Water Project" on StellarGive`;
    const expectedUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(
      expectedText,
    )}&url=${encodeURIComponent(EXPECTED_URL)}`;

    expect(window.open).toHaveBeenCalledWith(expectedUrl, "_blank", "noopener,noreferrer");
  });

  it("percent-encodes special characters in the campaign title (quotes, spaces, ampersands)", async () => {
    const tricky = { id: 7n, title: `Save the Reef & "Friends"` };
    render(<ShareButton campaign={tricky} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /share on x/i }));

    const [openedUrl] = vi.mocked(window.open).mock.calls[0];
    // The intent URL has the shape `...?text=<text>&url=<url>`; isolate the
    // encoded `text` param (everything between `?text=` and the `&url=`).
    const encodedText = (openedUrl as string).split("?text=")[1].split("&url=")[0];

    // The encoded text param must not contain unencoded spaces, quotes, or
    // ampersands - those would either break the URL or get misinterpreted as
    // extra query params.
    expect(encodedText).not.toMatch(/[ "&]/);
    // And decoding it back should give us exactly the text we expect.
    const decoded = decodeURIComponent(encodedText);
    expect(decoded).toBe(`Check out "Save the Reef & "Friends"" on StellarGive`);
  });

  it("includes the campaign's share URL inside the tweet text", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /share on x/i }));

    const [openedUrl] = vi.mocked(window.open).mock.calls[0];
    const encodedText = (openedUrl as string).split("?text=")[1];
    expect(decodeURIComponent(encodedText)).toContain(EXPECTED_URL);
  });

  it("opens the intent in a new tab without a window opener", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /share on x/i }));

    const [, target, features] = vi.mocked(window.open).mock.calls[0];
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
  });
});

describe("ShareButton — other networks", () => {
  const text = `Check out "Clean Water Project" on StellarGive`;

  it("opens the Telegram share URL", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();
    fireEvent.click(screen.getByRole("button", { name: /share on telegram/i }));
    expect(window.open).toHaveBeenCalledWith(
      `https://t.me/share/url?url=${encodeURIComponent(EXPECTED_URL)}&text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens the WhatsApp share URL with the link in the text", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();
    fireEvent.click(screen.getByRole("button", { name: /share on whatsapp/i }));
    expect(window.open).toHaveBeenCalledWith(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}: ${EXPECTED_URL}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("ShareButton — native share", () => {
  afterEach(() => {
    // @ts-expect-error - cleaning up our own test-only stub
    delete navigator.share;
  });

  function stubShare(impl: () => Promise<void>) {
    const share = vi.fn(impl);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    return share;
  }

  it("uses navigator.share when available and thanks the user", async () => {
    const share = stubShare(() => Promise.resolve());
    render(<ShareButton campaign={CAMPAIGN} />);
    fireEvent.click(screen.getByRole("button", { name: /share campaign/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Thanks for sharing!"));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: CAMPAIGN.title, url: EXPECTED_URL }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores an AbortError from the share sheet", async () => {
    vi.mocked(toast.error).mockClear();
    const share = stubShare(() => Promise.reject(new DOMException("cancelled", "AbortError")));
    render(<ShareButton campaign={CAMPAIGN} />);
    fireEvent.click(screen.getByRole("button", { name: /share campaign/i }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("falls back to the dialog when navigator.share fails for another reason", async () => {
    stubShare(() => Promise.reject(new Error("not allowed")));
    render(<ShareButton campaign={CAMPAIGN} />);
    fireEvent.click(screen.getByRole("button", { name: /share campaign/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("ShareButton — copy feedback timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets the copied state after 2 seconds", async () => {
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));
    await act(async () => {});
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Copy Link")).toBeInTheDocument();
  });

  it("logs a failed copy through the logger", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    render(<ShareButton campaign={CAMPAIGN} />);
    await openShareDialog();

    fireEvent.click(screen.getByRole("button", { name: /copy campaign link/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unable to copy link"));
    expect(logger.error).toHaveBeenCalledWith("Failed to copy link:", expect.any(Error));
  });
});
