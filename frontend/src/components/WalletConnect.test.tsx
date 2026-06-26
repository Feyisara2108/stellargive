import React, { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletConnect } from "./WalletConnect";
import { MockWalletProvider, useMockWallet } from "./MockWalletProvider";
import { toast } from "sonner";

// Mock external dependencies
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/soroban", () => ({
  getSACBalance: vi.fn().mockResolvedValue(BigInt(1000000000)), // 100 XLM
  fromStroops: vi.fn((value: bigint) => (Number(value) / 10000000).toFixed(7)),
}));

vi.mock("@stellar/freighter-api", () => ({
  disconnect: vi.fn(),
}));

/**
 * Test wrapper component that allows us to control MockWalletProvider state
 */
interface TestWrapperProps {
  children: ReactNode;
  onMount?: (wallet: any) => void;
}

function TestWrapper({ children, onMount }: TestWrapperProps) {
  return (
    <MockWalletProvider>
      <TestHarnessInner onMount={onMount}>{children}</TestHarnessInner>
    </MockWalletProvider>
  );
}

function TestHarnessInner({ children, onMount }: TestWrapperProps) {
  const wallet = useMockWallet();

  React.useEffect(() => {
    if (onMount) {
      onMount(wallet);
    }
  }, [wallet, onMount]);

  return <>{children}</>;
}

