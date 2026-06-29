import "@testing-library/jest-dom/vitest";
import "../mocks/setup";
import { vi } from "vitest";

process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = "https://localhost:8000/rpc";
process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = "Standalone Network ; February 2017";
process.env.NEXT_PUBLIC_CONTRACT_ID = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// jsdom does not implement matchMedia; next-themes calls it on mount.
// Provide a no-op stub so theme-aware components can render under test.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});
