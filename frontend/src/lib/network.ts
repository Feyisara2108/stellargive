import { Networks } from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.STANDALONE;

/**
 * Maps a network passphrase to a human-readable display name.
 * Supported networks:
 * - Networks.TESTNET -> "Testnet"
 * - Networks.PUBLIC -> "Mainnet"
 * - Networks.FUTURENET -> "Futurenet"
 * - Networks.STANDALONE -> "Standalone"
 * Unknown/custom passphrases return "Unknown".
 */
export function getNetworkDisplayName(passphrase: string = NETWORK_PASSPHRASE): string {
  switch (passphrase) {
    case Networks.TESTNET:
      return "Testnet";
    case Networks.PUBLIC:
      return "Mainnet";
    case Networks.FUTURENET:
      return "Futurenet";
    case Networks.STANDALONE:
      return "Standalone";
    default:
      return "Unknown";
  }
}

/**
 * Shared message for wrong-network tooltips across the application.
 */
export function getWrongNetworkMessage(passphrase: string = NETWORK_PASSPHRASE): string {
  return `Please switch wallet network to Stellar ${getNetworkDisplayName(passphrase)}`;
}

export const WRONG_NETWORK_MESSAGE = getWrongNetworkMessage();
