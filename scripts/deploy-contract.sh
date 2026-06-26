#!/bin/bash
set -euo pipefail

# Find workspace root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_ENV_LOCAL="$ROOT_DIR/frontend/.env.local"
LOG_FILE="$ROOT_DIR/scripts/deployments.log"
DEPLOY_RECORD="$ROOT_DIR/scripts/deployments.json"

# Default values
NETWORK="testnet"
SOURCE="deployer"
WASM="$ROOT_DIR/contracts/stellar-give/target/wasm32-unknown-unknown/release/stellar_give.wasm"
FORCE=false

usage() {
  cat <<USAGE
Usage:
  ./scripts/deploy-contract.sh [options]

Options:
  --network <network>   Stellar network (default: testnet)
  --source  <alias>     Stellar key alias for deployer (default: deployer)
  --wasm    <path>      Path to compiled WASM (default: auto-detected)
  --force               Redeploy even if a prior deployment record exists
  -h, --help            Show this help

Idempotency:
  If a deployment record already exists for this network in scripts/deployments.json,
  the script exits cleanly rather than deploying again. Pass --force to override.

Rollback / verify:
  See docs/deployment.md for manual rollback and verification steps.
USAGE
}

# Parse flags
POS_COUNT=1
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --source)  SOURCE="$2";  shift 2 ;;
    --wasm)    WASM="$2";    shift 2 ;;
    --force)   FORCE=true;   shift   ;;
    -h|--help) usage; exit 0          ;;
    -*)
      echo "error: unknown option $1" >&2
      usage
      exit 1
      ;;
    *)
      # Keep positional-arg compat for callers using the old interface
      if   [ "$POS_COUNT" -eq 1 ]; then NETWORK="$1"
      elif [ "$POS_COUNT" -eq 2 ]; then SOURCE="$1"
      elif [ "$POS_COUNT" -eq 3 ]; then WASM="$1"
      else echo "error: too many positional arguments: $1" >&2; usage; exit 1
      fi
      POS_COUNT=$((POS_COUNT + 1))
      shift
      ;;
  esac
done

# --- Idempotency check -----------------------------------------------------------
# If a deployment record already exists for this network, skip unless --force.
if [ -f "$DEPLOY_RECORD" ] && [ "$FORCE" = false ]; then
  EXISTING=$(python3 -c "
import json, sys
try:
    records = json.load(open('$DEPLOY_RECORD'))
    entry = next((r for r in records if r.get('network') == '$NETWORK'), None)
    if entry:
        print(entry.get('contractId', ''))
except Exception:
    pass
" 2>/dev/null || true)
  if [ -n "$EXISTING" ]; then
    echo "ℹ️  Contract already deployed on $NETWORK: $EXISTING"
    echo "   Pass --force to redeploy."
    exit 0
  fi
fi

# --- Logging setup ---------------------------------------------------------------
mkdir -p "$(dirname "$LOG_FILE")"
echo "=== Deployment Attempt: $(date) ===" >> "$LOG_FILE"
echo "Network: $NETWORK"  >> "$LOG_FILE"
echo "Source:  $SOURCE"   >> "$LOG_FILE"
echo "WASM:    $WASM"     >> "$LOG_FILE"

# --- Detect CLI ------------------------------------------------------------------
if   command -v soroban >/dev/null 2>&1; then CLI="soroban"
elif command -v stellar >/dev/null 2>&1; then CLI="stellar"
else
  echo "error: neither 'soroban' nor 'stellar' CLI found in PATH" | tee -a "$LOG_FILE" >&2
  exit 1
fi
echo "CLI: $CLI" >> "$LOG_FILE"

# --- Backup .env.local for rollback ----------------------------------------------
if [ -f "$FRONTEND_ENV_LOCAL" ]; then
  cp "$FRONTEND_ENV_LOCAL" "$FRONTEND_ENV_LOCAL.bak"
else
  mkdir -p "$(dirname "$FRONTEND_ENV_LOCAL")"
  touch "$FRONTEND_ENV_LOCAL"
  cp  "$FRONTEND_ENV_LOCAL" "$FRONTEND_ENV_LOCAL.bak"
fi

cleanup_on_failure() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo "❌ Deployment failed (exit $exit_code)" | tee -a "$LOG_FILE" >&2
    if [ -f "$FRONTEND_ENV_LOCAL.bak" ]; then
      echo "Rolling back frontend/.env.local …" | tee -a "$LOG_FILE" >&2
      mv "$FRONTEND_ENV_LOCAL.bak" "$FRONTEND_ENV_LOCAL"
    fi
  fi
}
trap cleanup_on_failure EXIT

