# Security Policy & Audit Guide

This document outlines the security mitigations, threat models, assumptions, and pre-audit checklists for the `stellarGive` smart contract.

## 1. Security Mitigations Table

| Vulnerability | Mitigation | Location |
| :--- | :--- | :--- |
| **Reentrancy** | Implement `enter_lock` and `exit_lock` guards on all state-mutating functions to prevent nested contract call exploits within the same execution context. | [lib.rs:L204](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L204), [lib.rs:L244](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L244) (in `donate`); [lib.rs:L270](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L270), [lib.rs:L292](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L292) (in `claim_funds`) |
| **Integer Overflow** | Enforce safe arithmetic utilizing `checked_add` and `checked_sub` for all operations altering campaign funding amounts and identifiers. | [lib.rs:L162](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L162) (incrementing next ID), [lib.rs:L221-222](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L221-222) (adding donation amounts) |
| **Unauthorized Access** | Mandate strict address verification and require cryptographically valid signatures by enforcing `require_auth()` on admin, creator, and beneficiary endpoints. | [lib.rs:L148](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L148) (creator), [lib.rs:L199](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L199) (donor), [lib.rs:L259](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L259) (claim caller) |
| **Storage Exhaustion** | Avoid unbounded collections and full loops by storing and accessing campaign entities individually via unique, direct persistent keys (`campaign_key(id)`). | [lib.rs:L59](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L59), [lib.rs:L74-85](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L74-L85) (individual getter/setter logic), [lib.rs:L177](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L177), [lib.rs:L206](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L206), [lib.rs:L249](file:///home/jhay/Desktop/stellargive/contracts/stellar-give/src/lib.rs#L249) |

## 2. Known Limitations & Assumptions

* **Token Contract Validation**: Token verification is limited to verifying interface compliance (e.g. calling `decimals()` via SEP-41). The contract does not verify the economic invariants, internal logic, or solvency of the target token contract.
* **Campaign Descriptions**: The contract stores campaign details (such as titles/strings) as-is and does not perform XSS payload stripping or content sanitization. Sanitization relies entirely on the frontend application layers prior to rendering.
* **Standards & Runtime Assumed Compliance**: The security model assumes full compliance of referenced tokens with the Stellar Asset Contract (SAC) standard, and relies on the underlying invariants and safety guarantees provided by the Soroban virtual machine runtime.

## 3. Pre-Audit Checklist

- [ ] Test coverage >90% (verify via `cargo tarpaulin`)
- [ ] `cargo clippy -- -D warnings` passes with zero output
- [ ] Manual review log signed by 2 core maintainers

## 4. Workflow & Maintenance Notes

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
11. **Final Mainnet Audit Checklist** ([`docs/MAINNET_AUDIT_CHECKLIST.md`](./MAINNET_AUDIT_CHECKLIST.md)) completed and signed off.

## 3. Dependency Audit Schedule

Supply-chain attacks target dependencies. We audit on two tracks:

| Track | Trigger | Tool |
|-------|---------|------|
| Automated CI | Every push / PR to `main` | `cargo audit --deny warnings` + `npm audit --audit-level=high` |
| Scheduled monthly | 1st of each month at 06:00 UTC (GitHub Actions cron) | Same tools |
| Pre-release manual | Before every production deployment | Human review of `cargo audit` + `npm audit` output |

**Remediation policy:**
- **Critical / High** — must be fixed or dependency removed before merge.
- **Moderate** — fix within the next sprint; create a tracking issue immediately.
- **Low** — address opportunistically; document in the issue tracker.

To run audits locally:
```bash
# Rust
cd contracts/stellar-give
cargo install cargo-audit --locked
cargo audit

# Frontend
cd frontend
npm audit --audit-level=high
```

## 4. Responsible Disclosure

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
