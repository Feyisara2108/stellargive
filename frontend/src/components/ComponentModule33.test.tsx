import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ComponentModule33 } from "./ComponentModule33";
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

describe("ComponentModule33", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("renders correctly when not connected", async () => {
    renderWithProviders(<ComponentModule33 />, { isConnected: false, address: null });
    expect(screen.getByText("Module 33")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hello from query 33")).toBeInTheDocument());
  });

  it("renders correctly when connected", async () => {
    renderWithProviders(<ComponentModule33 />, { isConnected: true, address: "G123" });
    expect(screen.getByText("Connected as G123")).toBeInTheDocument();
  });

  it("handles focus and input interactions", async () => {
    renderWithProviders(<ComponentModule33 />, { isConnected: true, address: "G123" });
    const input = screen.getByTestId("mod33-input");

    fireEvent.focus(input);
    expect(screen.getByText("Input is focused")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "test value" } });
    expect(input).toHaveProperty("value", "test value");

    fireEvent.blur(input);
    expect(screen.queryByText("Input is focused")).not.toBeInTheDocument();
  });

  it("handles button click interaction", async () => {
    renderWithProviders(<ComponentModule33 />, { isConnected: true, address: "G123" });
    const button = screen.getByTestId("mod33-button");

    fireEvent.click(button);
    expect(screen.getByText("Button was clicked")).toBeInTheDocument();
  });
});