# --- Build if WASM is missing ----------------------------------------------------
if [ ! -f "$WASM" ]; then
  echo "WASM not found; building …" | tee -a "$LOG_FILE"
  CONTRACT_DIR="$ROOT_DIR/contracts/stellar-give"
  [ -d "$CONTRACT_DIR" ] || { echo "error: $CONTRACT_DIR not found" >&2; exit 1; }
  (
    cd "$CONTRACT_DIR"
    rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
    cargo build --target wasm32-unknown-unknown --release
  )
fi
[ -f "$WASM" ] || { echo "error: WASM not found at $WASM" | tee -a "$LOG_FILE" >&2; exit 1; }

# --- Compute WASM hash (sha256) --------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  WASM_HASH=$(sha256sum "$WASM" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  WASM_HASH=$(shasum -a 256 "$WASM" | awk '{print $1}')
else
  WASM_HASH="unknown"
fi
echo "WASM SHA-256: $WASM_HASH" | tee -a "$LOG_FILE"

# --- Deploy ----------------------------------------------------------------------
echo "Deploying to $NETWORK …" | tee -a "$LOG_FILE"
DEPLOY_OUTPUT=$($CLI contract deploy --wasm "$WASM" --network "$NETWORK" --source "$SOURCE" 2>&1)
echo "$DEPLOY_OUTPUT" >> "$LOG_FILE"

CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'C[A-Z0-9]{55}' | head -n 1 || true)
if [ -z "$CONTRACT_ID" ]; then
  echo "error: could not parse contract ID from CLI output" | tee -a "$LOG_FILE" >&2
  exit 1
fi
echo "Contract ID: $CONTRACT_ID" | tee -a "$LOG_FILE"

# --- Write deployment record (JSON) ----------------------------------------------
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NEW_ENTRY="{\"network\":\"$NETWORK\",\"contractId\":\"$CONTRACT_ID\",\"wasmHash\":\"$WASM_HASH\",\"source\":\"$SOURCE\",\"deployedAt\":\"$TIMESTAMP\"}"

if [ -f "$DEPLOY_RECORD" ]; then
  # Remove any previous entry for this network, append the new one
  python3 - "$DEPLOY_RECORD" "$NEW_ENTRY" <<'PYEOF'
import json, sys
path, entry = sys.argv[1], json.loads(sys.argv[2])
records = json.load(open(path))
records = [r for r in records if r.get("network") != entry["network"]]
records.append(entry)
json.dump(records, open(path, "w"), indent=2)
PYEOF
else
  echo "[$NEW_ENTRY]" | python3 -m json.tool > "$DEPLOY_RECORD"
fi
echo "Deployment record updated: $DEPLOY_RECORD" | tee -a "$LOG_FILE"

# --- Update frontend/.env.local --------------------------------------------------
if grep -q "NEXT_PUBLIC_CONTRACT_ID=" "$FRONTEND_ENV_LOCAL"; then
  perl -pi -e "s/NEXT_PUBLIC_CONTRACT_ID=.*/NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID/" "$FRONTEND_ENV_LOCAL"
else
  # Ensure file ends with a newline before appending
  [ -s "$FRONTEND_ENV_LOCAL" ] && [ "$(tail -c1 "$FRONTEND_ENV_LOCAL" | wc -l)" -eq 0 ] && echo "" >> "$FRONTEND_ENV_LOCAL"
  echo "NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID" >> "$FRONTEND_ENV_LOCAL"
fi

# --- Done ------------------------------------------------------------------------
trap - EXIT
rm -f "$FRONTEND_ENV_LOCAL.bak"

echo ""
echo "✅ Deployed successfully!"
echo "   Network:     $NETWORK"
echo "   Contract ID: $CONTRACT_ID"
echo "   WASM hash:   $WASM_HASH"
echo "   Record:      $DEPLOY_RECORD"
echo ""
echo "To verify:  $CLI contract invoke --id $CONTRACT_ID --network $NETWORK -- version"
echo "For rollback steps see: docs/deployment.md"
