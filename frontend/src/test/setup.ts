import "@testing-library/jest-dom/vitest";
import "../mocks/setup";
import { vi } from "vitest";

// Mock next/dynamic generically to resolve dynamic imports synchronously in tests
vi.mock("next/dynamic", () => {
  return {
    default: (loader: any) => {
      const str = loader.toString();
      if (str.includes("AdminPanel")) {
        return require("@/app/admin/AdminPanel").AdminPanel;
      }
      if (str.includes("ActivityFeed")) {
        return require("@/app/activity/ActivityFeed").ActivityFeed;
      }
      if (str.includes("CreateCampaignForm")) {
        return require("@/components/CreateCampaignForm").CreateCampaignForm;
      }
      // Fallback: render loaded component asynchronously
      const React = require("react");
      return function DynamicMock(props: any) {
        const [Component, setComponent] = React.useState(null);
        React.useEffect(() => {
          loader().then((mod: any) => {
            setComponent(() => mod.default || mod);
          });
        }, []);
        if (!Component) return null;
        return React.createElement(Component, props);
      };
    },
  };
});

process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = "http://localhost:8000/rpc";
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
