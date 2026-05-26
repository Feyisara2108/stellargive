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

## 7. Pull Request Template (Use in every PR)

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
