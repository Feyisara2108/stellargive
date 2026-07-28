# End-to-End & Visual Regression Testing

This directory contains the Playwright E2E and visual regression test suite for StellarGive.

## Visual Regression Testing

Visual regression tests capture intentional snapshots of key pages to catch unintended UI regressions and layout shifts across PRs and releases.

### Key Pages Tested

Visual baselines are captured for the following primary surfaces in both **light** and **dark** themes:

1. **Home Page (`/`)**: Hero section, call to action, featured campaign cards, and footer.
2. **Explore Page (`/explore`)**: Search input, category filter tabs, campaign grid, and pagination controls.
3. **Campaign Detail Page (`/campaign/[id]`)**: Breadcrumbs, campaign header, progress bar, timeline, top donors, and recent activity sections.

### Masking Volatile Regions

To prevent test flakiness due to non-deterministic dynamic data, volatile UI regions are masked using standard Playwright locator masks:

- **Timestamps & Relative Dates**: `<time>` elements, relative time badges ("2 days ago", "in 3 days").
- **Countdowns**: Remaining time indicators ("⏱️ X days left", "Ended").
- **Progress Bars**: Dynamic fundraising progress bars (`[role='progressbar']`).
- **Wallet Addresses & Links**: Truncated Stellar public keys (`AddressLink`).
- **Donation & Target Amounts**: Numeric token balances and live donation figures.

### Running E2E & Visual Tests

Run the full Playwright test suite (including visual regression tests):

```bash
# From root or frontend directory
npm run test:e2e
```

To run only the visual regression suite:

```bash
npx playwright test frontend/e2e/visual.spec.ts
```

### Updating Baseline Snapshots

When design changes or new UI features intentionally alter the page appearance, update the baseline reference snapshots by running:

```bash
npm run test:e2e:update
```

Or for visual tests specifically:

```bash
npx playwright test frontend/e2e/visual.spec.ts --update-snapshots
```

Commit the updated reference PNG files generated in `visual.spec.ts-snapshots/` alongside your pull request.
