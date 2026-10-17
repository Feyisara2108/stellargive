#!/usr/bin/env bash
# Type generation lives in the frontend package script (removed stub, #1120).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"
npm run generate:bindings
