import { describe, it, expect } from "vitest";
import { cn, calculateProgress, getCampaignImageUrl } from "./utils";

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

    it("should convert ipfs:// URIs to ipfs.io gateway URLs", () => {
      expect(getCampaignImageUrl("ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).toBe(
        "https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      );
    });

    it("should return undefined for other unsupported uri schemes", () => {
      expect(getCampaignImageUrl("ftp://example.com")).toBeUndefined();
      expect(getCampaignImageUrl("data:image/png;base64,...")).toBeUndefined();
    });
  });
});
