import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "./Providers";
import { MockWalletProvider, useMockWallet } from "./MockWalletProvider";
import { useWallet } from "@/lib/WalletProvider";
import React from "react";

// Mock matchMedia for NextThemes
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// A component that requires wallet authentication
function GatedComponent() {
  const { isConnected, address } = useWallet();
  return isConnected ? (
    <div data-testid="gated-content">Welcome {address}</div>
  ) : (
    <div data-testid="login-prompt">Please connect</div>
  );
}

// A component to control the MockWalletProvider
function MockControlComponent() {
  const { setMockAddress, disconnect, connect } = useMockWallet();
  return (
    <div>
      <button onClick={() => setMockAddress("G-MOCKED")} data-testid="change-addr">
        Change
      </button>
      <button onClick={disconnect} data-testid="disconnect-mock">
        Disconnect
      </button>
      <button onClick={connect} data-testid="connect-mock">
        Connect
      </button>
    </div>
  );
}

describe("Providers", () => {
  it("renders children wrapped in context providers without crashing", () => {
    render(
      <Providers>
        <div data-testid="child">Hello Providers</div>
      </Providers>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

describe("MockWalletProvider", () => {
  it("simulates connected state by default for E2E tests", () => {
    render(
      <MockWalletProvider>
        <GatedComponent />
      </MockWalletProvider>,
    );
    // MockWalletProvider auto-connects
    expect(screen.getByTestId("gated-content")).toBeInTheDocument();
  });

  it("allows overriding the mock address", async () => {
    const user = userEvent.setup();
    render(
      <MockWalletProvider>
        <GatedComponent />
        <MockControlComponent />
      </MockWalletProvider>,
    );

    await user.click(screen.getByTestId("change-addr"));
    await waitFor(() => {
      expect(screen.getByTestId("gated-content")).toHaveTextContent("Welcome G-MOCKED");
    });
  });

  it("handles disconnect logic and re-connect seamlessly", async () => {
    const user = userEvent.setup();
    render(
      <MockWalletProvider>
        <GatedComponent />
        <MockControlComponent />
      </MockWalletProvider>,
    );

    // Disconnect
    await user.click(screen.getByTestId("disconnect-mock"));
    await waitFor(() => {
      expect(screen.queryByTestId("gated-content")).not.toBeInTheDocument();
      expect(screen.getByTestId("login-prompt")).toBeInTheDocument();
    });

    // Re-connect
    await user.click(screen.getByTestId("connect-mock"));
    await waitFor(() => {
      expect(screen.getByTestId("gated-content")).toBeInTheDocument();
    });
  });

  it("throws error if useMockWallet is used outside MockWalletProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const TestComponent = () => {
      useMockWallet();
      return null;
    };
    expect(() => render(<TestComponent />)).toThrow(
      "useMockWallet must be used within a MockWalletProvider",
    );
    consoleSpy.mockRestore();
  });
});
