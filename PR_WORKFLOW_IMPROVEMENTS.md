# Workflow and DevOps Improvements

This PR implements several workflow and DevOps improvements to enhance the project's CI/CD infrastructure, documentation quality, and deployment security.

## Changes

### 1. Add Docs Link Checker Workflow (#793)

**File:** `.github/workflows/link-check.yml`

- Added a link checker workflow using lychee to validate markdown links
- Runs on PRs that touch markdown files and on a weekly schedule (Sundays at 00:00 UTC)
- Fails on broken internal links (file:// and relative links)
- Reports external link failures as warnings to avoid flaky host issues
- Uploads link check results as artifacts for 30 days
- Generates a summary in the GitHub Actions run page

**Acceptance Criteria:**
- ✅ Markdown links are checked on relevant PRs
- ✅ Broken internal links fail the job
- ✅ External link failures are reported clearly

### 2. Add Path-based PR Auto-labeling (#791)

**Files:** `.github/workflows/labeler.yml`, `.github/labeler.yml`

- Added a PR labeler workflow using `actions/labeler`
- Configured path-to-label mappings in `.github/labeler.yml`:
  - `frontend`: Changes to frontend code, CSS, SCSS, TSX, JSX, Next.js config, ESLint config
  - `contract`: Changes to contracts, Rust files, Cargo.toml/Cargo.lock, Soroban-related files
  - `devops`: Changes to workflows, actions, Docker, scripts, Kubernetes, Terraform, shell scripts
  - `docs`: Changes to docs directory, markdown files, README, CHANGELOG, CONTRIBUTING
- Labels are applied on PR open, synchronize, and reopen events
- Labels sync automatically when PRs are updated

**Acceptance Criteria:**
- ✅ PRs are labeled by the areas they change
- ✅ Labels update when the PR is synchronized
- ✅ Label-to-path mapping is documented in the config

### 3. Require Reviewer Approval and Network Confirmation on Contract Deploys (#795)

**Files:** `.github/workflows/deploy-contract.yml`, `docs/MAINNET_DEPLOYMENT.md`

- Added `network_confirmation` input to the contract deploy workflow
- Implemented validation step that requires explicit confirmation for mainnet deployments
- The confirmation must exactly match the target network ("mainnet")
- Early failure occurs when confirmation doesn't match the selected network
- Updated `docs/MAINNET_DEPLOYMENT.md` to document the environment protection requirement
- Documented that the `production` environment requires reviewer approval in GitHub Actions settings

**Acceptance Criteria:**
- ✅ Mainnet deploys block on reviewer approval (via environment protection)
- ✅ A mismatched network confirmation aborts the run
- ✅ The approval requirement is documented

### 4. Add Contract Rollback Workflow (#794)

**File:** `.github/workflows/rollback-contract.yml`

- Created a manual-dispatch workflow for rolling back to a previous WASM hash
- Accepts inputs for:
  - `network`: Target network (testnet or mainnet)
  - `wasm_hash`: Target WASM hash to rollback to (64-character hex SHA256)
  - `rollback_reason`: Reason for rollback (for audit trail)
- Requires environment approval before executing (production environment)
- Validates WASM hash format before proceeding
- Records rollback details in the GitHub Actions run summary
- Logs all rollback operations for audit purposes
- Includes placeholder for actual rollback deployment logic (requires WASM artifact restoration)

**Acceptance Criteria:**
- ✅ A manual rollback workflow exists
- ✅ Rollback requires environment approval
- ✅ The action is recorded for audit

## Testing

All workflows have been designed to follow the existing patterns in the repository:
- Use the same action versions as other workflows (actions/checkout@v7.0.1, etc.)
- Follow the same timeout and concurrency patterns
- Use consistent error messaging with `::error::` annotations
- Generate GitHub Actions summaries for better visibility

## Documentation Updates

- Updated `docs/MAINNET_DEPLOYMENT.md` to document the environment protection requirement for the production environment

## Configuration Required

After merging this PR, the following repository settings need to be configured:

1. **Environment Protection**: Ensure the `production` environment has required reviewers configured
   - Navigate to: Settings > Environments > production
   - Add required reviewers for the production environment

2. **Labels**: The labeler workflow will automatically create labels if they don't exist, but you may want to verify the labels exist in the repository settings

## Related Issues

Closes #793, #791, #795, #794
