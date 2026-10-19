import * as Sentry from "@sentry/nextjs";
import { initAnalytics } from "@/lib/sentry";

// Next.js (Turbopack and webpack) loads this file on the client before the app
// hydrates; it replaces the old `sentry.client.config.ts`. Sentry must not start
// until the visitor has accepted analytics, so this only initialises it for
// returning visitors who already consented. First-time visitors are initialised
// by ConsentBanner when they click Accept (#1078).
initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
