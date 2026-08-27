#!/bin/bash
set -e

echo "Building contract..."
cd contracts/stellar-give
cargo build --release --target wasm32v1-none

ORIGINAL_WASM="target/wasm32v1-none/release/stellar_give.wasm"
OPTIMIZED_WASM="target/wasm32v1-none/release/stellar_give.optimized.wasm"

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
# 50 KiB release footprint budget (fails the build if exceeded).
# Measured 2026-08-26: unoptimized 58103 bytes, wasm-opt -Oz 39749 bytes.
MAX_WASM_BYTES=51200

echo ""
echo "WASM size:"
echo "Original: $ORIGINAL_SIZE bytes"
echo "Optimized: $OPTIMIZED_SIZE bytes"
echo "Reduction: $REDUCTION%"
echo "Budget: $MAX_WASM_BYTES bytes (50 KB)"
echo ""

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## WASM footprint"
        echo ""
        echo "| Artifact | Size |"
        echo "|---|---|"
        echo "| Original | ${ORIGINAL_SIZE} bytes |"
        echo "| Optimized | ${OPTIMIZED_SIZE} bytes |"
        echo "| Budget | ${MAX_WASM_BYTES} bytes (50 KB) |"
        echo "| Reduction | ${REDUCTION}% |"
        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$OPTIMIZED_SIZE" -gt "$MAX_WASM_BYTES" ]; then
    echo "Error: Optimized WASM size ($OPTIMIZED_SIZE bytes) exceeds the 50KB budget ($MAX_WASM_BYTES bytes)!"
    echo "::error::Optimized WASM size ($OPTIMIZED_SIZE bytes) exceeds the 50KB budget ($MAX_WASM_BYTES bytes)."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
        echo "**Status:** FAIL — binary exceeds size budget." >> "$GITHUB_STEP_SUMMARY"
    fi
    exit 1
fi

echo "WASM size is within limits."
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "**Status:** PASS" >> "$GITHUB_STEP_SUMMARY"
fi
exit 0
