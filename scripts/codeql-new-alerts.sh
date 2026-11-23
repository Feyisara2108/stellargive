#!/usr/bin/env bash
# Fail when a pull request introduces new high or critical CodeQL alerts.
#
# Run by .github/workflows/codeql.yml after `analyze` has uploaded the PR's
# results (the analyze step waits for processing). Compares the open CodeQL
# alerts on the PR's merge ref with those on the base branch: alert numbers
# are stable across refs, so an alert open on the PR but not on the base is
# one this PR introduced. Alerts that already exist on the base branch are
# reported elsewhere and never block an unrelated PR.
#
# Requires gh (authenticated with security-events: read) and jq.
#
# Environment:
#   GITHUB_REPOSITORY  owner/name (set by Actions)
#   PR_NUMBER          pull request number
#   BASE_REF           base branch name, e.g. main
#   CATEGORY           analysis category to check, e.g. /language:rust
#                      (optional; all categories when unset)
#   SEVERITIES         comma-separated security severity levels that fail the
#                      check (default: high,critical)

set -euo pipefail

: "${GITHUB_REPOSITORY:?}" "${PR_NUMBER:?}" "${BASE_REF:?}"
SEVERITIES="${SEVERITIES:-high,critical}"
CATEGORY="${CATEGORY:-}"

# Open CodeQL alerts on a ref at the configured severities, one JSON object per line.
alerts() {
  gh api --paginate \
    "repos/${GITHUB_REPOSITORY}/code-scanning/alerts?tool_name=CodeQL&state=open&per_page=100&ref=$1" \
    | jq -c --arg sev "$SEVERITIES" --arg cat "$CATEGORY" '
        .[]
        | select((.rule.security_severity_level // "") as $s | ($sev | split(",") | index($s)))
        | select($cat == "" or .most_recent_instance.category == $cat)
        | {number, severity: .rule.security_severity_level, rule: .rule.id,
           path: .most_recent_instance.location.path,
           line: .most_recent_instance.location.start_line, url: .html_url}'
}

pr_alerts="$(alerts "refs/pull/${PR_NUMBER}/merge")"
base_numbers="$(alerts "refs/heads/${BASE_REF}" | jq -r '.number')"

new_alerts="$(
  jq -c --argjson base "$(printf '%s\n' "$base_numbers" | jq -R 'select(length > 0) | tonumber' | jq -s '.')" \
    'select(.number as $n | ($base | index($n)) | not)' <<<"$pr_alerts"
)"

if [[ -z "$new_alerts" ]]; then
  echo "No new ${SEVERITIES} CodeQL alerts${CATEGORY:+ for ${CATEGORY}}."
  exit 0
fi

count="$(grep -c . <<<"$new_alerts")"
echo "::error::This PR introduces ${count} new ${SEVERITIES} CodeQL alert(s)${CATEGORY:+ for ${CATEGORY}}:"
jq -r '"  [\(.severity)] \(.rule) at \(.path):\(.line) \(.url)"' <<<"$new_alerts"
while read -r alert; do
  jq -r '"::error file=\(.path),line=\(.line)::[\(.severity)] CodeQL \(.rule) \(.url)"' <<<"$alert"
done <<<"$new_alerts"
exit 1
