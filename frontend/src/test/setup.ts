import "@testing-library/jest-dom/vitest";
import "../mocks/setup";
import { vi } from "vitest";

// Mock next/dynamic generically using React.lazy to run dynamic imports asynchronously under test
vi.mock("next/dynamic", () => {
  return {
    default: (loader: any) => {
      const React = require("react");
      const LazyComponent = React.lazy(loader);
      return function DynamicComponent(props: any) {
        return React.createElement(
          React.Suspense,
          { fallback: null },
          React.createElement(LazyComponent, props)
        );
      };
    },
  };
});

process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = "http://localhost:8000/rpc";
process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = "Standalone Network ; February 2017";
process.env.NEXT_PUBLIC_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

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
