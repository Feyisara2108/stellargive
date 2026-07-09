# Contributing to stellarGive

Thanks for contributing to stellarGive. This repository contains:
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

```bash
git clone https://github.com/Feyisara2108/stellargive.git
cd stellargive
cp .env.example .env
```

See `examples/` for CLI interaction patterns and Soroban integration examples.

Contract tooling:
```bash
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
```

Frontend tooling:
```bash
cd frontend
npm ci
```

## 3. Testing Requirements

Before opening a PR, run:

```bash
# Contract checks
cd contracts/stellar-give
cargo fmt --check
cargo clippy -- -D warnings
cargo test
cargo build --release --target wasm32-unknown-unknown

# Frontend checks
cd ../../frontend
npm run lint
npm run build
```

## 4. Code Review Standards

- Keep PRs focused and scoped to a single concern.
- Include tests or rationale when changing contract logic.
- Do not merge with failing CI.
- Document config/deployment changes in `docs/DEPLOYMENT.md`.
- Flag security-sensitive changes explicitly in PR description.

## 5. Commit Message Convention

Use Conventional Commits:
- `feat: add campaign claim guard`
- `fix: enforce accepted token check`
- `chore: optimize frontend ci cache`

## 6. Gas Estimation Guidelines

Every new contract function added to the project must be checked for resource
usage.  The goal is to keep individual transactions affordable for end users.

**Targets:**
| Operation | Expected fee (stroops) |
|-----------|----------------------|
| `create_campaign` | < 200 000 |
| `donate` | < 300 000 |
| `claim_funds` | < 300 000 |
| Any new function | < 500 000 |

**How to measure:**
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --simulate-only \
  -- <function_name> [args...]
```
The `minResourceFee` field in the simulation response shows the fee in stroops.

**Frontend guard:**
`submitTransaction` in `src/lib/soroban.ts` will log a warning and trigger a
`GasWarning` UI banner when the simulated fee exceeds `MAX_SIMULATION_FEE_STROOPS`
(10 M stroops).  If your new function consistently triggers this warning, reduce
its resource usage before merging.

## 7. Component Storybook

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
- Cover at least the primary state, an "edge" state (loading / error /
  empty), and one mobile viewport variant.
- Shared mock data lives in [`frontend/src/stories/mocks.ts`](../frontend/src/stories/mocks.ts).
- Use the theme toolbar to confirm dark-mode rendering — both themes share
  the variables defined in [`frontend/src/app/globals.css`](../frontend/src/app/globals.css).

A hosted Storybook URL will be added here once the team picks a host
(Vercel or Chromatic) and the deploy workflow lands.

## 8. Pull Request Template (Use in every PR)

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
- [ ] [Final Mainnet Audit Checklist](../docs/MAINNET_AUDIT_CHECKLIST.md) completed and signed off.

## Security impact
- [ ] No security impact
- [ ] Security-sensitive (describe)

## Deployment notes
- Any testnet/mainnet rollout steps
```

## Regenerating TypeScript contract bindings

The frontend talks to the Soroban contract through generated TypeScript bindings.
**After any change to the contract's interface, regenerate them so the frontend
types stay in sync** (this prevents silent drift between contract and UI).

