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
rustup target add wasm32-unknown-unknown

# Install Soroban CLI
cargo install --locked soroban-cli
```

## 3. Testing Requirements

Before opening a PR, ensure all local checks pass:

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
npm run test
```

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
- [ ] [Final Mainnet Audit Checklist](../docs/MAINNET_AUDIT_CHECKLIST.md) completed and signed off.

## Security impact
- [ ] No security impact
- [ ] Security-sensitive (describe)

## Deployment notes
- Any testnet/mainnet rollout steps
```

## 9. Pre-commit Hooks

We use Husky and `lint-staged` to automatically check modified files before every commit.
Run `npm run prepare` at the repository root to initialize the hooks. Once installed, `lint-staged` will run prettier, eslint, and cargo fmt checks automatically on commit.
