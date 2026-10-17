#!/usr/bin/env bash

set -euo pipefail

echo "=============================================="
echo " StellarGive Mainnet Dry-Run Deployment"
echo "=============================================="

# Check dependencies
if ! command -v cargo &> /dev/null; then
    echo "Error: cargo could not be found."
    exit 1
fi

if ! command -v soroban &> /dev/null; then
    echo "Error: soroban CLI could not be found."
    exit 1
fi

# Check required environment variables
if [ -z "${MAINNET_RPC_URL:-}" ]; then
    echo "Error: MAINNET_RPC_URL is not set."
    echo "Please set MAINNET_RPC_URL before running this script."
    exit 1
fi

if [ -z "${MAINNET_NETWORK_PASSPHRASE:-}" ]; then
    echo "Error: MAINNET_NETWORK_PASSPHRASE is not set."
    echo "Using default Public Global Stellar Network passphrase."
    export MAINNET_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
fi

echo "Checking deployment configuration..."
echo "RPC URL: $MAINNET_RPC_URL"

echo "Building contract..."
cargo build --target wasm32v1-none --release

WASM_FILE="target/wasm32v1-none/release/stellar_give.wasm"

if [ ! -f "$WASM_FILE" ]; then
    echo "Error: WASM file not found at $WASM_FILE."
    echo "Check the build output for errors."
    exit 1
fi

echo "Performing dry-run deployment..."

# Execute dry-run deployment
soroban contract deploy \
  --wasm "$WASM_FILE" \
  --source deployer \
  --network mainnet \
  --rpc-url "$MAINNET_RPC_URL" \
  --network-passphrase "$MAINNET_NETWORK_PASSPHRASE" \
  --dry-run

echo "Dry-run completed successfully! No transactions were broadcasted."
