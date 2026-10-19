# stellarGive Frontend

The decentralized relief grant platform frontend built for the Stellar network.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- `@stellar/stellar-sdk`
- `@stellar/freighter-api`
- React Query (TanStack)
- Radix UI

## Features

- **Wallet Connection**: Securely connect with Freighter wallet on Stellar Testnet.
- **Campaign Dashboard**: Real-time progress tracking of relief campaigns.
- **Create Campaign**: Launch new relief efforts directly from the UI.
- **Donation Flow**: One-click donations with instant on-chain settlement.
- **Funds Claiming**: Creators and beneficiaries can easily claim funded grants.
- **Event Feed**: Live history of on-chain platform activity.

## Setup & Local Development

1. **Install Dependencies**:

   ```bash
   cd frontend
   npm install
   ```

2. **Configure Environment**:
   Create a `.env.local` file with:

   ```env
   NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   NEXT_PUBLIC_CONTRACT_ID=CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT
   NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   ```

3. **Run Dev Server**:
   ```bash
   npm run dev
   ```

## Docker

- **Production image build** (from `frontend/`):
  ```bash
  docker build -t stellargive-frontend .
  docker run -p 3000:3000 stellargive-frontend
  ```
- **Hot-reload development** (from repository root):
  ```bash
  docker compose up
  ```

## Sentry Error Monitoring

We use Sentry to capture frontend exceptions, React crashes, and Soroban RPC/transaction errors.

### Environment Setup

To enable Sentry, you must provide the following variables in your `.env.local` or deployment environment:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NEXT_PUBLIC_APP_VERSION`

### Verification

- **React Error**: (Automated test) Verify an intentional React crash is captured.
- **RPC Failure**: Use an invalid `NEXT_PUBLIC_SOROBAN_RPC_URL`.
- **Transaction Failure**: Submit an intentionally invalid transaction to see the failure in Sentry.
- **User Rejection**: If the user cancels a wallet popup or transaction signature, the error is intentionally ignored to prevent noise.

## Bundle Analysis

The Stellar SDK is never part of a route's first-load JS: hooks in
`src/hooks/useSoroban.ts` load `@/lib/soroban` (and the SDK) with a dynamic
`import()` when a query or mutation first runs, and layout-level UI reads
SDK-free modules (`lib/config.ts`, `lib/network.ts`, `lib/amounts.ts`,
`lib/strkey.ts`, `lib/tokens.ts`). Keep it that way: don't add a static import
of `@stellar/stellar-sdk` or a value import from `@/lib/soroban` to a component
(type-only imports are fine).

Webpack's `performance` options in `next.config.mjs` enforce two budgets (raw,
pre-gzip), each a measured baseline plus ~25%:

- `ENTRYPOINT_JS_BUDGET_BYTES` (768 KiB) for any webpack entrypoint (the shared
  runtime is the largest at ~613 KiB);
- `ASSET_JS_BUDGET_BYTES` (896 KiB) for any single chunk (the lazily loaded SDK
  chunk is the largest at ~710 KiB).

`lighthouserc.js` caps compressed script transfer at 700 KB per audited page, and
the Performance workflow caps the total of all emitted JS at 3.25 MB.

- **Run the analyzer locally**:

  ```bash
  npm run analyze          # webpack build + treemaps under .next/analyze/
  npm run analyze:routes   # first-load JS per route (raw and gzip)
  ```

  The analyzer only works with webpack, so `npm run analyze` passes `--webpack`
  (a plain `next build` uses Turbopack).

- **Budget enforcement**: `npm run analyze` fails the build if an entrypoint or
  asset exceeds its budget. A plain `npm run build` doesn't check them, so a
  route creeping over budget doesn't block an unrelated production deploy before
  someone has reviewed the analyzer report.
- If a route legitimately needs to grow past a budget, adjust it in
  `next.config.mjs` and note the new measurement there.

## Contributing

Contributions are welcome! Please ensure all code passes ESLint and uses the project's design system.
