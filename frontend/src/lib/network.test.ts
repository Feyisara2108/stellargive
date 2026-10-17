import { describe, it, expect } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import {
  getNetworkDisplayName,
  getWrongNetworkMessage,
  WRONG_NETWORK_MESSAGE,
  NETWORK_PASSPHRASE,
} from "./network";

describe("getNetworkDisplayName", () => {
  it("maps Networks.TESTNET to Testnet", () => {
    expect(getNetworkDisplayName(Networks.TESTNET)).toBe("Testnet");
  });

  it("maps Networks.PUBLIC to Mainnet", () => {
    expect(getNetworkDisplayName(Networks.PUBLIC)).toBe("Mainnet");
  });

  it("maps Networks.FUTURENET to Futurenet", () => {
    expect(getNetworkDisplayName(Networks.FUTURENET)).toBe("Futurenet");
  });

  it("maps Networks.STANDALONE to Standalone", () => {
    expect(getNetworkDisplayName(Networks.STANDALONE)).toBe("Standalone");
  });

  it("maps unknown passphrase to Unknown without throwing", () => {
    expect(getNetworkDisplayName("custom unknown passphrase")).toBe("Unknown");
    expect(getNetworkDisplayName("")).toBe("Unknown");
  });

  it("defaults to configured NETWORK_PASSPHRASE", () => {
    expect(getNetworkDisplayName()).toBe(getNetworkDisplayName(NETWORK_PASSPHRASE));
  });
});

describe("getWrongNetworkMessage", () => {
  it("formats message for known networks", () => {
    expect(getWrongNetworkMessage(Networks.TESTNET)).toBe(
      "Please switch wallet network to Stellar Testnet",
    );
    expect(getWrongNetworkMessage(Networks.PUBLIC)).toBe(
      "Please switch wallet network to Stellar Mainnet",
    );
    expect(getWrongNetworkMessage(Networks.FUTURENET)).toBe(
      "Please switch wallet network to Stellar Futurenet",
    );
    expect(getWrongNetworkMessage(Networks.STANDALONE)).toBe(
      "Please switch wallet network to Stellar Standalone",
    );
  });

  it("formats message for unknown network", () => {
    expect(getWrongNetworkMessage("unknown")).toBe(
      "Please switch wallet network to Stellar Unknown",
    );
  });

  it("defaults to WRONG_NETWORK_MESSAGE", () => {
    expect(getWrongNetworkMessage()).toBe(WRONG_NETWORK_MESSAGE);
  });
});
