#!/usr/bin/env bash
# Upload image files as GitHub PR attachments (user-attachments).
# Prints markdown image lines. Does not commit to git.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: upload.sh [--repo owner/name] [--pr NUMBER] [--comment] <file> [file...]

Uploads files to GitHub user-attachments (same store as drag-and-drop on a PR).
Prints markdown: ![alt](https://github.com/user-attachments/assets/...)

  --repo owner/name  Target repository (default: gh repo of cwd)
  --pr NUMBER        Append the markdown to that PR body
  --comment          With --pr, post a PR comment instead of editing the body
EOF
  exit 2
}

REPO=""
PR=""
COMMENT=0
FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --pr)
      PR="${2:-}"
      shift 2
      ;;
    --comment)
      COMMENT=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    --)
      shift
      FILES+=("$@")
      break
      ;;
    -*)
      echo "unknown flag: $1" >&2
      usage
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  usage
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

REPO_ID="$(gh api "repos/${REPO}" --jq .id)"
TOKEN="$(gh auth token)"

quote() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

mime_of() {
  local ext="${1##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    png) echo image/png ;;
    jpg|jpeg) echo image/jpeg ;;
    gif) echo image/gif ;;
    webp) echo image/webp ;;
    svg) echo image/svg+xml ;;
    *) file --mime-type -b "$1" ;;
  esac
}

MARKDOWN=""
for FILE in "${FILES[@]}"; do
  if [[ ! -f "$FILE" ]]; then
    echo "not a file: $FILE" >&2
    exit 1
  fi

  NAME="$(basename "$FILE")"
  MIME="$(mime_of "$FILE")"
  NAME_Q="$(quote "$NAME")"
  MIME_Q="$(quote "$MIME")"

  RESP="$(
    curl -sS -w $'\n%{http_code}' \
      "https://uploads.github.com/user-attachments/assets?name=${NAME_Q}&content_type=${MIME_Q}&repository_id=${REPO_ID}" \
      -X POST \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Accept: application/json" \
      --data-binary "@${FILE}"
  )"
  HTTP="$(printf '%s\n' "$RESP" | tail -n1)"
  BODY="$(printf '%s\n' "$RESP" | sed '$d')"

  if [[ "$HTTP" != "201" ]]; then
    echo "upload failed HTTP ${HTTP}: ${BODY}" >&2
    exit 1
  fi

  URL="$(printf '%s\n' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')"
  if [[ -z "$URL" || "$URL" != https://github.com/user-attachments/assets/* ]]; then
    echo "unexpected response: ${BODY}" >&2
    exit 1
  fi

  ALT="${NAME%.*}"
  LINE="![${ALT}](${URL})"
  printf '%s\n' "$LINE"
  MARKDOWN+="${LINE}"$'\n'
done

if [[ -n "$PR" ]]; then
  if [[ "$COMMENT" -eq 1 ]]; then
    gh pr comment "$PR" --repo "$REPO" --body "$MARKDOWN"
  else
    TMP="$(mktemp)"
    EXISTING="$(gh pr view "$PR" --repo "$REPO" --json body --jq .body)"
    {
      if [[ -n "$EXISTING" ]]; then
        printf '%s\n\n' "$EXISTING"
      fi
      printf '%s' "$MARKDOWN"
    } >"$TMP"
    gh pr edit "$PR" --repo "$REPO" --body-file "$TMP"
    rm -f "$TMP"
  fi
fi
