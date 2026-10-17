# StellarGive Setup Guide

Welcome to the StellarGive project! This comprehensive guide provides step-by-step instructions for getting your local development environment up and running on macOS, Linux, and Windows.

## 1. Overview

This guide will walk you through installing the necessary tools to contribute to StellarGive. You will set up:
- **Rust and Cargo**: For compiling Soroban smart contracts.
- **Soroban CLI**: For interacting with the Stellar network and deploying contracts.
- **Node.js and npm**: For running the Next.js frontend application.
- **Git**: For version control.

**Estimated setup time:** 15-30 minutes.
**Supported Operating Systems:** macOS, Linux (Ubuntu/Debian), and Windows (via WSL2).

## 2. Prerequisites

Before starting, ensure you have:
- An active Internet connection
- Terminal/Command Line access
- A GitHub account
- Basic familiarity with your operating system's terminal
- Recommended minimum hardware: 8GB RAM, 10GB free storage

## 3. macOS Setup

On macOS, we recommend using [Homebrew](https://brew.sh/) to manage packages.

1. **Install Homebrew** (if not already installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. **Install Git**:
   ```bash
   brew install git
   ```
3. **Install Rust**:
   ```bash
   brew install rust
   ```
4. **Install Soroban CLI**:
   ```bash
   brew install stellar-cli
   ```
   *(Note: The `stellar-cli` package provides the `soroban` commands.)*
5. **Install Node.js**:
   ```bash
   brew install node
   ```

After installation, reload your shell to ensure your `PATH` is updated:
```bash
source ~/.zshrc
```
*(Or `source ~/.bash_profile` if you are using bash.)*

## 4. Linux Setup

These instructions are primarily for Ubuntu/Debian-based distributions. Other distributions can use their respective package managers (e.g., `dnf`, `pacman`).

1. **Install Prerequisites**:
   ```bash
   sudo apt update
   sudo apt install -y build-essential curl git
   ```
2. **Install Rust** (via Rustup):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```
3. **Install Soroban CLI**:
   ```bash
   cargo install --locked stellar-cli --features opt
   ```
4. **Install Node.js** (via NodeSource for a recent version):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

Verify your environment by running `source ~/.bashrc` (or your shell's config file) to reload the path.

## 5. Windows Setup

**IMPORTANT**: We strongly recommend using **WSL2 (Windows Subsystem for Linux)** as your primary development environment. 

**Why WSL2?** The Soroban toolchain and Rust ecosystem work significantly more reliably in Linux environments. Using WSL2 avoids complex `PATH` issues, compilation errors with `node-gyp`, and toolchain compatibility problems often encountered on native Windows.

### Recommended Path: WSL2 (Ubuntu)

1. **Install WSL2 and Ubuntu**:
   Open PowerShell as Administrator and run:
   ```powershell
   wsl --install
   ```
   Restart your computer if prompted. This will install Ubuntu by default.
2. **Open Windows Terminal** (Highly Recommended, install from Microsoft Store).
3. Open an Ubuntu tab in Windows Terminal.
4. **Follow the Linux Setup** instructions above from inside your Ubuntu terminal.

### Alternative Path: Native Windows (Not Recommended)

If you must use native Windows, you can use [Chocolatey](https://chocolatey.org/):
```powershell
choco install git
choco install rust
choco install nodejs
cargo install --locked stellar-cli --features opt
```
*Note: You may need to install the Visual Studio C++ Build Tools for Rust compilation to work on native Windows.*

## 6. Verify Installation

Verify that all tools are successfully installed on your system by running the following commands:

```bash
rustc --version     # Expected: Output showing the Rust compiler version
cargo --version     # Expected: Output showing the Cargo package manager version
soroban --version   # Expected: Output showing the Soroban CLI version
node --version      # Expected: Output showing Node.js version (e.g., v20.x)
npm --version       # Expected: Output showing npm version
git --version       # Expected: Output showing Git version
```
If any of these commands fail, revisit the installation steps for your platform.

## 7. Clone Repository

1. **Fork the repository** on GitHub by clicking the "Fork" button on the top right of the project page.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/stellargive.git
   cd stellargive
   ```
3. **Set the upstream remote** to sync with the original repository:
   ```bash
   git remote add upstream https://github.com/Nursca/stellargive.git
   ```

## 8. Install Project Dependencies

The project uses `npm` for the frontend and `cargo` for the smart contracts.

1. **Frontend dependencies**:
   ```bash
   cd frontend
   npm ci
   cd ..
   ```
2. **Smart contract dependencies**:
   The Rust dependencies are automatically downloaded when you build or test the contract.
   ```bash
   cd contracts/stellar-give
   cargo fetch
   cd ../..
   ```

## 9. Environment Variables

The frontend relies on specific environment variables to connect to the contract and network.

1. Create the base `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Create the frontend `.env.local` file:
   ```bash
   cp .env.example frontend/.env.local
   ```
3. Append the testnet contract address to your local frontend config:
   ```bash
   echo "NEXT_PUBLIC_CONTRACT_ADDRESS=CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT" >> frontend/.env.local
   ```

*Note: Never commit your actual `.env` files. The `.env.example` file contains safe, public placeholders or testnet values.*

## 10. Testnet Setup

To deploy or interact with contracts on the testnet, you need an account and test network tokens.

1. **Generate a Soroban testnet key**:
   ```bash
   soroban keys generate --global test-key --network testnet
   ```
2. **Retrieve your public address**:
   ```bash
   soroban keys address test-key
   ```
   *Expected result: A Stellar public key starting with 'G' (e.g., `GB...`)*
3. **Fund your account using friendbot**:
   Replace `YOUR_PUBLIC_KEY` with the output from the previous step.
   ```bash
   curl -X POST "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
   ```
   *Expected result: A JSON response indicating a successful transaction, meaning your account now has testnet XLM.*

## 11. Running the Project

Only use the commands currently supported by the repository.

**Smart Contract Operations**:
```bash
# Change to contract directory
cd contracts/stellar-give

# Format and lint
cargo fmt --check
cargo clippy -- -D warnings

# Run tests
cargo test

# Build WASM
cargo build --release --target wasm32-unknown-unknown
```

**Frontend Operations**:
```bash
# Change to frontend directory
cd frontend

# Lint codebase
npm run lint

# Run development server
npm run dev

# Build for production
npm run build
```

## 12. Troubleshooting

| Error | Cause | Solution |
|---|---|---|
| `soroban: command not found` | The CLI is not installed or not in PATH | Check installation. On Linux/Mac, ensure `~/.cargo/bin` is in your PATH. On Mac, check if `brew link stellar-cli` is needed. |
| `cargo: command not found` | Rust is not installed or not in PATH | Install Rust via Rustup/Homebrew and restart your terminal. |
| `permission denied` | Missing execution rights on scripts/folders | Run `chmod +x <filename>` for scripts, or check directory ownership. |
| PATH issues | Shell doesn't know where tools are located | Add `export PATH="$HOME/.cargo/bin:$PATH"` to your `~/.bashrc` or `~/.zshrc` and reload. |
| `node-gyp` issues | Missing build tools for Node.js modules | On Linux, install `build-essential`. On Windows, stick to WSL2 or install Windows Build Tools. |
| WSL networking issues | Port forwarding failing between Windows and WSL | Run `wsl --shutdown` and restart your terminal. Ensure the dev server binds to `0.0.0.0` if necessary. |
| `npm install` failures | Incompatible Node.js version or network issue | Ensure you are on Node v20.x or higher. Clear cache with `npm cache clean --force` and retry. Use `npm ci` instead of `npm install`. |
| Rust target missing / wasm32 target issues | Missing WASM toolchain | Run `rustup target add wasm32-unknown-unknown` to install the target. |

## 13. Common Contributor Workflow

When you're ready to make a contribution:

1. **Ensure your main branch is up to date**:
   ```bash
   git checkout main
   git pull upstream main
   ```
2. **Create a new branch for your feature or fix**:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/issue-description
   ```
3. **Make your changes** in your code editor.
4. **Run formatting, linting, and tests** locally:
   ```bash
   cd contracts/stellar-give && cargo test && cargo clippy
   cd ../../frontend && npm run lint
   ```
5. **Commit your changes** with a clear message:
   ```bash
   git commit -m "feat: implement new crowdfunding tier"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feat/my-feature
   ```
7. **Open a Pull Request** against the main repository via the GitHub interface.

## 14. Recommended Tooling

To ensure a smooth developer experience, we recommend using:
- **Editor**: [VS Code](https://code.visualstudio.com/)
- **Extensions**:
  - `rust-lang.rust-analyzer` (Rust Analyzer for intelligent code completion)
  - `dbaeumer.vscode-eslint` (ESLint for frontend linting)
  - `esbenp.prettier-vscode` (Prettier for code formatting)
  - `vadimcn.vscode-lldb` (CodeLLDB for Rust debugging)
  - `eamodio.gitlens` (GitLens for in-editor git blame and history)

## Docker Compose local stack (#1121)

```bash
docker compose up
```

- Stellar quickstart is pinned (`stellar/quickstart:soroban-dev`) with `--protocol-version 23` (matches soroban-sdk 27).
- Soroban RPC is exposed at `http://localhost:8000/soroban/rpc`.
- The frontend container is wired to that RPC URL and the testnet passphrase via `NEXT_PUBLIC_SOROBAN_RPC_URL` / `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`.
- Build contracts for `wasm32v1-none` (same target as CI): `./scripts/build-contract.sh`.
