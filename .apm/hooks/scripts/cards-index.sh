#!/usr/bin/env bash
# PostToolUse hook: rebuild index.html whenever a card.json, the template or the generator changes.
# Exit 2 sends the build errors back to Claude so it fixes the card straight away.
input=$(cat)
path=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s).tool_input||{};process.stdout.write(t.file_path||t.path||"")}catch{}})')

case "$path" in
  */games/*/card.json|*/index.template.html|*/scripts/build-index.mjs) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(node scripts/build-index.mjs 2>&1); then
  printf '%s\n' "$out" >&2
  exit 2
fi
printf '%s\n' "$out"
