import { describe, expect, it } from "vitest";
import {
  buildImageRemotePatterns,
  DEFAULT_IMAGE_GATEWAYS,
  isOptimizableImageUrl,
} from "../../image-hosts.mjs";
import { DEFAULT_IPFS_GATEWAY, getCampaignImageUrl } from "./utils";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

describe("buildImageRemotePatterns (#1051)", () => {
  it("allows the default IPFS gateways on /ipfs/** only", () => {
    expect(buildImageRemotePatterns("")).toEqual([
      { protocol: "https", hostname: "dweb.link", port: "", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "ipfs.io", port: "", pathname: "/ipfs/**" },
    ]);
  });

  it("covers the gateway resolveIpfsUrl uses by default", () => {
    expect(DEFAULT_IMAGE_GATEWAYS).toContain(DEFAULT_IPFS_GATEWAY);
  });

  it("adds the configured NEXT_PUBLIC_IPFS_GATEWAY, with or without a trailing slash", () => {
    const patterns = buildImageRemotePatterns("https://gateway.pinata.cloud/ipfs");
    expect(patterns).toContainEqual({
      protocol: "https",
      hostname: "gateway.pinata.cloud",
      port: "",
      pathname: "/ipfs/**",
    });
  });

  it("does not duplicate a configured gateway that is already a default", () => {
    expect(buildImageRemotePatterns("https://dweb.link/ipfs/")).toHaveLength(2);
  });

  it("ignores a malformed configured gateway", () => {
    expect(buildImageRemotePatterns("not a url")).toHaveLength(2);
  });
});

describe("isOptimizableImageUrl", () => {
  const patterns = buildImageRemotePatterns("");

  it("is true for covers on an allow-listed gateway", () => {
    expect(isOptimizableImageUrl(`https://dweb.link/ipfs/${CID}`, patterns)).toBe(true);
    expect(isOptimizableImageUrl(`https://ipfs.io/ipfs/${CID}/cover.png`, patterns)).toBe(true);
  });

  it("resolves an ipfs:// cover to an optimizable URL", () => {
    expect(isOptimizableImageUrl(getCampaignImageUrl(`ipfs://${CID}`)!, patterns)).toBe(true);
  });

  it("is false for unknown hosts, other paths, other schemes and junk", () => {
    expect(isOptimizableImageUrl("https://example.com/cover.png", patterns)).toBe(false);
    expect(isOptimizableImageUrl("https://dweb.link/other/cover.png", patterns)).toBe(false);
    expect(isOptimizableImageUrl(`http://dweb.link/ipfs/${CID}`, patterns)).toBe(false);
    expect(isOptimizableImageUrl("https://dweb.link.evil.com/ipfs/x", patterns)).toBe(false);
    expect(isOptimizableImageUrl("not a url", patterns)).toBe(false);
  });
});
