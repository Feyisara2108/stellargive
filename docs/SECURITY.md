# Security Policy

stellarGive handles user funds and must be treated as a high-assurance system.

## 1. Threat Model

### A. Authorization/Auth Bypass
- **Risk:** Unauthorized callers create, claim, or alter campaign state.
- **Controls:**
  - Enforce `require_auth` for all state-changing identities.
  - Validate beneficiary/creator caller roles on claim/update paths.
  - Reject zero/invalid identity values.

### B. Reentrancy / State Re-entry
- **Risk:** Nested calls re-enter mutable paths and double-claim or bypass checks.
- **Controls:**
  - Use temporary-storage lock guards before mutable operations.
  - Clear lock deterministically on all successful/failed branches.

### C. Deadline / Time-window Exploits
- **Risk:** Donations/claims processed outside campaign lifecycle windows.
- **Controls:**
  - Validate ledger timestamp in contract (not frontend only).
  - Ensure deadline checks are strict and tested at boundaries (`==`, `<`, `>`).

### D. Token Validation Failures
- **Risk:** Donations routed through untrusted/incorrect token contracts.
- **Controls:**
  - Persist accepted token per campaign and enforce exact match.
  - Validate token contract IDs and disallow unsupported assets.
  - Check transfer result paths and error on partial failures.

### E. Frontend/RPC Mismatch
- **Risk:** Users sign transactions on wrong network/contract.
- **Controls:**
  - Surface current network passphrase and contract ID in UI.
  - Gate writes if runtime network config mismatches expected values.

## 2. Security Audit Checklist

Run before every release:

1. Contract authorization paths reviewed (`require_auth` coverage complete).
2. All mutable entry points tested against reentrancy and replay conditions.
3. Deadline logic tested for edge timestamps and overflow assumptions.
4. Token transfer validation tested for wrong token, insufficient amount, and failed transfer.
5. Events emitted for all critical state transitions (create/donate/claim).
6. CI green on `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
7. Frontend build/lint clean; no hardcoded secrets in source.
8. `.env` and deployment scripts reviewed for accidental secret exposure.
9. Dependencies reviewed (`cargo audit` / `npm audit` in manual security review cadence).
10. Deployment runbook completed on testnet before mainnet promotion.

## 3. Responsible Disclosure

If you discover a vulnerability:

1. Do **not** open a public GitHub issue with exploit details.
2. Email maintainers at `security@stellargive.org` with:
   - Impact summary
   - Reproduction steps
   - Affected versions/commit SHA
   - Suggested mitigation (if available)
3. Expect acknowledgement within 72 hours.
4. Coordinated disclosure occurs after mitigation is merged and deployed.

## 4. Bug Bounty Guidelines (Community Program)

- **In scope:** Soroban contract logic, auth model, claim/donation flows, CI/deploy chain issues causing fund risk.
- **Out of scope:** Social engineering, third-party wallet bugs, spam, purely informational docs typos.
- **Severity examples:**
  - Critical: fund theft, unauthorized claim, permanent fund lock
  - High: auth bypass without immediate theft
  - Medium: deadline/token validation bypass requiring user interaction
  - Low: non-sensitive data exposure, minor hardening issues
- Rewards and eligibility are defined by maintainers per report quality, impact, and originality.
