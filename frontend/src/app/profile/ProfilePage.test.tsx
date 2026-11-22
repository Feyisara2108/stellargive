import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProfilePage from "./page";
import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";

// Valid 56-char G-address so the page's donor matching accepts it.
const { TEST_ADDRESS } = vi.hoisted(() => ({ TEST_ADDRESS: "G" + "B".repeat(55) }));

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  init: vi.fn(),
}));

// Mock @stellar/stellar-sdk
vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(() => ({})),
    },
  };
});

// Mock @/lib/soroban
vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => "0",
}));

// Mock useWallet
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    address: TEST_ADDRESS,
    isConnected: true,
  }),
}));

// Mock hooks
vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useRecentCampaigns: vi.fn(() => ({ data: [], isLoading: false })),
    useEvents: vi.fn(() => ({ data: [], isLoading: false })),
  }),
);

// Mock components
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));
vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: ({ campaign }: { campaign: { title: string } }) => (
    <div data-testid="campaign-card">{campaign.title}</div>
  ),
}));
vi.mock("@/components/WalletConnect", () => ({ WalletConnect: () => <div /> }));

import {
  useCampaignsByCreator,
  useRecentCampaigns,
  useEvents,
  useTokenMetadataBatch,
} from "@/hooks/useSoroban";

describe("ProfilePage - Empty States", () => {
  it("displays empty state messages and action buttons when no campaigns created or supported", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false } as any);

    render(<ProfilePage />);

    expect(screen.getByText(/You haven't created any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Create your first campaign/i)).toBeInTheDocument();

    expect(screen.getByText(/You haven't donated to any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Explore campaigns/i)[0]).toBeInTheDocument();
  });
});

describe("ProfilePage - malformed event payloads", () => {
  it("renders placeholders for missing fields and ignores non-event entries", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({
      data: [
        // Donor present but no campaign_id / amount
        {
          id: "d1",
          topic: "received",
          data: {
            donor: TEST_ADDRESS,
            total_raised: 0n,
            accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            comment: null,
          },
        },
        // Garbage campaign_id, still no amount
        {
          id: "d2",
          topic: "received",
          data: {
            campaign_id: "oops",
            donor: TEST_ADDRESS,
            total_raised: 0n,
            accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            comment: null,
          },
        },
        null,
        "garbage",
      ],
      isLoading: false,
    } as any);

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    expect(screen.getAllByText(/— Donated/)).toHaveLength(2);
    expect(screen.getAllByText(/To campaign ID: —/)).toHaveLength(2);
  });

  it("does not crash when the events payload is not an array", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({ data: { nope: true }, isLoading: false } as any);

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    expect(screen.getByText(/You haven't made any donations yet/i)).toBeInTheDocument();
  });
});

describe("ProfilePage - donation rows", () => {
  const USDC_TOKEN = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const donationTo = (campaignId: bigint, amount: bigint, acceptedToken: string) => ({
    id: `d-${campaignId}`,
    topic: "received",
    data: {
      campaign_id: campaignId,
      donor: TEST_ADDRESS,
      amount,
      total_raised: amount,
      accepted_token: acceptedToken,
      comment: null,
    },
  });

  it("links an unlisted campaign to its campaign page, not to an account explorer", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({
      data: [donationTo(7n, 50_000_000n, NATIVE_XLM_CONTRACT_ID)],
      isLoading: false,
    } as any);

    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    const link = screen.getByRole("link", { name: "Campaign #7" });
    expect(link).toHaveAttribute("href", "/campaign/7");
    expect(screen.queryByText(/To campaign ID: 7/)).not.toBeInTheDocument();
    expect(screen.getByText("5 XLM Donated")).toBeInTheDocument();
  });

  it("formats the amount with the donation's own token decimals and symbol", () => {
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({
      data: [donationTo(3n, 2_500_000n, USDC_TOKEN)],
      isLoading: false,
    } as any);
    vi.mocked(useTokenMetadataBatch).mockReturnValue({
      data: { [USDC_TOKEN]: { symbol: "USDC", decimals: 6 } },
    } as any);

    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("tab", { name: /My Donations/i }));

    expect(screen.getByText("2.5 USDC Donated")).toBeInTheDocument();
    expect(useTokenMetadataBatch).toHaveBeenCalledWith([USDC_TOKEN]);
  });
});

describe("ProfilePage - My Campaigns status filter", () => {
  const campaign = (id: number, status: string) => ({
    id: BigInt(id),
    title: `${status} campaign ${id}`,
    status,
    raised_amount: 0n,
  });

  const renderWith = (created: ReturnType<typeof campaign>[]) => {
    vi.mocked(useCampaignsByCreator).mockReturnValue({ data: created, isLoading: false } as any);
    vi.mocked(useRecentCampaigns).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useEvents).mockReturnValue({ data: [], isLoading: false } as any);
    render(<ProfilePage />);
  };

  it("counts each chip by the campaigns that selecting it shows", () => {
    renderWith([
      campaign(1, "Active"),
      campaign(2, "Funded"),
      campaign(3, "Cancelled"),
      campaign(4, "Expired"),
      campaign(5, "Claimed"),
    ]);

    const funded = screen.getByRole("button", { name: /Funded/ });
    expect(screen.getByRole("button", { name: /Active/ })).toHaveTextContent("(1)");
    expect(funded).toHaveTextContent("(1)");

    fireEvent.click(funded);
    expect(screen.getAllByTestId("campaign-card")).toHaveLength(1);
    expect(screen.getByText("Funded campaign 2")).toBeInTheDocument();
  });

  it("marks the selected chip with aria-pressed", () => {
    renderWith([campaign(1, "Active")]);

    const all = screen.getByRole("button", { name: "All" });
    const active = screen.getByRole("button", { name: /Active/ });
    expect(screen.getByRole("group", { name: /Status/ })).toBeInTheDocument();
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(active).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(active);
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(active).toHaveAttribute("aria-pressed", "true");
  });

  it("explains an empty filter instead of claiming no campaigns exist", () => {
    renderWith([campaign(1, "Active")]);

    fireEvent.click(screen.getByRole("button", { name: /Funded/ }));
    expect(screen.queryByText(/You haven't created any campaigns yet/i)).not.toBeInTheDocument();
    expect(screen.getByText("None of your campaigns are Funded.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all campaigns" }));
    expect(screen.getByText("Active campaign 1")).toBeInTheDocument();
  });
});
