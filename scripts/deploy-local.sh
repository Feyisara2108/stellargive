#!/usr/bin/env bash
# deploy-local.sh — build + deploy StellarGive to a local Quickstart node.
#
# Prerequisites:
#   docker compose up -d stellar
#   stellar (or soroban) CLI installed
#   Rust toolchain with wasm32v1-none target
#
# Usage:
#   ./scripts/deploy-local.sh
#
# Writes NEXT_PUBLIC_* vars for the standalone network into frontend/.env.local
# and prints the contract id for CI to export.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_PORT="${STELLAR_PORT_RPC:-8000}"
FRIENDBOT_PORT="${STELLAR_PORT_FRIENDBOT:-8001}"
HORIZON_URL="${HORIZON_URL:-http://localhost:$RPC_PORT}"
PASSPHRASE="${NETWORK_PASSPHRASE:-Standalone Network ; February 2017}"
NETWORK_NAME="${LOCAL_NETWORK_NAME:-stellargive-local}"
SOURCE_ALIAS="${DEPLOYER_ALIAS:-sg-local-deployer}"
FRONTEND_ENV_LOCAL="$ROOT_DIR/frontend/.env.local"

if command -v stellar >/dev/null 2>&1; then
  CLI=stellar
elif command -v soroban >/dev/null 2>&1; then
  CLI=soroban
else
  echo "error: neither stellar nor soroban CLI found in PATH" >&2
  exit 1
fi

# Quickstart has moved the Soroban RPC path between releases. An explicit
# SOROBAN_RPC_URL wins; otherwise probe the documented path first.
if [ -n "${SOROBAN_RPC_URL:-}" ]; then
  RPC_CANDIDATES=("$SOROBAN_RPC_URL")
else
  RPC_CANDIDATES=(
    "http://localhost:$RPC_PORT/soroban/rpc"
    "http://localhost:$RPC_PORT/rpc"
  )
fi

# Newer quickstart images serve Friendbot next to Horizon on the RPC port;
# older layouts use the separate Friendbot port. An explicit FRIENDBOT_URL wins.
if [ -n "${FRIENDBOT_URL:-}" ]; then
  FRIENDBOT_CANDIDATES=("$FRIENDBOT_URL")
else
  FRIENDBOT_CANDIDATES=(
    "http://localhost:$FRIENDBOT_PORT/friendbot"
    "http://localhost:$RPC_PORT/friendbot"
  )
fi

rpc_healthy() {
  curl -sf -m 5 -X POST "$1" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"status":"healthy"'
}

friendbot_answers() {
  local code
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)
  [ -n "$code" ] && [ "$code" != "000" ] && [ "$code" != "404" ]
}

echo "==> Waiting for local RPC on port $RPC_PORT (trying: ${RPC_CANDIDATES[*]}) …"
RPC_URL=""
for i in $(seq 1 60); do
  for candidate in "${RPC_CANDIDATES[@]}"; do
    if rpc_healthy "$candidate"; then
      RPC_URL="$candidate"
      break 2
    fi
  done
  if [ "$i" -eq 60 ]; then
    echo "error: no healthy Soroban RPC found at ${RPC_CANDIDATES[*]}. Is 'docker compose up -d stellar' running?" >&2
    exit 1
  fi
  sleep 2
done
echo "    RPC is healthy at $RPC_URL"

FRIENDBOT_URL=""
for candidate in "${FRIENDBOT_CANDIDATES[@]}"; do
  if friendbot_answers "$candidate"; then
    FRIENDBOT_URL="$candidate"
    break
  fi
done
if [ -z "$FRIENDBOT_URL" ]; then
  FRIENDBOT_URL="${FRIENDBOT_CANDIDATES[0]}"
fi
echo "    Friendbot at $FRIENDBOT_URL"

echo "==> Ensuring local network config ($NETWORK_NAME)…"
network_add_args=(network add "$NETWORK_NAME" --rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")
if "$CLI" network add --help 2>&1 | grep -q -- '--horizon-url'; then
  network_add_args+=(--horizon-url "$HORIZON_URL")
fi
if ! network_add_output=$("$CLI" "${network_add_args[@]}" 2>&1); then
  if printf '%s' "$network_add_output" | grep -qi 'already exists'; then
    echo "    Network config already present"
  else
    echo "$network_add_output" >&2
    echo "error: '$CLI network add' failed; see the output above." >&2
    exit 1
  fi
fi

echo "==> Ensuring deployer key ($SOURCE_ALIAS)…"
if ! "$CLI" keys address "$SOURCE_ALIAS" >/dev/null 2>&1; then
  "$CLI" keys generate "$SOURCE_ALIAS" >/dev/null
fi
DEPLOYER_PK=$("$CLI" keys address "$SOURCE_ALIAS")
echo "    Deployer: $DEPLOYER_PK"

account_exists() {
  curl -sf "${HORIZON_URL}/accounts/${DEPLOYER_PK}" >/dev/null 2>&1
}

echo "==> Funding deployer via Friendbot at $FRIENDBOT_URL …"
# Quickstart reports the RPC healthy before Friendbot has started, so a single request right
# after the health check can fail. Retry until the account exists instead of continuing unfunded.
funded=0
for i in $(seq 1 45); do
  if account_exists; then
    funded=1
    break
  fi
  curl -sf "${FRIENDBOT_URL}?addr=${DEPLOYER_PK}" >/dev/null 2>&1 || \
    curl -sf -X POST "${FRIENDBOT_URL}" -d "addr=${DEPLOYER_PK}" >/dev/null 2>&1 || true
  sleep 2
done
if [ "$funded" -ne 1 ] && account_exists; then funded=1; fi
[ "$funded" -eq 1 ] || { echo "error: deployer ${DEPLOYER_PK} was not funded by Friendbot at ${FRIENDBOT_URL}" >&2; exit 1; }
echo "    Funded"

echo "==> Deploying the native XLM token contract (the Stellar Asset Contract)…"
# A fresh standalone network has no contract for native XLM, and the campaign contract reads
# the token's decimals when it creates or funds a campaign. The contract id is deterministic and
# already built into the frontend for this passphrase. "Already deployed" is not an error.
"$CLI" contract asset deploy --asset native --source "$SOURCE_ALIAS" --network "$NETWORK_NAME" >/dev/null 2>&1 \
  || echo "    (native token contract already deployed, or deploy skipped)"

echo "==> Building contract WASM…"
bash "$ROOT_DIR/scripts/build-contract.sh"

WASM_CANDIDATES=(
  "$ROOT_DIR/contracts/stellar-give/target/wasm32v1-none/release/stellar_give.optimized.wasm"
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
DEPLOY_OUTPUT=$("$CLI" contract deploy \
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
