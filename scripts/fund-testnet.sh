#!/usr/bin/env bash
set -euo pipefail

# Load env vars from root .env if present and not already set
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ROOT_DIR/.env"; set +a
fi

# Allow the deployer alias to come from env (DEPLOYER_ALIAS) or the flag below
ALIAS="${DEPLOYER_ALIAS:-sg-testnet-$(date +%s)}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/fund-testnet.sh [--alias <stellar-key-alias>]

Behavior:
  - Generates a new Stellar testnet identity alias (or uses provided alias).
  - Funds it via Friendbot.
  - Prints the resulting public key for use in deploy scripts.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --alias)
      [ "$#" -ge 2 ] || { echo "error: --alias requires a value" >&2; exit 1; }
      ALIAS="$2"
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

command -v stellar >/dev/null 2>&1 || { echo "error: stellar CLI not found in PATH" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "error: curl not found in PATH" >&2; exit 1; }

if ! stellar keys address "$ALIAS" >/dev/null 2>&1; then
  echo "Generating key alias '$ALIAS'..."
  # --global makes alias reusable across repos in local dev environments.
  stellar keys generate --global "$ALIAS"
else
  echo "Using existing key alias '$ALIAS'..."
fi

PUBLIC_KEY="$(stellar keys address "$ALIAS")"
echo "Funding $PUBLIC_KEY via Friendbot..."
curl --fail --silent --show-error "https://friendbot.stellar.org/?addr=$PUBLIC_KEY" >/dev/null

echo "Funded successfully."
echo "Alias: $ALIAS"
echo "Public Key: $PUBLIC_KEY"
