/**
 * #1143 — the donation success dialog must survive the Active → Funded flip.
 *
 * When a donation completes a campaign's goal, the campaign refetches as
 * Funded. DonateModal hides its form unless the campaign is Active, but the
 * success dialog has to stay on screen at that point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { Campaign } from "@/lib/soroban";

const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const walletState = vi.hoisted(() => ({
  address: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ" as string | null,
  isWrongNetwork: false,
}));

const campaignState = vi.hoisted(() => ({ campaign: null as unknown }));
const donateMutation = vi.hoisted(() => ({ mutateAsync: undefined as unknown }));
const eventsState = vi.hoisted(() => ({ events: [] as unknown[] }));
const tokenMetaState = vi.hoisted(() => ({
  meta: undefined as { decimals: number; symbol: string } | undefined,
  requestedTokens: [] as unknown[],
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => walletState,
}));

vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useCampaign: () => ({
      data: campaignState.campaign,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useCancelCampaign: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEvents: () => ({ data: eventsState.events, isLoading: false }),
    useTokenMetadata: (token: unknown) => {
      tokenMetaState.requestedTokens.push(token);
      return { data: tokenMetaState.meta, isLoading: false };
    },
    useDonate: () => ({
      mutateAsync: donateMutation.mutateAsync,
      isPending: false,
      isSuccess: false,
    }),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Side panels that fetch their own data and have nothing to do with the donate flow.
vi.mock("@/components/RecentDonations", () => ({ RecentDonations: () => null }));
vi.mock("@/components/ProjectUpdates", () => ({ ProjectUpdates: () => null }));
vi.mock("@/components/TopDonors", () => ({
  TopDonors: ({ decimals, symbol }: { decimals?: number; symbol?: string }) => (
    <div data-testid="top-donors" data-decimals={decimals} data-symbol={symbol} />
  ),
}));
// The breadcrumb trail is not under test here.
vi.mock("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => null }));

import { CampaignDetailsClient } from "./CampaignDetailsClient";

/** Generous waits for the lazily loaded DonateModal when the whole suite runs in parallel. */
const SLOW_LOAD = { timeout: 10_000 };
const TEST_TIMEOUT = 30_000;

const TARGET = 1_000_000_000n; // 100 XLM
const RAISED = 580_000_000n; // 58 XLM

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1n,
    creator: WALLET,
    beneficiary: WALLET,
    beneficiaries: [{ address: WALLET, share: 10000 }],
    title: "Clean Water Initiative",
    description: "Wells for three villages",
    category: "relief",
    target_amount: TARGET,
    raised_amount: RAISED,
    deadline: 0n,
    accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    status: "Active",
    ...overrides,
  };
}

function renderPage() {
  return render(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);
}

