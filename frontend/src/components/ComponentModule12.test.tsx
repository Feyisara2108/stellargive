import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ComponentModule12 } from "./ComponentModule12";
import { WalletContext } from "@/lib/WalletProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const renderWithProviders = (ui: React.ReactElement, walletValue: any) => {
  return render(
    <WalletContext.Provider value={walletValue}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </WalletContext.Provider>,
  );
};

describe("ComponentModule12", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("renders correctly when not connected", async () => {
    renderWithProviders(<ComponentModule12 />, { isConnected: false, address: null });
    expect(screen.getByText("Module 12")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hello from query 12")).toBeInTheDocument());
  });

  it("renders loading state while the query is pending", () => {
    renderWithProviders(<ComponentModule12 />, { isConnected: false, address: null });
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders correctly when connected", async () => {
    renderWithProviders(<ComponentModule12 />, { isConnected: true, address: "G123" });
    expect(screen.getByText("Connected as G123")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hello from query 12")).toBeInTheDocument());
  });

  it("handles focus, blur, and input interactions", async () => {
    renderWithProviders(<ComponentModule12 />, { isConnected: true, address: "G123" });
    const input = screen.getByTestId("mod12-input");

    fireEvent.focus(input);
    expect(screen.getByText("Input is focused")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "test value" } });
    expect(input).toHaveProperty("value", "test value");

    fireEvent.blur(input);
    expect(screen.queryByText("Input is focused")).not.toBeInTheDocument();
  });

  it("handles button click interaction", async () => {
    renderWithProviders(<ComponentModule12 />, { isConnected: true, address: "G123" });
    const button = screen.getByTestId("mod12-button");

    fireEvent.click(button);
    expect(screen.getByText("Button was clicked")).toBeInTheDocument();
  });
});
