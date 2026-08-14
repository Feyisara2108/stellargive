#!/usr/bin/env bash
# file-testing.sh — create the Testing issues from ISSUES.md on GitHub.
#
# Matches the ACTUAL ISSUES.md format:
#   ### <Title>
#
#   **Labels:** `testing` · `rust` · `effort: M`
#
#   <body...>
#   ---
#
# Only the "## Testing Issues" section is processed. Parsing STOPS at the next
# "## " section header, so Frontend/DevOps are never touched.
#
# DEFAULT IS DRY-RUN. Pass --go to actually create issues.
set -euo pipefail

REPO="${REPO:-Feyisara2108/stellargive}"
ISSUES_FILE="${ISSUES_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ISSUES.md}"
SLEEP="${SLEEP:-3}"
GO=0; LIMIT=999999
while [[ $# -gt 0 ]]; do
  case "$1" in
    --go) GO=1; shift;;
    --limit) LIMIT="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

[[ -f "$ISSUES_FILE" ]] || { echo "ISSUES.md not found" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Extract only the Testing section into a working file.
awk '
  /^## Testing Issues/ { intest=1; next }
  intest && /^## / { intest=0 }
  intest { print }
' "$ISSUES_FILE" > "$TMP/testing.md"

# Split into per-issue body files + meta (title \t labels).
awk -v dir="$TMP" '
  /^### / {
    n++; inissue=1;
    title=$0; sub(/^### */,"",title);
    cur=sprintf("%s/issue_%03d.md", dir, n);
    titles[n]=title; files[n]=cur; labels[n]="";
    next;
  }
  inissue && /^---[[:space:]]*$/ { inissue=0; next; }
  inissue && /^\*\*Labels:\*\*/ {
    l=$0; sub(/^\*\*Labels:\*\* */,"",l); labels[n]=l; next;
  }
  inissue { print >> files[n]; next; }
  END {
    meta=dir"/meta.tsv";
    for (i=1;i<=n;i++) printf "%d\t%s\t%s\n", i, titles[i], labels[i] > meta;
  }
' "$TMP/testing.md"

TOTAL=$(wc -l < "$TMP/meta.tsv" | tr -d ' ')
echo "Repo: $REPO"
echo "Parsed $TOTAL Testing issues"
[[ $GO -eq 1 ]] && echo "MODE: CREATE (sleep ${SLEEP}s between)" || echo "MODE: dry-run"
echo

count=0
while IFS=$'\t' read -r seq title rawlabels; do
  (( count >= LIMIT )) && break
  bodyfile="$TMP/issue_$(printf '%03d' "$seq").md"
  sed -i '/./,$!d' "$bodyfile"                 # strip leading blank lines
  # trim trailing blank lines
  sed -i -e :a -e '/^\n*$/{$d;N;ba}' "$bodyfile" 2>/dev/null || true

  labelargs=(); labelnames=()
  while IFS= read -r lbl; do
    [[ -n "$lbl" ]] && { labelargs+=(--label "$lbl"); labelnames+=("$lbl"); }
  done < <(printf '%s' "$rawlabels" | sed 's/`//g; s/ *· */\n/g; s/^ *//; s/ *$//' | grep -v '^$')
  labeldisp="$(IFS=', '; echo "${labelnames[*]}")"

  count=$((count+1))
  if [[ $GO -eq 1 ]]; then
    url=$(gh issue create --repo "$REPO" --title "$title" --body-file "$bodyfile" "${labelargs[@]}")
    printf '  [%02d/%s] %s\n      -> %s\n' "$count" "$TOTAL" "$title" "$url"
    sleep "$SLEEP"
  else
    printf '  [%02d] %s\n        labels: %s | body: %s lines\n' \
      "$count" "$title" "$labeldisp" "$(wc -l < "$bodyfile" | tr -d ' ')"
  fi
done < "$TMP/meta.tsv"

echo
echo "Processed $count issue(s). $([[ $GO -eq 1 ]] && echo 'CREATED.' || echo 'Dry-run only.')"
