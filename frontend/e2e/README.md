# E2E Tests

Playwright-based end-to-end tests for StellarGive. All tests run against a local
dev server and mock the Soroban RPC endpoint so no live testnet connection is
required.

## Prerequisites

```bash
# Install Playwright browsers (one-time setup)
npx playwright install --with-deps
```

## Running tests

```bash
# Run all E2E tests
npm run test:e2e

# Run a single spec file
npx playwright test e2e/wallet.spec.ts

# Run in headed mode (shows the browser)
npx playwright test --headed

# Run with the Playwright UI (interactive)
npx playwright test --ui
```

## Visual regression tests

Snapshot baselines live next to the spec file in a
`visual.spec.ts-snapshots/` directory. Each theme × page combination produces
two files (desktop Chrome + Pixel 5).

### Establishing or updating baselines

Run the update command whenever you intentionally change the UI:

```bash
npm run test:e2e:update
```

This regenerates all `.png` snapshot files. Commit the updated baselines
alongside your UI change.

### What is masked

Volatile regions are covered with a solid box so they do not cause false
failures:

| Mask | Reason |
|------|--------|
| Campaign cards | amounts and progress change on every donation |
| Wallet button | address differs between environments |
| Progress bars | exact fill varies with raised amounts |
| Address links | environment-specific addresses |
| RPC status dot | timing-dependent; may be green or gray on first render |
| Countdown / `<time>` elements | tick every second |
| XLM amount text | changes as campaigns receive donations |

### Adding a new baseline

1. Add the `toHaveScreenshot("my-page-light.png", { ... })` call to `visual.spec.ts`.
2. Run `npm run test:e2e:update` to capture the initial snapshot.
3. Commit the generated `.png` file.

## Test files

| File | What it covers |
|------|---------------|
| `visual.spec.ts` | Pixel-level snapshots for Landing, Explore, Campaign Detail, and Create pages in light **and** dark mode |
| `wallet.spec.ts` | Connect / disconnect lifecycle using the `MockWalletProvider` (no Freighter extension needed) |
| `donate.spec.ts` | Donation happy path — mocked RPC + mock wallet |
| `create.spec.ts` | Campaign creation flow |
| `explore.spec.ts` | Search, status filters, and URL-persisted state on the Explore page |
| `refund.spec.ts` | Refund eligibility and claim flow |

## Wallet mocking

The Playwright config sets `NEXT_PUBLIC_USE_MOCK_WALLET=true`, which activates
`MockWalletProvider` instead of the real Freighter-backed `WalletProvider`. The
mock auto-connects with a deterministic test address:

```
GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV
```

Tests can drive connect/disconnect purely through UI clicks — no browser
extension or wallet popup required.
