#!/usr/bin/env bash
# create-labels.sh — create/update the GitHub labels referenced in ISSUES.md.
#
# Labels are DERIVED from the **Labels:** lines in ISSUES.md, so this stays in
# sync with the issues automatically. `gh issue create --label X` fails if the
# label doesn't exist, so run this BEFORE file-issues.sh.
#
# Usage:
#   ./create-labels.sh            # dry-run: print what would be created
#   ./create-labels.sh --go       # actually create/update labels (--force upsert)
#   REPO=owner/name ./create-labels.sh --go
set -euo pipefail

REPO="${REPO:-Feyisara2108/stellargive}"
ISSUES_FILE="${ISSUES_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ISSUES.md}"
GO=0
[[ "${1:-}" == "--go" ]] && GO=1

[[ -f "$ISSUES_FILE" ]] || { echo "ISSUES.md not found at $ISSUES_FILE" >&2; exit 1; }

# Color + description per label; default gray for anything unmapped.
color_for() {
  case "$1" in
    frontend)        echo "1f77b4";; testing)      echo "2ca02c";;
    devops)          echo "ff7f0e";; contract)     echo "8c564b";;
    enhancement)     echo "a2eeef";; bug)          echo "d73a4a";;
    "good first issue") echo "7057ff";; advanced)  echo "b60205";;
    security)        echo "d93f0b";; a11y)         echo "0e8a16";;
    ci)              echo "0052cc";; e2e)          echo "5319e7";;
    docs)            echo "0075ca";; dx)           echo "c2e0c6";;
    ux)              echo "fbca04";; infra)        echo "5319e7";;
    mobile)          echo "bfdadc";; dependencies) echo "0366d6";;
    visual)          echo "e99695";; storybook)    echo "ff4785";;
    reliability)     echo "006b75";; performance)  echo "fbca04";;
    observability)   echo "1d76db";; admin)        echo "b60205";;
    supply-chain)    echo "5319e7";; seo)          echo "0075ca";;
    compliance)      echo "5319e7";;
    "effort: S")     echo "c2e0c6";; "effort: M")  echo "fbca04";;
    "effort: L")     echo "d93f0b";;
    *)               echo "ededed";;
  esac
}

# Extract unique labels. The separator is a UTF-8 middle dot ( · ); split on it
# with sed (UTF-8 locale), strip backticks, trim, drop blanks.
mapfile -t LABELS < <(
  grep '^\*\*Labels:\*\*' "$ISSUES_FILE" \
    | sed 's/^\*\*Labels:\*\* *//; s/`//g' \
    | sed 's/ *· */\n/g' \
    | sed 's/^ *//; s/ *$//' \
    | grep -v '^$' \
    | sort -u
)

echo "Repo: $REPO"
echo "Found ${#LABELS[@]} unique labels in $(basename "$ISSUES_FILE")"
[[ $GO -eq 1 ]] && echo "MODE: CREATE (--force upsert)" || echo "MODE: dry-run (pass --go to apply)"
echo

for lbl in "${LABELS[@]}"; do
  color="$(color_for "$lbl")"
  if [[ $GO -eq 1 ]]; then
    # gh 2.4 has no `gh label` command — use the REST API. Treat "already exists" as OK.
    out=$(gh api -X POST "repos/$REPO/labels" -f name="$lbl" -f color="$color" 2>&1) \
      && echo "  ✓ created  $lbl (#$color)" \
      || { if grep -q "already_exists" <<<"$out"; then echo "  • exists   $lbl"; \
           else echo "  ✗ FAILED   $lbl: $(echo "$out" | tr '\n' ' ')"; fi; }
  else
    printf '  would create: %-20s #%s\n' "$lbl" "$color"
  fi
done

echo
echo "Done."
