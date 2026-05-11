# stellarGive

[![Contract CI](https://github.com/Feyisara2108/stellargive/actions/workflows/ci-contract.yml/badge.svg)](https://github.com/Feyisara2108/stellargive/actions/workflows/ci-contract.yml)
[![Frontend CI](https://github.com/Feyisara2108/stellargive/actions/workflows/ci-frontend.yml/badge.svg)](https://github.com/Feyisara2108/stellargive/actions/workflows/ci-frontend.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./docs/CONTRIBUTING.md)
[![Network: Stellar Testnet](https://img.shields.io/badge/network-stellar%20testnet-0ea5e9)](https://soroban-testnet.stellar.org)

A Stellar Soroban grant and donation platform with a Rust smart contract and Next.js 14 App Router frontend.

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

- Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Security: [`docs/SECURITY.md`](./docs/SECURITY.md)
- Deployment: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
- Contributing: [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)
