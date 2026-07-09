# PR: DevOps & Security Hardening — CODEOWNERS, SBOM, CodeQL, Coverage Thresholds

## Summary

This PR addresses four open issues (#295, #293, #291, #286) that close gaps in code ownership, supply-chain transparency, static security analysis, and test-coverage enforcement.

---

## Changes

### #295 — Add CODEOWNERS (`.github/CODEOWNERS`)

- Maps `frontend/**`, `contracts/**`, and `.github/**` to `@Nursca`.
- A catch-all `*` rule ensures every path has at least one default reviewer.
- GitHub will now auto-request a review from the matching owner whenever a PR touches one of these paths.

### #293 — Generate SBOM on Release (`.github/workflows/release.yml`)

- Adds a `sbom` job that runs only when `release-please` creates a new release.
- **Frontend SBOM**: generated via `@cyclonedx/cyclonedx-npm` (CycloneDX JSON format).
- **Contract SBOM**: generated via `cargo-cyclonedx` (CycloneDX JSON format).
- Both artifacts (`sbom-frontend.cdx.json`, `sbom-contracts.cdx.json`) are uploaded to the GitHub Release with `gh release upload`.

**Regenerating locally:**
```bash
# Frontend
cd frontend && npx @cyclonedx/cyclonedx-npm --output-format JSON --output-file sbom-frontend.cdx.json

# Contracts
cd contracts/stellar-give && cargo install cargo-cyclonedx && cargo cyclonedx --format json
```

### #291 — CodeQL Static-Analysis Workflow (`.github/workflows/codeql.yml`)

- Analyses JavaScript/TypeScript using the `security-extended` query suite.
- Runs on every PR targeting `main`, every push to `main`, and weekly on Mondays at 06:00 UTC.
- Results are uploaded to the repository's **Security → Code scanning** tab automatically via `github/codeql-action/analyze`.

### #286 — Enforce Coverage Thresholds in Vitest (`frontend/vitest.config.ts`)

- Adds a `coverage` block with `provider: "v8"` and reporters (`text`, `lcov`, `json-summary`).
- Sets initial thresholds at **50 %** for statements, branches, functions, and lines — a conservative floor that matches or sits just below the current measured coverage, satisfying the "start at current coverage" requirement without immediately breaking CI.
- The CI job (`npm run test -- --coverage`) will now fail if any metric drops below the threshold, preventing silent coverage erosion.
- Thresholds should be ratcheted upward in subsequent PRs as coverage improves.

---

## Test Plan

- [ ] Open a PR touching `frontend/` and confirm `@Nursca` is auto-requested as a reviewer.
- [ ] Open a PR touching `contracts/` and confirm `@Nursca` is auto-requested as a reviewer.
- [ ] Open a PR touching `.github/` and confirm `@Nursca` is auto-requested as a reviewer.
- [ ] Merge to `main` and verify a release is created; check that both SBOM files appear as release assets.
- [ ] Verify the CodeQL workflow runs on the next PR and findings appear under Security → Code scanning.
- [ ] Run `npm run test -- --coverage` locally and confirm failure when a file's coverage is artificially dropped below 50 %.
- [ ] Confirm CI passes at the current coverage baseline.
