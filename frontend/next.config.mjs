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

// Per-route JS budget: each page's client entrypoint (its own code plus the shared
// chunks it pulls in) should stay under this size (raw, pre-gzip bytes) so
// first-load JS doesn't regress. This app ships the Stellar/Soroban SDK to most
// routes, so the ceiling starts generous — see lighthouserc.js's own 4 MB
// script-size allowance for the same reason. Tighten it once a real baseline has
// been measured with `npm run analyze`.
const ROUTE_JS_BUDGET_BYTES = 3 * 1024 * 1024;

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
        maxEntrypointSize: ROUTE_JS_BUDGET_BYTES,
        maxAssetSize: ROUTE_JS_BUDGET_BYTES,
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