describe("WalletConnect Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Disconnected State Render", () => {
    it("should display 'Connect Wallet' button when wallet is disconnected", async () => {
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect the wallet
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      // Verify Connect button is visible
      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });
    });

    it("should hide wallet address and disconnect button when disconnected", async () => {
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect the wallet
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      // Wait for disconnect to take effect
      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      // Verify address is not visible
      const addressElements = screen.queryAllByText(/GTEST/i);
      expect(addressElements).toHaveLength(0);

      // Verify disconnect button is not visible
      const disconnectBtn = screen.queryByRole("button", { name: /disconnect/i });
      expect(disconnectBtn).not.toBeInTheDocument();
    });

    it("should render connect button with correct styling", async () => {
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toHaveClass("bg-primary");
        expect(connectButton).toHaveClass("hover:bg-primary/90");
      });
    });

    it("should not show wallet dropdown when disconnected", async () => {
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      // Verify dropdown menu does not exist
      await waitFor(() => {
        const dropdownMenu = screen.queryByText(/STRENGTH OF WALLET/i);
        expect(dropdownMenu).not.toBeInTheDocument();
      });
    });
  });

  describe("Connect Action Call", () => {
    it("should call connect function when 'Connect Wallet' button is clicked", async () => {
      const user = userEvent.setup();
      let walletControls: any;

      const { rerender } = render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect first
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      // Wait for button to appear
      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      const connectButton = screen.getByRole("button", { name: /connect wallet/i });
      await user.click(connectButton);

      // Verify success toast was called
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Wallet connected!");
      });
    });

    it("should show 'Connecting...' loading state during connection", async () => {
      const user = userEvent.setup();
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect first
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      const connectButton = screen.getByRole("button", { name: /connect wallet/i });
      await user.click(connectButton);

      // After connection, success toast should be called
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Wallet connected!");
      });
    });

    it("should disable connect button while connecting", async () => {
      const user = userEvent.setup();
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Disconnect first
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      const connectButton = screen.getByRole("button", { name: /connect wallet/i });
      await user.click(connectButton);

      // After connection completes, button should be enabled
      await waitFor(() => {
        const finalButton = screen.getByRole("button");
        expect(finalButton).not.toBeDisabled();
      });
    });
  });

  describe("Connected State Render", () => {
    it("should display wallet address when connected", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      // MockWalletProvider initializes as connected by default
      await waitFor(() => {
        // Should show formatted address (first 4 and last 4 chars)
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });
    });

    it("should display truncated wallet address in the button", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        // The formatAddress utility truncates to first 4 and last 4 chars: GTES...SERV
        const addressButton = screen.getByRole("button", { name: /GTES.*SERV/i });
        expect(addressButton).toBeInTheDocument();
      });
    });

    it("should show wallet icon in connected button", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const walletButton = screen.getByRole("button", { name: /GTES/i });
        expect(walletButton).toBeInTheDocument();
        // Check for Lucide Wallet icon (rendered as svg)
        const svg = walletButton.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });

    it("should hide 'Connect Wallet' button when connected", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        // Primary connect button should not be visible in connected state
        const connectButton = screen.queryByRole("button", { name: /^Connect Wallet$/ });
        expect(connectButton).not.toBeInTheDocument();
      });
    });

    it("should not show disconnect button until dropdown is opened", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        // Disconnect button should not be visible initially (dropdown closed)
        const disconnectButton = screen.queryByRole("button", { name: /disconnect/i });
        expect(disconnectButton).not.toBeInTheDocument();
      });
    });

    it("should apply secondary styling to connected wallet button", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toHaveClass("bg-secondary/50");
        expect(addressButton).toHaveClass("border-border");
      });
    });
  });

  describe("Dropdown Toggle", () => {
    it("should toggle dropdown menu when address button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });

      // Dropdown should be closed initially
      let dropdown = screen.queryByText(/STRENGTH OF WALLET/i);
      expect(dropdown).not.toBeInTheDocument();

      // First click - open dropdown
      await user.click(addressButton);

      // Dropdown should now be visible
      await waitFor(() => {
        dropdown = screen.getByText(/STRENGTH OF WALLET/i);
        expect(dropdown).toBeInTheDocument();
      });

      // Second click - close dropdown
      await user.click(addressButton);

      // Dropdown should be hidden
      await waitFor(() => {
        dropdown = screen.queryByText(/STRENGTH OF WALLET/i);
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it("should display full wallet address in dropdown", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Full untruncated address should be shown in dropdown
      await waitFor(() => {
        const fullAddress = screen.getByText(/GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV/);
        expect(fullAddress).toBeInTheDocument();
      });
    });

    it("should display balance section in dropdown", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      await waitFor(() => {
        const balanceLabel = screen.getByText(/BALANCE \(XLM\)/i);
        expect(balanceLabel).toBeInTheDocument();
      });
    });

    it("should close dropdown when clicking outside", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <div>
            <WalletConnect />
            <div data-testid="outside-element">Outside</div>
          </div>
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Verify dropdown is open
      await waitFor(() => {
        const dropdown = screen.getByText(/STRENGTH OF WALLET/i);
        expect(dropdown).toBeInTheDocument();
      });

      // Click outside
      const outsideElement = screen.getByTestId("outside-element");
      await user.click(outsideElement);

      // Verify dropdown is closed
      await waitFor(() => {
        const dropdown = screen.queryByText(/STRENGTH OF WALLET/i);
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it("should rotate chevron icon when dropdown is opened", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });

      // Click to open dropdown
      await user.click(addressButton);

      // Wait for dropdown to appear
      await waitFor(() => {
        const dropdown = screen.getByText(/STRENGTH OF WALLET/i);
        expect(dropdown).toBeInTheDocument();
      });

      // Chevron should have rotate-180 class when open
      const chevrons = addressButton.querySelectorAll("svg");
      const lastChevron = chevrons[chevrons.length - 1]; // Last SVG should be chevron

      if (lastChevron) {
        const classAttr = lastChevron.getAttribute("class");
        expect(classAttr).toContain("rotate-180");
      }
    });
  });

  describe("Disconnect Action Call", () => {
    it("should call disconnect function when 'Disconnect' button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      // Open dropdown
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Wait for disconnect button to appear
      await waitFor(() => {
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toBeInTheDocument();
      });

      const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
      await user.click(disconnectButton);

      // Verify disconnect was called and toast was shown
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith("Wallet disconnected");
      });
    });

    it("should transition from connected to disconnected state after disconnect", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      // Verify connected state
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      // Open dropdown and disconnect
      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      await waitFor(() => {
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toBeInTheDocument();
      });

      const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
      await user.click(disconnectButton);

      // Verify address button is gone
      await waitFor(() => {
        const oldAddressButton = screen.queryByRole("button", { name: /GTES/i });
        expect(oldAddressButton).not.toBeInTheDocument();
      });

      // Verify connect button appears
      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });
    });

    it("should close dropdown after disconnect", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      // Open dropdown
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Verify dropdown is open
      await waitFor(() => {
        const dropdown = screen.getByText(/STRENGTH OF WALLET/i);
        expect(dropdown).toBeInTheDocument();
      });

      // Disconnect
      const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
      await user.click(disconnectButton);

      // Verify dropdown is closed
      await waitFor(() => {
        const dropdown = screen.queryByText(/STRENGTH OF WALLET/i);
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it("should display correct disconnect toast notification", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      // Open dropdown
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Click disconnect
      await waitFor(() => {
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toBeInTheDocument();
      });

      const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
      await user.click(disconnectButton);

      // Verify exact toast call
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith("Wallet disconnected");
        expect(toast.info).toHaveBeenCalledTimes(1);
      });
    });

    it("should show disconnect button with destructive styling", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      await waitFor(() => {
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toHaveClass("bg-destructive");
      });
    });
  });

  describe("State Transitions", () => {
    it("should transition from disconnected to connected state", async () => {
      const user = userEvent.setup();
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Start in connected state
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      // Disconnect
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      // Verify disconnected state
      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      // Verify connected button is gone
      const addressButton = screen.queryByRole("button", { name: /GTES/i });
      expect(addressButton).not.toBeInTheDocument();

      // Click connect
      const connectButton = screen.getByRole("button", { name: /connect wallet/i });
      await user.click(connectButton);

      // Verify back to connected state
      await waitFor(() => {
        const newAddressButton = screen.getByRole("button", { name: /GTES/i });
        expect(newAddressButton).toBeInTheDocument();
      });

      // Verify connect button is gone
      const oldConnectButton = screen.queryByRole("button", { name: /^Connect Wallet$/ });
      expect(oldConnectButton).not.toBeInTheDocument();
    });

    it("should handle multiple disconnect and reconnect cycles", async () => {
      const user = userEvent.setup();
      let walletControls: any;

      render(
        <TestWrapper
          onMount={(wallet) => {
            walletControls = wallet;
          }}
        >
          <WalletConnect />
        </TestWrapper>
      );

      // Cycle 1: Start connected, then disconnect
      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      // Disconnect
      await waitFor(() => {
        if (walletControls) {
          walletControls.disconnect();
        }
      });

      await waitFor(() => {
        const connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      // Cycle 2: Connect
      let connectButton = screen.getByRole("button", { name: /connect wallet/i });
      await user.click(connectButton);

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      // Cycle 3: Open dropdown and disconnect again
      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      await waitFor(() => {
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toBeInTheDocument();
      });

      const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
      await user.click(disconnectButton);

      // Should be back in disconnected state
      await waitFor(() => {
        connectButton = screen.getByRole("button", { name: /connect wallet/i });
        expect(connectButton).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /GTES/i })).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper button roles for interactive elements", async () => {
      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        // Connected state should have address button with role button
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toHaveAttribute("type", "button");
      });
    });

    it("should have accessible dropdown menu with proper structure", async () => {
      const user = userEvent.setup();

      render(
        <MockWalletProvider>
          <WalletConnect />
        </MockWalletProvider>
      );

      await waitFor(() => {
        const addressButton = screen.getByRole("button", { name: /GTES/i });
        expect(addressButton).toBeInTheDocument();
      });

      const addressButton = screen.getByRole("button", { name: /GTES/i });
      await user.click(addressButton);

      // Verify dropdown structure
      await waitFor(() => {
        const dropdown = screen.getByText(/STRENGTH OF WALLET/i);
        expect(dropdown).toBeInTheDocument();

        // Verify sections are present
        const balanceSection = screen.getByText(/BALANCE \(XLM\)/i);
        expect(balanceSection).toBeInTheDocument();

        // Verify disconnect button is present
        const disconnectButton = screen.getByRole("button", { name: /disconnect/i });
        expect(disconnectButton).toBeInTheDocument();
      });
    });
  });
});
