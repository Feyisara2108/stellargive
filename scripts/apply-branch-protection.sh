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
