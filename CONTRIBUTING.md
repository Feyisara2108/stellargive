# Contributing to stellarGive

Thanks for contributing to stellarGive! This repository contains:
- Soroban contract: `contracts/stellar-give`
- Next.js frontend: `frontend`

## 1. Branch Strategy

Use prefixed branch names:
- `feat/<short-description>` for features
- `fix/<short-description>` for bug fixes
- `chore/<short-description>` for maintenance

Examples:
- `feat/campaign-filtering`
- `fix/claim-deadline-validation`
- `chore/ci-cache-tuning`

## 2. Local Setup

### Frontend Setup (Node.js)

We enforce a consistent Node.js version using `.nvmrc` located in the `frontend` directory.

```bash
git clone https://github.com/Feyisara2108/stellargive.git
cd stellargive

# Set up the frontend
cd frontend
nvm use # Uses the version specified in .nvmrc
npm ci
cp .env.example .env.local
```

### Contract Setup (Rust & Soroban)

```bash
# Install the Rust toolchain
rustup toolchain install stable
rustup target add wasm32v1-none

# Install Soroban CLI
cargo install --locked soroban-cli
```

See `examples/` for CLI interaction patterns and Soroban integration examples.

### Environment Configuration

All network, contract, and alerting settings live in environment files.

Root `.env` (scripts):

```bash
cp .env.example .env
# Edit .env — set SOROBAN_RPC_URL, DEPLOYER_ALIAS, etc.
```

Frontend `.env.local`:

```bash
cp frontend/.env.example frontend/.env.local
# Edit — set NEXT_PUBLIC_CONTRACT_ID from your deployment
```

Every required variable is documented with its purpose and default value in both
`.env.example` and `frontend/.env.example`. Never commit `.env` or
`frontend/.env.local` — they are git-ignored.

### One-Command Testnet Bootstrap

To go from a fresh clone to a fully-working local/testnet environment in one step:

```bash
./scripts/bootstrap-testnet.sh
```

This script:

