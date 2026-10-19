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
        "categories:performance": ["error", { minScore: 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.8 }],
        "categories:seo": ["error", { minScore: 0.9 }],

        // Core Web Vitals – realistic thresholds for a Web3 dApp
        "first-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
        "total-blocking-time": ["error", { maxNumericValue: 600 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.25 }],
        interactive: ["error", { maxNumericValue: 6000 }],

        // JS transfer budget (compressed bytes). The audited pages load ~350 KB of
        // first-load JS, then ~190 KB of lazily loaded Stellar SDK chunks once their
        // queries run (~540 KB measured from `npm run analyze`); budget adds ~30%.
        "resource-summary:script:size": ["error", { maxNumericValue: 700_000 }],
        // Total page weight budget
        "resource-summary:total:size": ["error", { maxNumericValue: 8_000_000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
