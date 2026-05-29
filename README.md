# StellarGive

[![Contract CI](https://github.com/Feyisara2108/stellargive/actions/workflows/ci.yml/badge.svg)](https://github.com/Feyisara2108/stellargive/actions)
[![codecov](https://codecov.io/gh/Feyisara2108/stellargive/graph/badge.svg)](https://codecov.io/gh/Feyisara2108/stellargive)
![Soroban](https://img.shields.io/badge/Built%20on-Soroban-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Transparent crowdfunding on Stellar Soroban...

## Current Testnet Deployment

- **Contract name:** `stellarGive` (`contracts/stellar-give`)
- **Contract ID:** `CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT`
- **Deployer alias:** `copilot-deployer`
- **WASM upload tx:** `92a8a10978d2216de9f6e97bd2b4c522076eb1242a3d2d5c4738c4fb86a6dd2a`
- **Deploy tx:** `e3f88cee225bb5548e4640afe02c351373575469fb60dac6f5de670aa7687156`
- **Explorer (deploy tx):** `https://stellar.expert/explorer/testnet/tx/e3f88cee225bb5548e4640afe02c351373575469fb60dac6f5de670aa7687156`
- **Lab contract link:** `https://lab.stellar.org/r/testnet/contract/CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT`

## Architecture (High Level)

```text
Frontend (Next.js) -> Stellar SDK/Freighter -> Soroban RPC -> stellar-give Contract
       ^                                                           |
       |---------------------- event + state polling --------------|
```

Detailed architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## Repository Layout

```text
contracts/stellar-give   Soroban smart contract (Rust)
frontend/                Next.js 14 web app
scripts/                 Deployment and utility automation
docs/                    Security, deployment, architecture, contributing docs
.github/workflows/       Contract + frontend CI pipelines
```

## Quick Start (3 Steps)

> **New Contributors:** Please see our [Detailed Setup Guide](./docs/SETUP.md) for comprehensive instructions on setting up your environment for macOS, Linux, and Windows (WSL2).

1. **Install dependencies and set env files**
   ```bash
   cp .env.example .env
   cp .env.example frontend/.env.local
   echo "NEXT_PUBLIC_CONTRACT_ADDRESS=CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT" >> frontend/.env.local
   cd frontend && npm ci
   ```
2. **Run local checks**
   ```bash
   cd ../contracts/stellar-give && cargo test
   cd ../../frontend && npm run lint && npm run build
   ```
3. **Run the frontend with the deployed contract**
   ```bash
   npm run dev
   ```

## 🎥 Quick Start

[Watch the 3-minute tutorial](https://youtu.be/PLACEHOLDER) to create your first campaign.

> Video covers wallet connection, campaign creation, donation flow, and transaction confirmation with captions for accessibility.

## Contract vs Frontend Commands

| Area | Command |
|---|---|
| Contract format | `cd contracts/stellar-give && cargo fmt --check` |
| Contract lint | `cd contracts/stellar-give && cargo clippy -- -D warnings` |
| Contract test | `cd contracts/stellar-give && cargo test` |
| Contract wasm build | `cd contracts/stellar-give && cargo build --release --target wasm32-unknown-unknown` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build | `cd frontend && npm run build` |
| Frontend dev | `cd frontend && npm run dev` |

## Live / Network Links

- Soroban Testnet RPC: `https://soroban-testnet.stellar.org`
- Friendbot: `https://friendbot.stellar.org/?addr=<PUBLIC_KEY>`
- Explorer base (testnet): `https://stellar.expert/explorer/testnet`
- Lab: `https://lab.stellar.org`

## Tech Stack

- **Smart contract:** Rust, `soroban-sdk`
- **Frontend:** Next.js 14, React 18, TypeScript
- **Blockchain:** Stellar Soroban (testnet-first workflow)
- **CI/CD:** GitHub Actions

## Documentation

- Setup Guide: [`docs/SETUP.md`](./docs/SETUP.md)
- Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Contract API: [`docs/CONTRACT_API.md`](./docs/CONTRACT_API.md)
- Security: [`docs/SECURITY.md`](./docs/SECURITY.md)
- Deployment: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
- Contributing: [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)
- Video Transcript: [`docs/VIDEO_TRANSCRIPT.md`](./docs/VIDEO_TRANSCRIPT.md)
- Litepaper: [`docs/WHITEPAPER.md`](./docs/WHITEPAPER.md)

## DevOps & Infrastructure

- **Coverage reporting:** Tests for Rust (`cargo tarpaulin`) and Frontend (`vitest --coverage`) are run in CI.
- **Codecov dashboard:** Test coverage metrics are automatically uploaded to Codecov for both frontend and contract.
- **WASM optimization:** Contract builds are strictly validated to ensure optimized `.wasm` size remains under 64KB.
- **Local Soroban node:** We support local-first Soroban development using `stellar/quickstart:testing`. Run `docker compose up` to start a standalone node (RPC on port 8000, Horizon on port 8001).
- **Dependabot maintenance:** Weekly dependency updates are enabled for both Cargo (contracts) and NPM (frontend) dependencies.

## Roadmap

### Q3 2026 (Near-term)

- [ ] Multi-token donation support ([#10](https://github.com/Nursca/stellargive/issues/10))
- [ ] Campaign categories and search ([#15](https://github.com/Nursca/stellargive/issues/15), [#37](https://github.com/Nursca/stellargive/issues/37))
- [ ] Mobile-responsive UI ([#46](https://github.com/Nursca/stellargive/issues/46))

### Q4 2026 (Mid-term)

- [ ] Recurring donations (subscription model)
- [ ] DAO governance for platform upgrades
- [ ] Analytics dashboard for creators

### Q1-Q2 2027 (Long-term)

- [ ] Mobile app (React Native)
- [ ] Cross-chain bridge for Ethereum donations
- [ ] Grant program for non-profit onboarding

> Roadmap items are aspirational and may change based on community feedback and implementation feasibility.

## Contributor Onboarding

Welcome! If you are new to the project, please start by reading our [Detailed Setup Guide](./docs/SETUP.md) which will walk you through installing all necessary dependencies (Rust, Soroban CLI, Node.js) across macOS, Linux, and Windows. Once your environment is set up, check out [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for our workflow guidelines.

## 👥 Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://leetcode.com/u/Feyisara21/"><img src="https://avatars.githubusercontent.com/u/179263855?v=4?s=100" width="100px;" alt="Mutmahinat Feyisara"/><br /><sub><b>Mutmahinat Feyisara</b></sub></a><br /><a href="https://github.com/Nursca/stellargive/commits?author=Feyisara2108" title="Code">💻</a> <a href="https://github.com/Nursca/stellargive/commits?author=Feyisara2108" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Nursca"><img src="https://avatars.githubusercontent.com/u/193498127?v=4?s=100" width="100px;" alt="Nursca"/><br /><sub><b>Nursca</b></sub></a><br /><a href="https://github.com/Nursca/stellargive/commits?author=Nursca" title="Code">💻</a> <a href="https://github.com/Nursca/stellargive/commits?author=Nursca" title="Documentation">📖</a> <a href="#design-Nursca" title="Design">🎨</a> <a href="#ideas-Nursca" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome as always!
