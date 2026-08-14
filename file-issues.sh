#!/usr/bin/env bash
# file-issues.sh — create GitHub issues from ISSUES.md, with labels and pacing.
#
# Parses each "### ISSUE #N: Title" block out of ISSUES.md and creates it on the
# repo via `gh issue create`. The **Labels:** line is turned into real --label
# flags (run ./create-labels.sh --go first so the labels exist).
#
# DEFAULT IS DRY-RUN — nothing is created until you pass --go.
#
# Usage:
#   ./file-issues.sh                 # dry-run: show every issue that would be filed
#   ./file-issues.sh --go            # actually create ALL issues (paced)
#   ./file-issues.sh --from 210 --to 259           # only the Frontend batch (dry-run)
#   ./file-issues.sh --from 210 --to 259 --go      # file just the Frontend batch
#   ./file-issues.sh --limit 1 --go                # file ONLY the first issue (test!)
#   SLEEP=2 REPO=owner/name ./file-issues.sh --go
#
# Flags:
#   --go            actually create issues (omit = dry-run)
#   --from N        only issues with planned number >= N
#   --to N          only issues with planned number <= N
#   --limit K       stop after K issues (applied after --from/--to)
set -euo pipefail

REPO="${REPO:-Feyisara2108/stellargive}"
ISSUES_FILE="${ISSUES_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ISSUES.md}"
SLEEP="${SLEEP:-2}"     # seconds between creations (avoids secondary rate limits)
GO=0; FROM=0; TO=999999; LIMIT=999999

while [[ $# -gt 0 ]]; do
  case "$1" in
    --go) GO=1; shift;;
    --from) FROM="$2"; shift 2;;
    --to) TO="$2"; shift 2;;
    --limit) LIMIT="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

[[ -f "$ISSUES_FILE" ]] || { echo "ISSUES.md not found at $ISSUES_FILE" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Split ISSUES.md into per-issue body files + a metadata file.
# Each issue runs from "### ISSUE #N:" to the next standalone "---" (or EOF).
# The **Labels:** line is captured separately and excluded from the body.
awk -v dir="$TMP" '
  /^### ISSUE #[0-9]+:/ {
    n++; inissue=1;
    line=$0;
    num=line; sub(/^### ISSUE #/,"",num); sub(/:.*/,"",num);
    title=line; sub(/^### */,"",title);   # keep "ISSUE #N: ..." so the issue carries its number
    cur=sprintf("%s/issue_%03d.md", dir, n);
    nums[n]=num; titles[n]=title; files[n]=cur; labels[n]="";
    next;
  }
  inissue && /^---$/ { inissue=0; next; }
  inissue && /^\*\*Labels:\*\*/ {
    l=$0; sub(/^\*\*Labels:\*\* */,"",l); labels[n]=l; next;
  }
  inissue { print >> files[n]; next; }
  END {
    meta=dir"/meta.tsv";
    for (i=1;i<=n;i++) printf "%d\t%s\t%s\t%s\n", nums[i], i, titles[i], labels[i] > meta;
  }
' "$ISSUES_FILE"

TOTAL=$(wc -l < "$TMP/meta.tsv" | tr -d ' ')
echo "Repo: $REPO"
echo "Parsed $TOTAL issues from $(basename "$ISSUES_FILE")"
[[ $GO -eq 1 ]] && echo "MODE: CREATE (sleep ${SLEEP}s between)" || echo "MODE: dry-run (pass --go to apply)"
[[ $FROM -gt 0 || $TO -lt 999999 ]] && echo "Range: #$FROM .. #$TO"
[[ $LIMIT -lt 999999 ]] && echo "Limit: $LIMIT"
echo

count=0
while IFS=$'\t' read -r num seq title rawlabels; do
  (( num < FROM || num > TO )) && continue
  (( count >= LIMIT )) && break
  bodyfile="$TMP/issue_$(printf '%03d' "$seq").md"
  sed -i '/./,$!d' "$bodyfile"   # strip leading blank lines

  # Build --label args: split the captured labels line on the UTF-8 middle dot.
  labelargs=(); labelnames=()
  while IFS= read -r lbl; do
    [[ -n "$lbl" ]] && { labelargs+=(--label "$lbl"); labelnames+=("$lbl"); }
  done < <(printf '%s' "$rawlabels" | sed 's/`//g' | sed 's/ *· */\n/g' | sed 's/^ *//; s/ *$//' | grep -v '^$')
  labeldisp="$(IFS=', '; echo "${labelnames[*]}")"

  count=$((count+1))
  if [[ $GO -eq 1 ]]; then
    url=$(gh issue create --repo "$REPO" --title "$title" --body-file "$bodyfile" "${labelargs[@]}")
    printf '  [#%s expected] %s\n      -> %s\n' "$num" "$title" "$url"
    sleep "$SLEEP"
  else
    printf '  [#%s] %s\n        labels: %s\n        body: %s lines\n' \
      "$num" "$title" "$labeldisp" "$(wc -l < "$bodyfile" | tr -d ' ')"



  fi
done < "$TMP/meta.tsv"

echo
echo "Processed $count issue(s). $([[ $GO -eq 1 ]] && echo 'CREATED.' || echo 'Dry-run only — nothing created.')"
