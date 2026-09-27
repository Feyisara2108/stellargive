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

Each route's client-side JavaScript (its own page code plus the shared chunks it
loads) is budgeted at **3 MiB** (raw, pre-gzip). This is enforced via webpack's
`performance` options in `next.config.mjs`. The ceiling starts generous because
most routes ship the Stellar/Soroban SDK (see `lighthouserc.js`'s own 4 MB
script-size allowance for the same reason) — tighten `ROUTE_JS_BUDGET_BYTES`
once you've measured a real baseline with the analyzer below.

- **Run the analyzer locally**:

  ```bash
  npm run analyze
  ```

  This runs a production build with `@next/bundle-analyzer` enabled and opens an
  interactive treemap report for the client, server, and edge bundles in your
  browser (one HTML file per bundle, written under `.next/analyze/`).

- **Budget enforcement**: `npm run analyze` fails the build (and therefore the
  report) if any route's entrypoint or asset exceeds the 3 MiB budget. A plain
  `npm run build` only prints a warning for the same condition, so a route
  creeping over budget doesn't block an unrelated production deploy before
  someone has reviewed the analyzer report.
- If a route legitimately needs to grow past the budget, adjust
  `ROUTE_JS_BUDGET_BYTES` in `next.config.mjs`.

## Contributing

Contributions are welcome! Please ensure all code passes ESLint and uses the project's design system.
