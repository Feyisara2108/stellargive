import React, { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Navbar } from "./Navbar";
import { MockWalletProvider, useMockWallet } from "./MockWalletProvider";

// Navbar renders the real WalletConnect, which needs the same dependencies
// mocked as WalletConnect.test.tsx itself does.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/soroban", () => ({
  getSACBalance: vi.fn().mockResolvedValue(BigInt(1000000000)),
  fromStroops: vi.fn((value: bigint) => (Number(value) / 10000000).toFixed(7)),
}));

vi.mock("@stellar/freighter-api", () => ({
  disconnect: vi.fn(),
}));

// CreateCampaignForm and ThemeToggle are unrelated to nav links / wallet
// connect / the mobile menu toggle - stub them out so this test isn't
// coupled to their internals (form validation, next-themes context, etc.).
vi.mock("@/components/CreateCampaignForm", () => ({
  CreateCampaignForm: () => <button data-testid="create-campaign-form">Start a Campaign</button>,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Toggle theme</button>,
}));

/** Same test-wrapper pattern as WalletConnect.test.tsx, so we can drive the
 * mock wallet's connect/disconnect state from inside a test. */
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

/** Renders Navbar wrapped in a connected MockWalletProvider, then waits one
 * tick so WalletConnect's balance-fetch effect (triggered on mount because
 * the wallet is connected) settles before the test makes assertions. Without
 * this, tests that don't otherwise `await` anything leave that microtask
 * pending, and it resolves later outside any act() boundary. */
async function renderNavbarConnected() {
  const result = render(
    <MockWalletProvider>
      <Navbar />
    </MockWalletProvider>,
  );
  await waitFor(() => {
    // Navbar.tsx renders two <nav> elements: the outer bar and the mobile
    // drawer's own <nav>. Asserting the count is a stable, unambiguous way
    // to confirm the component (and its async children) finished rendering.
    expect(screen.getAllByRole("navigation").length).toBe(2);
  });
  return result;
}

const PRIMARY_NAV_LINKS = [
  { name: "Explore", href: "/explore" },
  { name: "Activity", href: "/activity" },
  { name: "My Campaigns", href: "/profile" },
  { name: "FAQ", href: "/faq" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Navbar — primary nav links", () => {
  it.each(PRIMARY_NAV_LINKS)(
    "renders an '$name' link pointing to $href",
    async ({ name, href }) => {
      await renderNavbarConnected();
      // The same link appears twice: once in the desktop nav, once in the
      // mobile drawer (always present in the DOM, just translated off-screen).
      const links = screen.getAllByRole("link", { name });
      expect(links.length).toBe(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", href);
      }
    },
  );

  it("renders all four primary nav links", async () => {
    await renderNavbarConnected();
    for (const { name } of PRIMARY_NAV_LINKS) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
  });
});

describe("Navbar — wallet connect entry point", () => {
  it("shows the connected wallet address when the wallet is connected", async () => {
    await renderNavbarConnected();
    const addressButtons = screen.getAllByRole("button", { name: /GTES.*SERV/i });
    expect(addressButtons.length).toBe(2); // desktop + mobile drawer
  });

  it("does not show a 'Connect Wallet' button while connected", async () => {
    await renderNavbarConnected();
    expect(screen.getAllByRole("button", { name: /GTES/i }).length).toBe(2);
    expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
  });

  it("shows 'Connect Wallet' once the wallet is disconnected", async () => {
    let walletControls: any;

    render(
      <TestWrapper
        onMount={(wallet) => {
          walletControls = wallet;
        }}
      >
        <Navbar />
      </TestWrapper>,
    );

    await waitFor(() => {
      if (walletControls) {
        walletControls.disconnect();
      }
    });

    await waitFor(() => {
      const connectButtons = screen.getAllByRole("button", { name: /connect wallet/i });
      expect(connectButtons.length).toBe(2); // desktop + mobile drawer
    });
  });

  it("does not show a connected address button once disconnected", async () => {
    let walletControls: any;

    render(
      <TestWrapper
        onMount={(wallet) => {
          walletControls = wallet;
        }}
      >
        <Navbar />
      </TestWrapper>,
    );

    await waitFor(() => {
      if (walletControls) {
        walletControls.disconnect();
      }
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /GTES/i })).not.toBeInTheDocument();
    });
  });
});

describe("Navbar — mobile menu toggle", () => {
  function getDrawer(container: HTMLElement): HTMLElement {
    const drawer = container.querySelector(".fixed.inset-y-0.left-0");
    if (!drawer) throw new Error("Mobile drawer element not found");
    return drawer as HTMLElement;
  }

  it("renders the mobile drawer off-screen by default", async () => {
    const { container } = await renderNavbarConnected();
    expect(getDrawer(container).className).toContain("-translate-x-full");
  });

  it("opens the mobile drawer when the menu button is clicked", async () => {
    const { container } = await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(getDrawer(container).className).toContain("translate-x-0");
    expect(getDrawer(container).className).not.toContain("-translate-x-full");
  });

  it("closes the mobile drawer when the close button is clicked", async () => {
    const { container } = await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(getDrawer(container).className).toContain("translate-x-0");

    fireEvent.click(screen.getByLabelText(/close menu/i));
    expect(getDrawer(container).className).toContain("-translate-x-full");
  });
});
