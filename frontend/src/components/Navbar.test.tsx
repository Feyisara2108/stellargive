import React, { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

// Navbar calls usePathname() to highlight the active link; provide it so the
// component renders without a mounted Next.js app router.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
}));

vi.mock("@/lib/soroban", () => ({
  getSACBalance: vi.fn().mockResolvedValue(BigInt(1000000000)),
  fromStroops: vi.fn((value: bigint) => (Number(value) / 10000000).toFixed(7)),
}));

vi.mock("@/lib/wallet", () => ({
  WALLETS: [
    { id: "freighter", name: "Freighter", url: "https://www.freighter.app", kind: "extension" },
    { id: "albedo", name: "Albedo", url: "https://albedo.link", kind: "web" },
  ],
  isWalletAvailable: vi.fn().mockResolvedValue(true),
  restoreWallet: vi.fn().mockResolvedValue(null),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn().mockResolvedValue(undefined),
  getWalletNetwork: vi.fn().mockResolvedValue(null),
  getNetworkSwitcher: vi.fn().mockResolvedValue(null),
}));

// CreateCampaignForm is unrelated to nav links / wallet connect / the mobile
// menu toggle - stub it out so this test isn't coupled to its internals (form
// validation, draft storage, etc.). The real ThemeToggle is used so the tests
// can check how many theme radiogroups end up in the DOM.
vi.mock("@/components/CreateCampaignForm", () => ({
  CreateCampaignForm: () => <button data-testid="create-campaign-form">Start a Campaign</button>,
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
    // With the mobile drawer closed, Navbar renders a single <nav>. Asserting
    // it is a stable, unambiguous way to confirm the component (and its async
    // children) finished rendering.
    expect(screen.getAllByRole("navigation").length).toBe(1);
    // Navbar.tsx renders two <nav> elements: the desktop link group
    // (aria-label="Main") and the mobile drawer's own <nav>. The outer
    // wrapper is a <header>, not a <nav>. Asserting the count is a stable,
    // unambiguous way to confirm the component (and its async children)
    // finished rendering.
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
      // The mobile drawer is only mounted while open, so with it closed the
      // link exists once, in the desktop nav.
      const links = screen.getAllByRole("link", { name });
      expect(links.length).toBe(1);
      expect(links[0]).toHaveAttribute("href", href);
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
    expect(addressButtons.length).toBe(1);
  });

  it("does not show a 'Connect Wallet' button while connected", async () => {
    await renderNavbarConnected();
    expect(screen.getAllByRole("button", { name: /GTES/i }).length).toBe(1);
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
      expect(connectButtons.length).toBe(1);
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

describe("Navbar — controls render once", () => {
  it("has a single Theme radiogroup and a single System theme radio while the drawer is closed", async () => {
    await renderNavbarConnected();
    expect(screen.getAllByRole("radiogroup", { name: "Theme" })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: "System theme" })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: "Light theme" })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: "Dark theme" })).toHaveLength(1);
  });

  it("has a single Start a Campaign button while the drawer is closed", async () => {
    await renderNavbarConnected();
    expect(screen.getAllByRole("button", { name: "Start a Campaign" })).toHaveLength(1);
  });

  it("has a single wallet button while the drawer is closed", async () => {
    await renderNavbarConnected();
    expect(screen.getAllByRole("button", { name: /GTES.*SERV/i })).toHaveLength(1);
  });

  it("only adds the drawer's own copies once the menu is opened", async () => {
    await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(within(drawer).getAllByRole("radiogroup", { name: "Theme" })).toHaveLength(1);

    fireEvent.click(screen.getByLabelText(/close menu/i));
    expect(screen.getAllByRole("radiogroup", { name: "Theme" })).toHaveLength(1);
  });
});

describe("Navbar — mobile menu toggle", () => {
  it("does not render the mobile drawer by default", async () => {
    await renderNavbarConnected();
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/open menu/i)).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the mobile drawer when the menu button is clicked", async () => {
    await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(
      within(drawer).getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/open menu/i)).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the mobile drawer when the close button is clicked", async () => {
    await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/close menu/i));
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
  });

  it("closes the drawer on Escape and returns focus to the menu button", async () => {
    await renderNavbarConnected();
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it("moves focus into the drawer and traps Tab inside it", async () => {
    await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes the drawer when the backdrop is clicked", async () => {
    const { container } = await renderNavbarConnected();
    fireEvent.click(screen.getByLabelText(/open menu/i));

    const backdrop = container.querySelector<HTMLElement>(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
  });
});

describe("Navbar — brand link and landmark structure", () => {
  it("renders a 'StellarGive' accessible link pointing to '/'", async () => {
    await renderNavbarConnected();
    const brandLink = screen.getByRole("link", { name: /stellargive/i });
    expect(brandLink).toHaveAttribute("href", "/");
  });

  it("has no nav element nested inside another nav", async () => {
    const { container } = await renderNavbarConnected();
    const navs = Array.from(container.querySelectorAll("nav"));
    expect(navs.length).toBeGreaterThan(0);
    for (const nav of navs) {
      // Walk up from the *parent* (not the nav itself, which always matches
      // its own selector) looking for an ancestor nav.
      expect(nav.parentElement?.closest("nav") ?? null).toBeNull();
    }
  });

  it("renders the outer wrapper as a header, not a nav", async () => {
    const { container } = await renderNavbarConnected();
    expect(container.querySelector("header")).toBeInTheDocument();
  });
});
