import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ConsentBanner, getAnalyticsConsent } from "./ConsentBanner";

describe("ComponentModule38 — ConsentBanner Unit Tests", () => {
  const CONSENT_KEY = "stellargive_analytics_consent";

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders consent banner when no consent is stored in localStorage", () => {
    render(<ConsentBanner />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cookie & Analytics Consent")).toBeInTheDocument();
    expect(
      screen.getByText(/We use cookies and analytics to improve your experience/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close consent banner" })).toBeInTheDocument();
  });

  it("does not render banner when consent is already set in localStorage", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const { container } = render(<ConsentBanner />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("handles Accept click: sets localStorage, closes banner, and reloads window", () => {
    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });

    render(<ConsentBanner />);

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(acceptButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("accepted");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("handles Decline click: sets localStorage to declined and closes banner without reload", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });

    render(<ConsentBanner />);

    const declineButton = screen.getByRole("button", { name: "Decline" });
    fireEvent.click(declineButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("declined");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("handles Close icon button click: sets localStorage to declined and closes banner", () => {
    render(<ConsentBanner />);

    const closeButton = screen.getByRole("button", { name: "Close consent banner" });
    fireEvent.click(closeButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("declined");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ComponentModule38 — getAnalyticsConsent Utility Tests", () => {
  const CONSENT_KEY = "stellargive_analytics_consent";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns null when no consent has been given", () => {
    expect(getAnalyticsConsent()).toBeNull();
  });

  it("returns 'accepted' when localStorage has 'accepted'", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    expect(getAnalyticsConsent()).toBe("accepted");
  });

  it("returns 'declined' when localStorage has 'declined'", () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    expect(getAnalyticsConsent()).toBe("declined");
  });

  it("returns null for arbitrary unmapped localStorage values", () => {
    localStorage.setItem(CONSENT_KEY, "other_value");
    expect(getAnalyticsConsent()).toBeNull();
  });
});
