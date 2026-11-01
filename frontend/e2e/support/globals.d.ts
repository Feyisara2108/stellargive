export {};

declare global {
  interface Window {
    /** Set by e2e init scripts to simulate a connected wallet. */
    __mockWalletAddress?: string;
    /** Set by e2e init scripts to simulate a disconnected wallet. */
    __mockWalletDisconnected?: boolean;
  }
}