describe("CampaignDetailsClient donation success dialog", () => {
  beforeEach(() => {
    localStorage.clear();
    walletState.address = WALLET;
    walletState.isWrongNetwork = false;
    campaignState.campaign = makeCampaign();
    donateMutation.mutateAsync = vi.fn().mockResolvedValue({ hash: "TXHASH123" });
  });

  it(
    "keeps the success dialog visible when the donation flips the campaign to Funded",
    async () => {
      const user = userEvent.setup();
      const { rerender } = renderPage();

      // DonateModal is loaded with next/dynamic, so its first render can be slow under load.
      await user.click(await screen.findByRole("button", { name: "Donate Now" }, SLOW_LOAD));
      // 58 XLM raised of 100: a 42 XLM donation reaches the goal exactly.
      await user.type(await screen.findByPlaceholderText("10.0", {}, SLOW_LOAD), "42");
      await user.click(await screen.findByRole("button", { name: "Confirm Donation" }));

      expect(await screen.findByText("Donation Successful!", {}, SLOW_LOAD)).toBeInTheDocument();
      expect(donateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: 1n, amount: "42" }),
      );

      // The refetch after the donation reports the campaign as Funded.
      campaignState.campaign = makeCampaign({ raised_amount: TARGET, status: "Funded" });
      rerender(<CampaignDetailsClient params={{ id: "1" }} breadcrumbs={[]} />);

      expect(screen.getByText("Donation Successful!")).toBeInTheDocument();
      expect(screen.getByText("TXHASH123")).toBeInTheDocument();
      // The campaign no longer accepts donations, so the form and its trigger are gone.
      expect(screen.queryByRole("button", { name: "Donate Now" })).not.toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    "does not offer the donate form for a campaign that is already Funded",
    async () => {
      campaignState.campaign = makeCampaign({ raised_amount: TARGET, status: "Funded" });
      renderPage();

      expect(await screen.findByRole("heading", { name: "Clean Water Initiative" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Donate Now" })).not.toBeInTheDocument();
      expect(screen.queryByText("Donation Successful!")).not.toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );
});

describe("CampaignDetailsClient timeline", () => {
  const DEADLINE_SECONDS = 1_700_000_000n;
  const DEADLINE_ISO = "2023-11-14T22:13:20.000Z";
  const CREATED_ISO = "2024-03-05T10:00:00.000Z";

  beforeEach(() => {
    walletState.address = WALLET;
    walletState.isWrongNetwork = false;
    campaignState.campaign = makeCampaign({ deadline: DEADLINE_SECONDS });
    eventsState.events = [];
  });

  afterEach(() => {
    eventsState.events = [];
  });

  async function timelineItem(title: "Campaign Created" | "Deadline") {
    renderPage();
    const heading = await screen.findByRole("heading", { name: title }, SLOW_LOAD);
    return heading.closest("li") as HTMLLIElement;
  }

  it("positions each marker against its own entry", async () => {
    const created = await timelineItem("Campaign Created");
    const deadline = screen.getByRole("heading", { name: "Deadline" }).closest("li")!;

    expect(created).toHaveClass("relative");
    expect(deadline).toHaveClass("relative");
  });

  it("hides the decorative dots from assistive technology", async () => {
    const created = await timelineItem("Campaign Created");
    const deadline = screen.getByRole("heading", { name: "Deadline" }).closest("li")!;

    for (const item of [created, deadline]) {
      const dot = item.querySelector("div.absolute");
      expect(dot).not.toBeNull();
      expect(dot).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("gives each <time> a machine-readable ISO dateTime", async () => {
    eventsState.events = [{ topic: "created", data: { id: "1" }, createdAt: CREATED_ISO }];
    const created = await timelineItem("Campaign Created");
    const deadline = screen.getByRole("heading", { name: "Deadline" }).closest("li")!;

    expect(created.querySelector("time")).toHaveAttribute("datetime", CREATED_ISO);
    expect(deadline.querySelector("time")).toHaveAttribute("datetime", DEADLINE_ISO);
  });

  it("renders 'Unknown' without an empty dateTime when the creation date is missing", async () => {
    const created = await timelineItem("Campaign Created");
    const time = created.querySelector("time")!;

    expect(time).toHaveTextContent("Unknown");
    expect(time).not.toHaveAttribute("datetime");
  });

  it("renders 'Unknown' without a dateTime when the creation date is unparseable", async () => {
    eventsState.events = [{ topic: "created", data: { id: "1" }, createdAt: "not-a-date" }];
    const created = await timelineItem("Campaign Created");
    const time = created.querySelector("time")!;

    expect(time).toHaveTextContent("Unknown");
    expect(time).not.toHaveAttribute("datetime");
  });
});

describe("CampaignDetailsClient token amounts", () => {
  const SIX_DECIMAL_TOKEN = { decimals: 6, symbol: "USDC" };
  const USDC_TOKEN_ADDRESS = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

  beforeEach(() => {
    walletState.address = WALLET;
    walletState.isWrongNetwork = false;
    eventsState.events = [];
    tokenMetaState.meta = undefined;
    tokenMetaState.requestedTokens = [];
  });

  afterEach(() => {
    tokenMetaState.meta = undefined;
  });

  it("looks up the metadata of the campaign's accepted token", async () => {
    campaignState.campaign = makeCampaign({ accepted_token: USDC_TOKEN_ADDRESS });
    renderPage();

    await screen.findByRole("heading", { name: "Clean Water Initiative" });

    expect(tokenMetaState.requestedTokens).toContain(USDC_TOKEN_ADDRESS);
  });

  it("scales raised, target and max-per-donor by the token's decimals and shows its symbol", async () => {
    tokenMetaState.meta = SIX_DECIMAL_TOKEN;
    campaignState.campaign = makeCampaign({
      accepted_token: USDC_TOKEN_ADDRESS,
      target_amount: 100_000_000n, // 100 USDC
      raised_amount: 58_000_000n, // 58 USDC
      max_per_donor: 25_000_000n, // 25 USDC
    });
    renderPage();

    await screen.findByRole("heading", { name: "Clean Water Initiative" });

    expect(screen.getByText("58 USDC")).toBeInTheDocument();
    expect(screen.getByText("100 USDC")).toBeInTheDocument();
    expect(screen.getByText("25 USDC")).toBeInTheDocument();
    expect(screen.queryByText(/XLM/)).not.toBeInTheDocument();
  });

  it("computes the fund-the-gap amount from the bigint remainder in the token's units", async () => {
    tokenMetaState.meta = SIX_DECIMAL_TOKEN;
    campaignState.campaign = makeCampaign({
      accepted_token: USDC_TOKEN_ADDRESS,
      target_amount: 100_000_000n,
      raised_amount: 98_765_433n, // 1.234567 USDC left, which a 2-decimal float would round
    });
    renderPage();

    expect(await screen.findByText("Only 1.234567 USDC left — fund the gap!")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quick donate to fund the remaining 1.234567 USDC" }),
    ).toBeInTheDocument();
  });

  it("passes the token's decimals and symbol to the top donors list", async () => {
    tokenMetaState.meta = SIX_DECIMAL_TOKEN;
    campaignState.campaign = makeCampaign({ accepted_token: USDC_TOKEN_ADDRESS });
    renderPage();

    const topDonors = await screen.findByTestId("top-donors");

    expect(topDonors).toHaveAttribute("data-decimals", "6");
    expect(topDonors).toHaveAttribute("data-symbol", "USDC");
  });

  it("renders XLM campaigns with 7 decimals and the XLM symbol", async () => {
    tokenMetaState.meta = { decimals: 7, symbol: "XLM" };
    campaignState.campaign = makeCampaign({
      max_per_donor: 250_000_000n, // 25 XLM
      raised_amount: 950_000_000n, // 5 XLM left
    });
    renderPage();

    await screen.findByRole("heading", { name: "Clean Water Initiative" });

    expect(screen.getByText("95 XLM")).toBeInTheDocument();
    expect(screen.getByText("100 XLM")).toBeInTheDocument();
    expect(screen.getByText("25 XLM")).toBeInTheDocument();
    expect(screen.getByText("Only 5 XLM left — fund the gap!")).toBeInTheDocument();
    expect(screen.getByTestId("top-donors")).toHaveAttribute("data-decimals", "7");
    expect(screen.getByTestId("top-donors")).toHaveAttribute("data-symbol", "XLM");
  });

  it("falls back to 7 decimals and XLM while the token metadata is loading", async () => {
    tokenMetaState.meta = undefined;
    campaignState.campaign = makeCampaign();
    renderPage();

    await screen.findByRole("heading", { name: "Clean Water Initiative" });

    expect(screen.getByText("58 XLM")).toBeInTheDocument();
    expect(screen.getByTestId("top-donors")).toHaveAttribute("data-decimals", "7");
    expect(screen.getByTestId("top-donors")).toHaveAttribute("data-symbol", "XLM");
  });
});
