#!/usr/bin/env bash
# record-all.sh — replay each scripts/*.sh under asciinema rec, writing
# .cast files into ./casts/. Idempotent: skips an existing cast unless
# --force is passed.
#
# Setup (one-time):
#   brew install asciinema       (recorder; macOS / Linux)
#   # or:
#   pip install asciinema        (Linux without homebrew)
#
# Usage:
#   ./record-all.sh              # records any missing .cast files
#   ./record-all.sh --force      # re-records every cast, overwriting
#
# The vibesift CLI must be on PATH (npm install -g vibesift, or run
#   npm link from the repo root in dev) — the demo scripts call it.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$HERE/scripts"
CASTS_DIR="$HERE/casts"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'unknown flag: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v asciinema >/dev/null 2>&1; then
  printf 'error: asciinema not on PATH. Install with: brew install asciinema\n' >&2
  exit 1
fi

if ! command -v vibesift >/dev/null 2>&1; then
  printf 'error: vibesift not on PATH. Install with: npm install -g vibesift\n' >&2
  printf '       (or run `npm link` from the vibesift repo root)\n' >&2
  exit 1
fi

mkdir -p "$CASTS_DIR"

shopt -s nullglob
scripts=( "$SCRIPTS_DIR"/*.sh )
if [ "${#scripts[@]}" -eq 0 ]; then
  printf 'no scripts found in %s\n' "$SCRIPTS_DIR" >&2
  exit 1
fi

for script in "${scripts[@]}"; do
  name="$(basename "$script" .sh)"
  cast="$CASTS_DIR/$name.cast"
  if [ -f "$cast" ] && [ "$FORCE" -eq 0 ]; then
    printf '  skip   %s.cast (already exists; pass --force to re-record)\n' "$name"
    continue
  fi
  printf '  record %s.cast …\n' "$name"
  asciinema rec --overwrite --cols 100 --rows 30 \
    --title "vibesift: $name" \
    --command "bash $script" \
    "$cast"
done

printf '\ndone. casts in %s\n' "$CASTS_DIR"
printf 'next: ./convert-all.sh\n'
