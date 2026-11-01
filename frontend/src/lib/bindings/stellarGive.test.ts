import { describe, it, expect } from "vitest";
import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { isNativeCampaign, parseCampaignStatus } from "./stellarGive";
import { buildCampaign, campaignToXdr } from "@/test/factories";

describe("parseCampaignStatus", () => {
  it("reads the vec-of-one-symbol a contract unit enum decodes to", () => {
    const decoded = scValToNative(xdr.ScVal.scvVec([nativeToScVal("Funded", { type: "symbol" })]));

    expect(decoded).toEqual(["Funded"]);
    expect(parseCampaignStatus(decoded)).toBe("Funded");
  });

  it("still accepts a bare string and an { Active: null } object", () => {
    expect(parseCampaignStatus("Active")).toBe("Active");
    expect(parseCampaignStatus({ Cancelled: null })).toBe("Cancelled");
  });

  it.each(["Active", "Funded", "Claimed", "Expired", "Cancelled"] as const)(
    "recognises %s",
    (status) => {
      expect(parseCampaignStatus([status])).toBe(status);
    },
  );

  it.each([undefined, null, 7, "", "Paused", ["Paused"], [], {}, { Paused: null }])(
    "returns null for %j",
    (value) => {
      expect(parseCampaignStatus(value)).toBeNull();
    },
  );
});

describe("isNativeCampaign", () => {
  it("accepts a campaign encoded the way the contract stores it", () => {
    const decoded = scValToNative(campaignToXdr(buildCampaign({ status: "Funded" })));

    expect(isNativeCampaign(decoded)).toBe(true);
    expect((decoded as { status: unknown }).status).toEqual(["Funded"]);
  });

  it("rejects a campaign with an unknown status", () => {
    const decoded = scValToNative(campaignToXdr(buildCampaign()));

    expect(isNativeCampaign({ ...decoded, status: ["Paused"] })).toBe(false);
  });

  it("reads each beneficiary as an (address, share) pair", () => {
    const decoded = scValToNative(campaignToXdr(buildCampaign())) as {
      beneficiaries: Array<[string, number]>;
    };

    expect(decoded.beneficiaries[0]).toEqual([expect.stringMatching(/^G/), 10000]);
    expect(new Address(decoded.beneficiaries[0][0]).toString()).toBe(decoded.beneficiaries[0][0]);
  });
});
