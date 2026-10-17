#!/usr/bin/env bash
# deploy-local.sh — build + deploy StellarGive to a local Quickstart node.
#
# Prerequisites:
#   docker compose up -d stellar
#   stellar (or soroban) CLI installed
#   Rust toolchain with wasm32v1-none (or wasm32v1-none) target
#
# Usage:
#   ./scripts/deploy-local.sh
#
# Writes NEXT_PUBLIC_* vars for the standalone network into frontend/.env.local
# and prints the contract id for CI to export.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${SOROBAN_RPC_URL:-http://localhost:8000/rpc}"
PASSPHRASE="${NETWORK_PASSPHRASE:-Standalone Network ; February 2017}"
NETWORK_NAME="${LOCAL_NETWORK_NAME:-stellargive-local}"
SOURCE_ALIAS="${DEPLOYER_ALIAS:-sg-local-deployer}"
FRIENDBOT_URL="${FRIENDBOT_URL:-http://localhost:8000/friendbot}"
FRONTEND_ENV_LOCAL="$ROOT_DIR/frontend/.env.local"

if command -v stellar >/dev/null 2>&1; then
  CLI=stellar
elif command -v soroban >/dev/null 2>&1; then
  CLI=soroban
else
  echo "error: neither stellar nor soroban CLI found in PATH" >&2
  exit 1
fi

echo "==> Waiting for local RPC at $RPC_URL …"
for i in $(seq 1 60); do
  if curl -sf -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q healthy; then
    echo "    RPC is healthy"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "error: RPC did not become healthy. Is 'docker compose up -d stellar' running?" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Ensuring local network config ($NETWORK_NAME)…"
$CLI network add "$NETWORK_NAME" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  --horizon-url "${HORIZON_URL:-http://localhost:8000}" 2>/dev/null || \
$CLI network add "$NETWORK_NAME" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

echo "==> Ensuring deployer key ($SOURCE_ALIAS)…"
if ! $CLI keys address "$SOURCE_ALIAS" >/dev/null 2>&1; then
  $CLI keys generate "$SOURCE_ALIAS" --network "$NETWORK_NAME" 2>/dev/null || \
    $CLI keys generate "$SOURCE_ALIAS"
fi
DEPLOYER_PK=$($CLI keys address "$SOURCE_ALIAS")
echo "    Deployer: $DEPLOYER_PK"

echo "==> Funding deployer via Friendbot…"
curl -sf "${FRIENDBOT_URL}?addr=${DEPLOYER_PK}" >/dev/null || \
  curl -sf -X POST "${FRIENDBOT_URL}" -d "addr=${DEPLOYER_PK}" >/dev/null || \
  echo "warning: Friendbot request returned non-zero; continuing if account already funded"

echo "==> Building contract WASM…"
bash "$ROOT_DIR/scripts/build-contract.sh"

WASM_CANDIDATES=(
  "$ROOT_DIR/contracts/stellar-give/target/wasm32v1-none/release/stellar_give.optimized.wasm"
  "$ROOT_DIR/contracts/stellar-give/target/wasm32v1-none/release/stellar_give.wasm"
  "$ROOT_DIR/contracts/stellar-give/target/wasm32v1-none/release/stellar_give.wasm"
)
WASM=""
for candidate in "${WASM_CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    WASM="$candidate"
    break
  fi
done
[ -n "$WASM" ] || { echo "error: no WASM artifact found after build" >&2; exit 1; }
echo "    Using $WASM"

echo "==> Deploying contract…"
DEPLOY_OUTPUT=$($CLI contract deploy \
  --wasm "$WASM" \
  --source "$SOURCE_ALIAS" \
  --network "$NETWORK_NAME" 2>&1) || {
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
}
CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'C[A-Z0-9]{55}' | head -n 1 || true)
[ -n "$CONTRACT_ID" ] || { echo "error: could not parse contract id from: $DEPLOY_OUTPUT" >&2; exit 1; }
echo "    Contract ID: $CONTRACT_ID"

mkdir -p "$(dirname "$FRONTEND_ENV_LOCAL")"
touch "$FRONTEND_ENV_LOCAL"
upsert_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$FRONTEND_ENV_LOCAL"; then
    perl -pi -e "s|^${key}=.*|${key}=${value}|" "$FRONTEND_ENV_LOCAL"
  else
    echo "${key}=${value}" >> "$FRONTEND_ENV_LOCAL"
  fi
}
upsert_env "NEXT_PUBLIC_CONTRACT_ID" "$CONTRACT_ID"
upsert_env "NEXT_PUBLIC_SOROBAN_RPC_URL" "$RPC_URL"
upsert_env "NEXT_PUBLIC_NETWORK_PASSPHRASE" "$PASSPHRASE"

# Export for CI / parent shells that source this script's stdout.
echo ""
echo "CONTRACT_ID=$CONTRACT_ID"
echo "✅ Local deploy complete. frontend/.env.local updated."
