/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      // Start the Next.js standalone server before auditing
      startServerCommand: "node .next/standalone/server.js",
      startServerReadyPattern: "started server on",
      startServerReadyTimeout: 30000,
      url: [
        "http://localhost:3000",
        "http://localhost:3000/explore",
        "http://localhost:3000/campaign/1",
      ],
      numberOfRuns: 2,
      settings: {
        // Use desktop preset for consistent results in CI
        preset: "desktop",
        // Skip PWA audits — not applicable here
        skipAudits: ["installable-manifest", "splash-screen", "themed-omnibox"],
      },
    },
    assert: {
      // Fail CI if any assertion drops below these thresholds
      assertions: {
        // Lighthouse category scores (0–1 scale)
        "categories:performance": ["warn", { minScore: 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.8 }],
        "categories:seo": ["warn", { minScore: 0.9 }],

        // Core Web Vitals – realistic thresholds for a Web3 dApp
        "first-contentful-paint": ["warn", { maxNumericValue: 3000 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4000 }],
        "total-blocking-time": ["warn", { maxNumericValue: 600 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.25 }],
        interactive: ["warn", { maxNumericValue: 6000 }],

        // JS/Total bundle budget – 4 MB for JS resources (soroban-sdk is large)
        "resource-summary:script:size": ["warn", { maxNumericValue: 4_000_000 }],
        // Total page weight budget
        "resource-summary:total:size": ["warn", { maxNumericValue: 8_000_000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
