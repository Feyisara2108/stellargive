#!/bin/bash
set -e

echo "Building contract..."
cd contracts/stellar-give
cargo build --release --target wasm32-unknown-unknown

ORIGINAL_WASM="../../target/wasm32-unknown-unknown/release/stellar_give.wasm"
OPTIMIZED_WASM="../../target/wasm32-unknown-unknown/release/stellar_give.optimized.wasm"

if [ ! -f "$ORIGINAL_WASM" ]; then
    echo "Error: Original WASM not found at $ORIGINAL_WASM"
    exit 1
fi

ORIGINAL_SIZE=$(stat -c%s "$ORIGINAL_WASM" 2>/dev/null || stat -f%z "$ORIGINAL_WASM")

echo "Optimizing WASM..."
soroban contract optimize --wasm "$ORIGINAL_WASM"

if [ ! -f "$OPTIMIZED_WASM" ]; then
    echo "Error: Optimized WASM not found at $OPTIMIZED_WASM"
    exit 1
fi

OPTIMIZED_SIZE=$(stat -c%s "$OPTIMIZED_WASM" 2>/dev/null || stat -f%z "$OPTIMIZED_WASM")

REDUCTION=$(( 100 - (OPTIMIZED_SIZE * 100 / ORIGINAL_SIZE) ))

echo ""
echo "WASM size:"
echo "Original: $ORIGINAL_SIZE bytes"
echo "Optimized: $OPTIMIZED_SIZE bytes"
echo "Reduction: $REDUCTION%"
echo ""

if [ "$OPTIMIZED_SIZE" -gt 65536 ]; then
    echo "Error: Optimized WASM size ($OPTIMIZED_SIZE bytes) exceeds the 64KB limit (65536 bytes)!"
    exit 1
fi

echo "WASM size is within limits."
exit 0
