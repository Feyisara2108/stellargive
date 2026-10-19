import { describe, it, expect, vi, beforeEach } from "vitest";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const getCampaignMock = vi.hoisted(() => vi.fn());

// React's `cache` is only available in the server build Next uses for RSC.
// Stand in a memoizer scoped to one "request" (cleared between tests).
const requestCache = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    <A, R>(fn: (arg: A) => R) =>
    (arg: A) => {
      if (!requestCache.has(arg)) requestCache.set(arg, fn(arg));
      return requestCache.get(arg) as R;
    },
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

vi.mock("@/lib/soroban", () => {
  class CampaignNotFoundError extends Error {}
  return {
    getCampaign: getCampaignMock,
    fromStroops: (v: bigint) => String(v),
    CampaignNotFoundError,
    isCampaignNotFoundError: (e: unknown) => e instanceof CampaignNotFoundError,
  };
});

vi.mock("./CampaignDetailsClient", () => ({ CampaignDetailsClient: () => null }));

import CampaignPage, { generateMetadata } from "./page";
import { CampaignNotFoundError } from "@/lib/soroban";

const render = (id: string) => CampaignPage({ params: Promise.resolve({ id }) });

describe("CampaignPage (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestCache.clear();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_WALLET", "false");
  });

  it("renders when the campaign loads", async () => {
    getCampaignMock.mockResolvedValue({ title: "Flood Relief" });
    await expect(render("1")).resolves.toBeTruthy();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("shows the 404 page when the contract reports CampaignNotFound", async () => {
    getCampaignMock.mockRejectedValue(new (CampaignNotFoundError as any)(1n));
    await expect(render("1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("lets RPC failures reach the error boundary instead of 404ing", async () => {
    getCampaignMock.mockRejectedValue(new Error("Simulation failed: upstream timeout"));
    await expect(render("1")).rejects.toThrow("Simulation failed: upstream timeout");
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("lets network failures reach the error boundary instead of 404ing", async () => {
    getCampaignMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(render("1")).rejects.toThrow("fetch failed");
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("404s for ids that can't be a campaign without calling the RPC", async () => {
    await expect(render("not-a-number")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getCampaignMock).not.toHaveBeenCalled();
  });

  it("reads the campaign once per render and hands it to the client (#1094)", async () => {
    const campaign = {
      title: "Flood Relief",
      raised_amount: 0n,
      target_amount: 10n,
      beneficiaries: [],
    };
    getCampaignMock.mockResolvedValue(campaign);
    const params = Promise.resolve({ id: "1" });

    const metadata = await generateMetadata({ params });
    const element = await CampaignPage({ params });

    expect(metadata.title).toBe("Flood Relief | StellarGive");
    expect(getCampaignMock).toHaveBeenCalledTimes(1);
    expect(element.props.initialCampaign).toBe(campaign);
    expect(element.props.breadcrumbs.at(-1).label).toBe("Flood Relief");
  });

  it("still renders in mock-wallet mode when the server-side read fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_WALLET", "true");
    getCampaignMock.mockRejectedValue(new Error("RPC unreachable"));
    await expect(render("1")).resolves.toBeTruthy();
  });
});
