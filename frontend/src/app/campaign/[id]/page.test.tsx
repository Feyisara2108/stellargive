import { describe, it, expect, vi, beforeEach } from "vitest";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const getCampaignMock = vi.hoisted(() => vi.fn());

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

import CampaignPage from "./page";
import { CampaignNotFoundError } from "@/lib/soroban";

const render = (id: string) => CampaignPage({ params: Promise.resolve({ id }) });

describe("CampaignPage (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("still renders in mock-wallet mode when the server-side read fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_WALLET", "true");
    getCampaignMock.mockRejectedValue(new Error("RPC unreachable"));
    await expect(render("1")).resolves.toBeTruthy();
  });
});
