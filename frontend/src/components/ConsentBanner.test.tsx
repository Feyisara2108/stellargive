import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsentBanner, getAnalyticsConsent } from "./ConsentBanner";

const CONSENT_KEY = "stellargive_analytics_consent";

describe("ConsentBanner", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Mock window.location reload
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders consent banner when consent is not yet set in localStorage", () => {
    render(<ConsentBanner />);

    expect(screen.getByText("Cookie & Analytics Consent")).toBeInTheDocument();
    expect(
      screen.getByText(/We use cookies and analytics to improve your experience/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("does not render when consent is already set in localStorage", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    render(<ConsentBanner />);

    expect(screen.queryByText("Cookie & Analytics Consent")).not.toBeInTheDocument();
  });

  it("handles Accept button click by updating localStorage and reloading window", () => {
    render(<ConsentBanner />);

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(acceptButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("accepted");
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Cookie & Analytics Consent")).not.toBeInTheDocument();
  });

  it("handles Decline button click by updating localStorage and hiding banner without reloading", () => {
    render(<ConsentBanner />);

    const declineButton = screen.getByRole("button", { name: "Decline" });
    fireEvent.click(declineButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("declined");
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(screen.queryByText("Cookie & Analytics Consent")).not.toBeInTheDocument();
  });

  it("handles Close icon button click by treating it as decline", () => {
    render(<ConsentBanner />);

    const closeButton = screen.getByRole("button", { name: "Close consent banner" });
    fireEvent.click(closeButton);

    expect(localStorage.getItem(CONSENT_KEY)).toBe("declined");
    expect(screen.queryByText("Cookie & Analytics Consent")).not.toBeInTheDocument();
  });

  describe("getAnalyticsConsent", () => {
    it("returns null when no consent stored", () => {
      expect(getAnalyticsConsent()).toBeNull();
    });

    it("returns 'accepted' when stored as accepted", () => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      expect(getAnalyticsConsent()).toBe("accepted");
    });

    it("returns 'declined' when stored as declined", () => {
      localStorage.setItem(CONSENT_KEY, "declined");
      expect(getAnalyticsConsent()).toBe("declined");
    });

    it("returns null when stored with an arbitrary invalid value", () => {
      localStorage.setItem(CONSENT_KEY, "other_value");
      expect(getAnalyticsConsent()).toBeNull();
    });

    it("returns null when window is undefined (SSR environment)", () => {
      const windowSpy = vi.spyOn(global, "window", "get");
      windowSpy.mockImplementation(() => undefined as any);
      expect(getAnalyticsConsent()).toBeNull();
      windowSpy.mockRestore();
    });
  });
});
