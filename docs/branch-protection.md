# Branch Protection & Required Status Checks

To ensure code quality, security, and stability, the `main` branch of StellarGive is protected. This document explains the protection rules, the status checks that must pass before merging any pull request, and how to apply these settings.

---

## Required Status Checks

Every pull request targeted at the `main` branch must pass the following automated GitHub Actions checks before it can be merged:

| Check Name | Source Workflow | Description |
|---|---|---|
| `test` | `Contract CI` | Executes the Soroban smart contract unit and integration tests. |
| `rust-lint` | `Lint & Format` | Runs `cargo fmt --check` and `cargo clippy -- -D warnings` on the smart contracts. |
| `frontend-lint` | `Lint & Format` | Runs ESLint and Prettier format checks on the Next.js frontend code. |
| `rust-and-contract` | `CI` | Builds the optimized WASM contract, checks code coverage (`cargo tarpaulin`), and runs tests. |
| `frontend` | `CI` | Runs frontend unit tests, accessibility audits (`test:a11y`), and builds the Next.js production bundle. |
| `Cargo Audit` | `Dependency Audit` | Scans smart contract dependencies for known security vulnerabilities. |
| `NPM Audit` | `Dependency Audit` | Scans frontend production dependencies for security advisories. |

---

## Branch Protection Rules

The following configuration options are active for the `main` branch:

1. **Require a Pull Request Before Merging**: Direct pushes to `main` are disabled. All changes must be submitted via pull requests.
2. **Require Approvals**: At least **1 approving review** from a code owner or maintainer is required.
3. **Dismiss Stale Approvals**: Approvals are automatically dismissed when new commits are pushed to a pull request.
4. **Require Status Checks to Pass**: All of the required status checks listed above must pass before a merge.
5. **Require Linear History**: Merges must be squash-merged or rebased; merge commits are not allowed.
6. **Require Conversation Resolution**: All discussions and comments on the pull request must be resolved before merging.
7. **Restrict Force Pushes and Deletions**: Force pushing to `main` and deleting the branch are strictly blocked.

### Owner-Bypass Behavior

> [!IMPORTANT]
> The **Enforce Admins** setting is disabled (`enforce_admins: false`). This means Repository Owners/Administrators can bypass status checks and pull request requirements in emergency scenarios (e.g., immediate production hotfixes, network emergency upgrades). Bypass privilege should only be exercised as a last resort.

---

## Apply Protection Rules Automatically

Maintainers can apply or update these branch protection rules programmatically using the GitHub CLI (`gh`).

### Setup Script

Create a script or execute the following command in your terminal while authenticated with `gh`:

```bash
#!/usr/bin/env bash
# Script to apply branch protection rules to the main branch.
# Requires the GitHub CLI (gh) installed and authenticated.

set -euo pipefail

# Retrieve the current repository nameWithOwner (owner/repo)
REPO_NAME=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH="main"

echo "Applying branch protection rules for '$BRANCH' in '$REPO_NAME'..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/$REPO_NAME/branches/$BRANCH/protection" \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "test",
      "rust-lint",
      "frontend-lint",
      "rust-and-contract",
      "frontend",
      "Cargo Audit",
      "NPM Audit"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF

echo "Branch protection rules applied successfully."
```
