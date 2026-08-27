import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { UIModule60 } from "./UIModule60";
import { WalletContext } from "@/lib/WalletProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (
  ui: React.ReactElement,
  walletValue: any,
  queryClient = createTestQueryClient(),
) => {
  return render(
    <WalletContext.Provider value={walletValue}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </WalletContext.Provider>,
  );
};

describe("UIModule60", () => {
  it("renders correctly when not connected", async () => {
    const { container } = renderWithProviders(<UIModule60 />, {
      isConnected: false,
      address: null,
    });
    expect(screen.getByText("Module 60")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hello from query 60")).toBeInTheDocument());

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders correctly when connected", async () => {
    renderWithProviders(<UIModule60 />, { isConnected: true, address: "G123456789" });
    expect(screen.getByText("Connected as G123456789")).toBeInTheDocument();
  });

  it("handles input focus, change, and blur interactions", async () => {
    renderWithProviders(<UIModule60 />, { isConnected: true, address: "G123456789" });
    const input = screen.getByTestId("mod60-input");

    fireEvent.focus(input);
    expect(screen.getByText("Input is focused")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "test value" } });
    expect(input).toHaveProperty("value", "test value");

    fireEvent.blur(input);
    expect(screen.queryByText("Input is focused")).not.toBeInTheDocument();
  });

  it("handles button click interaction", async () => {
    renderWithProviders(<UIModule60 />, { isConnected: true, address: "G123456789" });
    const button = screen.getByTestId("mod60-button");

    fireEvent.click(button);
    expect(screen.getByText("Button was clicked")).toBeInTheDocument();
  });

  it("renders loading state with status role and screen reader label", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: () => new Promise(() => {}),
        },
      },
    });

    renderWithProviders(<UIModule60 />, { isConnected: false, address: null }, client);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders error state and handles retry action", async () => {
    let callCount = 0;
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Failed to load");
      }
      return { message: "Hello from query 60" };
    };

    renderWithProviders(
      <UIModule60 fetchData={mockFetch} />,
      { isConnected: false, address: null },
      client,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Something went wrong loading this module.")).toBeInTheDocument();

    const retryButton = screen.getByTestId("mod60-retry");
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("Hello from query 60")).toBeInTheDocument();
    });
  });
});
