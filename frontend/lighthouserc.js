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
        // Lighthouse category scores (0–1 scale, 0.9 = 90)
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],

        // Core Web Vitals
        "first-contentful-paint": ["warn", { maxNumericValue: 2000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        interactive: ["warn", { maxNumericValue: 4000 }],

        // JS bundle budget: max 200 KB transferred for JS resources
        "resource-summary:script:size": ["error", { maxNumericValue: 200_000 }],
        // Total page weight budget
        "resource-summary:total:size": ["warn", { maxNumericValue: 500_000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
