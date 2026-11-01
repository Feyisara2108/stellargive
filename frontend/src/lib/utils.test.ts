import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cn,
  calculateProgress,
  DEFAULT_IPFS_GATEWAY,
  getCampaignImageUrl,
  getStellarExpertTxUrl,
  isPlaceholderMetadataUri,
  NO_IMAGE_METADATA_URI,
  resolveIpfsUrl,
} from "./utils";

describe("utils", () => {
  describe("cn", () => {
    it("should merge class names correctly", () => {
      expect(cn("bg-red-500", "text-white")).toBe("bg-red-500 text-white");
    });

    it("should handle conflicts (tailwind-merge)", () => {
      expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
      expect(cn("p-4", "p-2")).toBe("p-2");
    });

    it("should handle conditional classes (clsx)", () => {
      expect(cn("base-class", true && "active-class", false && "inactive-class")).toBe(
        "base-class active-class",
      );
      expect(cn({ "is-active": true, "is-disabled": false })).toBe("is-active");
    });
  });

  describe("calculateProgress", () => {
    it("should return 0 when target is 0 to avoid division by zero", () => {
      expect(calculateProgress(100n, 0n)).toBe(0);
    });

    it("should calculate correct percentage", () => {
      expect(calculateProgress(50n, 100n)).toBe(50);
      expect(calculateProgress(25n, 100n)).toBe(25);
    });

    it("should truncate percentage to integer via BigInt division", () => {
      expect(calculateProgress(33n, 100n)).toBe(33);
      expect(calculateProgress(1n, 3n)).toBe(33); // 100 / 3 = 33
    });

    it("should cap progress at 100", () => {
      expect(calculateProgress(150n, 100n)).toBe(100);
      expect(calculateProgress(200n, 100n)).toBe(100);
    });

    it("should return 0 when raised is 0", () => {
      expect(calculateProgress(0n, 100n)).toBe(0);
    });
  });

  describe("getCampaignImageUrl", () => {
    it("should return undefined if uri is not provided or empty", () => {
      expect(getCampaignImageUrl(undefined)).toBeUndefined();
      expect(getCampaignImageUrl("")).toBeUndefined();
    });

    it("should return http/https URLs unchanged", () => {
      const url1 = "https://example.com/image.png";
      const url2 = "http://example.com/image.png";
      expect(getCampaignImageUrl(url1)).toBe(url1);
      expect(getCampaignImageUrl(url2)).toBe(url2);
    });

    it("should convert ipfs:// URIs through the shared resolver", () => {
      expect(getCampaignImageUrl("ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).toBe(
        `${DEFAULT_IPFS_GATEWAY}QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG`,
      );
    });

    it("should never treat the no-image placeholder as an image URL (#1075)", () => {
      expect(getCampaignImageUrl(NO_IMAGE_METADATA_URI)).toBeUndefined();
    });

    it("should treat the legacy https://example.com placeholder as no image", () => {
      expect(getCampaignImageUrl("https://example.com")).toBeUndefined();
      expect(getCampaignImageUrl("https://example.com/")).toBeUndefined();
    });

    it("should return undefined for other unsupported uri schemes", () => {
      expect(getCampaignImageUrl("ftp://example.com")).toBeUndefined();
      expect(getCampaignImageUrl("data:image/png;base64,...")).toBeUndefined();
    });
  });

  describe("resolveIpfsUrl (#1052)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("resolves ipfs:// URIs on the default gateway", () => {
      expect(resolveIpfsUrl("ipfs://bafyTestCid123")).toBe(`${DEFAULT_IPFS_GATEWAY}bafyTestCid123`);
    });

    it("uses NEXT_PUBLIC_IPFS_GATEWAY and normalises a missing trailing slash", () => {
      vi.stubEnv("NEXT_PUBLIC_IPFS_GATEWAY", "https://gateway.example/ipfs");
      expect(resolveIpfsUrl("ipfs://bafyTestCid123")).toBe(
        "https://gateway.example/ipfs/bafyTestCid123",
      );
    });

    it("passes https:// URLs through unchanged", () => {
      expect(resolveIpfsUrl("https://example.com/image.png")).toBe("https://example.com/image.png");
    });

    it("returns undefined for empty input", () => {
      expect(resolveIpfsUrl()).toBeUndefined();
      expect(resolveIpfsUrl("")).toBeUndefined();
      expect(resolveIpfsUrl("   ")).toBeUndefined();
    });
  });

  describe("isPlaceholderMetadataUri", () => {
    it("recognises empty, sentinel and legacy placeholder values", () => {
      expect(isPlaceholderMetadataUri(undefined)).toBe(true);
      expect(isPlaceholderMetadataUri("")).toBe(true);
      expect(isPlaceholderMetadataUri(NO_IMAGE_METADATA_URI)).toBe(true);
      expect(isPlaceholderMetadataUri("https://example.com")).toBe(true);
    });

    it("does not flag real image locations", () => {
      expect(
        isPlaceholderMetadataUri("ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"),
      ).toBe(false);
      expect(isPlaceholderMetadataUri("https://example.com/image.png")).toBe(false);
    });

    it("is accepted by the contract's metadata URI validation", () => {
      // create_campaign accepts `https://` or `ipfs://` prefixes, max 256 bytes.
      expect(NO_IMAGE_METADATA_URI.startsWith("https://")).toBe(true);
      expect(NO_IMAGE_METADATA_URI.length).toBeLessThanOrEqual(256);
    });
  });

  describe("getStellarExpertTxUrl", () => {
    const TX_HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("links to the public explorer for the Public Global passphrase", () => {
      vi.stubEnv(
        "NEXT_PUBLIC_NETWORK_PASSPHRASE",
        "Public Global Stellar Network ; September 2015",
      );
      expect(getStellarExpertTxUrl(TX_HASH)).toBe(
        `https://stellar.expert/explorer/mainnet/tx/${TX_HASH}`,
      );
    });

    it("links to the testnet explorer for the Test SDF passphrase", () => {
      vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015");
      expect(getStellarExpertTxUrl(TX_HASH)).toBe(
        `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`,
      );
    });

    it("defaults to testnet when the passphrase is empty", () => {
      vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "");
      expect(getStellarExpertTxUrl(TX_HASH)).toBe(
        `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`,
      );
    });

    it("defaults to testnet for an unrecognised passphrase (fail-safe, never mainnet)", () => {
      vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Standalone Network ; February 2017");
      expect(getStellarExpertTxUrl(TX_HASH)).toContain("/explorer/testnet/");
    });

    it("only treats a passphrase that starts with 'Public Global' as mainnet", () => {
      vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Not Public Global Stellar Network");
      expect(getStellarExpertTxUrl(TX_HASH)).toContain("/explorer/testnet/");
    });

    it("embeds the given transaction hash at the end of the URL", () => {
      vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015");
      expect(getStellarExpertTxUrl("abc123").endsWith("/tx/abc123")).toBe(true);
    });
  });
});
