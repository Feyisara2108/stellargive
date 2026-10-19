#!/usr/bin/env bash
# Apply branch protection (required reviews + required status checks) to main.
#
# Requires the GitHub CLI (gh, authenticated) and jq. Applying needs admin on the
# repository; --dry-run only needs read access (and still works without it).
#
# The script is idempotent: it reads the branch's current protection, compares it
# with the desired settings below, and only sends a PUT when they differ. Re-running
# it after a successful apply prints "already up to date" and changes nothing.
#
# REQUIRED_CHECKS is the list of required status checks. It MUST stay in sync with
# docs/required-status-checks.md — update both in the same change. Each entry is the
# check-run name GitHub shows on a PR: the job's `name:` (or its job id when it has
# no `name:`), and `<caller job> / <called job>` for reusable workflows. See the
# "Keeping this in sync" section of that doc when a job is renamed.
#
# Usage:
#   scripts/apply-branch-protection.sh --dry-run          # show the diff, change nothing
#   scripts/apply-branch-protection.sh                    # apply to main
#   scripts/apply-branch-protection.sh --repo owner/name --branch main

set -euo pipefail

REQUIRED_CHECKS=(
  # CI (ci.yml)
  "frontend"
  "Verify lockfiles are in sync"
  "Contract MSRV"
  # Contract CI (ci-contract.yml -> contract-checks.yml)
  "contract-checks / check"
  "cargo-deny (advisories, licenses, bans, sources)"
  # Lint & Format (ci-lint.yml)
  "frontend-lint"
  # Gitleaks Secret Scanning (gitleaks.yml)
  "gitleaks"
  "Validate gitleaks configuration"
  # Dependency Audit (audit.yml)
  "Cargo Audit"
  "NPM Audit"
)

# GitHub Actions' app id: only check runs created by Actions satisfy a required
# check, so a third-party app or a manual status cannot spoof one.
GITHUB_ACTIONS_APP_ID=15368

DRY_RUN=false
REPO_NAME=""
BRANCH="main"

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --repo) REPO_NAME="${2:?--repo needs owner/name}"; shift ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

for tool in gh jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: '$tool' is required but not installed." >&2
    exit 1
  fi
done

if [[ -z "$REPO_NAME" ]]; then
  REPO_NAME=$(gh repo view --json nameWithOwner -q .nameWithOwner)
fi

ENDPOINT="/repos/$REPO_NAME/branches/$BRANCH/protection"

checks_json=$(printf '%s\n' "${REQUIRED_CHECKS[@]}" |
  jq -R --argjson app "$GITHUB_ACTIONS_APP_ID" '{context: ., app_id: $app}' |
  jq -s 'sort_by(.context)')

desired=$(jq -n --argjson checks "$checks_json" '{
  required_status_checks: { strict: true, checks: $checks },
  enforce_admins: false,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true
}')

# Reshape the GET response into the PUT payload's shape so the two compare
# field-for-field. Fields absent from the response (not configured) become null.
normalise='{
  required_status_checks: (
    if .required_status_checks then {
      strict: .required_status_checks.strict,
      checks: ([.required_status_checks.checks[]? | {context, app_id}] | sort_by(.context))
    } else null end),
  enforce_admins: (.enforce_admins.enabled // false),
  required_pull_request_reviews: (
    if .required_pull_request_reviews then {
      dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews,
      require_code_owner_reviews: .required_pull_request_reviews.require_code_owner_reviews,
      required_approving_review_count: .required_pull_request_reviews.required_approving_review_count
    } else null end),
  restrictions: (if .restrictions then "(custom push restrictions)" else null end),
  required_linear_history: (.required_linear_history.enabled // false),
  allow_force_pushes: (.allow_force_pushes.enabled // false),
  allow_deletions: (.allow_deletions.enabled // false),
  block_creations: (.block_creations.enabled // false),
  required_conversation_resolution: (.required_conversation_resolution.enabled // false)
}'

echo "Repository: $REPO_NAME"
echo "Branch:     $BRANCH"
echo "Mode:       $([[ "$DRY_RUN" == true ]] && echo "dry run (no changes)" || echo "apply")"
echo
echo "Required status checks (${#REQUIRED_CHECKS[@]}):"
printf '  - %s\n' "${REQUIRED_CHECKS[@]}"
echo

current_raw=""
read_status="ok"
if ! current_raw=$(gh api -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" "$ENDPOINT" 2>&1); then
  if grep -q "Branch not protected" <<<"$current_raw"; then
    read_status="unprotected"
  else
    read_status="unreadable"
  fi
fi

case "$read_status" in
  ok)
    current=$(jq -S "$normalise" <<<"$current_raw")
    ;;
  unprotected)
    echo "'$BRANCH' currently has no branch protection."
    current='{}'
    ;;
  unreadable)
    echo "Could not read current protection (needs admin on $REPO_NAME):"
    echo "  $(grep -o 'gh: .*' <<<"$current_raw" || head -n 1 <<<"$current_raw")"
    current=""
    ;;
esac

desired_sorted=$(jq -S . <<<"$desired")

if [[ -n "$current" && "$current" == "$desired_sorted" ]]; then
  echo "Branch protection on '$BRANCH' is already up to date. Nothing to do."
  exit 0
fi

if [[ -n "$current" ]]; then
  echo "Changes (current -> desired):"
  diff -u --label current --label desired \
    <(printf '%s\n' "$current") <(printf '%s\n' "$desired_sorted") || true
else
  echo "Desired settings (PUT $ENDPOINT):"
  printf '%s\n' "$desired_sorted"
fi
echo

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run: no changes made. Re-run without --dry-run to apply."
  exit 0
fi

if [[ "$read_status" == "unreadable" ]]; then
  echo "Refusing to apply without read access to the current settings." >&2
  exit 1
fi

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$ENDPOINT" \
  --input - <<<"$desired" >/dev/null

echo "Branch protection rules applied to '$BRANCH' in '$REPO_NAME'."
