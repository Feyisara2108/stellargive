import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' output is required for Docker self-hosting.
  // Vercel manages its own output — using 'standalone' on Vercel causes a 404.
  // The Dockerfile sets NEXT_BUILD_TARGET=docker to enable this mode.
  ...(process.env.NEXT_BUILD_TARGET === "docker" ? { output: "standalone" } : {}),
  swcMinify: false,
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
