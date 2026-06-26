#!/usr/bin/env bash
# bootstrap-testnet.sh — one-command testnet setup for StellarGive
#
# Takes a fresh clone to a fully-working testnet environment:
#   1. Load env configuration
#   2. Fund a deployer account via Friendbot
#   3. Build the Soroban contract
#   4. Deploy the contract (idempotent — skips if already deployed)
#   5. Generate TypeScript bindings / types
#
# Usage:
#   ./scripts/bootstrap-testnet.sh [--force-deploy] [--alias <key-alias>]
#
# Options:
#   --force-deploy    Pass --force to deploy-contract.sh (redeploys even if record exists)
#   --alias <alias>   Stellar key alias to create/use as the deployer (default: from .env or "sg-deployer")
#   -h, --help        Show this help

set -euo pipefail

# ── Resolve paths ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load env ─────────────────────────────────────────────────────────────────
# Source root .env if present so all scripts share the same configuration.
if [ -f "$ROOT_DIR/.env" ]; then
  echo "[bootstrap] Loading environment from $ROOT_DIR/.env"
  # shellcheck disable=SC1090
  set -a; source "$ROOT_DIR/.env"; set +a
elif [ -f "$ROOT_DIR/.env.example" ]; then
  echo "[bootstrap] ⚠️  No .env found — copying .env.example to .env"
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "[bootstrap] Please review $ROOT_DIR/.env, then re-run this script."
  exit 1
fi

# ── Defaults (overridable via .env or CLI flags) ──────────────────────────────
DEPLOYER_ALIAS="${DEPLOYER_ALIAS:-sg-deployer}"
FORCE_DEPLOY_FLAG=""

# ── Parse flags ───────────────────────────────────────────────────────────────
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force-deploy) FORCE_DEPLOY_FLAG="--force"; shift ;;
    --alias)
      [ "$#" -ge 2 ] || { echo "error: --alias requires a value" >&2; exit 1; }
      DEPLOYER_ALIAS="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[bootstrap] $*"; }
step() { echo ""; echo "[bootstrap] ▶ $*"; echo "[bootstrap] $(printf '─%.0s' {1..60})"; }
ok()   { echo "[bootstrap] ✅ $*"; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
step "Checking dependencies"
for cmd in stellar cargo node curl; do
  if command -v "$cmd" >/dev/null 2>&1; then
    log "  ✓ $cmd ($(command -v "$cmd"))"
  else
    echo "[bootstrap] ✗ $cmd not found — install it and retry" >&2
    exit 1
  fi
done

# ── Step 1: Fund testnet account ──────────────────────────────────────────────
step "Funding testnet account (alias: $DEPLOYER_ALIAS)"
DEPLOYER_ALIAS="$DEPLOYER_ALIAS" bash "$SCRIPT_DIR/fund-testnet.sh" --alias "$DEPLOYER_ALIAS"
ok "Testnet account funded"

# ── Step 2: Build the contract ────────────────────────────────────────────────
step "Building Soroban contract"
CONTRACT_DIR="$ROOT_DIR/contracts/stellar-give"
if [ ! -d "$CONTRACT_DIR" ]; then
  echo "[bootstrap] error: contract directory not found: $CONTRACT_DIR" >&2
  exit 1
fi

rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
(
  cd "$CONTRACT_DIR"
  cargo build --target wasm32-unknown-unknown --release
)
ok "Contract built"

# ── Step 3: Deploy (idempotent) ───────────────────────────────────────────────
step "Deploying contract to testnet"
bash "$SCRIPT_DIR/deploy-contract.sh" \
  --network testnet \
  --source "$DEPLOYER_ALIAS" \
  $FORCE_DEPLOY_FLAG
ok "Contract deployed (or already exists)"

# ── Step 4: Generate TypeScript bindings ──────────────────────────────────────
step "Generating TypeScript types"
if [ -f "$SCRIPT_DIR/generate-types.sh" ]; then
  bash "$SCRIPT_DIR/generate-types.sh"
  ok "TypeScript types generated"
else
  log "⚠️  generate-types.sh not found — skipping type generation"
fi

# ── Step 5: Copy env to frontend ─────────────────────────────────────────────
step "Syncing env to frontend"
FRONTEND_ENV="$ROOT_DIR/frontend/.env.local"
if [ ! -f "$FRONTEND_ENV" ]; then
  if [ -f "$ROOT_DIR/frontend/.env.example" ]; then
    cp "$ROOT_DIR/frontend/.env.example" "$FRONTEND_ENV"
    log "Created $FRONTEND_ENV from .env.example"
  fi
fi
ok "Frontend env ready"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "[bootstrap] ════════════════════════════════════════════════════"
echo "[bootstrap] ✅  Bootstrap complete!"
echo "[bootstrap]"

# Read contract ID from the deployment record if available
DEPLOY_RECORD="$SCRIPT_DIR/deployments.json"
if [ -f "$DEPLOY_RECORD" ]; then
  CONTRACT_ID=$(python3 -c "
import json
records = json.load(open('$DEPLOY_RECORD'))
entry = next((r for r in records if r.get('network') == 'testnet'), None)
if entry:
    print(entry.get('contractId', ''))
" 2>/dev/null || true)
  if [ -n "$CONTRACT_ID" ]; then
    echo "[bootstrap]    Contract ID: $CONTRACT_ID"
  fi
fi

echo "[bootstrap]    Network:     testnet"
echo "[bootstrap]    Frontend:    cd frontend && npm install && npm run dev"
echo "[bootstrap] ════════════════════════════════════════════════════"
