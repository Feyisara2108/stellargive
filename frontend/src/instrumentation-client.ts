import { captureRouterTransitionStart, initAnalytics } from "@/lib/sentry";

// Next.js (Turbopack and webpack) loads this file on the client before the app
// hydrates; it replaces the old `sentry.client.config.ts`. Sentry must not start
// until the visitor has accepted analytics, so this only initialises it for
// returning visitors who already consented, and the SDK itself is loaded lazily
// by `initAnalytics`. First-time visitors are initialised by ConsentBanner when
// they click Accept (#1078).
initAnalytics();

export const onRouterTransitionStart = captureRouterTransitionStart;
