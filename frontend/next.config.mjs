import { withSentryConfig } from "@sentry/nextjs/config";
import bundleAnalyzer from "@next/bundle-analyzer";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The repo root has its own package-lock.json, so Next would otherwise guess the
// monorepo root as the workspace. Pin it so standalone output (`server.js`) lands
// in the same place locally and in the Docker build.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

// Client JS budgets (raw, pre-gzip bytes), enforced by webpack's performance
// hints in `npm run analyze` so first-load JS doesn't regress. The Stellar SDK is
// loaded on demand (see `loadSoroban` in hooks/useSoroban.ts), so no route
// entrypoint carries it; it lives in one async chunk.
//
// Measured baseline (Oct 2026, `npm run analyze`):
//   - largest entrypoint: `main-app` (shared runtime) 613 KiB; largest page
//     entrypoint: app/explore/page 303 KiB
//   - largest asset: the lazily loaded SDK chunk, 710 KiB
// Each budget is that baseline plus ~25%. Per-route first-load totals are
// printed by `node scripts/measure-route-js.mjs` after an analyze build.
const ENTRYPOINT_JS_BUDGET_BYTES = 768 * 1024;
const ASSET_JS_BUDGET_BYTES = 896 * 1024;

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  // 'standalone' output is required for Docker self-hosting.
  // Vercel manages its own output — using 'standalone' on Vercel causes a 404.
  // The Dockerfile sets NEXT_BUILD_TARGET=docker to enable this mode.
  ...(process.env.NEXT_BUILD_TARGET === "docker" ? { output: "standalone" } : {}),
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.performance = {
        ...config.performance,
        maxEntrypointSize: ENTRYPOINT_JS_BUDGET_BYTES,
        maxAssetSize: ASSET_JS_BUDGET_BYTES,
        // `npm run analyze` fails outright on a budget breach; a plain `next build`
        // only warns, so a route creeping over budget doesn't block an unrelated
        // production deploy before the analyzer report has been reviewed.
        hints: process.env.ANALYZE === "true" ? "error" : "warning",
      };
    }
    return config;
  },
};

export default withBundleAnalyzer(
  withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: process.env.SENTRY_RELEASE,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },
  }),
);