1. Loads `.env` (or copies `.env.example` if it doesn't exist and prompts you to fill it in)
2. Generates and funds a testnet Stellar account via Friendbot
3. Builds the Soroban contract with `cargo`
4. Deploys the contract (idempotent — skips if already deployed; pass `--force-deploy` to redeploy)
5. Generates TypeScript bindings with `generate-types.sh`
6. Copies the env to `frontend/.env.local` if it doesn't already exist

Options:

```
--force-deploy     Redeploy even if a deployment record already exists
--alias <name>     Stellar key alias to use as the deployer (default: sg-deployer)
```

Every step is safe to re-run. If an account is already funded or a contract already
deployed, those steps are skipped automatically.

### Local Soroban Node

We support local-first development using the Stellar Quickstart image. Start the local node with:

```bash
docker compose up -d stellar
```

This exposes the Soroban RPC on port 8000 and Horizon on port 8001. You can configure your frontend to use it by copying `frontend/.env.example` to `frontend/.env.local`.

Friendbot is available at http://localhost:8000/friendbot?addr=<YOUR_PUBLIC_KEY>.

## 3. Testing Requirements

Before opening a PR, ensure all local checks pass:

```bash
# Contract checks
cd contracts/stellar-give
cargo fmt --check
cargo clippy -- -D warnings
cargo test
cargo build --release --target wasm32v1-none

# Frontend checks
cd ../../frontend
npm run lint
npm run build
npm run test
```

### Gas Estimation Guidelines

Every new contract function added to the project must be checked for resource
usage. The goal is to keep individual transactions affordable for end users.

Targets:

| Operation | Expected fee (stroops) |
|-----------|----------------------|
| `create_campaign` | < 200 000 |
| `donate` | < 300 000 |
| `claim_funds` | < 300 000 |
| Any new function | < 500 000 |

How to measure:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --simulate-only \
  -- <function_name> [args...]
```

The `minResourceFee` field in the simulation response shows the fee in stroops.

Frontend guard: `submitTransaction` in `frontend/src/lib/soroban.ts` will log a
warning and trigger a `GasWarning` UI banner when the simulated fee exceeds
`MAX_SIMULATION_FEE_STROOPS` (10 M stroops). If your new function consistently
triggers this warning, reduce its resource usage before merging.

## 4. Code Review Standards

- Keep PRs focused and scoped to a single concern.
- Include tests or rationale when changing contract logic.
- Do not merge with failing CI.
- Document config/deployment changes in `docs/DEPLOYMENT.md`.
- Flag security-sensitive changes explicitly in PR description.

## 5. Commit Message Convention

We use Conventional Commits. Your commit messages should reflect the branch strategy:
- `feat: add campaign claim guard`
- `fix: enforce accepted token check`
- `chore: optimize frontend ci cache`

## 6. Required CI Checks

When you open a PR, the following automated checks must pass before merging:
- **Contract Tests**: Runs `cargo test` and coverage reports. ([ci-contract.yml](.github/workflows/ci-contract.yml))
- **Lint & Format**: Runs `cargo fmt`, `cargo clippy`, and `eslint`. ([ci-lint.yml](.github/workflows/ci-lint.yml))
- **Frontend Build**: Ensures Next.js compiles without errors. ([ci.yml](.github/workflows/ci.yml))

## 7. Good First Issues

If you're looking for a place to start, check out the [`good first issue`](https://github.com/Feyisara2108/stellargive/labels/good%20first%20issue) label on our issue tracker. These are self-contained tasks that are perfect for getting familiar with the codebase!

## 8. Templates

When contributing, please follow our [Pull Request Template](#pull-request-template-use-in-every-pr) to provide context and verification steps. If you are creating an issue, please provide clear reproduction steps for bugs or detailed use cases for feature requests.

---

### Pull Request Template (Use in every PR)

```md
## Summary
- What changed and why

## Type of change
- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs

## Validation
- [ ] cargo fmt --check
- [ ] cargo clippy -- -D warnings
- [ ] cargo test
- [ ] npm run lint
- [ ] npm run build

## Mainnet Readiness (Required for Mainnet-targeting PRs)
- [ ] [Final Mainnet Audit Checklist](docs/MAINNET_AUDIT_CHECKLIST.md) completed and signed off.

## Security impact
- [ ] No security impact
- [ ] Security-sensitive (describe)

## Deployment notes
- Any testnet/mainnet rollout steps
```

## 9. Pre-commit Hooks

We use Husky and `lint-staged` to automatically format and lint modified files before every commit. The hook runs only on staged files for speed.

Setup: run `npm run prepare` at the repository root to initialize the hooks.

What runs:
- **Frontend files** (`frontend/**/*.{js,jsx,ts,tsx}`): Prettier formats and ESLint fixes, plus `prettier --check`.
- **Rust files** (`contracts/**/*.rs`): `cargo fmt --check` formats/checks the code.

If any checks fail, the commit is aborted with a clear error output so you can fix the issue locally before pushing.

Running checks manually:

```bash
# Run format/lint checks on all files in frontend
cd frontend && npm run lint && npx prettier --check .

# Run formatting checks on the contract
cd contracts/stellar-give && cargo fmt --check && cargo clippy -- -D warnings
```

Emergency skip: use `git commit --no-verify` to bypass the hook when necessary.

## 10. EditorConfig

An `.editorconfig` file enforces consistent formatting across editors (UTF-8, LF line endings, trailing whitespace trimming, and indentation per file type). Most editors respect it automatically; install a plugin if yours doesn't.

## 11. Secret Scanning

Gitleaks runs on every PR and push to `main` to prevent committed secrets. If a scan flags a false positive, add an allowlist entry in `.gitleaks.toml` with a comment explaining why.

## 12. Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you are expected to uphold this code. Please report unacceptable behavior to **stellargive-conduct@proton.me**.

## 13. Component Storybook

The frontend ships with a Storybook for visual review of shared components
(`Button`, `Progress`, `CampaignCard`, `DonateModal`, ...). Use it whenever
you change a component to confirm light/dark rendering and mobile layout
before opening a PR.

```bash
cd frontend
npm install           # one-time, picks up @storybook/* devDeps
npm run storybook     # serves at http://localhost:6006
npm run build-storybook   # produces a static bundle under storybook-static/
```

Story conventions:
- Co-locate `*.stories.tsx` next to the component it documents.
- Cover at least the primary state, an "edge" state (loading / error / empty), and one mobile viewport variant.
- Shared mock data lives in [`frontend/src/stories/mocks.ts`](frontend/src/stories/mocks.ts).
- Use the theme toolbar to confirm dark-mode rendering — both themes share the variables defined in [`frontend/src/app/globals.css`](frontend/src/app/globals.css).

A hosted Storybook URL will be added here once the team picks a host (Vercel or Chromatic) and the deploy workflow lands.

## 14. Regenerating TypeScript contract bindings

The frontend talks to the Soroban contract through generated TypeScript bindings.
**After any change to the contract's interface, regenerate them so the frontend
types stay in sync** (this prevents silent drift between contract and UI).

Prerequisites: the [Stellar CLI](https://developers.stellar.org/docs/tools/cli)
installed and the contract built to WASM
(`cargo build --target wasm32v1-none --release` in `contracts/stellar-give`).

```bash
cd frontend
npm run generate:bindings
```

This runs `stellar contract bindings typescript` against
`contracts/stellar-give/target/wasm32v1-none/release/stellar_give.wasm`
and writes the bindings to `frontend/src/lib/bindings/`.

> The step is intentionally **not** part of `npm run build`: production/CI builds
> of the frontend don't have the Stellar CLI or the compiled WASM available, so
> wiring it into `build` would break those pipelines. Run it locally (or in a
> contract-aware CI job) whenever the contract interface changes.

## 15. Frontend Input Sanitization & Security Guidelines

To prevent Cross-Site Scripting (XSS) and injection attacks, adhere to the following rules:
- **HTML Sanitization**: Never render user-controlled HTML string payloads directly with `dangerouslySetInnerHTML` unless they are first passed through `sanitizeHtml` from `@/lib/sanitize`. Prefer plain text or standard React element interpolation (which React escapes by default) whenever possible.
- **URL Sanitization**: Always wrap URLs provided by users (such as website and Twitter links) in `sanitizeUrl` from `@/lib/sanitize` before placing them in the `href` attribute of an `<a>` anchor tag. This blocks malicious protocols like `javascript:`, `data:`, and `vbscript:`.

## 16. DevOps & Infrastructure

### Coverage Reporting & Codecov Dashboard

We track test coverage for both Rust contracts and the frontend:
- **Rust Coverage:** Generated via `cargo tarpaulin --out Xml`
- **Frontend Coverage:** Generated via `npm run test -- --coverage` (using Vitest)

Our CI workflow automatically uploads these reports to our Codecov dashboard to help maintain high code quality.

### Automated WASM Optimization

Contract builds are strictly validated in CI. We enforce a **50KB** maximum limit
(51200 bytes) on optimized `.wasm` files. The release workflow uploads
`stellar_give.wasm` as a GitHub Actions artifact and attaches it to release tags.
You can run the optimization check locally using:

```bash
bash scripts/build-contract.sh
```

### Dependabot Maintenance

We use Dependabot to keep our dependencies up-to-date. It runs on a weekly schedule for both Cargo and NPM, keeping a maximum of 5 open PRs each. Dependabot PRs will be prefixed with `chore(deps/cargo)` and `chore(deps/npm)`.

### RPC Alerting

The `rpc-health` GitHub Actions workflow pings the Soroban RPC every 5 minutes.
On failure it:
- Opens a GitHub issue labelled `rpc-outage` (or adds a comment if one is already open)
- Posts to Slack / Discord if webhooks are configured

On recovery it automatically closes the tracking issue.

Configure alerting via repo secrets (Settings → Secrets → Actions):

| Secret | Purpose |
|---|---|
| `SOROBAN_RPC_URL` | Primary RPC endpoint to monitor |
| `SOROBAN_RPC_FALLBACK_URL` | Optional backup; probed if the primary fails |
| `SOROBAN_RPC_URLS` | Optional comma-separated list (overrides the two above) |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook (optional) |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook (optional) |

The monitor (`scripts/monitor-rpc.js`) exits 0 if **any** configured endpoint is
healthy (`getHealth` + best-effort `getLatestLedger`), and only opens an outage
issue when every endpoint fails.

See `frontend/.env.example` for all available configuration variables.

### Lighthouse CI PR comments

The `Performance` workflow (`.github/workflows/performance.yml`) runs Lighthouse CI
on frontend changes and always uploads the `.lighthouseci/` report as a workflow
artifact (`lighthouse-results-<sha>`).

Automated PR status comments require a Lighthouse CI GitHub App token:

1. Install the [Lighthouse CI GitHub App](https://github.com/apps/lighthouse-ci)
   on the `Feyisara2108/stellargive` repository (or your fork).
2. Copy the app token from the Lighthouse CI dashboard.
3. In the repo: **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret exactly `LHCI_GITHUB_APP_TOKEN` and paste the token value.

If the secret is missing, the workflow still builds, audits, and uploads artifacts —
it only skips GitHub status/comment posting (no hard failure from an empty token).
