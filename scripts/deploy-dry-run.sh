#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/stellar-give"
WASM_FILE="$CONTRACT_DIR/target/wasm32v1-none/release/stellar_give.wasm"

echo "=============================================="
echo " StellarGive Mainnet Dry-Run Deployment"
echo "=============================================="

# Check dependencies
if ! command -v cargo &> /dev/null; then
    echo "Error: cargo could not be found."
    exit 1
fi

if command -v stellar &> /dev/null; then
    CLI=stellar
elif command -v soroban &> /dev/null; then
    CLI=soroban
else
    echo "Error: neither stellar nor soroban CLI could be found."
    exit 1
fi
echo "Using $CLI CLI."

# Check required environment variables
if [ -z "${MAINNET_RPC_URL:-}" ]; then
    echo "Error: MAINNET_RPC_URL is not set."
    echo "Please set MAINNET_RPC_URL before running this script."
    exit 1
fi

if [ -z "${MAINNET_NETWORK_PASSPHRASE:-}" ]; then
    echo "Notice: MAINNET_NETWORK_PASSPHRASE is not set; using the public Stellar network passphrase."
    export MAINNET_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
fi

echo "Checking deployment configuration..."
echo "RPC URL: $MAINNET_RPC_URL"

echo "Building contract in $CONTRACT_DIR..."
(cd "$CONTRACT_DIR" && cargo build --target wasm32v1-none --release)

if [ ! -f "$WASM_FILE" ]; then
    echo "Error: WASM file not found at $WASM_FILE."
    echo "Check the build output for errors."
    exit 1
fi

if ! "$CLI" contract deploy --help 2>&1 | grep -q -- '--dry-run'; then
    echo "Error: the installed $CLI CLI does not support 'contract deploy --dry-run'." >&2
    echo "Refusing to deploy without a dry run. Update the CLI or deploy manually after review." >&2
    exit 1
fi

echo "Performing dry-run deployment..."

# Execute dry-run deployment
"$CLI" contract deploy \
  --wasm "$WASM_FILE" \
  --source deployer \
  --rpc-url "$MAINNET_RPC_URL" \
  --network-passphrase "$MAINNET_NETWORK_PASSPHRASE" \
  --dry-run

echo "Dry-run completed successfully! No transactions were broadcasted."
