import React from "react";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";
import type { Campaign } from "@/lib/soroban";

// ---------------------------------------------------------------------------
// Mocks for rendering the bar inside CampaignDetailsClient, which owns the
// scroll-visibility wiring (IntersectionObserver on the page header).
// ---------------------------------------------------------------------------

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const walletState = vi.hoisted(() => ({
  address: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ" as string | null,
  isWrongNetwork: false,
}));

const campaignState = vi.hoisted(() => ({ campaign: null as unknown }));

vi.mock("@/hooks/useSoroban", () => ({
  useCampaign: () => ({
    data: campaignState.campaign,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCancelCampaign: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvents: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => walletState,
}));

vi.mock("@/components/DonateModal", () => ({
  DonateModal: ({ open, suggestedAmount }: { open: boolean; suggestedAmount?: string }) => (
    <div
      data-testid="donate-modal"
      data-open={String(open)}
      data-suggested-amount={suggestedAmount ?? ""}
    />
  ),
}));
vi.mock("@/components/RecentDonations", () => ({ RecentDonations: () => null }));
vi.mock("@/components/ProjectUpdates", () => ({ ProjectUpdates: () => null }));
vi.mock("@/components/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/AddressLink", () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}));
vi.mock("@/components/RefundButton", () => ({ RefundButton: () => null }));
vi.mock("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/CampaignStatusBadge", () => ({
  CampaignStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

import { StickyDonateBar } from "./StickyDonateBar";
import { CampaignDetailsClient } from "@/app/campaign/[id]/CampaignDetailsClient";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Clean Water Initiative",
    description: "Wells for three villages",
    category: "relief",
    target_amount: 1_000_000_000n,
    raised_amount: 580_000_000n, // 58%
    deadline: 0n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

/** The Radix progress indicator's fill, expressed as its translateX offset. */
function progressIndicator(root: HTMLElement) {
  const bar = within(root).getByRole("progressbar");
  return bar.firstElementChild as HTMLElement;
}

// ---------------------------------------------------------------------------
// Component in isolation
// ---------------------------------------------------------------------------

describe("StickyDonateBar", () => {
  it("renders nothing when hidden", () => {
    const { container } = render(<StickyDonateBar onOpen={vi.fn()} hidden title="Campaign" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a fixed bottom bar with the Donate action when not hidden", () => {
    render(<StickyDonateBar onOpen={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Donate" });
    expect(button).toBeEnabled();
    expect(button.closest(".fixed")).toHaveClass("bottom-0", "md:hidden");
  });

  it("calls onOpen when Donate is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StickyDonateBar onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Donate" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not call onOpen when disabled", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StickyDonateBar onOpen={onOpen} disabled />);

    const button = screen.getByRole("button", { name: "Donate" });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders the title and progress figure from props", () => {
    const { container } = render(
      <StickyDonateBar onOpen={vi.fn()} title="Clean Water Initiative" progressPercent={58} />,
    );

    expect(screen.getByText("Clean Water Initiative")).toBeInTheDocument();
    expect(progressIndicator(container).style.transform).toBe("translateX(-42%)");
  });

  it.each([
    [0, /^translateX\(-100%\)$/],
    [100, /^translateX\(-?0%\)$/],
  ])("renders a %i%% progress figure", (percent, transform) => {
    const { container } = render(
      <StickyDonateBar onOpen={vi.fn()} title="Campaign" progressPercent={percent} />,
    );

    expect(progressIndicator(container).style.transform).toMatch(transform);
  });

  it("omits the progress bar when progressPercent is not provided", () => {
    render(<StickyDonateBar onOpen={vi.fn()} title="Campaign" />);

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("omits the title block, including progress, when no title is provided", () => {
    render(<StickyDonateBar onOpen={vi.fn()} progressPercent={58} />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "Donate" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scroll visibility and modal wiring on the campaign detail page
// ---------------------------------------------------------------------------

describe("StickyDonateBar on the campaign detail page", () => {
  let observerCallback: IntersectionObserverCallback | null;
  let observedElement: Element | null;

  class ControlledIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = (el: Element) => {
      observedElement = el;
    };
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  /** Simulate the main header CTA scrolling into (true) or out of (false) view. */
  function setHeaderInView(isIntersecting: boolean) {
    act(() => {
      observerCallback!(
        [{ isIntersecting, target: observedElement } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  }

  const stickyDonate = () => screen.queryByRole("button", { name: "Donate" });

  function renderPage() {
    return render(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);
  }

  beforeEach(() => {
    observerCallback = null;
    observedElement = null;
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    walletState.address = WALLET;
    walletState.isWrongNetwork = false;
    campaignState.campaign = makeCampaign();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes the page header that holds the main campaign CTA", () => {
    renderPage();

    expect(observedElement).not.toBeNull();
    expect(
      within(observedElement as HTMLElement).getByRole("heading", {
        name: "Clean Water Initiative",
      }),
    ).toBeInTheDocument();
  });

  it("stays hidden on initial load while the main CTA is in view", () => {
    renderPage();

    expect(stickyDonate()).toBeNull();
  });

  it("appears after scrolling past the main CTA", () => {
    renderPage();

    setHeaderInView(false);

    expect(stickyDonate()).toBeInTheDocument();
  });

  it("hides again when the main CTA scrolls back into view", () => {
    renderPage();

    setHeaderInView(false);
    expect(stickyDonate()).toBeInTheDocument();

    setHeaderInView(true);
    expect(stickyDonate()).toBeNull();
  });

  it("renders the campaign title and funding progress on the bar", () => {
    renderPage();
    setHeaderInView(false);

    const bar = stickyDonate()!.closest(".fixed") as HTMLElement;
    expect(within(bar).getByText("Clean Water Initiative")).toBeInTheDocument();
    // 580_000_000 / 1_000_000_000 raised => 58%.
    expect(progressIndicator(bar).style.transform).toBe("translateX(-42%)");
  });

  it("opens the donation modal with no preset amount when Donate is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    setHeaderInView(false);

    const modal = await screen.findByTestId("donate-modal");
    expect(modal).toHaveAttribute("data-open", "false");

    await user.click(stickyDonate()!);

    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-suggested-amount", "");
  });

  it.each([
    ["no wallet is connected", { address: null, isWrongNetwork: false }],
    ["the wallet is on the wrong network", { address: WALLET, isWrongNetwork: true }],
  ])("disables Donate and keeps the modal closed when %s", async (_, wallet) => {
    const user = userEvent.setup();
    Object.assign(walletState, wallet);
    renderPage();
    setHeaderInView(false);

    const modal = await screen.findByTestId("donate-modal");
    const button = stickyDonate()!;
    expect(button).toBeDisabled();

    await user.click(button);

    expect(modal).toHaveAttribute("data-open", "false");
  });

  it("is never rendered for a campaign that is no longer active", () => {
    campaignState.campaign = makeCampaign({ status: "Funded" });
    renderPage();

    setHeaderInView(false);

    expect(stickyDonate()).toBeNull();
  });
});
