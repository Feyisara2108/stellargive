#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/stellar-give"
FRONTEND_ENV_LOCAL="$ROOT_DIR/frontend/.env.local"
NETWORK="testnet"
SOURCE_ALIAS=""

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/deploy-contract.sh --network testnet --source <stellar-key-alias>

Required flags:
  --source <alias>      Stellar CLI key alias to sign deployment.

Optional flags:
  --network <name>      Stellar network profile configured in stellar-cli (default: testnet).

Examples:
  ./scripts/deploy-contract.sh --source copilot-deployer
  ./scripts/deploy-contract.sh --network testnet --source alice
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --network)
      [ "$#" -ge 2 ] || { echo "error: --network requires a value" >&2; exit 1; }
      NETWORK="$2"
      shift 2
      ;;
    --source)
      [ "$#" -ge 2 ] || { echo "error: --source requires a value" >&2; exit 1; }
      SOURCE_ALIAS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[ -n "$SOURCE_ALIAS" ] || { echo "error: --source is required" >&2; usage; exit 1; }
command -v stellar >/dev/null 2>&1 || { echo "error: stellar CLI not found in PATH" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "error: cargo not found in PATH" >&2; exit 1; }

echo "Building Soroban contract Wasm..."
(
  cd "$CONTRACT_DIR"
  rustup target add wasm32-unknown-unknown >/dev/null
  cargo build --release --target wasm32-unknown-unknown
)

WASM_PATH="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/stellar_give.wasm"
[ -f "$WASM_PATH" ] || { echo "error: expected wasm not found at $WASM_PATH" >&2; exit 1; }

echo "Deploying contract to network '$NETWORK' with source '$SOURCE_ALIAS'..."
DEPLOY_OUTPUT="$(stellar contract deploy --wasm "$WASM_PATH" --source "$SOURCE_ALIAS" --network "$NETWORK" 2>&1)"
printf '%s\n' "$DEPLOY_OUTPUT"

# Capture the most likely contract ID token from CLI output.
CONTRACT_ID="$(printf '%s\n' "$DEPLOY_OUTPUT" | grep -Eo 'C[A-Z2-7]{55}' | tail -n 1 || true)"
[ -n "$CONTRACT_ID" ] || { echo "error: failed to parse contract ID from deploy output" >&2; exit 1; }

touch "$FRONTEND_ENV_LOCAL"
if grep -q '^NEXT_PUBLIC_CONTRACT_ADDRESS=' "$FRONTEND_ENV_LOCAL"; then
  sed -i.bak "s|^NEXT_PUBLIC_CONTRACT_ADDRESS=.*|NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT_ID|" "$FRONTEND_ENV_LOCAL"
else
  printf '\nNEXT_PUBLIC_CONTRACT_ADDRESS=%s\n' "$CONTRACT_ID" >> "$FRONTEND_ENV_LOCAL"
fi
rm -f "$FRONTEND_ENV_LOCAL.bak"

case "$NETWORK" in
  testnet)
    RPC_URL="https://soroban-testnet.stellar.org"
    EXPLORER_BASE="https://stellar.expert/explorer/testnet"
    ;;
  futurenet)
    RPC_URL="https://rpc-futurenet.stellar.org"
    EXPLORER_BASE="https://stellar.expert/explorer/testnet"
    ;;
  *)
    RPC_URL="(configured in stellar network profile: $NETWORK)"
    EXPLORER_BASE=""
    ;;
esac

echo
echo "Deployment complete."
echo "Contract ID: $CONTRACT_ID"
echo "RPC URL: $RPC_URL"
[ -n "$EXPLORER_BASE" ] && echo "Explorer: $EXPLORER_BASE/contract/$CONTRACT_ID"
echo "Saved NEXT_PUBLIC_CONTRACT_ADDRESS to: $FRONTEND_ENV_LOCAL"
