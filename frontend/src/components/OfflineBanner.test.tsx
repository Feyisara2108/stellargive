import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { OfflineBanner } from "./OfflineBanner";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

describe("OfflineBanner", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    onlineManager.setOnline(true);
  });

  it("does not display when online", () => {
    const { Wrapper } = createWrapper();
    render(<OfflineBanner />, { wrapper: Wrapper });
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("displays banner when offline event triggers", () => {
    const { Wrapper } = createWrapper();
    render(<OfflineBanner />, { wrapper: Wrapper });

    act(() => {
      vi.stubGlobal("navigator", { onLine: false });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByText(/You are currently offline/i)).toBeInTheDocument();
  });

  it("hides banner when online event triggers after offline", () => {
    const { Wrapper } = createWrapper();
    render(<OfflineBanner />, { wrapper: Wrapper });

    act(() => {
      vi.stubGlobal("navigator", { onLine: false });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

    act(() => {
      vi.stubGlobal("navigator", { onLine: true });
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("handles manual retry button click", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");

    render(<OfflineBanner />, { wrapper: Wrapper });

    act(() => {
      vi.stubGlobal("navigator", { onLine: false });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

    // User comes back online and clicks Retry
    vi.stubGlobal("navigator", { onLine: true });
    const retryButton = screen.getByRole("button", { name: /retry/i });

    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(refetchSpy).toHaveBeenCalled();
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });
});