Prerequisites: the [Stellar CLI](https://developers.stellar.org/docs/tools/cli)
installed and the contract built to WASM
(`cargo build --target wasm32-unknown-unknown --release` in `contracts/stellar-give`).

```bash
cd frontend
npm run generate:bindings
```

This runs `stellar contract bindings typescript` against
`contracts/stellar-give/target/wasm32-unknown-unknown/release/stellar_give.wasm`
and writes the bindings to `frontend/src/lib/bindings/`.

> The step is intentionally **not** part of `npm run build`: production/CI builds
> of the frontend don't have the Stellar CLI or the compiled WASM available, so
> wiring it into `build` would break those pipelines. Run it locally (or in a
> contract-aware CI job) whenever the contract interface changes.

## 9. Frontend Input Sanitization & Security Guidelines

To prevent Cross-Site Scripting (XSS) and injection attacks, adhere to the following rules:
- **HTML Sanitization**: Never render user-controlled HTML string payloads directly with `dangerouslySetInnerHTML` unless they are first passed through `sanitizeHtml` from `@/lib/sanitize`. Prefer plain text or standard React element interpolation (which React escapes by default) whenever possible.
- **URL Sanitization**: Always wrap URLs provided by users (such as website and Twitter links) in `sanitizeUrl` from `@/lib/sanitize` before placing them in the `href` attribute of an `<a>` anchor tag. This blocks malicious protocols like `javascript:`, `data:`, and `vbscript:`.

## 10. Pre-commit Hooks (Recommended)

To catch lint and formatting issues before they reach CI, we use Husky and `lint-staged` to automatically check only your modified files before every commit.

### 1. Setup Hook Tools
Run the following command at the repository root to install and configure the Git pre-commit hooks:

```bash
npm run prepare
```

This command automatically initializes Husky in the workspace.

### 2. Standard Workflow
Once installed, when you run `git commit`, `lint-staged` will automatically run:
- `eslint` and `prettier --check` on any modified frontend files (`.js`, `.jsx`, `.ts`, `.tsx`).
- `cargo fmt --check` on any modified smart contract files (`.rs`).

If any checks fail, the commit is aborted with a clear error output so you can fix the issue locally before pushing.

### 3. Running Checks Manually
If you want to run the linters manually before committing or pushing:

```bash
# Run format/lint checks on all files in frontend
cd frontend && npm run lint && npx prettier --check .

# Run formatting checks on the contract
cd contracts/stellar-give && cargo fmt --check && cargo clippy -- -D warnings
```


## DevOps & Infrastructure

### Local Soroban Node

We support local-first development using the Stellar Quickstart image. Start the local node with:
`ash
docker compose up -d stellar
`
This exposes the Soroban RPC on port 8000 and Horizon on port 8001. You can configure your frontend to use it by copying rontend/.env.local.example to rontend/.env.local.

Friendbot is available at http://localhost:8000/friendbot?addr=<YOUR_PUBLIC_KEY>.

### Coverage Reporting & Codecov Dashboard

We track test coverage for both Rust contracts and the frontend:
- **Rust Coverage:** Generated via cargo tarpaulin --out Xml
- **Frontend Coverage:** Generated via 
pm run test -- --coverage (using Vitest)

Our CI workflow automatically uploads these reports to our Codecov dashboard to help maintain high code quality.

### Automated WASM Optimization

Contract builds are strictly validated in CI. We enforce a 64KB maximum limit on optimized .wasm files.
You can run the optimization check locally using:
`ash
bash scripts/build-contract.sh
`

### Dependabot Maintenance

We use Dependabot to keep our dependencies up-to-date. It runs on a weekly schedule for both Cargo and NPM, keeping a maximum of 5 open PRs each. Dependabot PRs will be prefixed with chore(deps/cargo) and chore(deps/npm).

---

## Environment Configuration

All network, contract, and alerting settings live in environment files.

### Root `.env` (scripts)

```bash
cp .env.example .env
# Edit .env — set SOROBAN_RPC_URL, DEPLOYER_ALIAS, etc.
```

### Frontend `.env.local`

```bash
cp frontend/.env.example frontend/.env.local
# Edit — set NEXT_PUBLIC_CONTRACT_ID from your deployment
```

Every required variable is documented with its purpose and default value in
both `.env.example` and `frontend/.env.example`.  Never commit `.env` or
`frontend/.env.local` — they are git-ignored.

---

## One-Command Testnet Bootstrap

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

### Options

```
--force-deploy     Redeploy even if a deployment record already exists
--alias <name>     Stellar key alias to use as the deployer (default: sg-deployer)
```

### Idempotency

Every step is safe to re-run.  If an account is already funded or a contract
already deployed, those steps are skipped automatically.

---

## RPC Alerting

The `rpc-health` GitHub Actions workflow pings the Soroban RPC every 5 minutes.
On failure it:
- Opens a GitHub issue labelled `rpc-outage` (or adds a comment if one is already open)
- Posts to Slack / Discord if webhooks are configured

On recovery it automatically closes the tracking issue.

**Configure alerting** via repo secrets (Settings → Secrets → Actions):

| Secret | Purpose |
|---|---|
| `SOROBAN_RPC_URL` | RPC endpoint to monitor |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook (optional) |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook (optional) |

See `.env.example` for all available configuration variables.
